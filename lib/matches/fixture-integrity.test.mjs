import test from 'node:test'
import assert from 'node:assert/strict'
import { hasCurrentFixtureSource, isUnsupportedFixture } from './fixture-integrity.ts'
import { upcomingSchedule } from './discovery.ts'
import { hasIndexableEvent, currentBroadcasts } from './guide.ts'
import { applyAllEventDestinations } from './all-event.ts'
import reviewed from './reviewed-destinations.json' with { type: 'json' }
import { loadPublishedMatch, loadPlanningMatches, loadMatchSitemap, saveMatch } from './publication-store.ts'

const now = Date.parse('2026-10-23T12:00:00Z')
const event = { id: 'espn-401879253', title: 'Home vs Away', sport: 'football', competition: 'Premier League', startsAt: '2026-10-24T14:00:00Z', homeTeam: null, awayTeam: null, broadcasts: [], fixtureSource: { name: 'ESPN schedule', url: 'https://www.espn.com/soccer/match/_/gameId/401879253', checkedAt: new Date(now).toISOString() } }

test('generic provider presence cannot imply US Premier League match availability', () => {
  const [fresh] = applyAllEventDestinations([event], reviewed.allEventDestinations, now, '2026-10-24T12:00:00Z')
  assert.deepEqual(fresh.broadcasts.filter(b => b.territory === 'US'), [])
  const stored = { ...event, broadcasts: [
    { channel: 'DAZN', territory: 'US', evidenceLevel: 'B', sourceUrl: 'https://dazngroup.com/about-us/where-we-are/' },
    { channel: 'beIN SPORTS', territory: 'US', evidenceLevel: 'B', sourceUrl: 'https://www.beinsports.com/en-mena' },
    { channel: 'USA Network', territory: 'US', evidenceLevel: 'C', sourceUrl: 'https://www.espn.com/soccer/match/_/gameId/401879253' },
  ] }
  assert.deepEqual(currentBroadcasts(stored, now).map(b => b.channel), ['USA Network'])
})

test('fresh sourced fixtures are indexable without invented broadcast rights', () => {
  assert.equal(hasCurrentFixtureSource(event, now), true)
  assert.equal(hasIndexableEvent(event, now), true)
  assert.equal(hasIndexableEvent(event, now + 49 * 3600_000), false)
  assert.equal(hasIndexableEvent({ ...event, phase: 'Postponed' }, now), false)
})

test('placeholder schedules cannot return through discovery or stored publication', async () => {
  const seed = { ...event, id: 'ms-epl-20261107-ars-che' }
  assert.equal(isUnsupportedFixture(seed), true)
  assert.equal(hasIndexableEvent(seed, now), false)
  assert.deepEqual(upcomingSchedule({ state: 'ready', expiresAt: new Date(now + 60000).toISOString(), events: [seed] }, now), [])
  const db = { $queryRawUnsafe: async () => [{ id: seed.id, slug: seed.id, event: seed }] }
  assert.equal(await loadPublishedMatch(db, seed.id), undefined)
  assert.deepEqual(await loadPlanningMatches(db, now), [])
  assert.deepEqual(await loadMatchSitemap(db, now), [])
  await assert.rejects(saveMatch(db, seed, now), /unsupported-fixture-source/)
})
