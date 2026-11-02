import { evidenceLevelFor, isExactChannelBroadcast, type EvidenceLevel, type Match, type MatchFeed } from './feed.ts'
import { currentBroadcasts, verifiedLanguages } from './guide.ts'

export type EvidenceCounts = Record<EvidenceLevel, number>
export type CoverageRow = EvidenceCounts & { key: string; total: number; stale: number; unmatched: number }
export type LanguageCoverageRow = { key: string; events: number; destinations: number }
export type CoverageReport = {
  precision: { exactEvents: number; exactPairs: number; platformOnlyPairs: number; expiredBroadcasts: number; rejectedRecords: number }
  generatedAt: string | null
  state: MatchFeed['state']
  events: CoverageRow
  eventCountries: CoverageRow
  bySport: CoverageRow[]
  byCompetition: CoverageRow[]
  byCountry: CoverageRow[]
  byDate: CoverageRow[]
  byLanguage: LanguageCoverageRow[]
  verifiedAudio: { language: string; events: number; eventCountryPairs: number }[]
  failedSources: string[]
  participants: number
  missingLogos: number
  pipeline?: MatchFeed['pipeline']
}

const coreCountries = ['GB', 'US', 'ES', 'FR', 'DE', 'IT', 'CA', 'AU', 'BR', 'PT', 'MA', 'IN']
const empty = (key: string): CoverageRow => ({ key, total: 0, A: 0, B: 0, C: 0, D: 0, E: 0, stale: 0, unmatched: 0 })
const levelOrder: EvidenceLevel[] = ['A', 'B', 'C', 'D', 'E']

function add(row: CoverageRow, level: EvidenceLevel, event: Match, now: number) {
  row.total++
  row[level]++
  if (event.validUntil && Date.parse(event.validUntil) <= now) row.stale++
  if (event.broadcasterEvidence?.sourceEventMatched === false || (event.broadcasterEvidence?.eventMatched === false && !event.broadcasterEvidence?.sourceEventMatched)) row.unmatched++
}

function bestEventLevel(event: Match, countries: string[], now: number): EvidenceLevel {
  const levels = countries.map(country => evidenceLevelFor(event, country, now))
  return levelOrder.find(level => levels.includes(level)) ?? 'E'
}

function rows(map: Map<string, CoverageRow>) {
  return [...map.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
}

function countryCoverageRows(map: Map<string, CoverageRow>) {
  const priority = new Map(coreCountries.map((country, index) => [country, index]))
  return [...map.values()].sort((a, b) => {
    const left = priority.get(a.key) ?? Number.MAX_SAFE_INTEGER
    const right = priority.get(b.key) ?? Number.MAX_SAFE_INTEGER
    return left - right || b.total - a.total || a.key.localeCompare(b.key)
  })
}

export function buildCoverageReport(feed: MatchFeed, now = Date.now()): CoverageReport {
  const countries = [...new Set([...coreCountries, ...feed.events.flatMap(event => [...event.broadcasts.map(item => item.territory), ...(event.broadcastRights ?? []).map(item => item.territory)])])].sort()
  const events = empty('All events'), eventCountries = empty('All event-country pairs')
  const sports = new Map<string, CoverageRow>(), competitions = new Map<string, CoverageRow>(), countryRows = new Map<string, CoverageRow>(), dates = new Map<string, CoverageRow>()
  const languageRows = new Map<string, { events: Set<string>; destinations: number }>()
  const audioRows = new Map<string, { events: Set<string>; pairs: Set<string> }>()
  const precision = { exactEvents: 0, exactPairs: 0, platformOnlyPairs: 0, expiredBroadcasts: 0, rejectedRecords: feed.rejected }
  for (const event of feed.events) {
    const live = currentBroadcasts(event, now)
    for (const b of live.filter(b => b.official)) for (const language of verifiedLanguages(b)) {
      const row = audioRows.get(language) ?? { events: new Set<string>(), pairs: new Set<string>() }
      row.events.add(event.id); row.pairs.add(`${event.id}:${b.territory}`); audioRows.set(language, row)
    }
    if (live.some(b => isExactChannelBroadcast(b, now))) precision.exactEvents++
    precision.expiredBroadcasts += event.broadcasts.length - live.length
    const eventLevel = bestEventLevel(event, countries, now)
    add(events, eventLevel, event, now)
    const day = event.startsAt.slice(0, 10)
    for (const [map, key] of [[sports, event.sport], [competitions, event.competition], [dates, day]] as const) {
      const row = map.get(key) ?? empty(key); add(row, eventLevel, event, now); map.set(key, row)
    }
    for (const country of countries) {
      const local = live.filter(b => b.territory === country)
      if (local.some(b => isExactChannelBroadcast(b, now))) precision.exactPairs++
      else if (local.some(b => b.official && ['service', 'network'].includes(b.destinationPrecision ?? ''))) precision.platformOnlyPairs++
      const level = evidenceLevelFor(event, country, now)
      add(eventCountries, level, event, now)
      const row = countryRows.get(country) ?? empty(country); add(row, level, event, now); countryRows.set(country, row)
    }
    for (const broadcast of event.broadcasts.filter(item => isExactChannelBroadcast(item, now))) {
      const known = verifiedLanguages(broadcast)
      const languages = known.length ? known : ['unknown']
      for (const language of languages) {
        const row = languageRows.get(language) ?? { events: new Set<string>(), destinations: 0 }
        row.events.add(event.id); row.destinations++; languageRows.set(language, row)
      }
    }
  }
  return {
    precision,
    verifiedAudio: [...audioRows].map(([language, row]) => ({ language, events: row.events.size, eventCountryPairs: row.pairs.size })).sort((a, b) => a.language.localeCompare(b.language)),
    generatedAt: feed.generatedAt,
    state: feed.state,
    events,
    eventCountries,
    bySport: rows(sports),
    byCompetition: rows(competitions),
    byCountry: countryCoverageRows(countryRows),
    byDate: rows(dates),
    byLanguage: [...languageRows.entries()].map(([key, row]) => ({ key, events: row.events.size, destinations: row.destinations })).sort((a, b) => b.events - a.events || a.key.localeCompare(b.key)),
    failedSources: (feed.sources ?? []).filter(source => !source.ok).map(source => `${source.name}${source.detail ? `: ${source.detail}` : ''}`),
    participants: feed.events.flatMap(event => [event.homeTeam, event.awayTeam]).filter(Boolean).length,
    missingLogos: feed.events.flatMap(event => [event.homeTeam, event.awayTeam]).filter(team => team && !team.badgeUrl).length,
    pipeline: feed.pipeline
  }
}
