import type { Broadcast, BroadcastRight, Match, MatchFeed } from './feed'

type LegacyPackedMatchFeed = Omit<MatchFeed, 'events'> & {
  encoding: 'broadcast-table-v1'
  broadcasts: Broadcast[]
  events: (Omit<Match, 'broadcasts'> & { broadcasts: number[] })[]
}

const COMPETITION_FIELDS = ['sport', 'competition', 'competitionKey', 'competitionLogo', 'competitionCountry'] as const
type Competition = Pick<Match, typeof COMPETITION_FIELDS[number]>
type EventAttributes = Omit<Match, 'id' | 'title' | 'startsAt' | 'canonicalSlug' | typeof COMPETITION_FIELDS[number] | 'homeTeam' | 'awayTeam' | 'broadcasts' | 'broadcastRights'>
type EventRow = [id: string, title: string, startsAt: string, slug: string | null, competition: number, home: number, away: number, broadcasts: number, rights: number, attributes?: EventAttributes]

export type EntityMatchFeed = Omit<MatchFeed, 'events'> & {
  encoding: 'entity-tables-v2'
  competitions: Competition[]
  participants: Match['homeTeam'][]
  broadcasts: Broadcast[]
  broadcastGroups: number[][]
  rights: BroadcastRight[][]
  events: EventRow[]
}
export type PackedMatchFeed = LegacyPackedMatchFeed | EntityMatchFeed

function table<T>() {
  const values: T[] = [], indices = new Map<string, number>()
  return { values, index(value: T) {
    const key = JSON.stringify(value), existing = indices.get(key)
    if (existing !== undefined) return existing
    const index = values.length
    values.push(value)
    indices.set(key, index)
    return index
  } }
}

// Repeated teams, competition identities, channel allocations and rights remain
// exact records. A compact row references them without excluding any fixtures
// or countries, so filters and country switching stay entirely local.
export function packMatchFeed(feed: MatchFeed): EntityMatchFeed {
  const competitions = table<Competition>(), participants = table<Match['homeTeam']>()
  const broadcasts = table<Broadcast>(), broadcastGroups = table<number[]>(), rights = table<BroadcastRight[]>()
  const events: EventRow[] = feed.events.map(event => {
    const { id, title, startsAt, canonicalSlug, homeTeam, awayTeam, broadcasts: allocation, broadcastRights, ...rest } = event
    const competition = Object.fromEntries(COMPETITION_FIELDS.filter(key => key in rest).map(key => [key, rest[key]])) as Competition
    const attributes = Object.fromEntries(Object.entries(rest).filter(([key]) => !COMPETITION_FIELDS.some(field => field === key))) as EventAttributes
    const row: EventRow = [id, title, startsAt, canonicalSlug ?? null, competitions.index(competition), participants.index(homeTeam), participants.index(awayTeam), broadcastGroups.index(allocation.map(broadcasts.index)), broadcastRights === undefined ? -1 : rights.index(broadcastRights)]
    if (Object.keys(attributes).length) row.push(attributes)
    return row
  })
  return { ...feed, encoding: 'entity-tables-v2', competitions: competitions.values, participants: participants.values, broadcasts: broadcasts.values, broadcastGroups: broadcastGroups.values, rights: rights.values, events }
}

export function unpackMatchFeed(feed: MatchFeed | PackedMatchFeed): MatchFeed {
  if (!('encoding' in feed)) return feed
  if (feed.encoding === 'broadcast-table-v1') {
    const { encoding: _encoding, broadcasts, ...rest } = feed
    return { ...rest, events: feed.events.map(event => ({ ...event, broadcasts: event.broadcasts.map(index => broadcasts[index]) })) }
  }
  const { encoding: _encoding, competitions, participants, broadcasts, broadcastGroups, rights, ...rest } = feed
  return { ...rest, events: feed.events.map(([id, title, startsAt, canonicalSlug, competition, home, away, allocation, right, attributes]) => ({
    ...attributes,
    id, title, startsAt,
    ...(canonicalSlug === null ? {} : { canonicalSlug }),
    ...competitions[competition],
    homeTeam: participants[home], awayTeam: participants[away],
    broadcasts: broadcastGroups[allocation].map(index => broadcasts[index]),
    ...(right < 0 ? {} : { broadcastRights: rights[right] }),
  })) }
}
