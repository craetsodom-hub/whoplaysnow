import test from 'node:test'
import assert from 'node:assert/strict'
import { skyMatch, skyScheduleRows, nbaMatches, mergeOfficialMatches, fetchScheduleHtml } from './official.ts'
import { filterMatches } from './feed.ts'
import { findMatchById } from './routes.ts'
const now = Date.parse('2026-10-16T12:00:00Z')
const row = { home: 'Newcastle United', away: 'Aston Villa', preview: 'https://www.skysports.com/football/newcastle-united-vs-aston-villa/559511', sourceUrl: 'https://www.skysports.com/watch/football-on-sky/competitions/premier-league', competition: 'Premier League', channels: ['Sky Sports Main Event'] }
const preview = (extra = {}) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'SportsEvent', homeTeam: { name: row.home }, awayTeam: { name: row.away }, startDate: '2026-10-17T17:30:00+01:00', eventStatus: 'EventScheduled', ...extra })}</script>`
test('Sky exact event supplies timezone-aware kickoff and must match both listed teams', () => {
  const result = skyMatch(row, preview(), now)
  assert.equal(result.startsAt, '2026-10-17T16:30:00.000Z')
  assert.equal(result.broadcasts[0].official, true)
  assert.equal(skyMatch(row, preview({ awayTeam: { name: 'Another club' } }), now), null)
  assert.equal(skyMatch(row, preview({ startDate: '2026-10-17T17:30:00' }), now), null)
  assert.equal(skyMatch(row, preview({ eventStatus: 'EventPostponed' }), now), null)
})

test('already published weekend channels remain available beyond three days without extending the seven-day window', () => {
  const monday = Date.parse('2026-10-19T12:00:00Z')
  const weekend = skyMatch(row, preview({ startDate: '2026-10-24T17:30:00+01:00' }), monday)
  assert.equal(weekend.startsAt, '2026-10-24T16:30:00.000Z')
  assert.equal(skyMatch(row, preview({ startDate: '2026-10-27T17:30:00Z' }), monday), null)
})

test('merging a new broadcaster preserves namespaced fixture IDs and existing match URLs', () => {
  const broadcaster = skyMatch(row, preview(), now)
  const fixture = { ...broadcaster, id: 'espn-401999999', sourceIds: { espn: '401999999' }, broadcasts: [] }
  const events = mergeOfficialMatches([broadcaster], [fixture])
  assert.deepEqual(events[0].sourceIds, { sky: '559511', espn: '401999999' })
  assert.equal(findMatchById(events, fixture.id), events[0])
  assert.equal(findMatchById(events, broadcaster.id), events[0])
  assert.equal(findMatchById(events, 'nba-559511'), undefined)
  assert.equal(findMatchById([...events, { ...events[0], id: 'ambiguous' }], fixture.id), undefined)
})
test('Sky broadcast channels come only from the same event block, excluding coverage start time', () => {
  const html = `<div class="event-group -layout1"><ul><strong>Newcastle United</strong><strong>Aston Villa</strong><a href="${row.preview}">Match Preview</a></ul><p class="event-detail -center caption">Premier League, Sky Sports Main Event (17:00)</p></div>`
  assert.deepEqual(skyScheduleRows(html, row.sourceUrl, row.competition), [row])
})
test('NBA typed TV lists exclude radio and link to the exact event; cancelled/live games are omitted', () => {
  const card = { gameId: '0012600018', gameStatus: 1, gameTimeUtc: '2026-10-16T23:00:00Z', shareUrl: 'https://www.nba.com/game/bos-vs-phi-0012600018', seasonType: 'Preseason', homeTeam: { teamId: 1610612755, teamName: '76ers' }, awayTeam: { teamId: 1610612738, teamName: 'Celtics' }, broadcasters: { nationalBroadcasters: [{ broadcasterDisplayName: 'NBA TV' }], homeRadioBroadcasters: [{ broadcasterDisplayName: '97.5 The Fanatic' }] } }
  const html = data => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { gameCardFeed: { modules: [{ cards: [{ cardData: data }] }] } } } })}</script>`
  const result = nbaMatches(html(card), now)
  assert.equal(result[0].broadcasts.length, 1); assert.equal(result[0].broadcasts[0].channel, 'NBA TV'); assert.equal(result[0].phase, 'Preseason')
  assert.equal(nbaMatches(html({ ...card, gameStatus: 2 }), now).length, 0)
  assert.equal(nbaMatches(html({ ...card, shareUrl: 'https://www.nba.com/games?date=' }), now).length, 0)
})
test('different source IDs with a one-hour kickoff conflict cannot transfer broadcast assignments', () => {
  const official = skyMatch(row, preview(), now)
  const imported = { ...official, id: 'tsdb-other', startsAt: '2026-10-17T17:30:00.000Z', broadcasts: [{ ...official.broadcasts[0], official: false, channel: 'Outdated channel' }] }
  const result = mergeOfficialMatches([imported], [official])
  assert.equal(result.length, 2); assert.equal(result.find(e => e.id === official.id).broadcasts[0].channel, 'Sky Sports Main Event')
})

