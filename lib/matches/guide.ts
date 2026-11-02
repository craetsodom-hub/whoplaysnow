import { evidenceLevelForSource, isExactChannelBroadcast, type Broadcast, type Match } from './feed.ts'
import countryLabels from './country-labels.json' with { type: 'json' }
import { ALL_SPORT_COMPETITIONS } from './competitions.ts'
import { hasCurrentFixtureSource, isUnsupportedFixture } from './fixture-integrity'
import withdrawnServiceEvidence from './withdrawn-service-evidence.json' with { type: 'json' }

const withdrawnServiceSources = new Set(withdrawnServiceEvidence.sourceUrls)
export const isWithdrawnBroadcast = (b: Broadcast) => evidenceLevelForSource(b) === 'B' && withdrawnServiceSources.has(b.sourceUrl)

export type LanguageEvidence = { sourceUrl: string; verifiedAt: string; scope: 'event-audio' | 'feed-audio' }
// Keep SSR and browsers on identical labels: their ICU versions can disagree
// (for example, "Palestine" versus "Palestinian Territories").
export const countryName = (code: string) => (countryLabels as Record<string, string>)[code] ?? code
export const guideSlug = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Keep country, channel number, quality and language variants in the identity.
// Only case and whitespace are presentation differences without an alias contract.
export function channelIdentity(b: Pick<Broadcast, 'channel' | 'territory'> & Partial<Broadcast>) {
  return `${b.territory.toLowerCase()}--${guideSlug(b.channel)}${b.languages?.length ? `--${[...b.languages].sort().join('-')}` : ''}`
}
export function currentBroadcasts(event: Match, now = Date.now()) {
  if (event.validUntil && Date.parse(event.validUntil) <= now) return []
  return event.broadcasts.filter(b => (!b.validUntil || Date.parse(b.validUntil) > now) &&
    !isWithdrawnBroadcast(b))
}
export function broadcastsIn(event: Match, country: string, language = 'all', now = Date.now()) {
  return currentBroadcasts(event, now).filter(b => b.territory === country && (language === 'all' || verifiedLanguages(b).includes(language)))
}
export function verifiedLanguages(b: Broadcast): string[] {
  return b.languageEvidence && ['event-audio', 'feed-audio'].includes(b.languageEvidence.scope) ? b.languages : []
}
export function broadcastKind(b: Broadcast) {
  const level = evidenceLevelForSource(b)
  if (level === 'C') return 'TV guide listing'
  if (level === 'B') return 'Streams every match'
  return b.destinationPrecision === 'service' || b.destinationPrecision === 'network' ? 'Live streaming' : 'TV channel'
}
export function distinctBroadcasts(items: Broadcast[]) {
  const stamp = (b: Broadcast) => Date.parse(b.checkedAt ?? b.verifiedAt ?? '') || 0
  const base = (b: Broadcast) => `${b.territory}|${b.channel.trim().toLowerCase()}|${b.destinationPrecision ?? 'channel'}`
  const sorted = [...items].sort((a, b) => evidenceLevelForSource(a).localeCompare(evidenceLevelForSource(b)) || stamp(b) - stamp(a))
  const audioCandidatesByBase = new Map<string, Broadcast[]>()
  for (const b of sorted) {
    if (verifiedLanguages(b).length > 0) {
      const k = base(b)
      const list = audioCandidatesByBase.get(k)
      if (list) list.push(b)
      else audioCandidatesByBase.set(k, [b])
    }
  }
  const selected = new Map<string, Broadcast>()
  for (const b of sorted) {
    // A newer reviewed service/audio record supersedes an older unspecified
    // record of that same service. Differently named/numbered feeds stay apart.
    if (b.destinationPrecision === 'service' && !verifiedLanguages(b).length) {
      const candidates = audioCandidatesByBase.get(base(b))
      if (candidates?.some(other => stamp(other) >= stamp(b) && evidenceLevelForSource(other) <= evidenceLevelForSource(b))) continue
    }
    const key = `${channelIdentity(b)}|${b.destinationPrecision ?? 'channel'}`
    if (!selected.has(key)) selected.set(key, b)
  }
  return [...selected.values()].sort((a, b) => evidenceLevelForSource(a).localeCompare(evidenceLevelForSource(b)) || a.channel.localeCompare(b.channel))
}
export function isUsefulMatch(event: Match, now = Date.now()) {
  return currentBroadcasts(event, now).length > 0
}
export function hasIndexableBroadcast(event: Match, now = Date.now()) {
  if (isUnsupportedFixture(event)) return false
  return currentBroadcasts(event, now).some(b => b.official && Boolean(b.sourceUrl) && ['A', 'B'].includes(evidenceLevelForSource(b)))
}
export function hasIndexableEvent(event: Match, now = Date.now()) {
  return !isUnsupportedFixture(event) && (hasCurrentFixtureSource(event, now) || hasIndexableBroadcast(event, now))
}
export function exactCount(events: Match[], country?: string, now = Date.now()) {
  return events.filter(event => currentBroadcasts(event, now).some(b => (!country || b.territory === country) && isExactChannelBroadcast(b, now))).length
}
export type Guide = { kind: 'competition' | 'team' | 'channel'; slug: string; name: string; events: Match[]; country?: string }
export const guidePath = (g: Pick<Guide, 'kind' | 'slug'>) => `/matches/guide/${g.kind}/${g.slug}`
function competitionGuideSlug(event: Match) {
  const known = ALL_SPORT_COMPETITIONS.find(row => (row.sport === event.sport || (row.sport === 'motorsport' && event.sport === 'formula1')) && guideSlug(row.name) === guideSlug(event.competition))
  return event.competitionKey ?? known?.key ?? guideSlug(event.competition)
}
// An event that has started can still lead to its actual continuing schedule.
// Only select guides that exist in the planning feed; never fabricate a URL or
// turn a lone event into a new schedule landing page.
export function relatedPlanningGuides(event: Match, guides: Guide[], now = Date.now()): Guide[] {
  const keys = new Set(['competition/' + competitionGuideSlug(event)])
  for (const team of [event.homeTeam, event.awayTeam]) if (team) keys.add('team/' + event.sport + '-' + guideSlug(team.name))
  for (const broadcast of currentBroadcasts(event, now)) if (isExactChannelBroadcast(broadcast, now)) keys.add('channel/' + channelIdentity(broadcast))
  return guides.filter(guide => keys.has(guide.kind + '/' + guide.slug))
}
export function buildGuides(events: Match[], now = Date.now()): Guide[] {
  const groups = new Map<string, Guide>()
  const add = (kind: Guide['kind'], slug: string, name: string, event: Match, country?: string) => {
    const key = `${kind}/${slug}`, group = groups.get(key) ?? { kind, slug, name, events: [], country }
    if (!group.events.some(row => row.id === event.id)) group.events.push(event)
    groups.set(key, group)
  }
  for (const event of events) {
    const exact = currentBroadcasts(event, now).filter(b => isExactChannelBroadcast(b, now))
    if (!hasIndexableEvent(event, now)) continue
    add('competition', competitionGuideSlug(event), event.competition, event)
    for (const team of [event.homeTeam, event.awayTeam]) if (team) add('team', `${event.sport}-${guideSlug(team.name)}`, team.name, event)
    for (const b of exact) add('channel', channelIdentity(b), b.channel, event, b.territory)
  }
  // At least two distinct events make a useful schedule rather than a duplicate match page.
  return [...groups.values()].filter(g => g.events.length >= 2)
}

// Search schedules use the full persisted horizon. The seven-day browser list
// and its shared-feed expiry must not hide independently current publications.
export function buildPlanningGuides(events: Match[], now = Date.now()): Guide[] {
  return buildGuides(events.filter(event => Date.parse(event.startsAt) >= now), now)
}
