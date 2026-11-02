import test from 'node:test'
import assert from 'node:assert/strict'
import { filterMatches, isExactChannelBroadcast, normalizeMatches, safeTeamBadge } from './feed.ts'
const now = Date.parse('2026-10-16T12:00:00Z')
const broadcast = (extra = {}) => ({ channelName: 'Fixture Sports', territory: 'GB', confirmed: true, sourceType: 'official-event', sourceUrl: 'https://www.nba.com/game/bos-vs-phi-0012600018', ...extra })
const event = (extra = {}) => ({ id: 'fixture-game', title: 'Fixture A vs Fixture B', competition: 'Fixture League', sport: 'basketball', startUtcEpochSeconds: (now + 60 * 60_000) / 1000, status: 'confirmed', broadcasts: [broadcast()], ...extra })
const feed = (extra = {}) => ({ schemaVersion: 1, generatedAtEpochSeconds: now / 1000, validUntilEpochSeconds: (now + 12 * 60 * 60_000) / 1000, events: [event()], ...extra })
test('expired and future-dated feeds cannot present upcoming fixtures', () => {
  assert.equal(normalizeMatches(feed(), now + 13 * 60 * 60_000).events.length, 0)
  assert.throws(() => normalizeMatches(feed({ generatedAtEpochSeconds: (now + 60 * 60_000) / 1000 }), now))
})
test('unverified territories, destinations and confirmation flags are omitted', () => {
  for (const extra of [{ territory: 'WORLD' }, { confirmed: false }, { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://untrusted.example/game' }]) assert.equal(normalizeMatches(feed({ events: [event({ broadcasts: [broadcast(extra)] })] }), now).events.length, 0)
})
test('schedule listings stay distinct from official source confirmation', () => {
  const result = normalizeMatches(feed({ events: [event({ broadcasts: [broadcast({ sourceType: 'source-event', sourceUrl: 'https://www.thesportsdb.com/api/v1/json/123/eventstv.php' })] })] }), now)
  assert.equal(result.events[0].broadcasts[0].official, false)
  assert.equal(result.events[0].broadcasts[0].evidenceLevel, 'C')
  assert.equal(filterMatches(result, { country: 'GB', officialOnly: true }, now).length, 0)
})

test('legacy French channel labels are withheld without losing the fixture or guessing a replacement', () => {
  const reviewedNow = Date.parse('2026-10-19T12:00:00Z')
  const raw = feed({ generatedAtEpochSeconds: reviewedNow / 1000, validUntilEpochSeconds: reviewedNow / 1000 + 3600, events: [event({ sport: 'football', startUtcEpochSeconds: reviewedNow / 1000 + 1800, broadcasts: [broadcast({ channelName: 'MultiSports 6 FR', territory: 'FR', sourceType: 'source-event', sourceUrl: 'https://www.thesportsdb.com/api/v1/json/123/eventstv.php' })] })] })
  const result = normalizeMatches(raw, reviewedNow)
  assert.equal(result.events.length, 1)
  assert.deepEqual(result.events[0].broadcasts, [])
})
test('broadcast languages are source-backed and rights-holder provenance survives normalization', () => {
  const explicit = normalizeMatches(feed({ events: [event({ broadcasts: [broadcast({ languages: ['fr', 'AR', 'bad-language'], languageEvidence: { sourceUrl: 'https://www.nba.com/game/bos-vs-phi-0012600018', verifiedAt: '2026-10-16T10:00:00Z', scope: 'event-audio' }, rightsHolder: 'Fixture Network' })] })] }), now).events[0].broadcasts[0]
  assert.deepEqual(explicit.languages, ['fr', 'ar'])
  assert.equal(explicit.rightsHolder, 'Fixture Network')

  const sky = broadcast({ channelName: 'Sky Sports Premier League', territory: 'GB', sourceType: 'official-broadcaster-schedule', sourceUrl: 'https://www.skysports.com/watch/football-on-sky/competitions/premier-league' })
  const legacy = normalizeMatches(feed({ events: [event({ sport: 'football', broadcasts: [sky] })] }), now).events[0].broadcasts[0]
  assert.deepEqual(legacy.languages, [])

  const territoryOnly = normalizeMatches(feed(), now).events[0].broadcasts[0]
  assert.deepEqual(territoryOnly.languages, [])
})
test('country, sport, date and expiry filters remain conservative', () => {
  const result = normalizeMatches(feed(), now)
  assert.equal(filterMatches(result, { country: 'GB', sport: 'basketball', date: '2026-10-16', timeZone: 'Europe/Paris', query: 'Fixture A' }, now).length, 1)
  assert.equal(filterMatches(result, { country: 'FR' }, now).length, 0)
  assert.equal(filterMatches(result, { country: 'GB' }, now + 13 * 60 * 60_000).length, 0)
  assert.equal(normalizeMatches(feed({ events: [event({ startUtcEpochSeconds: (now - 1) / 1000 })] }), now).events.length, 0)
})
test('a valid multi-sport broadcaster record survives when the provider omits competition metadata', () => {
  const result = normalizeMatches(feed({ events: [event({ competition: undefined })] }), now)
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].competition, 'Basketball · competition not supplied')
})
test('duplicate events do not multiply fixture cards', () => {
  assert.equal(normalizeMatches(feed({ events: [event(), event()] }), now).events.length, 1)
})

test('participant identity survives normalization without trusting arbitrary artwork URLs', () => {
  const badgeUrl = 'https://r2.thesportsdb.com/images/media/team/badge/example123.png'
  const result = normalizeMatches(feed({ events: [event({ homeTeam: { name: 'Real club name', badgeUrl, sourceIds: { thesportsdb: '133647' } }, awayTeam: { name: 'Other club', badgeUrl: 'https://untrusted.example/track.svg' } })] }), now)
  assert.deepEqual(result.events[0].homeTeam, { name: 'Real club name', badgeUrl, sourceId: '133647', sourceIds: { thesportsdb: '133647' } })
  assert.deepEqual(result.events[0].awayTeam, { name: 'Other club', badgeUrl: null, sourceId: null })
  assert.equal(normalizeMatches(feed(), now).events[0].homeTeam, null)
})

test('badge URL validation excludes tracking parameters, executable files and alternate destinations', () => {
  const base = 'https://r2.thesportsdb.com/images/media/team/badge/example123.png'
  assert.equal(safeTeamBadge(base), base)
  for (const url of [base + '?token=private', base + '#fragment', base.replace('https:', 'http:'), base.replace('.png', '.svg'), base.replace('r2.thesportsdb.com', 'r2.thesportsdb.com.evil.example'), base.replace('r2.thesportsdb.com', 'user:pass@r2.thesportsdb.com'), base.replace('r2.thesportsdb.com', 'r2.thesportsdb.com:8443'), 'data:image/png;base64,AAAA', null]) assert.equal(safeTeamBadge(url), null)
})

test('official LaLiga and MLS crest CDNs are accepted only on constrained image paths', async () => {
  const { safeTeamBadge } = await import('./feed.ts')
  assert.equal(safeTeamBadge('https://assets.laliga.com/assets/2026/06/24/medium/6b88661529a2c06840c8bf6bddd90970.png'), 'https://assets.laliga.com/assets/2026/06/24/medium/6b88661529a2c06840c8bf6bddd90970.png')
  assert.equal(safeTeamBadge('https://images.mlssoccer.com/image/upload/f_auto,q_auto,w_128,h_128,c_fit/v1747500178/assets/logos/mls-clubs/Club_Logo-Chicago_jm2yev.png'), 'https://images.mlssoccer.com/image/upload/f_auto,q_auto,w_128,h_128,c_fit/v1747500178/assets/logos/mls-clubs/Club_Logo-Chicago_jm2yev.png')
  assert.equal(safeTeamBadge('https://assets.laliga.com/redirect?to=crest'), null)
  assert.equal(safeTeamBadge('https://images.mlssoccer.com/image/upload/x.svg'), null)
})

test('evidence semantics stay separate and exact standalone fixtures are not discarded', () => {
  const result = normalizeMatches(feed({ events: [event({ id: 'source id with spaces' })] }), now)
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].broadcasts[0].official, true)
  assert.equal(result.events[0].broadcasts[0].evidenceLevel, 'A')
  assert.equal(normalizeMatches(feed({ events: [event({ broadcasterEvidence: { eventMatched: false, sourceEventMatched: false } })] }), now).events.length, 1)
  assert.equal(normalizeMatches(feed({ events: [event({ broadcasts: [broadcast({ sourceUrl: 'https://www.nba.com/games?date=' })] })] }), now).events.length, 0)
  const allMatches = normalizeMatches(feed({ events: [event({ broadcasts: [broadcast({ sourceType: 'official-all-events', sourceUrl: 'https://www.laliga.com/en-GB/where-to-watch-laliga-easports', destinationPrecision: 'service', matchingMethod: 'all-events' })] })] }), now)
  assert.equal(allMatches.events[0].broadcasts[0].evidenceLevel, 'B')
})

