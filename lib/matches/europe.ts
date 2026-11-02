import { fetchOfficialJson } from '../status/collect.ts'
import { ESPN_TEAM_COMPETITIONS, type CompetitionDefinition } from './competitions.ts'
import { safeChannelArtwork } from './channel-artwork.ts'
import type { Match, Participant } from './feed'
import { fixtureVenue } from './venue'

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim().slice(0, 160) : ''
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
type Competition = CompetitionDefinition & {scoreboardUrl?:string}
export const SCHEDULE_DAYS = 7

export function espnMatches(input: unknown, league: Competition, now = Date.now(), days = SCHEDULE_DAYS): Match[] {
  const category = league.category ? league.espn : 'soccer'
  if (!Number.isInteger(days) || days < 1 || days > 120) throw new Error('invalid-schedule-horizon')
  const data = object(input)
  if (!array(data.leagues).some(value => object(value).slug === league.espn) || !Array.isArray(data.events) || data.events.length > 500) throw new Error('invalid-league-schedule')
  if(data.events.length>=300)throw new Error('truncated-league-schedule')
  const logos = array(object(array(data.leagues).find(value=>object(value).slug===league.espn)).logos)
  const logo = text(object(logos.find(value => array(object(value).rel).includes('default')) ?? logos[0]).href)
  const artworkLeague = !league.category ? 'soccer' : /college/.test(league.espn) ? 'ncaa' : league.espn
  const competitionLogo = league.logo || ((artworkLeague === 'soccer'
    ? /^https:\/\/a\.espncdn\.com\/i\/leaguelogos\/soccer\/500(?:-dark)?\/\d+\.png$/.test(logo)
    : new RegExp(`^https://a\\.espncdn\\.com/i/teamlogos/leagues/500(?:-dark)?/${artworkLeague}\\.png$`).test(logo)) ? logo : null)
  return data.events.flatMap(value => {
    const event = object(value), competition = object(array(event.competitions)[0]), status = object(object(competition.status).type), id = text(event.id), date = text(event.date), starts = Date.parse(date)
    if (!/^\d{5,12}$/.test(id) || String(competition.id) !== id || competition.timeValid !== true || status.name !== 'STATUS_SCHEDULED' || status.state !== 'pre' || !date.endsWith('Z') || !Number.isFinite(starts) || starts < now || starts > now + days * 86400_000) return []
    const teams = array(competition.competitors)
    const team = (side: string): Participant | null => {
      const source = object(object(teams.find(value => object(value).homeAway === side)).team), name = text(source.displayName), teamId = text(source.id), badge = text(source.logo)
      const abbreviation=text(source.abbreviation).toLowerCase()
      const numericBadge=new RegExp(`^https://a\\.espncdn\\.com/i/teamlogos/${artworkLeague}/500(?:-dark)?/${teamId}\\.png$`).test(badge)
      const scoreboardBadge=artworkLeague!=='soccer'&&/^[a-z0-9]{2,5}$/.test(abbreviation)&&[`${artworkLeague}/500/scoreboard/${abbreviation}.png`,`${artworkLeague}/500/${abbreviation}.png`].some(path=>badge==='https://a.espncdn.com/i/teamlogos/'+path)
      return name && /^[1-9]\d*$/.test(teamId) && !/^(?:TBD|TBC|To be (?:decided|confirmed)|Winner\b|Loser\b)/i.test(name) ? { name, aliases: [text(source.shortDisplayName), text(source.name)].filter(Boolean), sourceId: `espn:${teamId}`, badgeUrl: numericBadge||scoreboardBadge ? badge : null } : null
    }
    const homeTeam = team('home'), awayTeam = team('away')
    if (!homeTeam || !awayTeam || homeTeam.sourceId===awayTeam.sourceId) return []
    const sourceUrl = array(event.links).flatMap(value => {
      try {
        const href = object(value).href
        if (typeof href !== 'string' || href.length > 600) return []
        const url = new URL(href)
        return url.origin === 'https://www.espn.com' && !url.username && !url.password && !url.search && !url.hash && new RegExp(`^/${category}/(?:match|preview|game)/_/gameId/${id}(?:/[a-zA-Z0-9%_-]+)?$`).test(url.pathname) ? [url.href] : []
      } catch { return [] }
    })[0] || (!array(event.links).length ? league.scoreboardUrl : undefined)
    if (!sourceUrl) return []
    const venue = fixtureVenue(competition.venue, sourceUrl, new Date(now).toISOString())
    // Only explicitly geotagged TV/streaming records carry a country. Never
    // reinterpret the default US broadcaster list as European viewing rights.
    const broadcasts = array(competition.geoBroadcasts).flatMap(value => {
      const row = object(value), channel = text(object(row.media).shortName), territory = text(row.region).toUpperCase(), type = text(object(row.type).shortName).toUpperCase()
      const media = object(row.media), logoUrl = safeChannelArtwork(media.logo), darkLogoUrl = safeChannelArtwork(media.darkLogo)
      return channel && /^[A-Z]{2}$/.test(territory) && ['TV', 'STREAMING'].includes(type) ? [{ channel, territory, languages: [], official: false, sourceType: 'direct-publisher', evidenceLevel: 'C' as const, destinationPrecision: type === 'STREAMING' ? 'service' : 'channel', matchingMethod: 'publisher-event-listing', sourceUrl, checkedAt: new Date(now).toISOString(), ...(logoUrl ? { logoUrl } : {}), ...(darkLogoUrl ? { darkLogoUrl } : {}) }] : []
    })
    return [{ id: `espn-${id}`, sourceIds: { espn: id }, title: `${homeTeam.name} vs ${awayTeam.name}`, sport: league.sport ?? 'football', competition: league.name, competitionKey: league.key, competitionCountry: league.country, competitionLogo, startsAt: new Date(starts).toISOString(), fixtureSource: { name: 'ESPN schedule', url: sourceUrl, checkedAt: new Date(now).toISOString() }, ...(venue ? { venue } : {}), broadcasts, homeTeam, awayTeam }]
  })
}

