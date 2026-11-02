import status from './channel-status.json'
// Exported from WhoseIPTV config/channel-status.json. A legacy label never
// becomes a guessed replacement channel or a current viewing recommendation.
export function isUnconfirmedLegacyChannel(channel: string, territory: string, startsAt: string) {
  const key = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
  return territory === status.territory && startsAt.slice(0, 10) >= status.reviewedAt && status.unconfirmedLegacyNames.some(name => key(name) === key(channel))
}
