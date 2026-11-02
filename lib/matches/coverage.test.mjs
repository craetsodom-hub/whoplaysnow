import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCoverageReport } from './coverage.ts'

const now = Date.parse('2026-10-17T10:00:00Z')
const participant = name => ({ name, sourceId: null, badgeUrl: null })
const event = (id, broadcasts = [], broadcastRights = []) => ({ id, title: `${id} home vs ${id} away`, sport: 'football', competition: 'Fixture League', startsAt: '2026-10-18T12:00:00.000Z', broadcasts, broadcastRights, homeTeam: participant('Home'), awayTeam: participant('Away') })
const broadcast = (territory, evidenceLevel) => ({ channel: 'Fixture TV', territory, languages: evidenceLevel === 'A' ? ['en'] : [], official: evidenceLevel !== 'C', evidenceLevel, destinationPrecision: 'channel', sourceType: evidenceLevel === 'C' ? 'source-event' : 'official-event', sourceUrl: 'https://www.skysports.com/fixture' })

test('coverage reports event and event-country evidence separately', () => {
  const feed = { state: 'ready', generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 3600_000).toISOString(), rejected: 0, events: [event('one', [broadcast('GB', 'A')]), event('two', [], [{ territory: 'ES', holders: [{ name: 'Rights TV' }], sourceType: 'official-rights', sourceUrl: 'https://www.laliga.com/rights' }])] }
  const report = buildCoverageReport(feed, now)
  assert.equal(report.events.total, 2)
  assert.equal(report.events.A, 1)
  assert.equal(report.events.D, 1)
  assert(report.eventCountries.total > report.events.total)
  assert.equal(report.byCountry.find(row => row.key === 'GB').A, 1)
  assert.equal(report.byCountry.find(row => row.key === 'ES').D, 1)
  assert.equal(report.participants, 4)
  assert.equal(report.missingLogos, 4)
  assert.deepEqual(report.byLanguage, [{ key: 'unknown', events: 1, destinations: 1 }])
  assert.equal(report.precision.exactPairs, 1)
  assert.deepEqual(report.byCountry.slice(0, 6).map(row => row.key), ['GB', 'US', 'ES', 'FR', 'DE', 'IT'])
})
