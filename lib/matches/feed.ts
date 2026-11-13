import { normalizeBroadcastLanguages } from './languages.ts'
import reviewedEvidence from './reviewed-destinations.json'
import { isUnconfirmedLegacyChannel } from './channel-status'

export const MATCH_FEED_URL = 'https://raw.githubusercontent.com/craetsodom-hub/whoseiptv/main/feed/events/v1/events.json'
export const MATCH_COVERAGE_URL = 'https://raw.githubusercontent.com/craetsodom-hub/whoseiptv/main/feed/events/v1/coverage.json'
export const MATCH_FEED_REPOSITORY = 'https://github.com/craetsodom-hub/whoseiptv'

export type EvidenceLevel = 'A' | 'B' | 'C' | 'D' | 'E'
export type Broadcast = {
  channel: string
  logoUrl?: string
  darkLogoUrl?: string
  channelId?: string
  originalChannelName?: string
  languageEvidence?: { sourceUrl: string; verifiedAt: string; scope: 'event-audio' | 'feed-audio' }
  territory: string
  languages: string[]
  rightsHolder?: string
  sourceUrl: string
  official: boolean
  sourceType: string
  evidenceLevel?: Exclude<EvidenceLevel, 'D' | 'E'>
  destinationType?: string
  destinationPrecision?: string
  matchingMethod?: string
  aliases?: string[]
  scheduleUrl?: string
  checkedAt?: string
  verifiedAt?: string
  scope?: string
  viewingUrl?: string
  validUntil?: string
}
export type BroadcastRight = {
  territory: string
  holders: { name: string; kind?: string }[]
  sourceType: 'official-rights'
  sourceUrl: string
  verifiedAt?: string
  validFrom?: string
  validThrough?: string
  season?: string
}
export type Participant = { name: string; badgeUrl: string | null; sourceId: string | null; sourceIds?: Record<string, string>; aliases?: string[] }
export type MatchVenue = { name: string; city?: string; region?: string; country?: string; streetAddress?: string; postalCode?: string; sourceUrl: string; checkedAt: string }
export type Match = {
  canonicalPath?: string
  publicPathAliases?: string[]
  canonicalSlug?: string
  id: string
  mergedIds?: string[]
  title: string
  sport: string
  competition: string
  competitionKey?: string
  competitionCountry?: string | null
  competitionLogo?: string | null
  sourceIds?: Record<string, string>
  fixtureSource?: { name: string; url: string; checkedAt: string }
  venue?: MatchVenue
  broadcasterEvidence?: { source?: string; url?: string; eventMatched?: boolean; sourceEventMatched?: boolean }
  broadcastRights?: BroadcastRight[]
  phase?: string
  validUntil?: string
  startsAt: string
  broadcasts: Broadcast[]
  homeTeam: Participant | null
  awayTeam: Participant | null
}
export type MatchFeed = {
  fixtureUpdates?: { id: string; phase: string }[]
  generatedAt: string | null
  expiresAt: string | null
  events: Match[]
  state: 'ready' | 'expired' | 'unavailable'
  rejected: number
  sources?: { name: string; ok: boolean; detail?: string }[]
  pipeline?: { requests: number; succeeded: number; failed: number; successRatio: number; minimumSuccessRatio: number }
}

const officialHosts = new Set([
  'www.skysports.com', 'www.nba.com', 'www.laliga.com', 'ma-api.ligue1.fr', 'ligue1.com', 'www.ligue1.com',
  'www.formula1.com', 'www.premierleague.com', 'www.bundesliga.com', 'www.beinsports.com', 'www.movistarplus.es',
  'www.tntsports.co.uk', 'www.uefa.com', 'sportapi.mlssoccer.com', 'www.mlssoccer.com', 'digitalhub.fifa.com', 'www.fifa.com',
  'www.paramountpressexpress.com', 'www.paramountplus.com', 'newsroom.disney.fr', 'dazngroup.com', 'www.stan.com.au', 'www.fubo.tv', 'www.starhub.com', 'tv.apple.com'
])
const officialViewingHosts = new Set(['www.paramountplus.com', 'www.disneyplus.com', 'www.dazn.com', 'plus.espn.com', 'connect-au.beinsports.com', 'connect-nz.beinsports.com', 'tv.apple.com'])
const officialExactTypes = new Set(['official-event', 'official-broadcaster-schedule'])
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const safeDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 10)) ? text(value, 10) : undefined

