import en from './messages/en.json'
import es from './messages/es.json'
import fr from './messages/fr.json'
import de from './messages/de.json'
import it from './messages/it.json'
import pt from './messages/pt.json'
import ar from './messages/ar.json'
import { MATCH_LOCALES, matchPath, type MatchLocale } from './routes'
import type { Match } from './feed'
import countryLabels from './country-labels.json'

export const MATCH_MESSAGES = { en, es, fr, de, it, pt, ar } satisfies Record<MatchLocale, Record<keyof typeof en, string>>
export const MATCH_LANGUAGE_NAMES: Record<MatchLocale, string> = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português', ar: 'العربية' }
export function matchCopy(locale: MatchLocale, key: keyof typeof en, values: Record<string, string | number> = {}) {
  return MATCH_MESSAGES[locale][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder))
}
const countries = new Map<MatchLocale, Intl.DisplayNames>()
export function matchCountry(code: string, locale: MatchLocale = 'en') {
  if (locale === 'en') return (countryLabels as Record<string, string>)[code] ?? code
  let names = countries.get(locale)
  if (!names) { names = new Intl.DisplayNames([locale], { type: 'region' }); countries.set(locale, names) }
  try { return names.of(code) ?? code } catch { return code }
}
export function eventHeading(event: Pick<Match, 'title' | 'homeTeam' | 'awayTeam'>, locale: MatchLocale) {
  if (!event.homeTeam || !event.awayTeam || locale === 'en') return event.title
  const separator = locale === 'ar' ? 'ضد' : locale === 'pt' ? 'x' : locale === 'fr' ? '–' : 'vs'
  return `${event.homeTeam.name} ${separator} ${event.awayTeam.name}`
}
export function matchLanguageAlternates(event: Pick<Match, 'id' | 'title' | 'canonicalSlug'>) {
  return { 'x-default': matchPath(event), ...Object.fromEntries(MATCH_LOCALES.map(locale => [locale, matchPath(event, locale)])) }
}
export function matchPhase(phase: string | undefined, past: boolean, locale: MatchLocale) {
  const key = /postponed/i.test(phase ?? '') ? 'postponed' : /cancel/i.test(phase ?? '') ? 'cancelled' : /confirm/i.test(phase ?? '') ? 'unconfirmed' : past ? 'passed' : 'scheduled'
  return matchCopy(locale, key)
}
