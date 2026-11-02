import 'server-only'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { MATCH_COVERAGE_URL, MATCH_FEED_URL, type MatchFeed } from './feed'
import { collectMatches } from './collect'
import { prisma } from '@/lib/prisma'
import { loadPublishedMatch, loadPlanningMatches, loadMatchSitemap } from './publication-store'
import { applyAllEventDestinations } from './all-event'
import reviewedDestinations from './reviewed-destinations.json'
import { buildPlanningGuides, relatedPlanningGuides, currentBroadcasts, distinctBroadcasts, hasIndexableEvent, type Guide } from './guide'
import { FIVE_MONTH_HORIZON_DAYS, upcomingSchedule } from './discovery'
import { findMatchById } from './routes'
import type { Match } from './feed'
import { fixtureObservationIsFresh, sourceAliases } from './publication'
import { canonicalMatchId } from './event-aliases'

function configuredSharedUrl(name: 'WHOSEIPTV_FEED_URL' | 'WHOSEIPTV_COVERAGE_URL', fallback: string) {
  const configured = process.env[name]
  if (!configured) return fallback
  const url = new URL(configured)
  const reviewedRemote = url.protocol === 'https:' && url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith('/craetsodom-hub/whoseiptv/')
  const localPreview = process.env.ALLOW_LOCAL_MATCH_FEED === '1' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  if (!reviewedRemote && !localPreview) throw new Error('unreviewed-shared-feed-url')
  return url.href
}

const MATCHES_FRESH_TTL_MS = 900_000
const MATCHES_STALE_TTL_MS = 86_400_000
const DERIVED_CACHE_TTL_MS = 60_000

let memoryMatchesCache: {
  key: string
  feed: MatchFeed
  fetchedAt: number
} | null = null
let inflightMatchesPromise: Promise<MatchFeed> | null = null

type DerivedMatchesState = {
  computedAt: number
  compactFeed: MatchFeed
  allGuides: Guide[]
  guidesByEventId: Map<string, Guide[]>
}

const derivedMatchesCacheByFeed = new WeakMap<MatchFeed, DerivedMatchesState>()

async function fetchAndStoreMatches(feedUrl: string, coverageUrl: string, cacheKey: string): Promise<MatchFeed> {
  if (inflightMatchesPromise) return inflightMatchesPromise
  inflightMatchesPromise = (async () => {
    try {
      const feed = await collectMatches(feedUrl, coverageUrl)
      memoryMatchesCache = {
        key: cacheKey,
        feed,
        fetchedAt: Date.now(),
      }
      return feed
    } finally {
      inflightMatchesPromise = null
    }
  })()
  return inflightMatchesPromise
}

export async function getMatches(): Promise<MatchFeed> {
  const feedUrl = configuredSharedUrl('WHOSEIPTV_FEED_URL', MATCH_FEED_URL)
  const coverageUrl = configuredSharedUrl('WHOSEIPTV_COVERAGE_URL', MATCH_COVERAGE_URL)
  const cacheKey = `${feedUrl}|${coverageUrl}`
  const now = Date.now()

  if (memoryMatchesCache && memoryMatchesCache.key === cacheKey) {
    const age = now - memoryMatchesCache.fetchedAt
    if (age < MATCHES_FRESH_TTL_MS) {
      return memoryMatchesCache.feed
    }
    if (age < MATCHES_STALE_TTL_MS) {
      void fetchAndStoreMatches(feedUrl, coverageUrl, cacheKey).catch(() => {})
      return memoryMatchesCache.feed
    }
  }

  try {
    return await fetchAndStoreMatches(feedUrl, coverageUrl, cacheKey)
  } catch (err) {
    if (memoryMatchesCache && memoryMatchesCache.key === cacheKey) {
      return memoryMatchesCache.feed
    }
    throw err
  }
}