test('competition rights remain level D and never become an exact match broadcast', async () => {
  const rights = [{ territory: 'GB', holders: [{ name: 'Fixture Network', kind: 'network' }], sourceType: 'official-rights', sourceUrl: 'https://www.premierleague.com/en/about/broadcast-partners', verifiedAt: '2026-10-01', validFrom: '2026-08-01', validThrough: '2027-07-31', season: '2026/27' }]
  const value = event({ sport: 'football', broadcasts: [], broadcastRights: rights })
  const result = normalizeMatches(feed({ events: [value] }), now)
  const { evidenceLevelFor } = await import('./feed.ts')
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].broadcasts.length, 0)
  assert.equal(evidenceLevelFor(result.events[0], 'GB', now), 'D')
  assert.equal(evidenceLevelFor(result.events[0], 'FR', now), 'E')
})
test('exact-channel publishing rejects services, third-party listings and expired evidence', () => {
  const exact = normalizeMatches(feed(), now).events[0].broadcasts[0]
  assert.equal(isExactChannelBroadcast(exact, now), true)
  assert.equal(isExactChannelBroadcast({ ...exact, evidenceLevel: 'B', destinationPrecision: 'service' }, now), false)
  assert.equal(isExactChannelBroadcast({ ...exact, evidenceLevel: 'C', official: false }, now), false)
  assert.equal(isExactChannelBroadcast({ ...exact, validUntil: '2026-10-15T23:59:59Z' }, now), false)
})
test('conflicting duplicate IDs cannot reappear in a third record; consistent duplicates merge sources', () => {
  assert.equal(normalizeMatches(feed({ events: [event(), event({ sport: 'football' }), event()] }), now).events.length, 0)
  const result = normalizeMatches(feed({ events: [event(), event({ broadcasts: [broadcast({ channelName: 'Other channel' })] })] }), now)
  assert.equal(result.events.length, 1); assert.equal(result.events[0].broadcasts.length, 2)
})