function safeHttps(value: unknown, allowedHosts: Set<string>): URL | null {
  try {
    const url = new URL(String(value))
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && allowedHosts.has(url.hostname) ? url : null
  } catch { return null }
}

function sourceIds(value: unknown): Record<string, string> | undefined {
  const ids = Object.entries(object(value)).flatMap(([key, value]) => {
    const id = text(value, 80)
    return /^[a-z0-9_.:-]{1,80}$/i.test(key) && id && !/[<>\u0000-\u001f]/.test(id) ? [[key, id] as const] : []
  }).slice(0, 20)
  return ids.length ? Object.fromEntries(ids) : undefined
}

export function safeTeamBadge(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 600) return null
  try {
    const url = new URL(value)
    const pathAllowed = ['r2.thesportsdb.com', 'www.thesportsdb.com'].includes(url.hostname)
      ? /^\/images\/media\/team\/badge\/[a-zA-Z0-9_.-]+\.(?:png|webp|jpg)$/i.test(url.pathname)
      : url.hostname === 'assets.laliga.com'
        ? /^\/assets\/\d{4}\/\d{2}\/\d{2}\/(?:small|medium|large)\/[a-z0-9_.-]+\.png$/i.test(url.pathname)
        : url.hostname === 'images.mlssoccer.com'
          ? /^\/image\/upload\/[a-z0-9_,.-]+\/v\d+\/assets\/[a-z0-9_./-]+\.png$/i.test(url.pathname)
          : false
    return url.protocol === 'https:' && pathAllowed && !url.port && !url.username && !url.password && !url.search && !url.hash ? url.href : null
  } catch { return null }
}

function participant(value: unknown): Participant | null {
  const item = object(value)
  const name = text(item.name, 150)
  if (!name) return null
  const ids = sourceIds(item.sourceIds)
  const id = ids?.thesportsdb
  const aliases = (Array.isArray(item.aliases) ? item.aliases : []).map(value => text(value, 150)).filter(Boolean).slice(0, 30)
  return { name, badgeUrl: safeTeamBadge(item.badgeUrl), sourceId: id && /^\d+$/.test(id) ? id : null, ...(ids ? { sourceIds: ids } : {}), ...(aliases.length ? { aliases } : {}) }
}

function territories(value: Record<string, unknown>): string[] {
  const values = [...(Array.isArray(value.territories) ? value.territories : []), value.territory]
  return [...new Set(values.map(code => text(code, 10).toUpperCase()).filter(code => /^[A-Z]{2}$/.test(code)))].slice(0, 80)
}

