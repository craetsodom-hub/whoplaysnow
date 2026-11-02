// ESPN's event-level media records carry the exact network artwork. Restrict
// source-provided URLs to that captured CDN contract; no arbitrary image proxy.
export function safeChannelArtwork(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 300) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'a.espncdn.com' && !url.port && !url.username && !url.password && !url.search && !url.hash &&
      /^\/guid\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/logos\/default(?:-dark)?\.png$/.test(url.pathname) ? url.href : undefined
  } catch { return undefined }
}