export function compactEventForBrowser(event: Match, now = Date.now(), includeAllEvents = true, includeSources = false): Match {
  const compactBroadcasts = distinctBroadcasts(currentBroadcasts(event, now))
    .filter((b) => includeAllEvents || b.sourceType !== 'official-all-events')
    .map((b) => ({
      channel: b.channel,
      ...(b.validUntil ? { validUntil: b.validUntil } : {}),
      territory: b.territory,
      languages: [],
      sourceUrl: includeSources ? b.sourceUrl : b.sourceUrl ? 'https://whoplaysnow.com' : '',
      ...(includeSources && b.checkedAt ? { checkedAt: b.checkedAt } : {}),
      official: b.official,
      sourceType: b.sourceType,
      ...(b.evidenceLevel ? { evidenceLevel: b.evidenceLevel } : {}),
      ...(b.destinationPrecision ? { destinationPrecision: b.destinationPrecision } : {}),
      ...(b.logoUrl ? { logoUrl: b.logoUrl } : {}),
      ...(b.darkLogoUrl ? { darkLogoUrl: b.darkLogoUrl } : {}),
      ...(b.rightsHolder ? { rightsHolder: b.rightsHolder } : {}),
    }))

  const compactRights = event.broadcastRights?.length
    ? event.broadcastRights.map((r) => ({
        territory: r.territory,
        holders: r.holders.map((h) => ({ name: h.name })),
        sourceType: r.sourceType,
        sourceUrl: '',
        ...(r.validFrom ? { validFrom: r.validFrom } : {}),
        ...(r.validThrough ? { validThrough: r.validThrough } : {}),
      }))
    : undefined

  return {
    id: event.id,
    ...(includeSources && event.venue ? { venue: event.venue } : {}),
    ...(event.validUntil ? { validUntil: event.validUntil } : {}),
    ...(event.canonicalSlug ? { canonicalSlug: event.canonicalSlug } : {}),
    ...(event.phase ? { phase: event.phase } : {}),
    title: event.title,
    sport: event.sport,
    competition: event.competition,
    ...(event.competitionKey ? { competitionKey: event.competitionKey } : {}),
    ...(event.competitionLogo ? { competitionLogo: event.competitionLogo } : {}),
    startsAt: event.startsAt,
    broadcasts: compactBroadcasts,
    ...(compactRights ? { broadcastRights: compactRights } : {}),
    homeTeam: event.homeTeam
      ? { name: event.homeTeam.name, badgeUrl: event.homeTeam.badgeUrl, sourceId: null }
      : null,
    awayTeam: event.awayTeam
      ? { name: event.awayTeam.name, badgeUrl: event.awayTeam.badgeUrl, sourceId: null }
      : null,
  }
}

function getDerivedMatchesState(feed: MatchFeed, now = Date.now()): DerivedMatchesState {
  const existing = derivedMatchesCacheByFeed.get(feed)
  if (existing && now - existing.computedAt < DERIVED_CACHE_TTL_MS) {
    return existing
  }

  const events = upcomingSchedule(feed, now, FIVE_MONTH_HORIZON_DAYS).map((event) => compactEventForBrowser(event, now, true))
  const compactFeed: MatchFeed = {
    generatedAt: feed.generatedAt,
    expiresAt: feed.expiresAt,
    state: feed.state,
    rejected: 0,
    events,
  }

  const allGuides = buildPlanningGuides(feed.events, now)
  const guidesByEventId = new Map<string, Guide[]>()
  for (const guide of allGuides) {
    const strippedGuide: Guide = { ...guide, events: [] }
    for (const ev of guide.events) {
      const list = guidesByEventId.get(ev.id)
      if (list) list.push(strippedGuide)
      else guidesByEventId.set(ev.id, [strippedGuide])
    }
  }

  const state: DerivedMatchesState = {
    computedAt: now,
    compactFeed,
    allGuides,
    guidesByEventId,
  }
  derivedMatchesCacheByFeed.set(feed, state)
  return state
}

export function compactFeedForBrowser(feed: MatchFeed, now = Date.now()): MatchFeed {
  return getDerivedMatchesState(feed, now).compactFeed
}

export function getCachedGuidesForFeed(feed: MatchFeed, now = Date.now()): Guide[] {
  return getDerivedMatchesState(feed, now).allGuides
}

