import test from 'node:test'
import assert from 'node:assert/strict'
import { espnMatches, collectEuropeanSchedules } from './europe.ts'
import { FOOTBALL_COMPETITIONS, ESPN_TEAM_COMPETITIONS } from './competitions.ts'
import { filterMatches } from './feed.ts'
import { mergeOfficialMatches } from './official.ts'
const now = Date.parse('2026-10-16T12:00:00Z'), league = FOOTBALL_COMPETITIONS.find(row => row.key === 'la-liga')
const team = (id, name, side) => ({ homeAway: side, team: { id, displayName: name, logo: `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` } })
const fixture = (extra = {}) => ({ id: '401882843', date: '2026-10-20T19:00Z', links: [{ href: 'https://www.espn.com/soccer/match/_/gameId/401882843/away-home' }], competitions: [{ id: '401882843', timeValid: true, status: { type: { name: 'STATUS_SCHEDULED', state: 'pre' } }, competitors: [team('88', 'Home', 'home'), team('1068', 'Away', 'away')], ...extra }] })
const response = (event = fixture()) => ({ leagues: [{ slug: league.espn }], events: [event] })
test('published European fixtures remain visible without inventing local TV coverage', () => {
  const [event] = espnMatches(response(fixture({ geoBroadcasts: [{ region: 'us', type: { shortName: 'TV' }, media: { shortName: 'ESPN Deportes' } }], broadcasts: [{ market: 'national', names: ['Unknown territory TV'] }] })), league, now)
  assert.equal(event.competitionCountry, 'ES'); assert.equal(event.homeTeam.name, 'Home'); assert.equal(event.broadcasts.length, 1); assert.equal(event.broadcasts[0].territory, 'US')
  const feed = { events: [event], state: 'ready', expiresAt: new Date(now + 900000).toISOString() }
  assert.equal(filterMatches(feed, { country: 'ES', includeGlobal: true, officialOnly: true }, now).length, 1)
  assert.equal(filterMatches(feed, { country: 'ES', officialOnly: true }, now).length, 0)
  assert.equal(filterMatches(feed, { country: 'US', officialOnly: true }, now).length, 0)
  assert.equal(filterMatches(feed, { country: 'US', officialOnly: false }, now).length, 1)
  assert.equal(filterMatches(feed, { country: 'ES', includeGlobal: true }, now + 900001).length, 0)
})
test('postponed, untimed and mismatched fixtures are not presented as scheduled', () => {
  for (const extra of [{ timeValid: false }, { status: { type: { name: 'STATUS_POSTPONED', state: 'pre' } } }, { id: 'different' }]) assert.equal(espnMatches(response(fixture(extra)), league, now).length, 0)
  assert.equal(espnMatches(response({ ...fixture(), date: '2026-10-20T19:00' }), league, now).length, 0)
  assert.equal(espnMatches(response({ ...fixture(), links: [{ href: 'https://other.example/event' }] }), league, now).length, 0)
  assert.throws(() => espnMatches({ ...response(), leagues: [{ slug: 'ger.1' }] }, league, now))
  const [unicode] = espnMatches(response({ ...fixture(), links: [{ href: 'https://www.espn.com/soccer/match/_/gameId/401882843/fc-københavn-nordsjælland' }] }), league, now)
  assert.ok(unicode.fixtureSource.url.includes('k%C3%B8benhavn'))
})
test('radio and unknown-region broadcasts never become local viewing evidence', () => {
  const [event] = espnMatches(response(fixture({ geoBroadcasts: [{ region: 'us', type: { shortName: 'RADIO' }, media: { shortName: 'Radio' } }, { type: { shortName: 'TV' }, media: { shortName: 'No country' } }] })), league, now)
  assert.equal(event.broadcasts.length, 0); assert.ok(event.fixtureSource.url.includes('401882843'))
})