function normalizeBroadcast(value: unknown, row: Record<string, unknown>, expires: number, now: number): Broadcast[] {
  const item = object(value)
  const channel = text(item.channelName, 150)
  const sourceType = text(item.sourceType, 80)
  const platformOnly = /^(?:DAZN|Apple TV|Apple TV\+|WOW|Sky Deutschland|Paramount\+|ESPN\+|Prime Video|Amazon Prime Video|Orange TV)$/i.test(channel)
  const destinationPrecision = platformOnly ? 'service' : text(item.destinationPrecision, 30) || 'channel'
  const matchingMethod = text(item.matchingMethod ?? item.ruleType, 120)
  if (!channel || item.confirmed !== true) return []
  // Older v1 producers incorrectly marked this competition-wide table as a
  // race schedule. Its legacy confirmed flag cannot establish an exact channel.
  if (matchingMethod === 'official-country-broadcaster-table' || /formula1\.com\/en\/information\/f1-broadcasters/i.test(String(item.sourceUrl))) return []

  let evidenceLevel: Broadcast['evidenceLevel'] | null = null
  let source: URL | null = null
  if (officialExactTypes.has(sourceType) && ['channel', 'service', 'network'].includes(destinationPrecision) && item.destinationVerified !== false) {
    source = safeHttps(item.sourceUrl, officialHosts)
    evidenceLevel = source ? 'A' : null
  } else if (sourceType === 'official-all-events' && destinationPrecision === 'service' && matchingMethod === 'all-events') {
    source = safeHttps(item.sourceUrl, officialHosts)
    evidenceLevel = source ? 'B' : null
  } else if (sourceType === 'source-event') {
    source = safeHttps(item.sourceUrl, new Set(['www.thesportsdb.com']))
    evidenceLevel = source ? 'C' : null
  }
  if (!source || !evidenceLevel) return []
  if (source.hostname === 'www.nba.com' && !/^\/game\/[a-z0-9-]+-\d{10}\/?$/.test(source.pathname)) return []

  const ids = sourceIds(row.sourceIds)
  const sourceUrl = source.hostname === 'www.thesportsdb.com' && /^\d+$/.test(ids?.thesportsdb ?? '')
    ? `https://www.thesportsdb.com/event/${ids!.thesportsdb}` : source.href
  const aliases = (Array.isArray(item.aliases) ? item.aliases : []).map(value => text(value, 150)).filter(Boolean).slice(0, 30)
  const viewing = safeHttps(item.viewingUrl, officialViewingHosts)
  const viewingUrl = viewing && !viewing.search && !viewing.hash && (/^\/shows\/[a-z0-9-]+(?:\/episodes)?\/?$/.test(viewing.pathname) || /^(?:\/|\/fr-FR\/home)$/.test(viewing.pathname)) ? viewing.href : undefined
  const language = object(item.languageEvidence)
  const languageSource = safeHttps(language.sourceUrl, new Set([...officialHosts, 'www.bein.com']))
  const reviewedAudio = reviewedEvidence.channelAudioEvidence.some(rule => languageSource?.href === rule.sourceUrl &&
    rule.scope === language.scope && rule.region === item.region && rule.channelNames.includes(channel) && source.hostname === rule.scheduleHost &&
    Date.parse(String(language.verifiedAt)) === Date.parse(rule.verifiedAt) && now >= Date.parse(rule.verifiedAt) && now < Date.parse(rule.reviewValidUntil) &&
    Array.isArray(item.languages) && item.languages.length > 0 && item.languages.every(code => rule.languages.includes(String(code))))
  const languageEvidence = languageSource && (languageSource.hostname === source.hostname || reviewedAudio) && ['event-audio', 'feed-audio'].includes(String(language.scope)) && Number.isFinite(Date.parse(String(language.verifiedAt))) && Date.parse(String(language.verifiedAt)) <= now
    ? { sourceUrl: languageSource.href, verifiedAt: String(language.verifiedAt), scope: language.scope as 'event-audio' | 'feed-audio' } : undefined
  const ownExpiry = Date.parse(String(item.validUntil))
  const expiry = Number.isFinite(ownExpiry) ? Math.min(expires, ownExpiry) : expires
  return territories(item).filter(territory => !(territory === 'GB' && /viaplay/i.test(channel)) &&
    !(sourceType === 'source-event' && isUnconfirmedLegacyChannel(channel, territory, new Date(Number(row.startUtcEpochSeconds) * 1000).toISOString()))).map(territory => ({
    channel, originalChannelName: text(item.originalChannelName, 150) || channel, territory, sourceUrl,
    languages: languageEvidence ? normalizeBroadcastLanguages(item.languages) : [],
    ...(languageEvidence ? { languageEvidence } : {}),
    official: evidenceLevel === 'A' || evidenceLevel === 'B', sourceType, evidenceLevel,
    validUntil: new Date(expiry).toISOString(),
    ...(destinationPrecision ? { destinationPrecision } : {}),
    ...(text(item.destinationType, 30) ? { destinationType: text(item.destinationType, 30) } : {}),
    ...(matchingMethod ? { matchingMethod } : {}),
    ...(text(item.rightsHolder, 120) ? { rightsHolder: text(item.rightsHolder, 120) } : {}),
    ...(text(item.scope, 300) ? { scope: text(item.scope, 300) } : {}),
    ...(aliases.length ? { aliases } : {}),
    ...(Number.isFinite(Date.parse(String(item.verifiedAt))) ? { verifiedAt: new Date(String(item.verifiedAt)).toISOString() } : {}),
    ...(Number.isFinite(Date.parse(String(item.checkedAt))) ? { checkedAt: new Date(String(item.checkedAt)).toISOString() } : {}),
    ...(viewingUrl ? { viewingUrl } : {})
  }))
}

