import type { Broadcast, Match } from './feed'
import withdrawnServiceEvidence from './withdrawn-service-evidence.json' with { type: 'json' }

const withdrawnServiceSources = new Set(withdrawnServiceEvidence.sourceUrls)

type AllEventDestinationRule = {
  destinationPrecision: 'channel' | 'service'
  sport?: string
  competitionId: string
  competitionAliases: string[]
  seasons: string[]
  validFrom: string
  validThrough: string
  territory: string
  territories?: string[]
  name: string
  aliases: string[]
  sourceUrl: string
  viewingUrl?: string
  lastVerified: string
  languages?: string[]
  languageEvidence?: Broadcast['languageEvidence']
  reviewValidUntil?: string
}

const MAX_RULES = 5000
const evidenceHosts = new Set([
  'www.paramountanz.com.au', 'ask.thmanyah.com', 'www.kpn.com', 'fanatiz.com', 'www.fanatiz.com', 'www.allente.no', 'www.telia.se', 'www.paramountpressexpress.com', 'www.paramountplus.com', 'www.laliga.com',
  'ligue1.com', 'www.ligue1.com', 'www.uefa.com', 'www.premierleague.com',
  'www.bundesliga.com', 'www.mlssoccer.com', 'www.fifa.com', 'digitalhub.fifa.com',
  'newsroom.disney.fr', 'dazngroup.com', 'www.beinsports.com',
  'www.stan.com.au', 'www.fubo.tv', 'www.starhub.com', 'tv.apple.com',
  'www.nba.com', 'www.euroleaguebasketball.net', 'www.formula1.com', 'www.motogp.com',
  'www.atptour.com', 'www.wtatennis.com', 'www.nfl.com', 'www.nhl.com', 'www.ufc.com',
  'www.sixnationsrugby.com', 'www.epcrugby.com', 'www.icc-cricket.com',
  'www.skysports.com', 'www.tntsports.co.uk', 'www.espn.com', 'www.movistarplus.es',
])
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function strictText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string' || value.length > maximum) return null
  const result = value.trim()
  return result && !/[<>\u0000-\u001f]/.test(result) ? result : null
}

function strictList(value: unknown, maximumItems: number, maximumLength: number): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumItems) return null
  const result = value.map(item => strictText(item, maximumLength))
  return result.every((item): item is string => Boolean(item)) ? [...new Set(result)] : null
}

