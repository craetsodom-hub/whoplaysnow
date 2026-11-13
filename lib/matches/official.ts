import type { Broadcast, Match, Participant } from './feed'
import { matchSourceIds } from './routes'
import { matchCompetition } from './competitions'

const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const clean = (value: unknown) => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#(?:0*39|x27);/gi, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, 160) : ''
const nameKey = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '')
function mergedParticipant(next: Participant | null, prior: Participant | null): Participant | null {
  const primary = next?.badgeUrl ? next : prior ?? next
  if (!primary) return null
  const references = (team: Participant | null) => {
    const source = team?.sourceId?.match(/^(espn|laliga):(\d+)$/)
    return { ...team?.sourceIds, ...(source ? { [source[1]]: source[2] } : {}) }
  }
  return { ...primary, aliases: [...new Set([next?.name, prior?.name, ...(next?.aliases ?? []), ...(prior?.aliases ?? [])].filter((name): name is string => Boolean(name)))], sourceIds: { ...references(prior), ...references(next) } }
}
export const SKY_SCHEDULES = [
  { url: 'https://www.skysports.com/watch/football-on-sky/competitions/premier-league', competition: 'Premier League' },
  { url: 'https://www.skysports.com/watch/football-on-sky/competitions/championship', competition: 'English League Championship' },
]
export type SkyRow = { home: string; away: string; preview: string; channels: string[]; competition: string; sourceUrl: string }

export function skyScheduleRows(html: string, sourceUrl: string, competition: string): SkyRow[] {
  return html.split(/<div\s+class="event-group\b[^">]*"[^>]*>/i).slice(1, 31).flatMap(block => {
    const event = block.split(/<\/p>/i)[0]
    const teams = [...event.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)].map(match => clean(match[1]))
    const preview = event.match(/href="(https:\/\/www\.skysports\.com\/football\/[a-z0-9-]+\/\d+)"/i)?.[1]
    const detail = clean(event.match(/<p\s+class="event-detail[^">]*"[^>]*>([\s\S]*?)$/i)?.[1])
    const channels = [...detail.matchAll(/(Sky Sports[^,()]*?)\s*\(\d{1,2}:\d{2}\)/g)].map(match => clean(match[1]))
    return teams.length === 2 && teams.every(Boolean) && preview && channels.length ? [{ home: teams[0], away: teams[1], preview, channels: [...new Set(channels)], competition, sourceUrl }] : []
  })
}

export function skyMatch(row: SkyRow, previewHtml: string, now = Date.now()): Match | null {
  const records = [...previewHtml.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => { try { const data = JSON.parse(match[1]); return Array.isArray(data) ? data : [data] } catch { return [] } })
  const source = records.map(obj).find(record => record['@type'] === 'SportsEvent' && nameKey(clean(obj(record.homeTeam).name)) === nameKey(row.home) && nameKey(clean(obj(record.awayTeam).name)) === nameKey(row.away))
  // An explicit offset is required: the visible Sky clock is UK local time, not UTC.
  if (!source || typeof source.startDate !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(source.startDate) || !/^(?:https?:\/\/schema\.org\/)?EventScheduled$/.test(String(source.eventStatus))) return null
  const epoch = Date.parse(source.startDate)
  if (!Number.isFinite(epoch) || epoch < now || epoch > now + 7 * 86400_000) return null
  const broadcasts: Broadcast[] = row.channels.map(channel => ({ channel, territory: 'GB', languages: [], rightsHolder: 'Sky Sports', official: true, sourceType: 'direct-broadcaster', evidenceLevel: 'A', destinationPrecision: 'channel', matchingMethod: 'official-fixture-page', sourceUrl: row.preview, scheduleUrl: row.sourceUrl, checkedAt: new Date(now).toISOString() }))
  const badge = (name: string) => [...previewHtml.matchAll(/<img\b[^>]*>/gi)].map(match => ({ url: match[0].match(/\bsrc="([^"]+)"/)?.[1], name: clean(match[0].match(/\balt="([^"]*)"/)?.[1]) })).find(image => nameKey(image.name) === nameKey(name) && /^https:\/\/e[0-4]\.365dm\.com\/football\/badges\/(?:24|32|64|128)\/\d+\.png$/.test(image.url ?? ''))?.url ?? null
  return { id: `sky-${row.preview.split('/').pop()}`, sourceIds: { sky: row.preview.split('/').pop()! }, title: `${row.home} vs ${row.away}`, sport: 'football', competition: row.competition, fixtureSource: { name: 'Sky Sports fixture', url: row.preview, checkedAt: new Date(now).toISOString() }, startsAt: new Date(epoch).toISOString(), broadcasts, homeTeam: { name: row.home, badgeUrl: badge(row.home), sourceId: null }, awayTeam: { name: row.away, badgeUrl: badge(row.away), sourceId: null } }
}

