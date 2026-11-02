import type { Match } from './feed.ts'
import { canonicalMatchId } from './event-aliases'
import {publicEventPath} from '../../public/event-routes.js'

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
