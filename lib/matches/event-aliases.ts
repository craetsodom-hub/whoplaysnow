// Reviewed event IDs, never inferred from similar titles at request time.
// Both records below independently specify Levante v Athletic, LaLiga,
// 2026-10-21 18:00 UTC. See docs/seo-evidence/duplicate-fixture-check.json.
// ESPN provides the continuing 90-day fixture schedule. Keep its established
// canonical URL and permanently resolve the duplicate URL to it. Do not move
// the duplicate record's broadcaster evidence onto the preferred event.
const REVIEWED_EVENT_ALIASES: Readonly<Record<string, string>> = {
  'tsdb-2506222': 'espn-401882870',
  // Same teams/home-away and 2026-10-24 14:15 UTC in both primary sources.
  // See docs/seo-evidence/racing-espanyol-identity.json. Collect current channel
  // assignments independently; never reuse the retired publication's array.
  'laliga-102344': 'espn-401882831',
}

export function canonicalMatchId(id: string): string {
  return Object.prototype.hasOwnProperty.call(REVIEWED_EVENT_ALIASES, id) ? REVIEWED_EVENT_ALIASES[id] : id
}

export function isCanonicalMatchId(id: string) { return canonicalMatchId(id) === id }
export function retiredMatchIds() { return Object.keys(REVIEWED_EVENT_ALIASES) }
