import type { Broadcast, Match } from './feed'
import { currentBroadcasts, distinctBroadcasts, isWithdrawnBroadcast } from './guide'
import { eventHeading, matchCopy, matchCountry, matchPhase } from './i18n'
import type { MatchLocale } from './routes'

// Metadata, visible answers and JSON-LD must describe the same source facts.
export function eventQuestions(event: Match, country: string, locale: MatchLocale, now: number, options: {timeZone?: string; historicalBroadcasts?: Broadcast[]} = {}) {
  const past = Date.parse(event.startsAt) < now
  const changed = /postponed|cancel|confirm/i.test(event.phase ?? '')
  // Expiry removes live viewing claims, not the saved historical record.
  // A withdrawn source must not be revived as historical evidence either.
  const broadcasts = changed ? [] : past
    ? (options.historicalBroadcasts ?? event.broadcasts).filter(b => !isWithdrawnBroadcast(b))
    : currentBroadcasts(event, now)
  const local = distinctBroadcasts(broadcasts.filter(b => b.territory === country))
  const channels = [...new Set(broadcasts.map(b => b.channel))].slice(0, 10).join(', ')
  let zone = options.timeZone ?? 'UTC'
  try { new Intl.DateTimeFormat(locale, {timeZone: zone}) } catch { zone = 'UTC' }
  const values = { event: eventHeading(event, locale), competition: event.competition, country: matchCountry(country, locale),
    channels, count: new Set(broadcasts.map(b => b.territory)).size,
    status: matchPhase(event.phase, past, locale),
    date: `${new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { dateStyle: 'long', timeStyle: 'short', timeZone: zone }).format(new Date(event.startsAt))} (${zone})` }
  return [
    { question: matchCopy(locale, past ? 'pastWhereQuestion' : 'whereQuestion', values), answer: local.length ? matchCopy(locale, past ? 'pastLocalAnswer' : 'localAnswer', { ...values, channels: local.map(b => b.channel).join(', ') }) : matchCopy(locale, past ? 'pastMissingAnswer' : 'missingAnswer', values) },
    { question: matchCopy(locale, past ? 'pastStartQuestion' : 'startQuestion', values), answer: matchCopy(locale, changed ? 'changedStartAnswer' : past ? 'pastStartAnswer' : 'startAnswer', values) },
    { question: matchCopy(locale, past ? 'pastWorldQuestion' : 'worldQuestion', values), answer: matchCopy(locale, past ? channels ? 'pastWorldAnswer' : 'pastWorldUnknown' : channels ? 'worldAnswer' : 'worldUnknown', values) },
  ]
}
