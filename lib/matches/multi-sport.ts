import type { Match } from './feed'

// Removed: manually authored fixtures and inferred channel allocations must
// never be presented as freshly verified schedules. Kept as a compatibility
// entry point for callers; real fixtures come from the fetched source adapters.
export function collectMultiSportSchedules(): { events: Match[]; sources: { name: string; ok: boolean }[] } {
  return { events: [], sources: [] }
}