export function nbaMatches(html: string, now = Date.now()): Match[] {
  const script = html.match(/<script\b[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)?.[1]
  if (!script) throw new Error('nba-format-unavailable')
  const data = obj(JSON.parse(script)), feed = obj(obj(obj(data.props).pageProps).gameCardFeed)
  if (!Array.isArray(feed.modules)) throw new Error('nba-format-unavailable')
  const cards = feed.modules.flatMap(module => Array.isArray(obj(module).cards) ? obj(module).cards as unknown[] : [])
  return cards.flatMap(value => {
    const card = obj(obj(value).cardData), epoch = Date.parse(String(card.gameTimeUtc)), id = String(card.gameId)
    if (!/^\d{10}$/.test(id) || card.gameStatus !== 1 || !String(card.gameTimeUtc).endsWith('Z') || !Number.isFinite(epoch) || epoch < now || epoch > now + 72 * 3600_000) return []
    const sourceUrl = String(card.shareUrl)
    if (!new RegExp(`^https://www\\.nba\\.com/game/[a-z0-9-]+-${id}/?$`).test(sourceUrl)) return []
    const participant = (input: unknown): Participant | null => { const team = obj(input), name = clean(team.teamName), teamId = String(team.teamId); return name && /^161061\d{4}$/.test(teamId) ? { name, sourceId: teamId, badgeUrl: Number(teamId) >= 1610612737 && Number(teamId) <= 1610612766 ? `/utility-identity/nba/${teamId}.svg` : `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg` } : null }
    const homeTeam = participant(card.homeTeam), awayTeam = participant(card.awayTeam)
    if (!homeTeam || !awayTeam) return []
    const broadcasters = obj(card.broadcasters), broadcasts: Broadcast[] = []
    // NBA's typed radio lists never enter a viewing directory. Domestic local
    // TV/OTT entries remain marked as local-market listings, not nationwide rights.
    for (const key of ['nationalBroadcasters', 'nationalOttBroadcasters', 'homeTvBroadcasters', 'awayTvBroadcasters', 'homeOttBroadcasters', 'awayOttBroadcasters', 'intlTvBroadcasters', 'intlOttBroadcasters']) {
      for (const value of Array.isArray(broadcasters[key]) ? broadcasters[key] as unknown[] : []) {
        const broadcaster = obj(value), channel = clean(broadcaster.broadcasterDisplayName)
        const territory = key.startsWith('intl') ? clean(broadcaster.broadcasterLocalizationRegion).toUpperCase() : 'US'
        if (!channel || !/^[A-Z]{2}$/.test(territory)) continue
        broadcasts.push({ channel, territory, languages: [], official: true, sourceType: 'direct-organizer', evidenceLevel: 'A', destinationPrecision: key.toLowerCase().includes('ott') ? 'service' : 'channel', matchingMethod: 'official-game-id', sourceUrl, checkedAt: new Date(now).toISOString(), ...(key.startsWith('home') || key.startsWith('away') ? { scope: 'Local-market listing; regional and package restrictions apply.' } : {}) })
      }
    }
    if (!broadcasts.length) return []
    return [{ id: `nba-${id}`, title: `${awayTeam.name} at ${homeTeam.name}`, sport: 'basketball', competition: 'NBA', fixtureSource: { name: 'NBA official schedule', url: sourceUrl, checkedAt: new Date(now).toISOString() }, phase: clean(card.seasonType), startsAt: new Date(epoch).toISOString(), broadcasts: [...new Map(broadcasts.map(b => [`${b.territory}:${b.channel}`, b])).values()], homeTeam, awayTeam }]
  })
}

export function mergeOfficialMatches(imported: Match[], official: Match[]): Match[] {
  const result=new Map<number,Match>(), byId=new Map<string,Set<number>>(), byTime=new Map<string,Set<number>>()
  let serial=0
  const bucket=(e:Match)=>Math.floor(Date.parse(e.startsAt)/(15*60_000))
  const add=(e:Match)=>{const index=serial++;result.set(index,e);const ids=byId.get(e.id)||new Set<number>();ids.add(index);byId.set(e.id,ids);const key=e.sport+'|'+bucket(e),times=byTime.get(key)||new Set<number>();times.add(index);byTime.set(key,times)}
  const remove=(index:number)=>{const e=result.get(index)!;result.delete(index);byId.get(e.id)?.delete(index);byTime.get(e.sport+'|'+bucket(e))?.delete(index)}
  for(const e of imported)add(e)
  const generic = new Set(['club', 'fc', 'cf', 'afc', 'sc', 'ac', 'rcd', 'cd', 'ud', 'rc', 'ogc', 'losc', 'stade', 'le', 'la', 'de', 'del', '29', 'football', 'futbol', 'calcio'])
  const weakSingle = new Set(['city', 'united', 'real', 'sporting', 'athletic', 'atletico', 'olympic', 'olympique', 'dynamo', 'racing'])
  const stem = (token: string) => token === 'lyonnais' ? 'lyon' : token === 'brestois' ? 'brest' : token
  const tokens = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).map(stem).filter(token => token && !generic.has(token))
  const sameName = (a: string, b: string) => {
    const one = nameKey(a), two = nameKey(b)
    if (one.length >= 4 && one === two) return true
    const left = tokens(a), right = tokens(b), shorter = left.length <= right.length ? left : right, longer = new Set(left.length <= right.length ? right : left)
    return shorter.length > 0 && shorter.every(token => longer.has(token)) && (shorter.length >= 2 || (shorter[0].length >= 4 && !weakSingle.has(shorter[0])))
  }
  const sameCompetition = (a: string, b: string) => { const one = nameKey(a), two = nameKey(b); return one === two || (one.length >= 5 && two.length >= 5 && (one.endsWith(two) || two.endsWith(one) || one.startsWith(two) || two.startsWith(one))) }
  // Some providers (TheSportsDB) omit participant objects. Their title still
  // names the sides ("Home vs Away"), so matching falls back to it; without
  // this the same fixture is published twice under two URLs.
  const sides = (e: Match): [Participant | null, Participant | null] => {
    if (e.homeTeam && e.awayTeam) return [e.homeTeam, e.awayTeam]
    const vs = e.title.split(/\s+(?:vs\.?|v)\s+/i), at = e.title.split(/\s+at\s+/i)
    const named = (name?: string) => name?.trim() ? { name: name.trim(), sourceId: null } as Participant : null
    if (vs.length === 2) return [e.homeTeam ?? named(vs[0]), e.awayTeam ?? named(vs[1])]
    if (at.length === 2) return [e.homeTeam ?? named(at[1]), e.awayTeam ?? named(at[0])]
    return [e.homeTeam, e.awayTeam]
  }
  for (const event of official) {
    const sameTeam = (a: Participant | null, b: Participant | null) => a && b && [a.name, ...(a.aliases ?? [])].some(one => [b.name, ...(b.aliases ?? [])].some(two => sameName(one, two)))
    const [eventHome, eventAway] = sides(event)
    const matches = (prior: Match) => {
      const [priorHome, priorAway] = sides(prior)
      const previousCompetition = prior.competitionKey ? matchCompetition(prior.competitionKey) : undefined
      const currentCompetition = event.competitionKey ? matchCompetition(event.competitionKey) : undefined
      if (previousCompetition && currentCompetition && previousCompetition.key !== currentCompetition.key) return false
      if (prior.id === event.id) return prior.sport === event.sport && sameCompetition(prior.competition, event.competition) && Boolean(sameTeam(priorHome, eventHome) && sameTeam(priorAway, eventAway))
      if (prior.sport !== event.sport || !sameCompetition(prior.competition, event.competition) || !sameTeam(priorHome, eventHome) || !sameTeam(priorAway, eventAway)) return false
      const drift = Math.abs(Date.parse(prior.startsAt) - Date.parse(event.startsAt))
      return drift <= 15 * 60_000
    }
    // Different provider identities can match only within the existing 15-minute
    // window. Same-ID reschedules remain eligible regardless of their drift.
    // Index those candidates instead of scanning the entire season per event.
    const candidates=new Set(byId.get(event.id)||[]),time=bucket(event)
    for(const offset of [-1,0,1])for(const index of byTime.get(event.sport+'|'+(time+offset))||[])candidates.add(index)
    const matching=[...candidates].sort((a,b)=>a-b).filter(index=>matches(result.get(index)!))
    const duplicates=matching.map(index=>result.get(index)!)
    // Ambiguous candidate sets must never transfer broadcaster evidence.
    if (duplicates.length > 1 && new Set(duplicates.map(e => e.startsAt)).size > 1) { add(event); continue }
    const prior = duplicates[0]
    // One official channel does not disprove another provider's listing in the
    // same territory. Retain separate evidence levels; the UI deduplicates only
    // identical destination identities, preferring the stronger evidence.
    for(const index of matching)remove(index)
    const broadcasts = [...event.broadcasts, ...duplicates.flatMap(item => item.broadcasts.filter(() => Math.abs(Date.parse(item.startsAt) - Date.parse(event.startsAt)) <= 15 * 60_000))]
    const rights = [...new Map([...(event.broadcastRights ?? []), ...duplicates.flatMap(item => item.broadcastRights ?? [])].map(right => [`${right.territory}:${right.sourceUrl}`, right])).values()]
    const sourceIds = Object.assign({}, ...duplicates.map(matchSourceIds), matchSourceIds(event))
    const venue = event.venue ?? (prior?.startsAt === event.startsAt ? prior.venue : undefined)
    // Identities absorbed by this merge keep their published URLs as redirects.
    const id = prior?.id ?? event.id
    const mergedIds = [...new Set([...duplicates.flatMap(item => [item.id, ...(item.mergedIds ?? [])]), event.id, ...(event.mergedIds ?? [])])].filter(value => value !== id)
    add({ ...event, ...(venue ? { venue } : {}), id, ...(mergedIds.length ? { mergedIds } : {}), sourceIds, broadcasterEvidence: event.broadcasterEvidence ?? prior?.broadcasterEvidence, broadcastRights: rights, competitionKey: event.competitionKey ?? prior?.competitionKey, competitionCountry: event.competitionCountry ?? prior?.competitionCountry, competitionLogo: event.competitionLogo ?? prior?.competitionLogo, fixtureSource: event.fixtureSource ?? prior?.fixtureSource, homeTeam: mergedParticipant(event.homeTeam, prior?.homeTeam ?? null), awayTeam: mergedParticipant(event.awayTeam, prior?.awayTeam ?? null), broadcasts: [...new Map(broadcasts.map(b => [`${b.territory}:${b.channel}:${b.sourceUrl}:${b.evidenceLevel ?? ''}`, b])).values()] })
  }
  return [...result.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

export async function fetchScheduleHtml(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  const target = new URL(url)
  const reviewed = ['www.nba.com', 'www.skysports.com'].includes(target.hostname) || url === 'https://www.laliga.com/iframes/external-consumer-broadcast'
  if (target.protocol !== 'https:' || target.username || target.password || target.port || !reviewed) throw new Error('unreviewed-source')
  const response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: 'manual', cache: 'no-store', headers: { Accept: 'text/html', 'User-Agent': 'WHOPLAYSNOW/1.0 (+https://whoplaysnow.com/matches)' } })
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('text/html') || Number(response.headers.get('age')) > 900) throw new Error('schedule-unavailable')
  const reader = response.body?.getReader(); if (!reader) throw new Error('schedule-unavailable')
  const decoder = new TextDecoder(); let bytes = 0, html = ''
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 4_000_000) { await reader.cancel(); throw new Error('oversize-schedule') } html += decoder.decode(value, { stream: true }) } }
  finally { reader.releaseLock() }
  return html + decoder.decode()
}

