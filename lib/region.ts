type HeaderLike = Pick<Headers, "get">

export const REGION_COOKIE_NAME = "region"
export const REGION_PREFERENCE_COOKIE_NAME = "region_preference"
export const REGION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180
export const REGION_COOKIE_OPTIONS = {
  path: "/",
  maxAge: REGION_COOKIE_MAX_AGE_SECONDS,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
}

const REGION_HEADER_CANDIDATES = [
  "x-vercel-ip-country",
  "cf-ipcountry",
  "cf-country",
  "x-country-code",
  "cloudfront-viewer-country",
] as const

export const REGION_OVERRIDE_HEADER_NAME = "x-wpn-region"

export type RegionDetectionSource = "url" | "header" | "cookie" | "default"
export type RegionDetectionConfidence = "high" | "medium" | "low"

export type RegionDetectionResult = {
  region: string
  source: RegionDetectionSource
  confidence: RegionDetectionConfidence
  detectedAt: string
}

const REGION_NAME_LOCALE = "en"

function toSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function normalizeIso2Candidate(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return null
  return normalized
}

function buildRegionMaps() {
  const displayNames = new Intl.DisplayNames([REGION_NAME_LOCALE], { type: "region" })
  const iso2ToSlug = new Map<string, string>()
  const slugToIso2 = new Map<string, string>()

  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second)
      const label = displayNames.of(code)

      if (typeof label !== "string") continue
      const normalizedLabel = label.trim()
      if (!normalizedLabel) continue
      if (normalizedLabel.toUpperCase() === code) continue
      if (/unknown region/i.test(normalizedLabel)) continue

      const slug = toSlug(normalizedLabel)
      if (!slug) continue

      iso2ToSlug.set(code, slug)
      if (!slugToIso2.has(slug)) {
        slugToIso2.set(slug, code)
      }
    }
  }

  const aliases: Array<[string, string]> = [
    ["germany", "DE"],
    ["united-kingdom", "GB"],
    ["uk", "GB"],
    ["usa", "US"],
    ["united-states-of-america", "US"],
    ["uae", "AE"],
    ["chili", "CL"],
    ["south-korea", "KR"],
    ["north-korea", "KP"],
  ]

  for (const [alias, code] of aliases) {
    if (!iso2ToSlug.has(code)) continue
    slugToIso2.set(alias, code)
  }

  return {
    iso2ToSlug,
    slugToIso2,
  }
}

const REGION_MAPS = buildRegionMaps()

export function toIso2Region(input: string | null | undefined): string | null {
  if (!input) return null

  const trimmed = input.trim()
  if (!trimmed) return null

  const iso2Candidate = normalizeIso2Candidate(trimmed)
  if (iso2Candidate === "UK") return "GB"
  if (iso2Candidate && REGION_MAPS.iso2ToSlug.has(iso2Candidate)) {
    return iso2Candidate
  }

  const slug = toSlug(trimmed)
  if (!slug) return null

  return REGION_MAPS.slugToIso2.get(slug) ?? null
}

export const DEFAULT_REGION = toIso2Region(process.env.REGION_DEFAULT) ?? "US"

export function normalizeRegion(input: string | null | undefined, fallback = DEFAULT_REGION): string {
  return toIso2Region(input) ?? fallback
}

export function toRegionSlug(input: string | null | undefined): string | null {
  const iso2 = toIso2Region(input)
  if (!iso2) return null
  return REGION_MAPS.iso2ToSlug.get(iso2) ?? null
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function extractCookieValue(headers: HeaderLike, cookieName: string): string | null {
  const cookieHeader = headers.get("cookie")
  if (!cookieHeader) return null

  for (const entry of cookieHeader.split(";")) {
    const separatorIndex = entry.indexOf("=")
    if (separatorIndex <= 0) continue

    const key = entry.slice(0, separatorIndex).trim()
    if (key !== cookieName) continue

    const rawValue = entry.slice(separatorIndex + 1).trim()
    if (!rawValue) return null
    return decodeCookieValue(rawValue)
  }

  return null
}

function readRegionFromCountryHeaders(headers: HeaderLike): string | null {
  for (const headerName of REGION_HEADER_CANDIDATES) {
    const normalized = toIso2Region(headers.get(headerName))
    if (normalized) return normalized
  }
  return null
}

export function readRegionFromPathname(pathname: string | null | undefined): string | null {
  if (typeof pathname !== "string") return null

  const normalizedPathname = pathname.trim()
  if (!normalizedPathname) return null

  const firstSegment = normalizedPathname
    .replace(/^\/+/, "")
    .split("/")[0]

  if (!firstSegment) return null
  return toIso2Region(firstSegment)
}

export function readRegionFromOverrideHeader(headers: HeaderLike): string | null {
  return toIso2Region(headers.get(REGION_OVERRIDE_HEADER_NAME))
}

export function readRegionFromCookie(headers: HeaderLike): string | null {
  return toIso2Region(extractCookieValue(headers, REGION_COOKIE_NAME))
}

export async function detectRegionFromHeaders(headers: HeaderLike): Promise<RegionDetectionResult> {
  const fromOverrideHeader = readRegionFromOverrideHeader(headers)

  if (fromOverrideHeader) {
    return {
      region: fromOverrideHeader,
      source: "url",
      confidence: "high",
      detectedAt: new Date().toISOString(),
    }
  }

  const fromCookie = readRegionFromCookie(headers)
  const fromPreference = toIso2Region(extractCookieValue(headers, REGION_PREFERENCE_COOKIE_NAME))

  if (fromPreference) {
    return {
      region: fromPreference,
      source: "cookie",
      confidence: "high",
      detectedAt: new Date().toISOString(),
    }
  }

  const fromHeaders = readRegionFromCountryHeaders(headers)

  if (fromHeaders) {
    return {
      region: fromHeaders,
      source: "header",
      confidence: "medium",
      detectedAt: new Date().toISOString(),
    }
  }

  if (fromCookie) return { region: fromCookie, source: "cookie", confidence: "low", detectedAt: new Date().toISOString() }

  return {
    region: DEFAULT_REGION,
    source: "default",
    confidence: "low",
    detectedAt: new Date().toISOString(),
  }
}

export async function detectRegionFromRequest(request: Request): Promise<RegionDetectionResult> {
  const fromPathname = readRegionFromPathname(new URL(request.url).pathname)

  if (fromPathname) {
    return {
      region: fromPathname,
      source: "url",
      confidence: "high",
      detectedAt: new Date().toISOString(),
    }
  }

  return detectRegionFromHeaders(request.headers)
}

export function resolveRegionFromRequestHeaders(headers: HeaderLike): string {
  const fromOverrideHeader = readRegionFromOverrideHeader(headers)
  if (fromOverrideHeader) return fromOverrideHeader

  const fromPreference = toIso2Region(extractCookieValue(headers, REGION_PREFERENCE_COOKIE_NAME))
  if (fromPreference) return fromPreference

  const fromHeaders = readRegionFromCountryHeaders(headers)
  if (fromHeaders) return fromHeaders

  const fromCookie = readRegionFromCookie(headers)
  if (fromCookie) return fromCookie

  return DEFAULT_REGION
}