test('imported fixture expiry remains effective inside a newer combined schedule', () => {
  const result = normalizeMatches(feed(), now)
  result.events[0].validUntil = new Date(now + 1000).toISOString()
  assert.equal(filterMatches(result, { country: 'GB' }, now + 2000).length, 0)
})

test('legacy F1 country tables cannot claim race-specific channels even with confirmed=true', () => {
  const result = normalizeMatches(feed({ events: [event({ sport: 'formula1', broadcasts: [broadcast({ channelName: 'Sky Sports F1', sourceType: 'official-broadcaster-schedule', sourceUrl: 'https://www.formula1.com/en/information/f1-broadcasters.example', matchingMethod: 'official-country-broadcaster-table' })] })] }), now)
  assert.equal(result.events.length, 0)
})

test('shared NBA local-market restrictions survive consumer normalization', () => {
  const scope = 'Local-market listing; regional and package restrictions apply.'
  const result = normalizeMatches(feed({ events: [event({ broadcasts: [broadcast({ scope })] })] }), now)
  assert.equal(result.events[0].broadcasts[0].scope, scope)
})

test('reviewed cross-domain beIN audio stays bound to its exact MENA feed and review age', () => {
  const checked = Date.parse('2026-10-18T16:50:00Z')
  const proof = { sourceUrl: 'https://www.bein.com/en/ufaq/which-bein-sports-channels-that-include-foreign-languages-commentary/', verifiedAt: '2026-10-18T16:40:00Z', scope: 'feed-audio' }
  const b = broadcast({ territory: undefined, region: 'MENA', territories: ['MA'], channelName: 'beIN SPORTS EN 1', sourceType: 'official-broadcaster-schedule', sourceUrl: 'https://www.beinsports.com/api/opta/tv-event?region=en-mena', languages: ['en'], languageEvidence: proof })
  const parse = (extra = {}, time = checked) => normalizeMatches(feed({ generatedAtEpochSeconds: time / 1000, validUntilEpochSeconds: time / 1000 + 3600,
    events: [event({ sport: 'football', startUtcEpochSeconds: time / 1000 + 1800, broadcasts: [{ ...b, ...extra }] })] }), time).events[0].broadcasts[0]
  assert.deepEqual(parse().languages, ['en'])
  for (const bad of [{ channelName: 'beIN SPORTS 1' }, { region: 'APAC' }, { languages: ['ar'] },
    { languageEvidence: { ...proof, scope: 'event-audio' } }, { languageEvidence: { ...proof, sourceUrl: proof.sourceUrl + '?unreviewed=1' } }]) assert.deepEqual(parse(bad).languages, [])
  assert.deepEqual(parse({}, Date.parse('2027-01-17T00:00:00Z')).languages, [])
})
