import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalMatchId, isCanonicalMatchId } from './event-aliases.ts'
import { findMatchById, matchSourceIds } from './routes.ts'
import { loadPublishedMatch, loadPlanningMatches, loadMatchSitemap } from './publication-store.ts'

const duplicate = 'tsdb-2506222', canonical = 'espn-401882870'
const row = id => ({ id, slug: `fixture--${id}`, event: { id }, content_hash: 'hash', published: true, first_seen: new Date(), observed_at: new Date(), changed_at: new Date() })

test('only an explicitly reviewed event pair resolves to the canonical ID', () => {
  assert.equal(canonicalMatchId(duplicate), canonical)
  assert.equal(canonicalMatchId(canonical), canonical)
  for (const id of ['tsdb-2506223', 'espn-2506222', '__proto__', 'constructor']) assert.equal(canonicalMatchId(id), id)
  assert(!isCanonicalMatchId(duplicate))
})
test('a duplicate URL resolves the preferred event without transferring channels', () => {
  const preferred = { id: canonical, broadcasts: [{ channel: 'Current verified service' }] }
  const old = { id: duplicate, broadcasts: [{ channel: 'Old separate listing' }] }
  assert.equal(findMatchById([old, preferred], duplicate), preferred)
  assert.equal(findMatchById([old], duplicate), undefined)
  assert.deepEqual(matchSourceIds(old), { thesportsdb: '2506222' })
})
test('the archive lookup binds the canonical ID and preserves its stable slug', async () => {
  const calls = [], stored = row(canonical)
  const db = { $queryRawUnsafe: async (...args) => { calls.push(args); return [stored] } }
  const found = await loadPublishedMatch(db, duplicate)
  assert.equal(calls[0][1], canonical)
  assert.equal(found.slug, stored.slug)
})
test('planning and sitemap inventories omit the duplicate without deleting its record', async () => {
  const rows = [row(duplicate), row(canonical), row('espn-999')]
  const db = { $queryRawUnsafe: async () => rows }
  for (const load of [loadPlanningMatches, loadMatchSitemap]) assert.deepEqual((await load(db)).map(item => item.event.id), [canonical, 'espn-999'])
  assert.equal(rows.length, 3)
})

test('reviewed Racing aliases resolve to one canonical publication in every lookup', async () => {
  const duplicate='laliga-102344', canonical='espn-401882831'
  assert.equal(canonicalMatchId(duplicate),canonical)
  assert(!isCanonicalMatchId(duplicate))
  const calls=[]
  const db={$queryRawUnsafe:async(...args)=>{calls.push(args);return [row(canonical)]}}
  const result=await loadPublishedMatch(db,duplicate)
  assert.equal(result.event.id,canonical)
  assert.equal(calls[0][1],canonical)
  assert.ok(calls[0][3].includes(duplicate))
  assert.ok(calls[0][0].includes('NOT (id=ANY($3::text[]))'))
})
