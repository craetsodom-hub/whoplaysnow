import { competitionIdentity } from '../utility-identity'
import { canonicalSportCategory } from './competitions'
import { isExactChannelBroadcast, type Match, type MatchFeed } from './feed'
import { broadcastsIn, countryName, currentBroadcasts, guideSlug } from './guide'
import labels from './country-labels.json'
import territoryCatalog from './viewing-territories.json'
import { isUnsupportedFixture } from './fixture-integrity'

// A viewing territory changes channel availability, never whether a fixture exists.
export const viewingCountries = territoryCatalog.territories
  .map(code => ({ code, label: (labels as Record<string, string>)[code] ?? code }))
  .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))

export const competitionKey = (event: Match) => event.competitionKey ?? competitionIdentity(event.competition, event.sport).key ?? guideSlug(event.competition)

export const FIVE_MONTH_HORIZON_DAYS = 165

export function upcomingSchedule(feed: MatchFeed, now: number, horizonDays = 7): Match[] {
  if (feed.state !== 'ready' || !feed.expiresAt || !(Date.parse(feed.expiresAt) > now)) return []
  return feed.events.filter(event => !isUnsupportedFixture(event) && !/postponed|cancel|confirm/i.test(event.phase ?? '') && Date.parse(event.startsAt) >= now && Date.parse(event.startsAt) < now + horizonDays * 86400_000 && (!event.validUntil || Date.parse(event.validUntil) > now))
    .sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export type ScheduleFilters = { country: string; sport?: string; competition?: string; date?: string; query?: string; exact?: boolean; timeZone?: string; horizonDays?: number }
export function discoverSchedule(feed: MatchFeed, filters: ScheduleFilters, now: number) {
  const events = upcomingSchedule(feed, now, filters.horizonDays ?? 7)
  return filterSchedule(events, filters, now)
}

// The browser memoizes the full ordered schedule once per feed/clock update.
// Changing a country, date or search term only needs to filter those records.
export function filterSchedule(events: Match[], filters: ScheduleFilters, now: number) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: filters.timeZone ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
  const query = filters.query?.trim().toLowerCase() ?? ''
  const selected = events.filter(event => {
    if (filters.sport && filters.sport !== 'all' && event.sport !== filters.sport && canonicalSportCategory(event.sport) !== canonicalSportCategory(filters.sport)) return false
    if (filters.competition && competitionKey(event) !== filters.competition) return false
    if (filters.date && filters.date !== 'all') {
      if (filters.date === '7d') {
        if (Date.parse(event.startsAt) >= now + 7 * 86400_000) return false
      } else if (/^\d{4}-\d{2}$/.test(filters.date)) {
        if (!day.format(new Date(event.startsAt)).startsWith(filters.date)) return false
      } else if (day.format(new Date(event.startsAt)) !== filters.date) {
        return false
      }
    }
    if (filters.exact && !broadcastsIn(event, filters.country, 'all', now).some(b => isExactChannelBroadcast(b, now))) return false
    if (query && !`${event.title} ${event.competition} ${broadcastsIn(event, filters.country, 'all', now).map(b => `${b.channel} ${b.rightsHolder ?? ''}`).join(' ')}`.toLowerCase().includes(query)) return false
    return true
  })
  return {
    events, selected,
    local: selected.filter(event => broadcastsIn(event, filters.country, 'all', now).length > 0),
    other: selected.filter(event => broadcastsIn(event, filters.country, 'all', now).length === 0),
  }
}

export function countryAlternatives(event: Match, selectedCountry: string, now: number) {
  return [...new Set(currentBroadcasts(event, now).map(b => b.territory))]
    .filter(code => code !== selectedCountry)
    .sort((a, b) => {
      const left = countryName(a)
      const right = countryName(b)
      return left < right ? -1 : left > right ? 1 : 0
    })
}

export function currentRights(event: Match, country: string, now: number) {
  const eventDay = event.startsAt.slice(0, 10)
  const today = new Date(now).toISOString().slice(0, 10)
  return (event.broadcastRights ?? []).filter(right => right.territory === country &&
    (!right.validFrom || eventDay >= right.validFrom) && (!right.validThrough || (eventDay <= right.validThrough && today <= right.validThrough)))
}
