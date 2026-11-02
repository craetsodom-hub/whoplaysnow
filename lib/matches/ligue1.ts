import { fetchOfficialJson } from '../status/collect.ts'
import type { Match, Participant } from './feed'
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 160) : ''

export function ligue1Match(input: unknown, sourceUrl: string, now = Date.now()): Match | null {
  const data = obj(input), id = text(data.id), epoch = Date.parse(String(data.date))
  if (data.type !== 'l1_championship_match' || data.championshipId !== 1 || !/^l1_championship_match_\d+$/.test(id) || sourceUrl !== `https://ma-api.ligue1.fr/championship-match/${id}`) throw new Error('invalid-ligue1-match')
  if (data.period !== 'preMatch' || !String(data.date).endsWith('Z') || !Number.isFinite(epoch) || epoch < now || epoch > now + 72 * 3600_000) return null
  const participant = (input: unknown): Participant | null => {
    const team = obj(obj(input).clubIdentity), name = text(team.name), logo = text(obj(obj(team.assets).logo).small)
    const safeLogo = /^https:\/\/s3\.eu-west-1\.amazonaws\.com\/image\.mpg\/(?:assets\/clubs\/logo\/[a-zA-Z0-9_.-]+\.png|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(logo)
    return name ? { name, aliases: [...new Set(['officialName', 'shortName', 'displayName', 'businessName'].map(key => text(team[key])).filter(Boolean))], sourceId: text(team.id) || null, badgeUrl: safeLogo ? logo : null } : null
  }
  const homeTeam = participant(data.home), awayTeam = participant(data.away)
  if (!homeTeam || !awayTeam) throw new Error('invalid-ligue1-teams')
  const local = obj(data.broadcasters).local
  if (!Array.isArray(local)) throw new Error('invalid-ligue1-broadcasters')
  const broadcasts = local.flatMap(value => {
    const broadcaster = obj(value), names = obj(broadcaster.name), channel = text(names['fr-FR']) || text(names['en-GB']), link = text(broadcaster.link)
    if (!channel) return []
    return [{ channel, territory: 'FR', languages: [], rightsHolder: 'Ligue 1+', official: true, sourceType: 'direct-organizer', evidenceLevel: 'A' as const, destinationPrecision: 'channel', matchingMethod: 'official-match-id', sourceUrl, checkedAt: new Date(now).toISOString(), ...(/^https:\/\/(?:www\.)?ligue1plus\.fr\/?$/.test(link) ? { viewingUrl: link } : {}) }]
  })
  if (!broadcasts.length) return null
  return { id, title: `${homeTeam.name} vs ${awayTeam.name}`, sport: 'football', competition: 'French Ligue 1', fixtureSource: { name: 'Ligue 1 official schedule', url: sourceUrl, checkedAt: new Date(now).toISOString() }, startsAt: new Date(epoch).toISOString(), broadcasts, homeTeam, awayTeam }
}

export async function collectLigue1(index: unknown, now = Date.now(), fetcher: typeof fetch = fetch) {
  const data = obj(index), rows = Array.isArray(data.events) && data.events.length <= 5000 ? data.events : []
  // The supplied index discovers IDs only. Names, clocks and broadcasters are
  // re-read from the league; an expired index never supplies public event facts.
  const urls = [...new Set(rows.flatMap(value => { const row = obj(value); return (Array.isArray(row.broadcasts) ? row.broadcasts : []).map(value => text(obj(value).sourceUrl)).filter(url => /^https:\/\/ma-api\.ligue1\.fr\/championship-match\/l1_championship_match_\d+$/.test(url)) }))].slice(0, 20)
  const events: Match[] = []; let next = 0, checked = 0
  await Promise.all(Array.from({ length: Math.min(3, urls.length) }, async () => {
    while (next < urls.length) { const url = urls[next++]; try { const result = await fetchOfficialJson(url, fetcher); const event = ligue1Match(result.data, url, now); checked++; if (event) events.push(event) } catch { /* Never substitute index values for an unavailable league response. */ } }
  }))
  return { events, sources: [{ name: 'Ligue 1 · official match data', ok: checked > 0 }] }
}
