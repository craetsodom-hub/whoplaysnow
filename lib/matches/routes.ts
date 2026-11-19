import type { Match } from './feed.ts'
import { canonicalMatchId } from './event-aliases'
import {publicEventPath,eventBasePath,routeSlug} from '../../public/event-routes.js'

// Before competition/matchup URLs, every fixture lived at
// /matches/{title}--{provider id}. Google still requests those URLs, so the
// server and the Worker resolve them the same way: the live fixture (301), its
// registered path (301 to the next meeting or 410), the next meeting of the
// same matchup named in the slug (301), and otherwise 410 for a real provider
// ID, because a URL of that shape was published, or 404 for anything else.
const PROVIDER_MATCH_ID = /^(espn|sky|nba|laliga|tsdb)-\d{1,20}$/
export const isProviderMatchId = (id: string | null | undefined) => !!id && PROVIDER_MATCH_ID.test(canonicalMatchId(id))

export function legacyMatchupSegment(slug: string): string | null {
  const separator = slug.lastIndexOf('--')
  if (separator < 1) return null
  const segment = routeSlug(slug.slice(0, separator))
  return segment === 'sports-event' ? null : segment
}

// Matchup segment ("everton-vs-newcastle-united") -> soonest meeting still on
// the schedule, using the same 3-hour window as retired competition paths.
export function legacyMatchupIndex<T extends { startsAt: string }>(events: T[], now: number) {
  const index = new Map<string, T>()
  for (const e of events) {
    if (!(Date.parse(e.startsAt) > now - 3 * 3600000)) continue
    const segment = eventBasePath(e).split('/')[2], seen = index.get(segment)
    if (!seen || e.startsAt < seen.startsAt) index.set(segment, e)
  }
  return index
}

export const MATCH_LOCALES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ar'] as const
export type MatchLocale = typeof MATCH_LOCALES[number]

export function matchLocale(value: unknown): MatchLocale | null {
  return typeof value === 'string' && (MATCH_LOCALES as readonly string[]).includes(value) ? value as MatchLocale : null
}

function slug(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110) || 'sports-event'
}

export function matchSlug(event: Pick<Match, 'id' | 'title' | 'canonicalSlug'>) {
  return event.canonicalSlug ?? `${slug(event.title)}--${encodeURIComponent(event.id)}`
}

export function matchIdFromSlug(value: string): string | null {
  const separator = value.lastIndexOf('--')
  if (separator < 1) return null
  try {
    const id = decodeURIComponent(value.slice(separator + 2))
    return id.length > 0 && id.length <= 120 && !/[<>/\\\u0000-\u001f]/.test(id) ? id : null
  } catch { return null }
}

export function matchPath(event: Pick<Match, 'id' | 'title' | 'canonicalSlug'> & Partial<Match>, locale: MatchLocale = 'en') {
  const base = event.competition||event.canonicalPath?publicEventPath(event):`/matches/${matchSlug(event)}`
  return locale === 'en' ? base : `${base}/${locale}`
}

export function matchSourceIds(event: Pick<Match, 'id' | 'sourceIds'>): Record<string, string> {
  const known = event.id.match(/^(espn|sky|nba|laliga|tsdb)-(\d{1,20})$/)
  return { ...(known ? { [known[1] === 'tsdb' ? 'thesportsdb' : known[1]]: known[2] } : {}), ...event.sourceIds }
}

// A newly connected broadcaster must not break the fixture's previous URL.
// Resolve only namespaced source identities, never similar-looking team names.
export function findMatchById(events: Match[], id: string | null) {
  if (!id) return undefined
  id = canonicalMatchId(id)
  const direct = events.find(event => event.id === id)
  if (direct) return direct
  const references = Object.entries(matchSourceIds({ id }))
  if (references.length !== 1) return undefined
  const [provider, sourceId] = references[0]
  const matches = events.filter(event => matchSourceIds(event)[provider] === sourceId)
  return matches.length === 1 ? matches[0] : undefined
}
