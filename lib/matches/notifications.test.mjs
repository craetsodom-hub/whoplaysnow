import test from 'node:test'
import assert from 'node:assert/strict'
import { drainMatchNotifications, matchNotificationStore } from './notifications.ts'

const now = Date.parse('2026-10-20T08:00:00Z')
function memoryStore(count) {
  const rows = Array.from({ length: count }, (_, id) => ({ id: `event-${id}`, slug: `fixture--event-${id}`, content_hash: 'first-version', notify_attempts: 0, due: now, published: true, notified: null }))
  return {
    rows,
    pending: async limit => rows.filter(row => row.published && row.notified !== row.content_hash && row.due <= now).slice(0, limit).map(row => ({ ...row })),
    acknowledge: async receipts => {
      let acknowledged = 0
      for (const receipt of receipts) { const row = rows.find(row => row.id === receipt.id); if (row.published && row.content_hash === receipt.content_hash) { row.notified = receipt.content_hash; acknowledged++ } }
      return acknowledged
    },
    defer: async receipts => {
      for (const receipt of receipts) { const row = rows.find(row => row.id === receipt.id); if (row.content_hash === receipt.content_hash) { row.notify_attempts++; row.due = now + 600000 } }
      return receipts.length
    },
    remaining: async () => rows.filter(row => row.published && row.notified !== row.content_hash).length,
  }
}

test('autopilot drains a backlog larger than one batch without manual invocations', async () => {
  const store = memoryStore(1201), calls = []
  const result = await drainMatchNotifications(store, { submit: async paths => { calls.push(paths); return { accepted: true, status: 200 } } })
  assert.deepEqual(calls.map(batch => batch.length), [3500, 3500, 1407])
  assert.equal(new Set(calls.flat()).size, 8407)
  assert.equal(result.acceptedUrls, 8407)
  assert.deepEqual(calls[0].slice(0,7), ['', '/es', '/fr', '/de', '/it', '/pt', '/ar'].map(suffix => '/matches/fixture--event-0'+suffix))
  assert.equal(result.accepted, 1201); assert.equal(result.acknowledged, 1201); assert.equal(result.pending, 0)
})
test('accepted notifications are not resubmitted on the next scheduled run', async () => {
  const store = memoryStore(3)
  const options = { submit: async () => ({ accepted: true, status: 202 }) }
  await drainMatchNotifications(store, options)
  assert.equal((await drainMatchNotifications(store, { submit: async () => { throw Error('must not call endpoint') } })).submitted, 0)
})
test('bounded runs leave excess rows durable for the independent retry timer', async () => {
  const store = memoryStore(1201)
  const result = await drainMatchNotifications(store, { maxBatches: 2, submit: async () => ({ accepted: true, status: 200 }) })
  assert.equal(result.batches, 2); assert.equal(result.pending, 201)
  assert.equal((await drainMatchNotifications(store, { submit: async () => ({ accepted: true, status: 200 }) })).pending, 0)
})
test('rate limits defer one batch and stop instead of flooding the endpoint', async () => {
  const store = memoryStore(700); let calls = 0
  const result = await drainMatchNotifications(store, { now: () => now, submit: async () => { calls++; return { accepted: false, status: 429 } } })
  assert.equal(calls, 1); assert.equal(result.deferred, 500); assert.equal(result.accepted, 0); assert.equal(result.pending, 700)
  assert.equal(store.rows[0].notify_attempts, 1)
})
test('transport failures retain the queue and do not expose response or credential text', async () => {
  const store = memoryStore(2)
  const result = await drainMatchNotifications(store, { submit: async () => { throw Error('private transport detail') } })
  assert.equal(result.pending, 2); assert.equal(result.deferred, 2); assert.equal(result.lastStatus, null)
  assert(!JSON.stringify(result).includes('private'))
})
test('a changed version during a request stays pending and is announced separately', async () => {
  const store = memoryStore(1); let calls = 0
  const result = await drainMatchNotifications(store, { submit: async () => { if (++calls === 1) store.rows[0].content_hash = 'rescheduled-version'; return { accepted: true, status: 200 } } })
  assert.equal(calls, 2); assert.equal(result.submitted, 2); assert.equal(result.acknowledged, 1)
  assert.equal(store.rows[0].notified, 'rescheduled-version'); assert.equal(result.pending, 0)
})
test('newly published matches arriving during draining are picked up automatically', async () => {
  const store = memoryStore(2); store.rows[1].published = false
  let calls = 0
  const result = await drainMatchNotifications(store, { submit: async () => { if (++calls === 1) store.rows[1].published = true; return { accepted: true, status: 200 } } })
  assert.equal(result.accepted, 2); assert.equal(result.pending, 0)
})
test('unpublished fixtures and failed attempts awaiting backoff do not get announced', async () => {
  const store = memoryStore(3); store.rows[0].published = false; store.rows[1].due = now + 3600000
  const paths = []
  const result = await drainMatchNotifications(store, { submit: async batch => { paths.push(...batch); return { accepted: true, status: 200 } } })
  assert.deepEqual(paths, ['', '/es', '/fr', '/de', '/it', '/pt', '/ar'].map(suffix => '/matches/fixture--event-2'+suffix)); assert.equal(result.pending, 1)
})
test('a dry-run receipt cannot mark a real notification delivered', async () => {
  const store = memoryStore(1)
  await assert.rejects(() => drainMatchNotifications(store, { submit: async () => ({ accepted: true, status: null, dryRun: true }) }), /dry-run-cannot/)
  assert.equal(await store.remaining(), 1)
})
test('a DB acknowledgement failure leaves delivery retryable', async () => {
  const store = memoryStore(1); store.acknowledge = async () => { throw Error('database unavailable') }
  await assert.rejects(() => drainMatchNotifications(store, { submit: async () => ({ accepted: true, status: 200 }) }), /database unavailable/)
  assert.equal(await store.remaining(), 1)
})
test('notification bounds reject zero, unbounded or fractional requests', async () => {
  for (const options of [{ batchSize: 0 }, { batchSize: 501 }, { maxBatches: 11 }, { maxBatches: 1.5 }]) await assert.rejects(() => drainMatchNotifications(memoryStore(0), options), /invalid-notification-bounds/)
})
test('database acknowledgements and retries bind versions and update whole batches', async () => {
  const calls = []
  const db = { $queryRawUnsafe: async (...args) => { calls.push(args); return [{ count: 3 }] }, $executeRawUnsafe: async (...args) => { calls.push(args); return 2 } }
  const store = matchNotificationStore(db)
  const rows = [{ id: "source's-id", slug: 'fixture--id', content_hash: 'version', notify_attempts: 2 }]
  await store.acknowledge(rows); await store.defer(rows, now)
  assert.equal(calls.length, 2)
  assert(!calls[0][0].includes("source's-id")); assert.equal(JSON.parse(calls[0][1])[0].id, "source's-id")
  assert(calls[0][0].includes('publication.content_hash=receipt.hash'))
  assert.equal(JSON.parse(calls[1][1])[0].retry, '2026-10-20T08:40:00.000Z')
  assert.equal(await store.remaining(), 3)
})
