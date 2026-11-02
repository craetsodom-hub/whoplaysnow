import { channelIdentity, currentBroadcasts } from './guide'
import { fetchOfficialJson } from '../status/collect'
import { normalizeMatches, type MatchFeed } from './feed'
import { collectOfficialMatches, mergeOfficialMatches } from './official'
import { collectLigue1 } from './ligue1'
import { collectEuropeanSchedules, type EuropeanScheduleCache } from './europe'
import { isUnsupportedFixture } from './fixture-integrity'
import { applyAllEventDestinations, normalizeAllEventDestinations } from './all-event'
import reviewedDestinations from './reviewed-destinations.json'
import { isCanonicalMatchId } from './event-aliases'
import { collectLaLiga } from './laliga'
import { matchSourceIds } from './routes'

export async function collectMatches(feedUrl: string, coverageUrl: string, now = Date.now(), days = 7, europeanCache:EuropeanScheduleCache = {}): Promise<MatchFeed & {calendarCache?:EuropeanScheduleCache}> {
  const index = fetchOfficialJson(feedUrl, fetch, true)
  const [imported, official, europe, coverage, spanish] = await Promise.allSettled([
    index.then(result => normalizeMatches(result.data, now, Math.min(days,166))),
    collectOfficialMatches(now),
    collectEuropeanSchedules(now, fetch, Math.min(days, 120), europeanCache),
    fetchOfficialJson(coverageUrl, fetch, true),
    collectLaLiga(now),
  ])
  const base: MatchFeed = imported.status === 'fulfilled' ? imported.value : { generatedAt: null, expiresAt: null, events: [], state: 'unavailable', rejected: 0 }
  const primary = official.status === 'fulfilled' ? official.value : { events: [], sources: [{ name: 'Official schedules', ok: false }] }
  const french = await index.then(result => collectLigue1(result.data, now)).catch(() => ({ events: [], sources: [{ name: 'Ligue 1 · official match data', ok: false }] }))
  const european = europe.status === 'fulfilled' ? europe.value : { events: [], sources: [{ name: 'European football schedules', ok: false }], fixtureUpdates: [] }
  const spain = spanish.status === 'fulfilled' ? spanish.value : { events: [], sources: [{ name: 'LaLiga · official Spanish consumer schedule', ok: false }], fixtureUpdates: [] }
  const coverageData = coverage.status === 'fulfilled' && coverage.value.data && typeof coverage.value.data === 'object' ? coverage.value.data as Record<string, unknown> : {}
  const refreshExpiresAt = new Date(now + 24 * 3600_000).toISOString()
  const canonicalComp = (competition: string) =>
    competition === 'Rugby Union International Friendlies' ? 'Autumn Nations Series'
    : competition === 'Twenty20 International Series' ? 'ICC International Series'
    : competition === 'Major League Soccer - Regular Season' ? 'MLS'
    : competition === 'Saudi-Arabian Pro League' ? 'Saudi Pro League'
    : competition === 'English League 1' ? 'League One'
    : competition === 'English League 2' ? 'League Two'
    : competition === 'English League Championship' ? 'Championship'
    : competition === 'French Ligue 1' ? 'Ligue 1'
    : competition === 'LALIGA EA SPORTS' || competition === 'Spanish LaLiga' ? 'LaLiga'
    : competition === 'Spanish Segunda División' || competition === 'Spanish Segunda' ? 'LaLiga Hypermotion'
    : competition
  const canonicalBaseEvents = base.events.filter(event => !isUnsupportedFixture(event) && isCanonicalMatchId(event.id)).map(event => {
    const comp = canonicalComp(event.competition)
    const sport = event.sport === 'formula1' ? 'motorsport' : event.sport
    return { ...event, sport, competition: comp, validUntil: base.expiresAt ?? undefined }
  })
  const mergedEvents = mergeOfficialMatches(
    mergeOfficialMatches(canonicalBaseEvents, european.events),
    [...primary.events, ...french.events, ...spain.events].map(event => ({ ...event, competition: canonicalComp(event.competition) }))
  ).map(event => ({ ...event, competition: canonicalComp(event.competition) }))
  // The bundled artifact is exported from WhoseIPTV's reviewed catalog. Its
  // source-review age is validated independently of this request/cache clock.
  const rules = [...(Array.isArray(coverageData.allEventDestinations) ? coverageData.allEventDestinations : []), ...reviewedDestinations.allEventDestinations]
  const fixtureUpdates = [...european.fixtureUpdates, ...spain.fixtureUpdates]
  const held = new Set(fixtureUpdates.map(update => update.id))
  const activeEvents = mergedEvents.filter(event => isCanonicalMatchId(event.id) && !held.has(event.id) && !Object.entries(matchSourceIds(event)).some(([source, id]) => held.has(`${source}-${id}`)))
  const events = applyAllEventDestinations(activeEvents, rules, now, refreshExpiresAt).map(event => ({ ...event, broadcasts: currentBroadcasts(event, now).map(b => ({ ...b, originalChannelName: b.originalChannelName ?? b.channel, channelId: channelIdentity(b), languages: b.languageEvidence ? b.languages : [] })) }))
  const pipelineData = coverageData.pipeline && typeof coverageData.pipeline === 'object' ? coverageData.pipeline as Record<string, unknown> : {}
  const numeric = (key: string) => Number.isFinite(Number(pipelineData[key])) ? Number(pipelineData[key]) : 0
  const pipeline = numeric('requests') > 0 ? { requests: numeric('requests'), succeeded: numeric('succeeded'), failed: numeric('failed'), successRatio: numeric('successRatio'), minimumSuccessRatio: numeric('minimumSuccessRatio') } : undefined
  const attemptRows = Array.isArray(pipelineData.sourceAttempts) ? pipelineData.sourceAttempts : []
  const failedSlices = attemptRows.flatMap(value => {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    return row.status === 'failed' && typeof row.sport === 'string' && /^[A-Z]{2}$/.test(String(row.territory)) ? [`${row.sport}/${row.territory}`] : []
  })
  const failureSummary = [...new Set(failedSlices)].join(', ')
  const adapterRows = Array.isArray(coverageData.adapters) ? coverageData.adapters : []
  const sharedSources = adapterRows.flatMap(value => {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    return typeof row.id === 'string' && row.success === false ? [{ name: `WhoseIPTV adapter · ${row.id}`, ok: false, detail: typeof row.failure === 'string' ? row.failure.slice(0, 160) : 'source unavailable' }] : []
  })
  const currentReviewedRules = normalizeAllEventDestinations(reviewedDestinations.allEventDestinations, now).length
  const sources = [...european.sources, ...primary.sources, ...french.sources, ...spain.sources, { name: 'WhoseIPTV reviewed service catalog', ok: currentReviewedRules === reviewedDestinations.allEventDestinations.length, detail: `${currentReviewedRules}/${reviewedDestinations.allEventDestinations.length} rules within source review age; expired rules withheld` }, { name: 'WhoseIPTV shared feed', ok: base.state === 'ready', ...(pipeline ? { detail: `${pipeline.succeeded}/${pipeline.requests} schedule slices succeeded${failureSummary ? `; failures: ${failureSummary}` : ''}` } : {}) }, ...sharedSources]
  // Independent official collection remains useful when the community feed expires.
  return { ...base, calendarCache:'cache' in european?european.cache:undefined, fixtureUpdates, sources, pipeline, events, state: events.length || sources.some(source => source.ok) ? 'ready' : base.state, generatedAt: new Date(now).toISOString(), expiresAt: refreshExpiresAt }
}