export function getGuidesForEvent(feed: MatchFeed, eventOrId: Match | string, now = Date.now()): Guide[] {
  const state = getDerivedMatchesState(feed, now)
  const eventId = typeof eventOrId === 'string' ? eventOrId : eventOrId.id
  const cached = state.guidesByEventId.get(eventId)
  if (cached) return cached
  if (typeof eventOrId === 'string') return []
  const computed = relatedPlanningGuides(eventOrId, state.allGuides, now)
    .map((g) => ({ ...g, events: [] }))
  state.guidesByEventId.set(eventId, computed)
  return computed
}

function isDisruptivePhase(phase?: string): boolean {
  return Boolean(phase && /postponed|cancel|confirm/i.test(phase))
}

function refreshStoredEvent(event: Match, now: number, observedAt: string): Match {
  // Reading a stored page is not a fresh broadcast verification.
  const clean = { ...event, broadcasts: currentBroadcasts(event, now) }
  if (Date.parse(event.startsAt) > now && !fixtureObservationIsFresh(event.fixtureSource?.checkedAt ?? observedAt, now)) {
    return { ...clean, phase: 'Schedule to be confirmed', broadcasts: [] }
  }
  return isDisruptivePhase(event.phase) ? { ...clean, broadcasts: [] } : clean
}

const publishedMatchMemoryCache = new Map<
  string,
  { value: Awaited<ReturnType<typeof loadPublishedMatch>>; expiresAt: number }
>()

export async function getPublishedMatch(id: string) {
  if (process.env.MATCHES_PUBLISHING_ENABLED !== '1') return undefined
  const now = Date.now()
  const cached = publishedMatchMemoryCache.get(id)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }
  try {
    const value = await loadPublishedMatch(prisma, id)
    if (publishedMatchMemoryCache.size > 4000) {
      const oldestKey = publishedMatchMemoryCache.keys().next().value
      if (oldestKey) publishedMatchMemoryCache.delete(oldestKey)
    }
    publishedMatchMemoryCache.set(id, { value, expiresAt: now + 300_000 })
    return value
  } catch {
    console.error('matches-publication-read-failed')
    return undefined
  }
}

let memoryPlanningCache: { records: Awaited<ReturnType<typeof loadPlanningMatches>>; fetchedAt: number } | null = null

async function getCachedPlanningRecords(enabled: boolean) {
  if (!enabled) return []
  const now = Date.now()
  if (memoryPlanningCache && now - memoryPlanningCache.fetchedAt < MATCHES_FRESH_TTL_MS) {
    return memoryPlanningCache.records
  }
  const records = await loadPlanningMatches(prisma).catch(() => {
    console.error('matches-planning-read-failed')
    return memoryPlanningCache?.records ?? []
  })
  memoryPlanningCache = { records, fetchedAt: now }
  return records
}

let memoryPlanningFeedCache: { feed: MatchFeed; fetchedAt: number } | null = null
let inflightPlanningFeedPromise: Promise<MatchFeed> | null = null

