export const INDEXNOW_DEFAULT_KEY = 'a3382bc18e63463a8bc0c2c2b24fb7a7'
export const INDEXNOW_DEFAULT_ENDPOINT = 'https://api.indexnow.org/indexnow'
export const INDEXNOW_MAX_URLS_PER_REQUEST = 10_000

type SubmitIndexNowOptions = {
  endpoint?: string
  fetchImpl?: typeof fetch
  key?: string
  siteUrl?: string
  dryRun?: boolean
}

export type SubmitIndexNowResult = {
  accepted: boolean
  dryRun: boolean
  status: number | null
  submitted: number
  urls: string[]
  responseText?: string
}

export function resolveIndexNowSiteUrl(input = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://whoplaysnow.com'): string {
  const trimmed = input.trim()
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return normalized.replace(/\/$/, '')
}

export function getIndexNowKey(): string {
  return process.env.INDEXNOW_KEY?.trim() || INDEXNOW_DEFAULT_KEY
}

export function normalizeIndexNowUrls(inputUrls: Iterable<string>, siteUrl = resolveIndexNowSiteUrl()): string[] {
  const normalizedSiteUrl = resolveIndexNowSiteUrl(siteUrl)
  const siteHost = new URL(normalizedSiteUrl).host
  const seen = new Set<string>()
  const urls: string[] = []

  for (const inputUrl of inputUrls) {
    const trimmed = inputUrl.trim()
    if (!trimmed) continue
    if (!/^https?:\/\//i.test(trimmed) && /\s/.test(trimmed)) continue

    let parsed: URL
    try {
      parsed = /^https?:\/\//i.test(trimmed)
        ? new URL(trimmed)
        : new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, normalizedSiteUrl)
    } catch {
      continue
    }

    if (parsed.host !== siteHost) continue
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue

    parsed.hash = ''
    const url = parsed.toString()
    if (seen.has(url)) continue

    seen.add(url)
    urls.push(url)
  }

  return urls
}

export async function submitIndexNowUrls(
  inputUrls: Iterable<string>,
  options: SubmitIndexNowOptions = {}
): Promise<SubmitIndexNowResult> {
  const key = options.key?.trim() || getIndexNowKey()
  const siteUrl = resolveIndexNowSiteUrl(options.siteUrl)
  const urlList = normalizeIndexNowUrls(inputUrls, siteUrl)
  // Never report success after silently dropping the tail of a large inventory.
  if (urlList.length > INDEXNOW_MAX_URLS_PER_REQUEST) throw new Error('indexnow-batch-exceeds-10000-urls')
  const endpoint = options.endpoint?.trim() || INDEXNOW_DEFAULT_ENDPOINT

  if (urlList.length === 0) {
    return { accepted: false, dryRun: Boolean(options.dryRun), status: null, submitted: 0, urls: [] }
  }

  if (options.dryRun) {
    return { accepted: true, dryRun: true, status: null, submitted: urlList.length, urls: urlList }
  }

  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      host: new URL(siteUrl).host,
      key,
      keyLocation: `${siteUrl}/${key}.txt`,
      urlList,
    }),
  })

  const responseText = await response.text().catch(() => '')

  return {
    accepted: response.ok || response.status === 202,
    dryRun: false,
    status: response.status,
    submitted: urlList.length,
    urls: urlList,
    responseText,
  }
}