test('third-party schedule enrichment preserves verified all-event destinations', () => {
  const shared = {
    id: 'laliga-102329', title: 'Real Betis vs FC Barcelona', sport: 'football', competition: 'LaLiga', startsAt: '2026-10-17T20:30:00.000Z',
    homeTeam: { name: 'Real Betis', sourceId: null, badgeUrl: null }, awayTeam: { name: 'FC Barcelona', sourceId: null, badgeUrl: null },
    broadcasts: [{ channel: 'DAZN', territory: 'FR', official: true, evidenceLevel: 'B', sourceType: 'official-all-events', sourceUrl: 'https://www.laliga.com/en-GB/where-to-watch-laliga-easports' }],
  }
  const publisher = {
    ...shared, id: 'espn-401919999', competition: 'LaLiga',
    broadcasts: [{ channel: 'ESPN listing', territory: 'FR', official: false, evidenceLevel: 'C', sourceType: 'direct-publisher', sourceUrl: 'https://www.espn.com/soccer/match/_/gameId/401919999' }],
  }
  const result = mergeOfficialMatches([shared], [publisher])
  assert.equal(result.length, 1)
  assert.deepEqual(result[0].broadcasts.map(item => item.evidenceLevel).sort(), ['B', 'C'])
})
test('schedule fetching refuses unreviewed URLs and stale cached HTML', async () => {
  await assert.rejects(fetchScheduleHtml('https://untrusted.example/page'), /unreviewed/)
  await assert.rejects(fetchScheduleHtml(row.preview, async () => new Response('x', { headers: { 'content-type': 'text/html', age: '1000' } })), /unavailable/)
})

test('an official channel preserves other providers in the same country without promoting their evidence', () => {
  const official = skyMatch(row, preview(), now)
  const imported = { ...official, id: 'community-event', broadcasts: [{ ...official.broadcasts[0], channel: 'Separate service', official: false, evidenceLevel: 'C', sourceType: 'source-event' }] }
  const result = mergeOfficialMatches([imported], [official])
  assert.equal(result.length, 1)
  assert.equal(result[0].broadcasts.length, 2)
  assert.equal(result[0].broadcasts.find(b => b.channel === 'Separate service').evidenceLevel, 'C')
})

test('a generic team-name suffix never identifies a different club', () => {
  const official = skyMatch(row, preview(), now)
  const ambiguous = { ...official, id: 'ambiguous', homeTeam: { ...official.homeTeam, name: 'United' }, broadcasts: [] }
  assert.equal(mergeOfficialMatches([ambiguous], [official]).length, 2)
})

test('official club aliases collapse every duplicate imported fixture while preserving overseas references', () => {
  const official = { ...skyMatch(row, preview(), now), id: 'l1-event', homeTeam: { name: 'RC Strasbourg Alsace', aliases: ['Strasbourg'], sourceId: '15', badgeUrl: null }, awayTeam: { name: 'Toulouse FC', aliases: ['Toulouse'], sourceId: '16', badgeUrl: null } }
  const imported = { ...official, id: 'tsdb-event', homeTeam: { name: 'Strasbourg', sourceId: null, badgeUrl: null }, awayTeam: { name: 'Toulouse', sourceId: null, badgeUrl: null }, broadcasts: [{ ...official.broadcasts[0], official: false, territory: 'ES' }] }
  const result = mergeOfficialMatches([{ ...official, broadcasts: [] }, imported], [official])
  assert.equal(result.length, 1); assert.equal(result[0].broadcasts.length, 2); assert.equal(result[0].id, 'l1-event')
})

test('merging a verified fixture never extends an imported foreign broadcaster past its own expiry', () => {
  const official = skyMatch(row, preview(), now)
  const imported = { ...official, id: 'imported', broadcasts: [{ ...official.broadcasts[0], official: false, territory: 'FR', validUntil: new Date(now + 1000).toISOString() }] }
  const feed = { events: mergeOfficialMatches([imported], [official]), state: 'ready', expiresAt: new Date(now + 900000).toISOString() }
  assert.equal(filterMatches(feed, { country: 'FR' }, now).length, 1)
  assert.equal(filterMatches(feed, { country: 'FR' }, now + 2000).length, 0)
  assert.equal(filterMatches(feed, { country: 'GB', officialOnly: true }, now + 2000).length, 1)
})