export function scheduleMonths(now: number, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 120) throw new Error('invalid-schedule-horizon')
  const end = new Date(now + days * 86400_000), cursor = new Date(now)
  cursor.setUTCDate(1); cursor.setUTCHours(0, 0, 0, 0)
  const months: string[] = []
  while (cursor <= end) { months.push(cursor.toISOString().slice(0, 7).replace('-', '')); cursor.setUTCMonth(cursor.getUTCMonth() + 1) }
  return months
}

export function espnScheduleChanges(input: unknown): { id: string; phase: string }[] {
  return array(object(input).events).flatMap(value => {
    const event = object(value), competition = object(array(event.competitions)[0]), status = object(object(competition.status).type), id = text(event.id)
    if (!/^\d{5,12}$/.test(id) || String(competition.id) !== id) return []
    const phase = ({ STATUS_POSTPONED: 'Postponed', STATUS_CANCELED: 'Canceled', STATUS_CANCELLED: 'Canceled' } as Record<string, string>)[String(status.name)]
      ?? (status.name === 'STATUS_SCHEDULED' && competition.timeValid === false ? 'Kickoff to be confirmed' : undefined)
    return phase ? [{ id: `espn-${id}`, phase }] : []
  })
}

// Distant dates are observed at least twice a day; a cache hit never renews
// the fixture or broadcaster verification clock.
export type EuropeanScheduleCache = {version?:number; slices?:Record<string,{checkedAt:string;events:Match[];fixtureUpdates:{id:string;phase:string}[]}>}
export async function collectEuropeanSchedules(now = Date.now(), fetcher: typeof fetch = fetch, days = SCHEDULE_DAYS, previous:EuropeanScheduleCache = {}) {
  const months = scheduleMonths(now, days)
  const competitions: Competition[] = ESPN_TEAM_COMPETITIONS
  // Daily basketball/hockey responses stay within the shared response-size cap;
  // monthly scoreboards exceed it and silently lose those sports otherwise.
  const dates = Array.from({ length: days + 1 }, (_, i) => new Date(now + i * 86400_000).toISOString().slice(0, 10).replaceAll('-', ''))
  const jobs = competitions.flatMap(league => (league.category||league.period==='day' ? dates : months).map(month => ({ league, month }))), events: Match[] = [], sources: { name: string; ok: boolean }[] = []
  const slices:NonNullable<EuropeanScheduleCache['slices']> = {}
  const calendars=new Map<string,{start:number;end:number;dates:Set<string>}>()
  let next = 0
  const fixtureUpdates: { id: string; phase: string }[] = []
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < jobs.length) {
      const { league, month } = jobs[next++]
      const sliceKey = league.espn+(league.groups?'@'+league.groups:'')+'|'+month
      const prior = previous.version===1 ? previous.slices?.[sliceKey] : undefined
      const checked = Date.parse(prior?.checkedAt||'')
      const sliceStart = Date.parse(month.length===6 ? month.slice(0,4)+'-'+month.slice(4,6)+'-01T00:00Z' : month.slice(0,4)+'-'+month.slice(4,6)+'-'+month.slice(6,8)+'T00:00Z')
      // A publisher's explicit day whitelist avoids hundreds of empty daily
      // calls. Outside its stated calendar range we still check the source.
      const calendar=calendars.get(league.espn)
      if(month.length===8&&calendar&&sliceStart>=calendar.start&&sliceStart+86400_000<=calendar.end&&!calendar.dates.has(month))continue
      const distant = sliceStart>now+30*86400_000
      const usable = prior && Number.isFinite(checked) && checked<=now && checked>now-48*3600_000 && Array.isArray(prior.events) && Array.isArray(prior.fixtureUpdates)
      const append = (slice:NonNullable<typeof prior>) => {
        events.push(...slice.events.filter(e=>Date.parse(e.startsAt)>=now&&Date.parse(e.startsAt)<=now+days*86400_000))
        fixtureUpdates.push(...slice.fixtureUpdates)
        slices[sliceKey]=slice
      }
      if(distant&&usable&&checked>now-12*3600_000){append(prior);sources.push({name:`ESPN · ${league.name} · ${month}`,ok:true});continue}
      try {
        const scoreboardUrl=`https://site.api.espn.com/apis/site/v2/sports/${league.category ?? 'soccer'}/${league.espn}/scoreboard?dates=${month}&limit=300${league.groups?'&groups='+league.groups:''}`
        const result = await fetchOfficialJson(scoreboardUrl, (url, init) => fetcher(url, { ...init, headers: { Accept: 'application/json' } }))
        const metadata=object(array(object(result.data).leagues).find(value=>object(value).slug===league.espn))
        if(metadata.calendarType==='day'&&metadata.calendarIsWhitelist===true&&Array.isArray(metadata.calendar)&&metadata.calendar.every((v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v))){
          const start=Date.parse(String(metadata.calendarStartDate)),end=Date.parse(String(metadata.calendarEndDate))
          if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)calendars.set(league.espn,{start,end,dates:new Set(metadata.calendar.map((v:string)=>v.slice(0,10).replaceAll('-','')))})
        }
        append({checkedAt:new Date(now).toISOString(),events:espnMatches(result.data, {...league,scoreboardUrl}, now, days),fixtureUpdates:espnScheduleChanges(result.data)})
        sources.push({ name: `ESPN · ${league.name} · ${month}`, ok: true })
      } catch { if(distant&&usable)append(prior);sources.push({ name: `ESPN · ${league.name} · ${month}`, ok: false }) }
    }
  }))
  return { events: [...new Map(events.map(event => [event.id, event])).values()], sources, fixtureUpdates, cache:{version:1,slices} }
}
