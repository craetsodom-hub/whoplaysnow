import test from 'node:test'
import assert from 'node:assert/strict'
import { preparePublication, sourceAliases, matchContentHash, notificationRetryAt, fixtureObservationIsFresh } from './publication.ts'
import { scheduleMonths, espnMatches, espnScheduleChanges } from './europe.ts'
import { matchPath, matchIdFromSlug } from './routes.ts'
import { currentBroadcasts, hasIndexableBroadcast } from './guide.ts'
import { saveMatch, loadPublishedMatch } from './publication-store.ts'
import { FOOTBALL_COMPETITIONS } from './competitions.ts'

const now = Date.parse('2026-10-20T12:00:00Z')
const broadcast = (extra = {}) => ({ channel: 'Actual TV 1', territory: 'GB', languages: [], official: true, evidenceLevel: 'A', destinationPrecision: 'channel', sourceType: 'official-event', sourceUrl: 'https://www.skysports.com/event', checkedAt: new Date(now).toISOString(), validUntil: new Date(now + 3600000).toISOString(), ...extra })
const fixture = (extra = {}) => ({ id: 'espn-401915403', sourceIds: { espn: '401915403' }, title: 'Home vs Away', sport: 'football', competition: 'Premier League', competitionKey: 'premier-league', startsAt: '2026-12-20T19:00:00Z', homeTeam: { name: 'Home', sourceId: 'espn:1', badgeUrl: null }, awayTeam: { name: 'Away', sourceId: 'espn:2', badgeUrl: null }, broadcasts: [broadcast()], ...extra })

