import { emptySnapshot, normalizeIncidentFeed, normalizeSummary, preferIncident, reassessSnapshot, STATUS_STALE_MS } from './core.ts'
import type { Service, Snapshot } from './types'

const MAX_BODY_BYTES = 2_000_000
export class FeedError extends Error {
  code: string
  retryAt: string | null
  constructor(code: string, retryAt: string | null = null) { super(code); this.code = code; this.retryAt = retryAt }
}

// Fixed catalog URLs only; no visitor input reaches fetch. Redirects stay on the reviewed origin.
export async function fetchOfficialJson(url: string, fetcher: typeof fetch = fetch, allowPlainText = false): Promise<{ data: unknown; observedAt: number }> {
  const started = Date.now()
  const response = await fetcher(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'WHOPLAYSNOW/1.0 (+https://whoplaysnow.com/status/methodology)' },
    // Workers supports manual/follow only. Reject non-2xx responses below so
    // redirects remain forbidden without relying on Node's `error` mode.
    signal: AbortSignal.timeout(8000), redirect: 'manual', cache: 'no-store',
  })
  if (response.status === 429) {
    const raw = response.headers.get('retry-after')
    const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : NaN
    const date = raw ? Date.parse(raw) : NaN
    const until = Number.isFinite(seconds) ? started + seconds * 1000 : Number.isFinite(date) ? date : started + 15 * 60_000
    throw new FeedError('rate-limited', new Date(Math.max(started + 60_000, Math.min(until, started + 24 * 60 * 60_000))).toISOString())
  }
  if (!response.ok) throw new FeedError('source-unavailable')
  const contentType = response.headers.get('content-type') ?? ''
  // GitHub Raw serves the reviewed events JSON as text/plain. Status endpoints still require JSON MIME.
  if (!contentType.includes('json') && !(allowPlainText && contentType.startsWith('text/plain'))) throw new FeedError('invalid-feed')
  const age = Math.max(0, Number(response.headers.get('age')) || 0) * 1000
  if (age > STATUS_STALE_MS) throw new FeedError('stale-source')
  if (Number(response.headers.get('content-length')) > MAX_BODY_BYTES) throw new FeedError('oversize-feed')
  const reader = response.body?.getReader()
  if (!reader) throw new FeedError('invalid-feed')
  const chunks: Uint8Array[] = []; let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new FeedError('oversize-feed') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const body = new Uint8Array(bytes); let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  try { return { data: JSON.parse(new TextDecoder().decode(body)), observedAt: started - age } }
  catch { throw new FeedError('invalid-feed') }
}

export async function collectService(service: Service, previous?: Snapshot, fetcher: typeof fetch = fetch): Promise<Snapshot> {
  if (service.source.kind === 'manual' || !service.source.summaryUrl) return emptySnapshot(service)
  const checkedAt = new Date().toISOString()
  if (previous?.retryAt && Date.parse(previous.retryAt) > Date.now()) return previous
  let snapshot: Snapshot
  try {
    const { data, observedAt } = await fetchOfficialJson(service.source.summaryUrl, fetcher)
    snapshot = normalizeSummary(data, service, Date.now())
    snapshot.lastSuccessAt = new Date(observedAt).toISOString()
  } catch (error) {
    return {
      ...(previous ?? emptySnapshot(service)), checkedAt, refresh: 'unavailable',
      error: error instanceof FeedError ? error.code : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'invalid-or-unavailable-feed',
      retryAt: error instanceof FeedError ? error.retryAt : null,
    }
  }
  if (service.source.incidentsUrl) {
    try {
      const { data, observedAt } = await fetchOfficialJson(service.source.incidentsUrl, fetcher)
      const history = normalizeIncidentFeed(data, service)
      // Resolve contradictions per source ID before assessing the combined
      // evidence. Either endpoint can lag behind the other's newer update.
      const merged = new Map(history.map(incident => [incident.id, incident]))
      for (const incident of snapshot.incidents) {
        const existing = merged.get(incident.id)
        if (!existing || preferIncident(incident, existing)) merged.set(incident.id, incident)
      }
      snapshot.incidents = [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100)
      snapshot = reassessSnapshot(snapshot)
      // Both endpoints support the assessment. It expires when the older
      // required evidence expires, even if the summary was just retrieved.
      snapshot.lastSuccessAt = new Date(Math.min(Date.parse(snapshot.lastSuccessAt!), observedAt)).toISOString()
      snapshot.history = { checkedAt: new Date(observedAt).toISOString(), available: true, error: null }
    } catch (error) {
      // An incident-only service (e.g. Plex) cannot claim a current all-clear if its incident feed fails.
      snapshot.incidents = mergePreviousIncidents(snapshot.incidents, previous?.incidents ?? [])
      snapshot = reassessSnapshot(snapshot)
      snapshot.history = { checkedAt: previous?.history.checkedAt ?? null, available: false, error: error instanceof FeedError ? error.code : 'history-unavailable' }
      if (error instanceof FeedError && error.retryAt) snapshot.retryAt = error.retryAt
      if (snapshot.assessment === 'no-known-incident') { snapshot.assessment = 'unknown'; snapshot.severity = 'unknown' }
    }
  }
  return snapshot
}

function mergePreviousIncidents(current: Snapshot['incidents'], previous: Snapshot['incidents']) {
  const merged = new Map(previous.map(i => [i.id, i]))
  for (const incident of current) {
    const prior = merged.get(incident.id)
    if (!prior || preferIncident(incident, prior)) merged.set(incident.id, incident)
  }
  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100)
}
