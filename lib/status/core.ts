import type { Assessment, Incident, Service, ServiceView, Severity, Snapshot } from './types'

export const STATUS_REFRESH_MS = 5 * 60_000
export const STATUS_STALE_MS = 15 * 60_000
const futureTolerance = 5 * 60_000
const componentStates = new Set(['operational', 'degraded_performance', 'partial_outage', 'major_outage', 'under_maintenance'])
const incidentStates = new Set(['investigating', 'identified', 'monitoring', 'resolved', 'postmortem'])
const indicatorSeverity: Record<string, Severity> = { none: 'none', minor: 'minor', major: 'major', critical: 'critical', maintenance: 'maintenance' }
const severityRank: Record<Severity, number> = { none: 0, unknown: 0, maintenance: 1, minor: 2, major: 3, critical: 4 }
type Obj = Record<string, unknown>
const object = (value: unknown): Obj => value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {}
const text = (value: unknown, length = 500): string => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, length) : ''

export function validDate(value: unknown, now = Date.now()): string | null {
  if (typeof value !== 'string') return null
  const epoch = Date.parse(value)
  return Number.isFinite(epoch) && epoch > 0 && epoch <= now + futureTolerance ? new Date(epoch).toISOString() : null
}

export function safeSourceUrl(value: unknown, fallback: string): string {
  try {
    const url = new URL(String(value))
    const origin = new URL(fallback)
    return url.protocol === 'https:' && url.hostname === origin.hostname && !url.username && !url.password ? url.href : fallback
  } catch { return fallback }
}

function normalizeIncident(input: unknown, service: Service, now: number): Incident | null {
  const row = object(input)
  const id = text(row.id, 100)
  const title = text(row.name, 250)
  const status = text(row.status)
  const startedAt = validDate(row.started_at, now) ?? validDate(row.created_at, now)
  const updatedAt = validDate(row.updated_at, now)
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !title || !incidentStates.has(status) || !startedAt || !updatedAt || Date.parse(updatedAt) < Date.parse(startedAt)) return null
  const resolved = status === 'resolved' || status === 'postmortem'
  const resolvedAt = resolved ? validDate(row.resolved_at, now) : null
  const updates = (Array.isArray(row.incident_updates) ? row.incident_updates : []).flatMap(value => {
    const update = object(value)
    const publishedAt = validDate(update.display_at, now) ?? validDate(update.created_at, now)
    const updateId = text(update.id, 100)
    const body = text(update.body, 8000)
    return publishedAt && updateId && body ? [{ id: updateId, status: text(update.status, 80), body, publishedAt }] : []
  })
  const deduplicatedUpdates = [...new Map(updates.map(update => [update.id, update])).values()]
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)).slice(-100)
  return {
    id, title, status, severity: indicatorSeverity[text(row.impact)] ?? 'unknown', startedAt, updatedAt, retrievedAt: new Date(now).toISOString(),
    resolvedAt,
    ...(resolvedAt && Date.parse(resolvedAt) < Date.parse(startedAt) ? { timingNote: 'The source publishes a resolution time before its reported start time. These timestamps are shown as published; elapsed downtime cannot be calculated from them.' } : {}),
    sourceUrl: safeSourceUrl(row.permalink, `${service.source.url.replace(/\/$/, '')}/incidents/${id}`),
    components: (Array.isArray(row.components) ? row.components : []).map(value => text(object(value).name, 150)).filter(Boolean).slice(0, 40),
    // Statuspage does not define a reliable viewer-country field. Never infer one from component names.
    regions: [], updates: deduplicatedUpdates,
  }
}