export async function getPlanningFeed(): Promise<MatchFeed> {
  const now = Date.now()
  if (memoryPlanningFeedCache && now - memoryPlanningFeedCache.fetchedAt < MATCHES_FRESH_TTL_MS) {
    return memoryPlanningFeedCache.feed
  }
  if (inflightPlanningFeedPromise) return inflightPlanningFeedPromise

  inflightPlanningFeedPromise = (async () => {
    try {
      const [feed, records] = await Promise.all([
        getMatches(),
        getCachedPlanningRecords(process.env.MATCHES_PUBLISHING_ENABLED === '1'),
      ])
      const validUntil = new Date(now + 24 * 3600_000).toISOString()
      const events = feed.events.map((e) => ({
        ...e,
      }))
      const liveByKey = new Map<string, Match>()
      for (const ev of events) {
        liveByKey.set(ev.id, ev)
        liveByKey.set(canonicalMatchId(ev.id), ev)
        for (const alias of sourceAliases(ev)) {
          liveByKey.set(alias, ev)
        }
      }

      const pendingDestinationEvents: Match[] = []
      for (const record of records) {
        const canonicalId = canonicalMatchId(record.event.id)
        let live = liveByKey.get(record.event.id) ?? liveByKey.get(canonicalId)
        if (!live) {
          for (const alias of sourceAliases(record.event)) {
            live = liveByKey.get(alias)
            if (live) break
          }
        }
        if (live) {
          live.canonicalSlug = record.slug
          if (isDisruptivePhase(record.event.phase)) {
            live.phase = record.event.phase
            live.broadcasts = []
          }
          continue
        }
        if (record.published) {
          const isFresh = fixtureObservationIsFresh(record.event.fixtureSource?.checkedAt ?? record.observedAt, now)
          const clean: Match = { ...refreshStoredEvent(record.event, now, record.observedAt), canonicalSlug: record.slug }

          if (Date.parse(record.event.startsAt) > now && !isFresh) {
            events.push({ ...clean, phase: 'Schedule to be confirmed', broadcasts: [] })
          } else if (!isDisruptivePhase(record.event.phase) && Date.parse(record.event.startsAt) > now) {
            pendingDestinationEvents.push(clean)
          } else {
            events.push(clean)
          }
        }
      }

      if (pendingDestinationEvents.length > 0) {
        const enriched = applyAllEventDestinations(
          pendingDestinationEvents,
          reviewedDestinations.allEventDestinations,
          now,
          validUntil
        )
        events.push(...enriched)
      }

      const result: MatchFeed = {
        ...feed,
        expiresAt: validUntil,
        events: events
          .filter((event) => Date.parse(event.startsAt) >= now)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      }
      memoryPlanningFeedCache = { feed: result, fetchedAt: Date.now() }
      getDerivedMatchesState(result, Date.now())
      return result
    } finally {
      inflightPlanningFeedPromise = null
    }
  })()

  return inflightPlanningFeedPromise
}

let memoryMatchSitemapCache: { entries: Awaited<ReturnType<typeof loadMatchSitemap>>; fetchedAt: number } | null = null

export async function getMatchPublicationSitemap() {
  if (process.env.MATCHES_PUBLISHING_ENABLED !== '1') return []
  const now = Date.now()
  if (memoryMatchSitemapCache && now - memoryMatchSitemapCache.fetchedAt < MATCHES_FRESH_TTL_MS) {
    return memoryMatchSitemapCache.entries
  }
  try {
    const entries = await loadMatchSitemap(prisma)
    memoryMatchSitemapCache = { entries, fetchedAt: now }
    return entries
  } catch {
    console.error('matches-sitemap-read-failed')
    return memoryMatchSitemapCache?.entries ?? []
  }
}

export const resolvePublishedEvent = cache(async (id: string) => {
  const [feed, record] = await Promise.all([getMatches(), getPublishedMatch(id)])
  const now = Date.now()
  const live = findMatchById(feed.events, id) ?? (record ? findMatchById(feed.events, record.event.id) : undefined)
  const event =
    record && isDisruptivePhase(record.event.phase)
      ? refreshStoredEvent(record.event, now, record.observedAt)
      : live
        ? refreshStoredEvent(
            { ...live, ...(record ? { id: record.event.id, canonicalSlug: record.slug } : {}) },
            now,
            record?.observedAt ?? feed.generatedAt ?? new Date(now).toISOString()
          )
        : record
          ? { ...refreshStoredEvent(record.event, now, record.observedAt), canonicalSlug: record.slug }
          : undefined
  return { feed, event, record, indexable: Boolean(record?.published || (event && hasIndexableEvent(event, now))) }
})

// Background warm-up & periodic refresh in production runtime so user requests never block on cold scraping.
if (
  typeof setInterval === 'function' &&
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  const warmMatches = () => {
    void getMatches()
      .then((feed) => {
        getDerivedMatchesState(feed, Date.now())
        return Promise.all([getPlanningFeed(), getMatchPublicationSitemap()])
      })
      .catch(() => {})
  }
  const initialTimer = setTimeout(warmMatches, 1_500)
  initialTimer.unref?.()
  const periodicTimer = setInterval(warmMatches, 600_000)
  periodicTimer.unref?.()
}