function normalizeRights(value: unknown, starts: number): BroadcastRight[] {
  const eventDay = new Date(starts).toISOString().slice(0, 10)
  return (Array.isArray(value) ? value : []).flatMap(entry => {
    const item = object(entry), territory = text(item.territory, 10).toUpperCase()
    const validFrom = safeDate(item.validFrom), validThrough = safeDate(item.validThrough)
    const source = safeHttps(item.sourceUrl, officialHosts)
    const holders = (Array.isArray(item.holders) ? item.holders : []).flatMap(holderValue => {
      const holder = object(holderValue), name = text(holder.name, 120), kind = text(holder.kind, 30)
      return name ? [{ name, ...(kind ? { kind } : {}) }] : []
    }).slice(0, 20)
    if (!/^[A-Z]{2}$/.test(territory) || item.sourceType !== 'official-rights' || !source || !holders.length || (validFrom && eventDay < validFrom) || (validThrough && eventDay > validThrough)) return []
    return [{ territory, holders, sourceType: 'official-rights' as const, sourceUrl: source.href, ...(safeDate(item.verifiedAt) ? { verifiedAt: safeDate(item.verifiedAt) } : {}), ...(validFrom ? { validFrom } : {}), ...(validThrough ? { validThrough } : {}), ...(text(item.season, 20) ? { season: text(item.season, 20) } : {}) }]
  })
}

export function evidenceLevelForSource(broadcast: Broadcast): Exclude<EvidenceLevel, 'D' | 'E'> {
  if (broadcast.evidenceLevel) return broadcast.evidenceLevel
  if (['direct-broadcaster', 'direct-organizer', 'official-event', 'official-broadcaster-schedule'].includes(broadcast.sourceType)) return 'A'
  if (broadcast.sourceType === 'official-all-events') return 'B'
  return 'C'
}

export function isExactChannelBroadcast(broadcast: Broadcast, now = Date.now()) {
  return broadcast.official &&
    evidenceLevelForSource(broadcast) === 'A' &&
    (broadcast.destinationPrecision ?? 'channel') === 'channel' &&
    (!broadcast.validUntil || Date.parse(broadcast.validUntil) > now)
}

export function evidenceLevelFor(event: Match, country: string, now = Date.now()): EvidenceLevel {
  const broadcasts = event.broadcasts.filter(item => item.territory === country && (!item.validUntil || Date.parse(item.validUntil) > now))
  if (broadcasts.some(item => evidenceLevelForSource(item) === 'A')) return 'A'
  if (broadcasts.some(item => evidenceLevelForSource(item) === 'B')) return 'B'
  if (broadcasts.some(item => evidenceLevelForSource(item) === 'C')) return 'C'
  if (event.broadcastRights?.some(item => item.territory === country)) return 'D'
  return 'E'
}

export const evidenceLabels: Record<EvidenceLevel, string> = {
  A: 'Exact match confirmed',
  B: 'All-match service verified',
  C: 'Match-specific listing',
  D: 'Not event-specific',
  E: 'No verified broadcaster data'
}

