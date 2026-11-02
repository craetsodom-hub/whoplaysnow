import type { PrismaClient } from '@prisma/client'
import { submitIndexNowUrls } from '../indexnow'
import { notificationRetryAt } from './publication'
import { MATCH_LOCALES } from './routes'

export type PendingMatchNotification = { id: string; slug: string; content_hash: string; notify_attempts: number }
type NotificationReceipt = { accepted: boolean; status: number | null; dryRun?: boolean }
type NotificationStore = {
  pending: (limit: number) => Promise<PendingMatchNotification[]>
  acknowledge: (rows: PendingMatchNotification[]) => Promise<number>
  defer: (rows: PendingMatchNotification[], now: number) => Promise<number>
  remaining: () => Promise<number>
}

export function matchNotificationStore(db: Pick<PrismaClient, '$queryRawUnsafe' | '$executeRawUnsafe'>): NotificationStore {
  return {
    pending: limit => db.$queryRawUnsafe<PendingMatchNotification[]>(`SELECT id,slug,content_hash,notify_attempts FROM matches_publication
      WHERE published=TRUE AND notified_hash IS DISTINCT FROM content_hash AND next_notify_at<=CURRENT_TIMESTAMP ORDER BY changed_at,id LIMIT $1`, limit),
    acknowledge: rows => db.$executeRawUnsafe(`UPDATE matches_publication AS publication SET notified_hash=receipt.hash,notify_attempts=0
      FROM jsonb_to_recordset($1::jsonb) AS receipt(id text,hash text)
      WHERE publication.id=receipt.id AND publication.content_hash=receipt.hash AND publication.published=TRUE`,
    JSON.stringify(rows.map(row => ({ id: row.id, hash: row.content_hash })))),
    defer: (rows, now) => db.$executeRawUnsafe(`UPDATE matches_publication AS publication SET notify_attempts=publication.notify_attempts+1,next_notify_at=receipt.retry::timestamptz
      FROM jsonb_to_recordset($1::jsonb) AS receipt(id text,hash text,retry text)
      WHERE publication.id=receipt.id AND publication.content_hash=receipt.hash AND publication.published=TRUE`,
    JSON.stringify(rows.map(row => ({ id: row.id, hash: row.content_hash, retry: notificationRetryAt(row.notify_attempts + 1, now).toISOString() })))),
    remaining: async () => (await db.$queryRawUnsafe<{ count: number }[]>(`SELECT COUNT(*)::int AS count FROM matches_publication
      WHERE published=TRUE AND notified_hash IS DISTINCT FROM content_hash`))[0].count,
  }
}

export async function drainMatchNotifications(store: NotificationStore, options: {
  submit?: (paths: string[]) => Promise<NotificationReceipt>
  batchSize?: number
  maxBatches?: number
  now?: () => number
} = {}) {
  const { batchSize = 500, maxBatches = 10, now = Date.now } = options
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500 || !Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 10) throw new Error('invalid-notification-bounds')
  const submit = options.submit ?? (paths => submitIndexNowUrls(paths, { fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30000) }) }))
  let batches = 0, submitted = 0, accepted = 0, acknowledged = 0, deferred = 0
  let lastStatus: number | null = null
  while (batches < maxBatches) {
    const rows = await store.pending(batchSize)
    if (!rows.length) break
    const paths = rows.flatMap(row => MATCH_LOCALES.map(locale => `/matches/${row.slug}${locale === 'en' ? '' : `/${locale}`}`))
    const receipt = await submit(paths).catch(() => ({ accepted: false, status: null }))
    if ('dryRun' in receipt && receipt.dryRun) throw new Error('dry-run-cannot-acknowledge-notifications')
    batches++; submitted += rows.length; lastStatus = receipt.status
    if (!receipt.accepted) {
      deferred += await store.defer(rows, now())
      // Do not hammer a failing endpoint. The independent notifier retries due
      // rows, even when the fixture collector itself is unavailable.
      break
    }
    accepted += rows.length
    // Only the submitted content version can be acknowledged. A reschedule or
    // channel update during this HTTP request remains queued automatically.
    acknowledged += await store.acknowledge(rows)
  }
  return { batches, submitted, accepted, submittedUrls: submitted * MATCH_LOCALES.length, acceptedUrls: accepted * MATCH_LOCALES.length, acknowledged, deferred, pending: await store.remaining(), lastStatus }
}
