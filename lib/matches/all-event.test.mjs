import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAllEventDestinations, normalizeAllEventDestinations } from './all-event.ts'
import { evidenceLevelFor } from './feed.ts'
import reviewed from './reviewed-destinations.json' with { type: 'json' }

const now = Date.parse('2026-10-17T12:00:00Z')
const cacheValidUntil = '2026-10-17T12:15:00.000Z'
const rule = (extra = {}) => ({
  competitionId: 'serie-a', competitionAliases: ['Serie A', 'Italian Serie A'], seasons: ['2026/27'],
  validFrom: '2026-07-01', validThrough: '2027-06-30', territory: 'US', name: 'Paramount+', aliases: ['Paramount Plus'],
  sourceUrl: 'https://www.paramountpressexpress.com/paramount-plus/shows/soccer/releases/?view=112947',
  allMatchesEvidenceUrl: 'https://www.paramountpressexpress.com/paramount-plus/shows/soccer/releases/?view=112947',
  viewingUrl: 'https://www.paramountplus.com/shows/serie-a/episodes/', lastVerified: '2026-10-17', ...extra,
})
const event = (extra = {}) => ({
  id: 'serie-a-event', title: 'Inter vs Milan', sport: 'football', competition: 'Serie A', startsAt: '2026-10-18T18:00:00.000Z',
  broadcasts: [], homeTeam: null, awayTeam: null, ...extra,
})

test('exported shared catalog is usable and does not leak services to Spain or invent Arabic audio', () => {
  const at = Date.parse('2026-10-18T16:00:00Z')
  const rows = normalizeAllEventDestinations(reviewed.allEventDestinations, at)
  assert.equal(rows.length, 49)
  const [result] = applyAllEventDestinations([event({ competition: 'LaLiga' })], reviewed.allEventDestinations, at, '2026-10-18T16:15:00Z')
  assert.equal(new Set(result.broadcasts.map(b => b.territory)).size, 14)
  assert(!result.broadcasts.some(b => b.territory === 'ES' || b.languages.includes('ar')))
  assert(result.broadcasts.some(b => b.territory === 'FR' && b.languages.includes('fr')))
  assert.equal(result.broadcasts.filter(b => b.territory === 'AU').length, 3)
})

test('applies a current official all-match service with evidence and a safe direct destination', () => {
  const [result] = applyAllEventDestinations([event()], [rule()], now, cacheValidUntil)
  assert.equal(result.broadcasts.length, 1)
  assert.deepEqual(result.broadcasts[0], {
    channel: 'Paramount+', territory: 'US', languages: [], official: true, sourceType: 'official-all-events', evidenceLevel: 'B',
    destinationType: 'service', destinationPrecision: 'service', matchingMethod: 'all-events',
    sourceUrl: rule().sourceUrl, verifiedAt: '2026-10-17', validUntil: cacheValidUntil,
    aliases: ['Paramount Plus'], viewingUrl: 'https://www.paramountplus.com/shows/serie-a/episodes/',
  })
})

test('requires an exact competition alias, current season, event date and football sport', () => {
  assert.equal(applyAllEventDestinations([event({ competition: 'Serie B' })], [rule()], now, cacheValidUntil)[0].broadcasts.length, 0)
  assert.equal(applyAllEventDestinations([event({ startsAt: '2028-10-18T18:00:00.000Z' })], [rule()], now, cacheValidUntil)[0].broadcasts.length, 0)
  assert.equal(applyAllEventDestinations([event({ sport: 'basketball' })], [rule()], now, cacheValidUntil)[0].broadcasts.length, 0)
})

test('rejects malformed rules, future verification and unreviewed evidence or viewing hosts', () => {
  assert.equal(normalizeAllEventDestinations([rule({ territory: 'USA' })], now).length, 0)
  assert.equal(normalizeAllEventDestinations([rule({ territory: 'ZZ' })], now).length, 0)
  assert.equal(normalizeAllEventDestinations([rule({ lastVerified: '2099-01-01' })], now).length, 0)
  assert.equal(normalizeAllEventDestinations([rule({ sourceUrl: 'https://evil.example/evidence', allMatchesEvidenceUrl: 'https://evil.example/evidence' })], now).length, 0)
  assert.equal(normalizeAllEventDestinations([rule({ viewingUrl: 'https://evil.example/watch' })], now).length, 0)
  assert.equal(normalizeAllEventDestinations([rule({ allMatchesEvidenceUrl: 'https://www.paramountplus.com/shows/serie-a/' })], now).length, 0)
})

test('adds Level B without overwriting stronger exact-match evidence', () => {
  const exact = { channel: 'CBS Sports', territory: 'US', official: true, sourceType: 'official-event', evidenceLevel: 'A', sourceUrl: 'https://www.uefa.com/exact', validUntil: cacheValidUntil }
  const [result] = applyAllEventDestinations([event({ broadcasts: [exact] })], [rule()], now, cacheValidUntil)
  assert.equal(result.broadcasts.length, 2)
  assert.equal(evidenceLevelFor(result, 'US', now), 'A')
})

test('does not apply sidecar rules when their cache validity is missing or expired', () => {
  assert.equal(applyAllEventDestinations([event()], [rule()], now)[0].broadcasts.length, 0)
  assert.equal(applyAllEventDestinations([event()], [rule()], now, '2026-10-17T11:59:59.000Z')[0].broadcasts.length, 0)
})

test('audio requires same reviewed source, explicit codes and a past verification time', () => {
  const audio = { languages: ['en', 'es'], languageEvidence: { scope: 'feed-audio', sourceUrl: rule().sourceUrl, verifiedAt: '2026-10-17T10:00:00Z' } }
  assert.deepEqual(applyAllEventDestinations([event()], [rule(audio)], now, cacheValidUntil)[0].broadcasts[0].languages, ['en', 'es'])
  const wrong = { ...audio, languageEvidence: { ...audio.languageEvidence, sourceUrl: 'https://evil.example/audio' } }
  assert.deepEqual(applyAllEventDestinations([event()], [rule(wrong)], now, cacheValidUntil)[0].broadcasts[0].languages, [])
  assert.deepEqual(applyAllEventDestinations([event()], [rule({ languages: ['fr'] })], now, cacheValidUntil)[0].broadcasts[0].languages, [])
})

test('source review expires independently of successful cache refreshes', () => {
  assert.equal(normalizeAllEventDestinations([rule({ lastVerified: '2026-01-01' })], now).length, 0)
})
