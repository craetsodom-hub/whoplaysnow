export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://whoplaysnow.com'
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  return url.origin
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

export function formatSeoTitle(core: string): string {
  const branded = `${core} | WHOPLAYSNOW`
  return Array.from(branded).length <= 65 ? branded : core
}