export function normalizeMatches(input: unknown, now = Date.now(), horizonDays = 7): MatchFeed {
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 166) throw new Error('invalid-schedule-horizon')
  const data = object(input)
  const generated = Number(data.generatedAtEpochSeconds) * 1000, expires = Number(data.validUntilEpochSeconds) * 1000
  if (data.schemaVersion !== 1 || !Number.isFinite(generated) || !Number.isFinite(expires) || generated <= 0 || generated > now + 300_000 || expires <= generated || expires - generated > 12 * 60 * 60_000 || !Array.isArray(data.events) || data.events.length > 5000) throw new Error('invalid-feed')
  const result: MatchFeed = { generatedAt: new Date(generated).toISOString(), expiresAt: new Date(expires).toISOString(), events: [], state: now >= expires ? 'expired' : 'ready', rejected: 0 }
  if (result.state === 'expired') return result
  const unique = new Map<string, Match>()
  const conflicts = new Set<string>()
  for (const value of data.events) {
    const row = object(value), id = text(row.id, 120), title = text(row.title), sport = text(row.sport, 50)
    const competition = text(row.competition, 150) || `${sport ? sport[0].toUpperCase() + sport.slice(1) : 'Sports'} · competition not supplied`
    const starts = Number(row.startUtcEpochSeconds) * 1000
    if (!id || /[\u0000-\u001f<>]/.test(id) || conflicts.has(id) || !title || !['football', 'basketball', 'tennis', 'rugby', 'cricket', 'formula1', 'motorsport'].includes(sport) || row.status !== 'confirmed' || !Number.isFinite(starts)) { result.rejected++; continue }
    if (starts < now || starts > now + horizonDays * 24 * 60 * 60_000) continue
    const broadcasts = (Array.isArray(row.broadcasts) ? row.broadcasts : []).slice(0, 256).flatMap(item => normalizeBroadcast(item, row, expires, now))
    const rights = normalizeRights(row.broadcastRights, starts)
    const dedup = [...new Map(broadcasts.map(b => [`${b.territory}:${b.channel}:${b.sourceUrl}:${b.evidenceLevel}`, b])).values()]
    if (!dedup.length && !rights.length && sport !== 'football') { result.rejected++; continue }
    const startsAt = new Date(starts).toISOString(), existing = unique.get(id)
    if (existing && (existing.title !== title || existing.startsAt !== startsAt || existing.sport !== sport || existing.competition !== competition)) { unique.delete(id); conflicts.add(id); result.rejected++; continue }
    const evidence = object(row.broadcasterEvidence)
    const ids = sourceIds(row.sourceIds)
    const evidenceUrl = safeHttps(evidence.url, officialHosts)
    const normalized: Match = {
      id, title, sport, competition, startsAt,
      broadcasts: existing ? [...new Map([...existing.broadcasts, ...dedup].map(b => [`${b.territory}:${b.channel}:${b.sourceUrl}:${b.evidenceLevel}`, b])).values()] : dedup,
      broadcastRights: existing ? [...new Map([...(existing.broadcastRights ?? []), ...rights].map(right => [`${right.territory}:${right.sourceUrl}`, right])).values()] : rights,
      homeTeam: participant(row.homeTeam), awayTeam: participant(row.awayTeam),
      ...(ids ? { sourceIds: ids } : {}),
      ...(Object.keys(evidence).length ? { broadcasterEvidence: { ...(text(evidence.source, 80) ? { source: text(evidence.source, 80) } : {}), ...(evidenceUrl ? { url: evidenceUrl.href } : {}), ...(typeof evidence.eventMatched === 'boolean' ? { eventMatched: evidence.eventMatched } : {}), ...(typeof evidence.sourceEventMatched === 'boolean' ? { sourceEventMatched: evidence.sourceEventMatched } : {}) } } : {})
    }
    unique.set(id, normalized)
  }
  result.events = [...unique.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return result
}

export function filterMatches(feed: MatchFeed, options: { country: string; sport?: string; date?: string; query?: string; officialOnly?: boolean; timeZone?: string; includeGlobal?: boolean }, now = Date.now()) {
  if (feed.state !== 'ready' || !feed.expiresAt || Date.parse(feed.expiresAt) <= now) return []
  return feed.events.filter(event => {
    if (event.validUntil && Date.parse(event.validUntil) <= now) return false
    if (Date.parse(event.startsAt) < now || (options.sport && options.sport !== 'all' && event.sport !== options.sport)) return false
    if (options.query && !`${event.title} ${event.competition} ${event.broadcasts.map(b => `${b.channel} ${b.rightsHolder ?? ''}`).join(' ')}`.toLowerCase().includes(options.query.trim().toLowerCase())) return false
    if (options.date && options.date !== 'all') {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: options.timeZone ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(event.startsAt))
      if (day !== options.date) return false
    }
    if (options.includeGlobal) return true
    const level = evidenceLevelFor(event, options.country, now)
    return options.officialOnly ? level === 'A' || level === 'B' : ['A', 'B', 'C'].includes(level)
  })
}
