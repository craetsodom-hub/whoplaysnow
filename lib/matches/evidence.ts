import type { Broadcast } from './feed'

export function listingEvidence(broadcast: Broadcast) {
  try {
    const url = new URL(broadcast.sourceUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || /(^|\.)whoplaysnow\.com$/i.test(url.hostname)) return null
    const checkedAt = broadcast.checkedAt && Number.isFinite(Date.parse(broadcast.checkedAt)) ? broadcast.checkedAt : undefined
    return { url: url.href, checkedAt }
  } catch { return null }
}