export async function collectOfficialMatches(now = Date.now(), fetcher: typeof fetch = fetch) {
  const events: Match[] = [], sources: { name: string; ok: boolean }[] = []
  await Promise.all(SKY_SCHEDULES.map(async schedule => {
    try {
      const rows = skyScheduleRows(await fetchScheduleHtml(schedule.url, fetcher), schedule.url, schedule.competition).slice(0, 12)
      if (!rows.length) throw new Error('sky-format-unavailable')
      // Six workers bound preview traffic and total latency. No arbitrary feed URL is fetched.
      let next = 0, checked = 0
      await Promise.all(Array.from({ length: 3 }, async () => { while (next < rows.length) { const row = rows[next++]; try { const event = skyMatch(row, await fetchScheduleHtml(row.preview, fetcher), now); checked++; if (event) events.push(event) } catch { /* Unverified fixtures are omitted. */ } } }))
      sources.push({ name: `Sky Sports · ${schedule.competition}`, ok: checked > 0 })
    } catch { sources.push({ name: `Sky Sports · ${schedule.competition}`, ok: false }) }
  }))
  await Promise.all(Array.from({ length: 4 }, async (_, offset) => {
    const date = new Date(now + offset * 86400_000).toISOString().slice(0, 10)
    try { events.push(...nbaMatches(await fetchScheduleHtml(`https://www.nba.com/games?date=${date}`, fetcher), now)); sources.push({ name: `NBA · ${date}`, ok: true }) }
    catch { sources.push({ name: `NBA · ${date}`, ok: false }) }
  }))
  return { events: [...new Map(events.map(event => [event.id, event])).values()], sources }
}