export function normalizeIncidentFeed(input: unknown, service: Service, now = Date.now()): Incident[] {
  const data = object(input)
  if (!Array.isArray(data.incidents) || data.incidents.length > 500) throw new Error('invalid-feed')
  const incidents = data.incidents.map(row => normalizeIncident(row, service, now))
  // Invalid incident entries must not quietly disappear and produce a false all-clear.
  if (incidents.some(row => row === null)) throw new Error('invalid-feed')
  const dedup = new Map<string, Incident>()
  for (const incident of incidents as Incident[]) {
    const prior = dedup.get(incident.id)
    if (!prior || preferIncident(incident, prior)) dedup.set(incident.id, incident)
  }
  return [...dedup.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function emptySnapshot(service: Service): Snapshot {
  return {
    serviceSlug: service.slug, checkedAt: null, lastSuccessAt: null, sourceUpdatedAt: null,
    assessment: 'unknown', severity: 'unknown', refresh: service.source.kind === 'manual' ? 'not-configured' : 'unavailable',
    error: null, retryAt: null, components: [], incidents: [], history: { checkedAt: null, available: false, error: null },
  }
}

export function normalizeSummary(input: unknown, service: Service, now = Date.now()): Snapshot {
  const data = object(input)
  const page = object(data.page)
  const indicator = text(object(data.status).indicator)
  if (!page.id || !Object.hasOwn(indicatorSeverity, indicator) || !Array.isArray(data.components) || !data.components.length || data.components.length > 200) throw new Error('invalid-feed')
  let pageUrl: string
  try { pageUrl = new URL(String(page.url)).href } catch { throw new Error('invalid-feed') }
  const parsedPageUrl = new URL(pageUrl)
  if (parsedPageUrl.protocol !== 'https:' || parsedPageUrl.username || parsedPageUrl.password || parsedPageUrl.hostname !== new URL(service.source.url).hostname) throw new Error('invalid-feed')
  const components = data.components.map(value => {
    const row = object(value)
    const id = text(row.id, 100), name = text(row.name, 150), status = text(row.status)
    if (!id || !name || !componentStates.has(status)) throw new Error('invalid-feed')
    return { id, name, status }
  })
  const incidents = data.incidents === undefined ? [] : normalizeIncidentFeed({ incidents: data.incidents }, service, now)
  const maintenances = data.scheduled_maintenances
  if (maintenances !== undefined && (!Array.isArray(maintenances) || maintenances.length > 200 || maintenances.some(value => !['scheduled', 'in_progress', 'verifying', 'completed'].includes(String(object(value).status))))) throw new Error('invalid-feed')
  const maintenance = Array.isArray(maintenances) && maintenances.some(value => ['in_progress', 'verifying'].includes(String(object(value).status)))
  const snapshot: Snapshot = {
    ...emptySnapshot(service), checkedAt: new Date(now).toISOString(), lastSuccessAt: new Date(now).toISOString(),
    sourceUpdatedAt: validDate(page.updated_at, now), refresh: 'ok', components, incidents,
    summarySignals: { indicator: indicatorSeverity[indicator], maintenanceInProgress: maintenance },
    assessment: 'no-known-incident', severity: indicatorSeverity[indicator],
  }
  return reassessSnapshot(snapshot)
}

export function reassessSnapshot(snapshot: Snapshot): Snapshot {
  // Legacy stored snapshots have no independent signal record. Do not guess at
  // a new assessment from a severity that may have come from an older incident.
  if (!snapshot.summarySignals) return { ...snapshot, assessment: 'unknown', severity: 'unknown' }
  const { components, incidents, summarySignals: { indicator, maintenanceInProgress } } = snapshot
  const active = incidents.filter(incidentIsActive)
  const degraded = components.some(component => ['degraded_performance', 'partial_outage', 'major_outage'].includes(component.status))
  const result = { ...snapshot, assessment: 'no-known-incident' as Assessment, severity: indicator }
  if (active.length || degraded || ['minor', 'major', 'critical'].includes(indicator)) {
    result.assessment = 'official-incident'
    const severities: Severity[] = [indicator, ...active.map(incident => incident.severity)]
    if (components.some(c => c.status === 'major_outage')) severities.push('major')
    if (degraded) severities.push('minor')
    result.severity = severities.sort((a, b) => severityRank[b] - severityRank[a])[0]
    if (result.severity === 'none') result.severity = 'unknown'
  } else if (maintenanceInProgress || indicator === 'maintenance' || components.some(c => c.status === 'under_maintenance')) {
    result.assessment = 'maintenance'; result.severity = 'maintenance'
  }
  return result
}

export function viewService(service: Service, snapshot: Snapshot, now = Date.now()): ServiceView {
  const success = snapshot.lastSuccessAt ? Date.parse(snapshot.lastSuccessAt) : NaN
  const stale = !Number.isFinite(success) || now - success > STATUS_STALE_MS || success > now + futureTolerance
  const unknown = stale || snapshot.refresh !== 'ok'
  const assessment = unknown ? 'unknown' : snapshot.assessment
  return { service, snapshot, stale, assessment, severity: unknown ? 'unknown' : snapshot.severity, confidence: assessment === 'unknown' ? 'insufficient-evidence' : 'official-source' }
}

export const ASSESSMENT_LABELS: Record<Assessment, string> = {
  'official-incident': 'Official issue reported', maintenance: 'Official maintenance',
  'no-known-incident': 'No known incident', unknown: 'Status unknown',
}

export function incidentIsActive(incident: Incident): boolean {
  return !['resolved', 'postmortem'].includes(incident.status)
}

export function preferIncident(candidate: Incident, prior: Incident): boolean {
  return candidate.updatedAt > prior.updatedAt || (candidate.updatedAt === prior.updatedAt && (incidentIsActive(candidate) || !incidentIsActive(prior)))
}

export function mergeIncidentArchive(current: Incident[], archived: Incident[]): Incident[] {
  const currentIds = new Set(current.map(incident => incident.id))
  const merged = new Map(archived.map(incident => [incident.id, { ...incident, historicalOnly: !currentIds.has(incident.id) }]))
  for (const incident of current) {
    const prior = merged.get(incident.id)
    if (!prior || preferIncident(incident, prior)) merged.set(incident.id, { ...incident, historicalOnly: false })
    else merged.set(incident.id, { ...prior, historicalOnly: true })
  }
  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function incidentDayCounts(incidents: Incident[], now = Date.now(), days = 14) {
  const today = new Date(now); today.setUTCHours(0, 0, 0, 0)
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getTime() - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10)
    return { date, count: incidents.filter(incident => incident.startedAt.slice(0, 10) === date).length }
  })
}