test('exact source media artwork survives ingestion without upgrading listing evidence', () => {
  const logo = 'https://a.espncdn.com/guid/322a7e47-3cdb-3b5c-ab1b-678e1f2c27e5/logos/default-dark.png'
  const [event] = espnMatches(response(fixture({ geoBroadcasts: [{ region: 'us', type: { shortName: 'TV' }, media: { shortName: 'Test channel', darkLogo: logo, logo: 'https://untrusted.example/image.png' } }] })), league, now)
  assert.equal(event.broadcasts[0].darkLogoUrl, logo)
  assert.equal(event.broadcasts[0].logoUrl, undefined)
  assert.equal(event.broadcasts[0].evidenceLevel, 'C')
  assert.equal(event.broadcasts[0].official, false)
})
test('an official broadcaster merge preserves a global fixture and its other country references', () => {
  const [event] = espnMatches(response(), league, now)
  const official = { ...event, id: 'official-other', fixtureSource: undefined, competitionKey: undefined, broadcasts: [{ channel: 'Reviewed TV', territory: 'ES', official: true, sourceUrl: 'https://www.laliga.com/event', sourceType: 'direct-organizer' }] }
  const [merged] = mergeOfficialMatches([event], [official])
  assert.equal(merged.fixtureSource.name, 'ESPN schedule'); assert.equal(merged.competitionKey, 'la-liga'); assert.equal(merged.broadcasts[0].territory, 'ES')
})
test('source spelling differences in Brighton do not create duplicate fixtures', () => {
  const [event] = espnMatches(response(), league, now)
  const published = { ...event, homeTeam: { ...event.homeTeam, name: 'Brighton & Hove Albion', aliases: [] } }
  const official = { ...published, id: 'sky-different-id', homeTeam: { ...published.homeTeam, name: 'Brighton and Hove Albion' } }
  assert.equal(mergeOfficialMatches([published], [official]).length, 1)
})
test('official long-form club names reconcile to the same exact fixture conservatively', () => {
  const [published] = espnMatches(response(), league, now)
  const espn = { ...published, homeTeam: { ...published.homeTeam, name: 'Espanyol' }, awayTeam: { ...published.awayTeam, name: 'Atletico Madrid' }, competition: 'Spanish LaLiga' }
  const official = { ...published, id: 'laliga-102332', homeTeam: { ...published.homeTeam, name: 'RCD Espanyol de Barcelona' }, awayTeam: { ...published.awayTeam, name: 'Atlético de Madrid' }, competition: 'LaLiga', broadcasts: [{ channel: 'DAZN', territory: 'ES', official: true, evidenceLevel: 'A', sourceUrl: 'https://www.laliga.com/event', sourceType: 'direct-organizer' }] }
  const merged = mergeOfficialMatches([official], [espn])
  assert.equal(merged.length, 1)
  assert(merged[0].broadcasts.some(item => item.channel === 'DAZN'))
})
test('month-end collection covers both months with bounded concurrency and isolated failures', async () => {
  const calls = []; let active = 0, peak = 0
  const result = await collectEuropeanSchedules(Date.parse('2026-10-31T12:00Z'), async url => {
    calls.push(url); peak = Math.max(peak, ++active)
    await new Promise(resolve => setTimeout(resolve, 1)); active--
    const slug = new URL(url).pathname.split('/').at(-2)
    return slug === 'ger.1' ? new Response('', { status: 503 }) : new Response(JSON.stringify({ leagues: [{ slug }], events: [] }), { headers: { 'content-type': 'application/json' } })
  })
  assert.equal(calls.length, ESPN_TEAM_COMPETITIONS.reduce((total,c)=>total+(c.category||c.period==='day'?8:2),0))
  assert.ok(calls.some(url => url.includes('dates=202611'))); assert.ok(calls.every(url => url.includes('limit=300'))); assert.ok(peak <= 4)
  assert.equal(result.sources.filter(row => !row.ok).length, 2); assert.ok(result.sources.some(row => row.ok))
})

test('US sport schedules use exact event links and explicit broadcast regions', () => {
  for (const [category, slug, sport] of [['basketball', 'nba', 'basketball'], ['football', 'nfl', 'american-football'], ['hockey', 'nhl', 'ice-hockey']]) {
    const input = fixture({ geoBroadcasts: [{ region: 'us', type: { shortName: 'Streaming' }, media: { shortName: 'Example service' } }] })
    input.links = [{ href: `https://www.espn.com/${slug}/game/_/gameId/401882843/away-home` }]
    const [event] = espnMatches({ leagues: [{ slug }], events: [input] }, { key: slug, name: slug.toUpperCase(), country: 'US', espn: slug, category, sport }, now)
    assert.equal(event.sport, sport)
    assert.equal(event.fixtureSource.url, input.links[0].href)
    assert.equal(event.broadcasts[0].territory, 'US')
    assert.equal(event.broadcasts[0].evidenceLevel, 'C')
    input.competitions[0].status.type.name = 'STATUS_POSTPONED'
    assert.deepEqual(espnMatches({ leagues: [{ slug }], events: [input] }, { key: slug, name: slug.toUpperCase(), country: 'US', espn: slug, category, sport }, now), [])
  }
})

test('publication collects US schedules beyond two weeks without exceeding concurrency limit', async () => {
  const calls = []
  const horizon = 30
  await collectEuropeanSchedules(now, async url => {
    calls.push(new URL(url))
    const slug = new URL(url).pathname.split('/').at(-2)
    return new Response(JSON.stringify({ leagues: [{ slug }], events: [] }), { headers: { 'content-type': 'application/json' } })
  }, horizon)
  for (const slug of ['nba', 'nfl', 'nhl']) {
    const dates = calls.filter(url => url.pathname.includes(`/${slug}/`)).map(url => url.searchParams.get('dates'))
    assert.equal(dates.length, 31)
    assert.ok(dates.includes('20261115'))
  }
})
