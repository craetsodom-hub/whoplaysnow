import type { PrismaClient } from '@prisma/client'
import { preparePublication, sourceAliases, type PublishedMatch } from './publication'
import type { Match } from './feed'
import { canonicalMatchId, isCanonicalMatchId, retiredMatchIds } from './event-aliases'
import { isUnsupportedFixture } from './fixture-integrity'

type Row = { id: string; slug: string; event: Match; content_hash: string; published: boolean; changed_at: Date; observed_at: Date; first_seen: Date }
export function publicationRow(row: Row): PublishedMatch {
  return { event: { ...row.event, canonicalSlug: row.slug }, slug: row.slug, hash: row.content_hash, published: row.published, changedAt: row.changed_at.toISOString(), observedAt: row.observed_at.toISOString(), firstSeen: row.first_seen.toISOString() }
}
export async function saveMatch(db: PrismaClient, event: Match, now = Date.now()) {
  if (isUnsupportedFixture(event)) throw new Error('unsupported-fixture-source')
  if (!isCanonicalMatchId(event.id)) throw new Error('conflicting-event-identity')
  const aliases = sourceAliases(event)
  // Reviewed retired records remain in the archive, but cannot compete with
  // their canonical publication when a fresh source supplies both source IDs.
  const rows = await db.$queryRawUnsafe<Row[]>('SELECT * FROM matches_publication WHERE (id=$1 OR aliases && $2::text[]) AND NOT (id=ANY($3::text[])) LIMIT 2', event.id, aliases, retiredMatchIds())
  if (rows.length > 1) throw new Error('ambiguous-event-alias')
  const previous = rows[0] ? publicationRow(rows[0]) : undefined
  const next = preparePublication(event, previous, now)
  const allAliases = [...new Set([...aliases, ...sourceAliases(next.event)])]
  await db.$executeRawUnsafe(`INSERT INTO matches_publication(id,slug,event,aliases,kickoff,observed_at,changed_at,content_hash,published)
    VALUES($1,$2,$3::jsonb,$4::text[],$5::timestamptz,$6::timestamptz,$7::timestamptz,$8,$9)
    ON CONFLICT(id) DO UPDATE SET event=EXCLUDED.event, aliases=ARRAY(SELECT DISTINCT unnest(matches_publication.aliases || EXCLUDED.aliases)),
    kickoff=EXCLUDED.kickoff, observed_at=EXCLUDED.observed_at, changed_at=EXCLUDED.changed_at, content_hash=EXCLUDED.content_hash,
    published=EXCLUDED.published, notify_attempts=CASE WHEN matches_publication.content_hash=EXCLUDED.content_hash THEN matches_publication.notify_attempts ELSE 0 END,
    next_notify_at=CASE WHEN matches_publication.content_hash=EXCLUDED.content_hash THEN matches_publication.next_notify_at ELSE CURRENT_TIMESTAMP END`,
    next.event.id, next.slug, JSON.stringify(next.event), allAliases, next.event.startsAt, next.observedAt, next.changedAt, next.hash, next.published)
  return { changed: previous?.hash !== next.hash, published: next.published }
}
export async function loadPublishedMatch(db: PrismaClient, id: string) {
  id = canonicalMatchId(id)
  if (isUnsupportedFixture({ id })) return undefined
  const aliases = sourceAliases({ id })
  const rows = await db.$queryRawUnsafe<Row[]>('SELECT * FROM matches_publication WHERE (id=$1 OR aliases && $2::text[]) AND NOT (id=ANY($3::text[])) LIMIT 2', id, aliases, retiredMatchIds())
  return rows.length === 1 && !isUnsupportedFixture(rows[0]) ? publicationRow(rows[0]) : undefined
}
export async function loadPlanningMatches(db: PrismaClient, now = Date.now()) {
  const rows = await db.$queryRawUnsafe<Row[]>('SELECT * FROM matches_publication WHERE kickoff >= $1::timestamptz AND kickoff <= $2::timestamptz ORDER BY kickoff,id LIMIT 5000', new Date(now).toISOString(), new Date(now + 165 * 86400_000).toISOString())
  return rows.filter(row => isCanonicalMatchId(row.id) && !isUnsupportedFixture(row)).map(publicationRow)
}
export async function loadMatchSitemap(db: PrismaClient, now = Date.now()) {
  // Published pages survive kickoff. Retain a useful, bounded one-year archive.
  const rows = await db.$queryRawUnsafe<(Pick<Row, 'id' | 'slug' | 'changed_at'> & Partial<Pick<Row, 'event'>>)[]>('SELECT id, slug, changed_at FROM matches_publication WHERE published=TRUE AND kickoff >= $1::timestamptz ORDER BY kickoff,id LIMIT 40000', new Date(now - 365 * 86400_000).toISOString())
  return rows.filter(row => isCanonicalMatchId(row.id) && !isUnsupportedFixture(row)).map(row => ({ id: row.id, slug: row.slug, changedAt: row.changed_at.toISOString(), event: row.event ? { ...row.event, canonicalSlug: row.slug } : ({ id: row.id, canonicalSlug: row.slug } as Match) }))
}