test('90-day collection enumerates every month across the year boundary', () => {
  assert.deepEqual(scheduleMonths(now, 90), ['202610', '202611', '202612', '202701'])
  for (const days of [0, 121, Infinity, 2.5]) assert.throws(() => scheduleMonths(now, days))
})
test('long-range fixtures require an explicit horizon and a confirmed kickoff', () => {
  const league = FOOTBALL_COMPETITIONS[0]
  const event = { id: '401915403', date: '2026-12-20T19:00Z', links: [{ href: 'https://www.espn.com/soccer/match/_/gameId/401915403/home-away' }], competitions: [{ id: '401915403', timeValid: true, status: { type: { name: 'STATUS_SCHEDULED', state: 'pre' } }, competitors: [{ homeAway: 'home', team: { id: '1', displayName: 'Home' } }, { homeAway: 'away', team: { id: '2', displayName: 'Away' } }] }] }
  const response = { leagues: [{ slug: league.espn }], events: [event] }
  assert.equal(espnMatches(response, league, now).length, 0)
  assert.equal(espnMatches(response, league, now, 90).length, 1)
  event.competitions[0].timeValid = false
  assert.equal(espnMatches(response, league, now, 90).length, 0)
  assert.deepEqual(espnScheduleChanges(response), [{ id: 'espn-401915403', phase: 'Kickoff to be confirmed' }])
})
test('postponements and cancellations withdraw an old allocation', () => {
  for (const [status, phase] of [['STATUS_POSTPONED', 'Postponed'], ['STATUS_CANCELED', 'Canceled']]) {
    assert.deepEqual(espnScheduleChanges({ events: [{ id: '401915403', competitions: [{ id: '401915403', status: { type: { name: status } } }] }] }), [{ id: 'espn-401915403', phase }])
    const prior = preparePublication(fixture(), undefined, now)
    assert.equal(preparePublication(fixture({ phase, broadcasts: [] }), prior, now + 1000).event.broadcasts.length, 0)
  }
})
test('a source heartbeat does not change lastmod or notify hash', () => {
  const first = preparePublication(fixture(), undefined, now)
  const next = preparePublication(fixture({ broadcasts: [broadcast({ checkedAt: new Date(now + 1000).toISOString(), validUntil: new Date(now + 5000000).toISOString() })] }), first, now + 1000)
  assert.equal(first.hash, next.hash)
  assert.equal(first.changedAt, next.changedAt)
  assert.notEqual(first.observedAt, next.observedAt)
})
test('broadcaster ordering does not churn page versions', () => {
  const first = broadcast(), second = broadcast({ channel: 'Actual TV 2', territory: 'DE' })
  assert.equal(matchContentHash(fixture({ broadcasts: [first, second] })), matchContentHash(fixture({ broadcasts: [second, first] })))
})
test('channel, territory and evidence changes are material', () => {
  const hash = matchContentHash(fixture())
  for (const delta of [{ channel: 'Actual TV 2' }, { territory: 'DE' }, { evidenceLevel: 'C', official: false }]) assert.notEqual(matchContentHash(fixture({ broadcasts: [broadcast(delta)] })), hash)
})
test('first published URL survives title, primary source and kickoff changes', () => {
  const first = preparePublication(fixture(), undefined, now)
  const updated = preparePublication(fixture({ id: 'sky-123456', sourceIds: { espn: '401915403', sky: '123456' }, title: 'Home FC vs Away FC', startsAt: '2026-12-21T19:00:00Z', broadcasts: [] }), first, now + 1000)
  assert.equal(updated.event.id, first.event.id)
  assert.equal(matchPath({ ...updated.event, canonicalSlug: updated.slug }), matchPath(first.event))
  assert.equal(updated.event.broadcasts.length, 0)
  assert.notEqual(first.hash, updated.hash)
  assert(sourceAliases(updated.event).includes('sky:123456'))
})
test('identity conflicts are quarantined instead of remapping a page', () => {
  const first = preparePublication(fixture(), undefined, now)
  for (const delta of [{ sport: 'basketball' }, { competitionKey: 'la-liga' }, { homeTeam: { name: 'Unrelated club', sourceId: 'espn:999', badgeUrl: null } }]) assert.throws(() => preparePublication(fixture(delta), first, now), /conflicting-event-identity/)
})
test('unknown or third-party channels never earn official publication status', () => {
  for (const broadcasts of [[], [broadcast({ official: false, evidenceLevel: 'C' })]]) assert.equal(preparePublication(fixture({ broadcasts }), undefined, now).published, false)
})
test('expired listings are hidden while an already published event stays durable', () => {
  const first = preparePublication(fixture({ validUntil: new Date(now + 100).toISOString() }), undefined, now)
  assert.equal(first.event.validUntil, undefined)
  assert.equal(currentBroadcasts(first.event, now + 4000000).length, 0)
  const next = preparePublication(fixture({ broadcasts: [] }), first, now + 4000000)
  assert.equal(next.published, true)
  assert.equal(hasIndexableBroadcast(next.event, now + 4000000), false)
})
test('one failed source preserves another still-fresh provider; a new kickoff does not', () => {
  const first = preparePublication(fixture(), undefined, now)
  assert.equal(preparePublication(fixture({ broadcasts: [broadcast({ channel: 'Actual TV 2' })] }), first, now + 100).event.broadcasts.length, 2)
  assert.equal(preparePublication(fixture({ startsAt: '2026-12-21T19:00:00Z', broadcasts: [] }), first, now + 100).event.broadcasts.length, 0)
})
test('notification failures back off and retry no more than daily at the ceiling', () => {
  assert(notificationRetryAt(2, now) > notificationRetryAt(1, now))
  assert.equal(notificationRetryAt(100, now).getTime() - now, 86400000)
})
test('source aliases are namespaced and arbitrary IDs stay separate', () => {
  assert.deepEqual(sourceAliases({ id: 'espn-12345', sourceIds: { sky: '12345' } }), ['espn:12345', 'id:espn-12345', 'sky:12345'])
  assert.equal(matchIdFromSlug(preparePublication(fixture(), undefined, now).slug), fixture().id)
})
test('store refuses ambiguous aliases and binds incoming values as SQL parameters', async () => {
  const row = { event: fixture(), slug: 'home-vs-away--espn-401915403', content_hash: 'old', published: true, changed_at: new Date(now), observed_at: new Date(now), first_seen: new Date(now) }
  const ambiguous = { $queryRawUnsafe: async () => [row, row] }
  await assert.rejects(() => saveMatch(ambiguous, fixture(), now), /ambiguous/)
  assert.equal(await loadPublishedMatch(ambiguous, fixture().id), undefined)
  const calls = []
  const db = { $queryRawUnsafe: async (...args) => { calls.push(args); return [] }, $executeRawUnsafe: async (...args) => { calls.push(args); return 1 } }
  await saveMatch(db, fixture({ title: "Home's club vs Away" }), now)
  assert(!calls[1][0].includes("Home's club"))
  assert(calls[1][3].includes("Home's club"))
  assert.deepEqual(calls[0][2], sourceAliases(fixture()))
})

test('prolonged source outages cannot renew future viewing claims', () => {
  assert.equal(fixtureObservationIsFresh(new Date(now).toISOString(), now), true)
  assert.equal(fixtureObservationIsFresh(new Date(now - 49 * 3600000).toISOString(), now), false)
  assert.equal(fixtureObservationIsFresh('invalid', now), false)
  assert.equal(fixtureObservationIsFresh(new Date(now + 3600000).toISOString(), now), false)
})
