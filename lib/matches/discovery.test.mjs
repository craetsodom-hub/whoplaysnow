import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverSchedule, filterSchedule, upcomingSchedule, viewingCountries, countryAlternatives, currentRights } from './discovery.ts'

const now = Date.parse('2026-10-19T12:00:00Z')
const channel = (territory = 'GB', extra = {}) => ({ channel: 'Sky Sports Premier League', territory, languages: [], sourceUrl: 'https://www.skysports.com/football', official: true, sourceType: 'direct-broadcaster', evidenceLevel: 'A', destinationPrecision: 'channel', ...extra })
const event = (id, broadcasts = [], extra = {}) => ({ id, title: `Home ${id} vs Away ${id}`, sport: 'football', competition: 'Premier League', startsAt: '2026-10-20T19:00:00Z', homeTeam: null, awayTeam: null, broadcasts, ...extra })
const feed = events => ({ generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 3600000).toISOString(), state: 'ready', events, rejected: 0 })

test('reusing an ordered schedule preserves every country, filter and local date result', () => {
 const input=feed([event('uk',[channel()]),event('us',[channel('US')]),event('late',[],{startsAt:'2026-10-20T23:30:00Z'}),event('other',[],{sport:'basketball',competition:'NBA'}),event('postponed',[],{phase:'Postponed'})])
 const ordered=upcomingSchedule(input,now,165)
 for(const country of viewingCountries)for(const filters of [{},{exact:true},{query:'Sky'},{sport:'basketball'},{date:'2026-10-21',timeZone:'Asia/Tokyo'},{date:'2026-10'},{date:'7d'},{date:'all',competition:'nba'}]){
  const selection={...filters,country:country.code,horizonDays:165}
  assert.deepEqual(filterSchedule(ordered,selection,now),discoverSchedule(input,selection,now))
 }
 assert.deepEqual(filterSchedule([], {country:'US'},now),{events:[],selected:[],local:[],other:[]})
})

test('every selectable country keeps the complete upcoming schedule, including fixture-only events', () => {
  const input = feed([event('uk', [channel()]), event('usa', [channel('US')]), event('fixture-only')])
  assert(viewingCountries.some(row => row.code === 'MA'))
  assert(viewingCountries.some(row => row.code === 'JP'))
  assert.equal(viewingCountries.length, 250) // ISO's 249 countries/territories plus Kosovo.
  for (const country of viewingCountries) {
    const result = discoverSchedule(input, { country: country.code }, now)
    assert.equal(result.selected.length, 3, country.code)
    assert.equal(result.local.length + result.other.length, 3)
    assert(result.local.every(e => e.broadcasts.some(b => b.territory === country.code)))
  }
})

test('local channels are split from worldwide fixtures without assigning foreign rights', () => {
  const uk = event('uk', [channel()]), us = event('us', [channel('US')])
  const result = discoverSchedule(feed([uk, us]), { country: 'US' }, now)
  assert.deepEqual(result.local.map(e => e.id), ['us'])
  assert.deepEqual(result.other.map(e => e.id), ['uk'])
  assert.deepEqual(uk.broadcasts.map(b => b.territory), ['GB'])
  assert.deepEqual(countryAlternatives(uk, 'US', now), ['GB'])
})

test('expired channel records do not hide a fresh fixture or appear as alternatives', () => {
  const input = event('expired-channel', [channel('MA', { validUntil: new Date(now - 1).toISOString() })])
  const result = discoverSchedule(feed([input]), { country: 'MA' }, now)
  assert.equal(result.selected.length, 1)
  assert.equal(result.local.length, 0)
  assert.deepEqual(countryAlternatives(input, 'US', now), [])
})

test('expired feeds and fixtures, past matches and fixtures beyond seven days stay withheld', () => {
  const current = event('current')
  assert.equal(upcomingSchedule({ ...feed([current]), expiresAt: new Date(now).toISOString() }, now).length, 0)
  assert.equal(upcomingSchedule(feed([current, event('old', [], { startsAt: new Date(now - 1).toISOString() }), event('expired', [], { validUntil: new Date(now - 1).toISOString() }), event('later', [], { startsAt: new Date(now + 8 * 86400000).toISOString() })]), now).length, 1)
})

test('explicit exact-channel filter stays territory-specific and excludes platform-only evidence', () => {
  const input = feed([event('uk', [channel()]), event('platform', [channel('US', { evidenceLevel: 'B', destinationPrecision: 'service' })]), event('us', [channel('US')])])
  assert.deepEqual(discoverSchedule(input, { country: 'US', exact: true }, now).selected.map(e => e.id), ['us'])
  assert.equal(discoverSchedule(input, { country: 'MA', exact: true }, now).selected.length, 0)
})

test('date filters use local timezone; search and sport remain available without local channels', () => {
  const input = feed([event('tokyo', [], { startsAt: '2026-10-20T22:30:00Z' })])
  assert.equal(discoverSchedule(input, { country: 'JP', date: '2026-10-21', timeZone: 'Asia/Tokyo', query: 'tokyo' }, now).selected.length, 1)
  assert.equal(discoverSchedule(input, { country: 'JP', sport: 'basketball' }, now).selected.length, 0)
})

test('competition-rights hints honor territory and season and never become exact channels', () => {
  const right = { territory: 'MA', holders: [{ name: 'beIN Sports' }], sourceType: 'official-rights', sourceUrl: 'https://www.premierleague.com/en/about/broadcast-partners', validFrom: '2025-08-01', validThrough: '2028-07-31' }
  const input = event('rights', [], { broadcastRights: [right] })
  assert.equal(currentRights(input, 'MA', now).length, 1)
  assert.equal(currentRights(input, 'US', now).length, 0)
  assert.equal(currentRights({ ...input, startsAt: '2029-08-01T20:00:00Z' }, 'MA', now).length, 0)
  assert.equal(discoverSchedule(feed([input]), { country: 'MA' }, now).local.length, 0)
})


test('broadcaster searches only match listings in the selected territory', () => {
  const input = feed([event('local', [channel('GB')]), event('foreign', [channel('US', { channel: 'Peacock' })])])
  assert.equal(discoverSchedule(input, { country: 'US', query: 'Sky Sports' }, now).selected.length, 0)
  assert.deepEqual(discoverSchedule(input, { country: 'GB', query: 'Sky Sports' }, now).selected.map(e => e.id), ['local'])
  assert.equal(discoverSchedule(input, { country: 'US', query: 'Home local' }, now).selected.length, 1)
})
