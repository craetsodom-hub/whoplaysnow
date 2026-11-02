import type { Match, Participant } from './feed'
import { canonicalMatchId } from './event-aliases'
import { fetchScheduleHtml } from './official'
import { fixtureVenue } from './venue'

// Reviewed Spanish consumer TV schedule, not the international rights-holder
// directory. Its channel assignments are attached to individual fixture IDs.
export const LALIGA_CONSUMER_SCHEDULE = 'https://www.laliga.com/iframes/external-consumer-broadcast'
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim().slice(0, 180) : ''
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const safeId = (value: unknown) => /^\d{1,8}$/.test(String(value)) && Number(value) > 0 ? String(value) : null
const explicitInstant = (value: unknown) => typeof value === 'string' && /T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN

function participant(value: unknown): Participant | null {
  const team = object(value), id = safeId(team.id), name = text(team.nickname) || text(team.name), slug = text(team.slug)
  if (!id || !name || !/^[a-z0-9-]+$/.test(slug)) return null
  // Reviewed organizer entities, not a general fuzzy "Racing" match. Primary
  // source identity evidence is stored in docs/seo-evidence/racing-espanyol-identity.json.
  const reviewedAliases = id === '49' && slug === 'r-racing-club' ? ['Racing Santander'] : id === '8' && slug === 'rcd-espanyol' ? ['Espanyol'] : []
  const shield = object(team.shield), logo = text(object(shield.resizes).small) || text(shield.url)
  const badgeUrl = /^https:\/\/assets\.laliga\.com\/assets\/\d{4}\/\d{2}\/\d{2}\/(?:small|medium|xlarge)\/[a-zA-Z0-9_-]+\.png$/.test(logo) ? logo : null
  return { name, aliases: [...new Set([text(team.name), text(team.boundname), text(team.shortname), ...reviewedAliases].filter(Boolean))], sourceId: `laliga:${id}`, sourceIds: { laliga: id }, badgeUrl }
}

export function laligaSchedule(input: unknown, now = Date.now()) {
  const matches = object(object(object(object(input).props).pageProps).matches)
  const competitions = [
    { source: 'laliga-easports', route: 'laliga-ea-sports', id: 1, slug: 'primera-division', name: 'LaLiga', key: 'la-liga' },
    { source: 'laliga-hypermotion', route: 'laliga-hypermotion', id: 2, slug: 'segunda-division', name: 'LaLiga Hypermotion', key: 'la-liga-2' },
  ]
  if (!competitions.every(c => Array.isArray(matches[c.source]) && rows(matches[c.source]).length <= 40) || !competitions.some(c => rows(matches[c.source]).length)) throw new Error('invalid-laliga-schedule')
  const events: Match[] = [], fixtureUpdates: { id: string; phase: string }[] = []
  for (const league of competitions) for (const value of rows(matches[league.source])) {
    const row = object(value), id = safeId(row.id), competition = object(row.competition), slug = text(row.slug), season = object(row.season)
    if (!id || competition.id !== league.id || competition.slug !== league.slug || !/^temporada-\d{4}-\d{4}$/.test(text(season.slug)) || !slug.startsWith(`${season.slug}-${league.route}-`) || !/^[a-z0-9-]+$/.test(slug)) continue
    const eventId = canonicalMatchId(`laliga-${id}`)
    const phase = ({ Postponed: 'Postponed', Cancelled: 'Canceled', Canceled: 'Canceled' } as Record<string, string>)[String(row.status)]
    if (phase) { fixtureUpdates.push({ id: eventId, phase }); continue }
    const starts = explicitInstant(row.date), timed = explicitInstant(row.time)
    if (row.status === 'PreMatch' && row.time === null && Number.isFinite(starts) && starts >= now && starts <= now + 7 * 86400_000) {
      fixtureUpdates.push({ id: eventId, phase: 'Kickoff to be confirmed' })
      continue
    }
    if (row.status !== 'PreMatch' || !Number.isFinite(starts) || timed !== starts || starts < now || starts > now + 7 * 86400_000) continue
    const homeTeam = participant(row.home_team), awayTeam = participant(row.away_team)
    if (!homeTeam || !awayTeam || homeTeam.sourceId === awayTeam.sourceId) continue
    const sourceUrl = `https://www.laliga.com/partido/${slug}`
    const venue = fixtureVenue(row.venue, sourceUrl, new Date(now).toISOString())
    const broadcasts = rows(row.channels).slice(0, 20).flatMap(value => {
      const channel = object(value), name = text(channel.name)
      const countries = rows(channel.countries)
      if (!safeId(channel.id) || !name || (countries.length && !countries.some(c => object(c).id === 'ES'))) return []
      const image=object(channel.image), artwork=text(object(image.resizes).small)||text(image.url)
      const logoUrl=/^https:\/\/assets\.laliga\.com\/assets\/\d{4}\/\d{2}\/\d{2}\/(?:xsmall|small|medium|large|xlarge)\/[a-zA-Z0-9_-]+\.png$/.test(artwork)?artwork:undefined
      return [{ channel: name, territory: 'ES', languages: [], official: true, sourceType: 'direct-organizer', evidenceLevel: 'A' as const,
        ...(logoUrl?{logoUrl}:{}),
        destinationPrecision: /^DAZN(?: EN ABIERTO)?$/.test(name) ? 'service' : 'channel',
        matchingMethod: 'official-fixture-id', sourceUrl, scheduleUrl: LALIGA_CONSUMER_SCHEDULE,
        checkedAt: new Date(now).toISOString(), validUntil: new Date(now + 24 * 3600_000).toISOString() }]
    })
    events.push({ id: eventId, sourceIds: { laliga: id }, title: `${homeTeam.name} vs ${awayTeam.name}`, sport: 'football', competition: league.name, competitionKey: league.key, competitionCountry: 'ES', startsAt: new Date(starts).toISOString(), fixtureSource: { name: 'LaLiga official schedule', url: sourceUrl, checkedAt: new Date(now).toISOString() }, ...(venue ? { venue } : {}), homeTeam, awayTeam, broadcasts })
  }
  return { events, fixtureUpdates }
}

export async function collectLaLiga(now = Date.now(), fetcher: typeof fetch = fetch) {
  try {
    const html = await fetchScheduleHtml(LALIGA_CONSUMER_SCHEDULE, fetcher)
    const script = html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
    if (!script) throw new Error('laliga-format-unavailable')
    return { ...laligaSchedule(JSON.parse(script[1]), now), sources: [{ name: 'LaLiga · official Spanish consumer schedule', ok: true }] }
  } catch {
    return { events: [], fixtureUpdates: [], sources: [{ name: 'LaLiga · official Spanish consumer schedule', ok: false }] }
  }
}
