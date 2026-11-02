import type { Match } from './feed'

// The old five-month seed list was editorial placeholder data, not fetched
// fixtures. Never revive it from a feed, persisted publication, or sitemap.
export function isUnsupportedFixture(event: Pick<Match, 'id'>) {
  return event.id.startsWith('ms-')
}

export function hasCurrentFixtureSource(event: Match, now = Date.now()) {
  if (isUnsupportedFixture(event) || /postponed|cancel|confirm/i.test(event.phase ?? '')) return false
  const source = event.fixtureSource
  if (!source || !Number.isFinite(Date.parse(event.startsAt))) return false
  const checked = Date.parse(source.checkedAt)
  if (!Number.isFinite(checked) || checked > now + 60_000 || checked <= now - 48 * 3600_000) return false
  try {
    const url = new URL(source.url)
    return url.protocol === 'https:' && !url.username && !url.password && Boolean(source.name)
  } catch { return false }
}
