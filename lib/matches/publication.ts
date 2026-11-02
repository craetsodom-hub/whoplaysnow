import { createHash } from 'node:crypto'
import { matchSlug, matchSourceIds } from './routes'
import { hasIndexableEvent } from './guide'
import type { Match } from './feed'

export type PublishedMatch = { event: Match; slug: string; hash: string; published: boolean; changedAt: string; observedAt: string; firstSeen?: string }
export const sourceAliases = (event: Pick<Match, 'id' | 'sourceIds'>) => [...new Set([`id:${event.id}`, ...Object.entries(matchSourceIds(event)).map(([source, id]) => `${source}:${id}`)])].sort()

const name = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
function sameParticipant(a: Match['homeTeam'], b: Match['homeTeam']) {
  if (!a || !b) return !a && !b
  if (a.sourceId && b.sourceId && a.sourceId === b.sourceId) return true
  const left = new Set([a.name, ...(a.aliases ?? [])].map(name))
  return [b.name, ...(b.aliases ?? [])].some(value => left.has(name(value)))
}
export function compatibleIdentity(a: Match, b: Match) {
  return a.sport === b.sport && (a.competitionKey && b.competitionKey ? a.competitionKey === b.competitionKey : name(a.competition) === name(b.competition)) && sameParticipant(a.homeTeam, b.homeTeam) && sameParticipant(a.awayTeam, b.awayTeam)
}

// A collection heartbeat is not a new version of a page. Array order and
// source/cache timestamps must not trigger sitemap or IndexNow churn.
function material(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => { const m = material(item); return { m, s: JSON.stringify(m) } }).sort((a, b) => a.s.localeCompare(b.s)).map(entry => entry.m)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['checkedAt', 'verifiedAt', 'validUntil', 'canonicalSlug', 'publication'].includes(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, material(item)]))
  return value
}
export function matchContentHash(event: Match) { return createHash('sha256').update(JSON.stringify(material(event))).digest('hex') }

export function preparePublication(incoming: Match, previous?: PublishedMatch, now = Date.now()): PublishedMatch {
  if (previous && !compatibleIdentity(previous.event, incoming)) throw new Error('conflicting-event-identity')
  const { validUntil: _feedExpiry, ...fixture } = incoming
  const rescheduled = previous && (previous.event.startsAt !== incoming.startsAt || previous.event.phase !== incoming.phase)
  const fresh = incoming.broadcasts
  // This reviewed organizer page is a complete fixture/channel snapshot for
  // Spain. A fresh replacement from the same page must retire yesterday's
  // allocation, while preserving separate countries and independent publishers.
  const replacedAllocation = (old: Match['broadcasts'][number]) => old.sourceType === 'direct-organizer' && fresh.some(next =>
    next.sourceType === 'direct-organizer' && next.matchingMethod === 'official-fixture-id' &&
    next.scheduleUrl === 'https://www.laliga.com/iframes/external-consumer-broadcast' &&
    next.sourceUrl === old.sourceUrl && next.territory === old.territory &&
    Number.isFinite(Date.parse(next.checkedAt ?? '')) && Date.parse(next.checkedAt!) >= (Date.parse(old.checkedAt ?? '') || 0))
  // An unavailable source must not erase another source's still-valid listing.
  // Rescheduling invalidates every allocation carried over from the old kickoff.
  const retained = previous && !rescheduled ? previous.event.broadcasts.filter(b => b.validUntil && Date.parse(b.validUntil) > now && !replacedAllocation(b) && !fresh.some(n => n.territory === b.territory && n.channel === b.channel && n.sourceUrl === b.sourceUrl)) : []
  const event: Match = { ...fixture, id: previous?.event.id ?? incoming.id, sourceIds: { ...previous?.event.sourceIds, ...incoming.sourceIds }, broadcasts: [...fresh, ...retained] }
  const hash = matchContentHash(event)
  return { event, slug: previous?.slug ?? matchSlug(event), hash, published: Boolean(previous?.published || hasIndexableEvent(event, now)), observedAt: new Date(now).toISOString(), changedAt: previous?.hash === hash ? previous.changedAt : new Date(now).toISOString() }
}

export function notificationRetryAt(attempts: number, now = Date.now()) { return new Date(now + Math.min(24 * 60, 5 * 2 ** Math.min(attempts, 9)) * 60_000) }

export function fixtureObservationIsFresh(observedAt: string, now = Date.now()) { const stamp = Date.parse(observedAt); return Number.isFinite(stamp) && stamp <= now + 60_000 && stamp > now - 48 * 3600_000 }