function safeDay(value: unknown): string | null {
  const day = strictText(value, 10)
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const parsed = new Date(`${day}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null
}

function safeHttps(value: unknown, allowedHosts: Set<string>): URL | null {
  try {
    const url = new URL(String(value))
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash && allowedHosts.has(url.hostname) ? url : null
  } catch { return null }
}

function safeViewingUrl(value: unknown): string | undefined {
  const sky = safeHttps(value, new Set(['www.sky.com']));
  if (sky && sky.pathname === '/tv/sports/f1' && !sky.search) return sky.href
  const espn = safeHttps(value, new Set(['www.espn.nl']));
  if (espn && espn.pathname === '/watch/' && !espn.search && !espn.hash) return espn.href
  const apple = safeHttps(value, new Set(['tv.apple.com']))
  if (apple && !apple.search && /^(?:\/[a-z]{2}\/offer\/mls|\/us\/info\/watch-f1)$/.test(apple.pathname)) return apple.href
  const direct = safeHttps(value, new Set(['thmanyah.com', 'www.fanatiz.com', 'play.tv2.no', 'www.tv4play.se', 'www.disneyplus.com', 'www.dazn.com', 'plus.espn.com', 'connect-au.beinsports.com', 'connect-nz.beinsports.com']))
  if (direct && !direct.search && /^(?:\/|\/fr-FR\/home)$/.test(direct.pathname)) return direct.href
  const url = safeHttps(value, new Set(['www.paramountplus.com']))
  return url && !url.search && /^\/shows\/[a-z0-9-]+(?:\/episodes)?\/?$/.test(url.pathname) ? url.href : undefined
}

function competitionKey(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '')
}

const regionDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' })
const validTerritoryCache = new Map<string, boolean>()

function knownTerritory(value: string) {
  const cached = validTerritoryCache.get(value)
  if (cached !== undefined) return cached
  try {
    const label = regionDisplayNames.of(value)
    const ok = Boolean(label && label !== value && !/unknown region/i.test(label))
    validTerritoryCache.set(value, ok)
    return ok
  } catch {
    validTerritoryCache.set(value, false)
    return false
  }
}

function seasonsFor(startsAt: string) {
  const date = new Date(startsAt)
  const year = date.getUTCFullYear()
  const start = date.getUTCMonth() >= 6 ? year : year - 1
  return new Set([String(year), `${start}/${String(start + 1).slice(-2)}`])
}

function normalizeRule(value: unknown, now: number): AllEventDestinationRule | null {
  const row = object(value)
  const destinationPrecision = row.destinationPrecision === undefined ? 'service' : row.destinationPrecision
  if (destinationPrecision !== 'channel' && destinationPrecision !== 'service') return null
  const sport = row.sport === undefined ? 'football' : strictText(row.sport, 40)?.toLowerCase() ?? null
  const competitionId = strictText(row.competitionId, 80)
  const competitionAliases = strictList(row.competitionAliases, 30, 150)
  const seasons = strictList(row.seasons, 12, 20)
  const validFrom = safeDay(row.validFrom), validThrough = safeDay(row.validThrough), lastVerified = safeDay(row.lastVerified)
  const rawTerritories = row.territories === undefined ? undefined : strictList(row.territories, 260, 2)?.map(code => code.toUpperCase()) ?? null
  if (row.territories !== undefined && !rawTerritories) return null
  const territory = strictText(row.territory, 2)?.toUpperCase() ?? rawTerritories?.[0] ?? null
  const territories = rawTerritories ?? (territory ? [territory] : null)
  const name = strictText(row.name, 120)
  const aliases = row.aliases === undefined || (Array.isArray(row.aliases) && !row.aliases.length) ? [] : strictList(row.aliases, 30, 120)
  const source = safeHttps(row.sourceUrl, evidenceHosts)
  const evidence = safeHttps(row.allMatchesEvidenceUrl, evidenceHosts)
  if (source && withdrawnServiceSources.has(source.href)) return null
  if (!sport || !/^[a-z0-9-]+$/.test(sport) || !competitionId || !/^[a-z0-9-]+$/.test(competitionId) || !competitionAliases || !seasons || !seasons.every(season => /^\d{4}(?:\/\d{2})?$/.test(season)) ||
      !validFrom || !validThrough || validFrom > validThrough || !lastVerified || Date.parse(`${lastVerified}T00:00:00Z`) > now + 86_400_000 ||
      !territory || !territories || !territories.every(code => /^[A-Z]{2}$/.test(code) && knownTerritory(code)) || !name || !aliases || !source || !evidence || source.href !== evidence.href) return null
  const viewingUrl = row.viewingUrl === undefined ? undefined : safeViewingUrl(row.viewingUrl)
  if (row.viewingUrl !== undefined && !viewingUrl) return null
  const reviewExpiry = Date.parse(`${lastVerified}T00:00:00Z`) + 90 * 86_400_000
  if (reviewExpiry <= now) return null
  const audio = object(row.languageEvidence)
  const audioUrl = safeHttps(audio.sourceUrl, evidenceHosts)
  const languages = strictList(row.languages, 8, 2)
  const languageEvidence: Broadcast['languageEvidence'] = audioUrl?.href === source.href && audio.scope === 'feed-audio' && Number.isFinite(Date.parse(String(audio.verifiedAt))) && Date.parse(String(audio.verifiedAt)) <= now && languages?.every(code => /^[a-z]{2}$/.test(code))
    ? { sourceUrl: audioUrl.href, scope: 'feed-audio', verifiedAt: String(audio.verifiedAt) } : undefined
  return { destinationPrecision, ...(sport !== 'football' ? { sport } : {}), competitionId, competitionAliases, seasons, validFrom, validThrough, territory, ...(rawTerritories ? { territories: rawTerritories } : {}), name, aliases, sourceUrl: source.href, ...(viewingUrl ? { viewingUrl } : {}), lastVerified, reviewValidUntil: new Date(reviewExpiry).toISOString(), ...(languageEvidence ? { languages: languages!, languageEvidence } : {}) }
}

export function normalizeAllEventDestinations(value: unknown, now = Date.now()): AllEventDestinationRule[] {
  if (!Array.isArray(value) || value.length > MAX_RULES) return []
  const rows = value.map(item => normalizeRule(item, now)).filter((item): item is AllEventDestinationRule => Boolean(item))
  return [...new Map(rows.map(item => [`${item.sport ?? 'football'}:${item.competitionId}:${(item.territories ?? [item.territory]).join(',')}:${competitionKey(item.name)}:${item.validFrom}:${item.validThrough}`, item])).values()]
}

export function applyAllEventDestinations(events: Match[], value: unknown, now = Date.now(), cacheValidUntil?: string | null): Match[] {
  const rules = normalizeAllEventDestinations(value, now)
  const cacheExpiry = cacheValidUntil ? Date.parse(cacheValidUntil) : Number.NaN
  if (!rules.length || !Number.isFinite(cacheExpiry) || cacheExpiry <= now) return events
  const rulesByCompetition = new Map<string, AllEventDestinationRule[]>()
  for (const rule of rules) {
    const ruleSport = rule.sport ?? 'football'
    const sportKeys = ruleSport === 'motorsport' || ruleSport === 'formula1' ? ['motorsport', 'formula1'] : [ruleSport]
    for (const sKey of sportKeys) {
      for (const alias of new Set(rule.competitionAliases.map(competitionKey))) {
        const mapKey = `${sKey}:${alias}`
        const list = rulesByCompetition.get(mapKey)
        if (list) list.push(rule)
        else rulesByCompetition.set(mapKey, [rule])
      }
    }
  }
  return events.map(event => {
    const key = `${event.sport}:${competitionKey(event.competition)}`
    const candidateRules = rulesByCompetition.get(key)
    if (!candidateRules?.length) return event
    const day = event.startsAt.slice(0, 10), eventSeasons = seasonsFor(event.startsAt)
    const additions: Broadcast[] = candidateRules.flatMap(rule => {
      if (!rule.seasons.some(season => eventSeasons.has(season)) || day < rule.validFrom || day > rule.validThrough) return []
      const endOfRule = Date.parse(`${rule.validThrough}T23:59:59.999Z`)
      const validUntil = new Date(Math.min(cacheExpiry, endOfRule, Date.parse(rule.reviewValidUntil!))).toISOString()
      const targetTerritories = rule.territories ?? [rule.territory]
      return targetTerritories.map(territory => ({
        channel: rule.name,
        territory,
        languages: rule.languages ?? [],
        ...(rule.languageEvidence ? { languageEvidence: rule.languageEvidence } : {}),
        official: true,
        sourceType: 'official-all-events' as const,
        evidenceLevel: 'B' as const,
        destinationType: rule.destinationPrecision,
        destinationPrecision: rule.destinationPrecision,
        matchingMethod: 'all-events' as const,
        sourceUrl: rule.sourceUrl,
        verifiedAt: rule.lastVerified,
        validUntil,
        ...(rule.aliases.length ? { aliases: rule.aliases } : {}),
        ...(rule.viewingUrl ? { viewingUrl: rule.viewingUrl } : {}),
      }))
    })
    if (!additions.length) return event
    const broadcasts = [...new Map([...event.broadcasts, ...additions].map(item => [`${item.territory}:${competitionKey(item.channel)}:${item.sourceUrl}:${item.evidenceLevel ?? ''}`, item])).values()]
    return { ...event, broadcasts }
  })
}
