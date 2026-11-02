import test from 'node:test'
import assert from 'node:assert/strict'
import { MATCH_LOCALES, matchIdFromSlug, matchLocale, matchPath, matchSlug } from './routes.ts'

test('match URLs retain a stable source ID and readable title', () => {
  const event = { id: 'laliga-102329', title: 'Real Betis vs FC Barcelona' }
  assert.equal(matchSlug(event), 'real-betis-vs-fc-barcelona--laliga-102329')
  assert.equal(matchIdFromSlug(matchSlug(event)), event.id)
  assert.equal(matchPath(event), '/matches/real-betis-vs-fc-barcelona--laliga-102329')
  assert.equal(matchPath(event, 'es'), '/matches/real-betis-vs-fc-barcelona--laliga-102329/es')
})

test('match route parsing rejects malformed IDs and unsupported locales', () => {
  assert.equal(matchIdFromSlug('missing-id'), null)
  assert.equal(matchIdFromSlug('event--bad%2Fid'), null)
  assert.equal(matchLocale('es'), 'es')
  assert.equal(matchLocale('xx'), null)
  assert.deepEqual(MATCH_LOCALES, ['en', 'es', 'fr', 'de', 'it', 'pt', 'ar'])
})
