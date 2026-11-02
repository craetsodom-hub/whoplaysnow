import sources from '../../data/competition-sources.json' with {type:'json'}
import additional from '../../data/additional-competitions.json' with {type:'json'}

export type CompetitionDefinition = { key:string; name:string; country:string|null; countryName?:string; major?:boolean; espn:string; sport?:string; category?:string; logo?:string|null; sourceUrl?:string; period?:string; groups?:string }

const ORIGINAL_FOOTBALL_COMPETITIONS = [
  { key: 'premier-league', name: 'Premier League', country: 'GB', countryName: 'England', espn: 'eng.1', major: true },
  { key: 'la-liga', name: 'LaLiga', country: 'ES', countryName: 'Spain', espn: 'esp.1', major: true },
  { key: 'bundesliga', name: 'Bundesliga', country: 'DE', countryName: 'Germany', espn: 'ger.1', major: true },
  { key: 'serie-a', name: 'Serie A', country: 'IT', countryName: 'Italy', espn: 'ita.1', major: true },
  { key: 'ligue-1', name: 'Ligue 1', country: 'FR', countryName: 'France', espn: 'fra.1', major: true },
  { key: 'champions-league', name: 'UEFA Champions League', country: null, countryName: 'Europe', espn: 'uefa.champions', major: true },
  { key: 'europa-league', name: 'UEFA Europa League', country: null, countryName: 'Europe', espn: 'uefa.europa', major: true },
  { key: 'conference-league', name: 'UEFA Conference League', country: null, countryName: 'Europe', espn: 'uefa.europa.conf', major: true },
  { key: 'eredivisie', name: 'Eredivisie', country: 'NL', countryName: 'Netherlands', espn: 'ned.1', major: false },
  { key: 'primeira-liga', name: 'Liga Portugal', country: 'PT', countryName: 'Portugal', espn: 'por.1', major: false },
  { key: 'championship', name: 'Championship', country: 'GB', countryName: 'England', espn: 'eng.2', major: false },
  { key: 'scottish-premiership', name: 'Scottish Premiership', country: 'GB', countryName: 'Scotland', espn: 'sco.1', major: false },
  { key: 'belgian-pro-league', name: 'Belgian Pro League', country: 'BE', countryName: 'Belgium', espn: 'bel.1', major: false },
  { key: 'super-lig', name: 'Süper Lig', country: 'TR', countryName: 'Türkiye', espn: 'tur.1', major: false },
  { key: 'mls', name: 'MLS', country: 'US', countryName: 'United States', espn: 'usa.1', major: false },
  { key: 'liga-mx', name: 'Liga MX', country: 'MX', countryName: 'Mexico', espn: 'mex.1', major: false },
  { key: 'brasileirao', name: 'Brazilian Serie A', country: 'BR', countryName: 'Brazil', espn: 'bra.1', major: false },
  { key: 'argentine-primera', name: 'Argentine Liga Profesional', country: 'AR', countryName: 'Argentina', espn: 'arg.1', major: false },
  { key: 'a-league', name: 'A-League Men', country: 'AU', countryName: 'Australia', espn: 'aus.1', major: false },
  { key: 'j-league', name: 'J.League', country: 'JP', countryName: 'Japan', espn: 'jpn.1', major: false },
  { key: 'saudi-pro-league', name: 'Saudi Pro League', country: 'SA', countryName: 'Saudi Arabia', espn: 'ksa.1', major: false },
  { key: 'austrian-bundesliga', name: 'Austrian Bundesliga', country: 'AT', countryName: 'Austria', espn: 'aut.1', major: false },
  { key: 'danish-superliga', name: 'Danish Superliga', country: 'DK', countryName: 'Denmark', espn: 'den.1', major: false },
  { key: 'eliteserien', name: 'Eliteserien', country: 'NO', countryName: 'Norway', espn: 'nor.1', major: false },
  { key: 'allsvenskan', name: 'Allsvenskan', country: 'SE', countryName: 'Sweden', espn: 'swe.1', major: false },
  { key: 'greek-super-league', name: 'Greek Super League', country: 'GR', countryName: 'Greece', espn: 'gre.1', major: false },
  { key: 'league-one', name: 'League One', country: 'GB', countryName: 'England', espn: 'eng.3', major: false },
  { key: 'league-two', name: 'League Two', country: 'GB', countryName: 'England', espn: 'eng.4', major: false },
  { key: 'nwsl', name: 'NWSL', country: 'US', countryName: 'United States', espn: 'usa.nwsl', major: false },
  { key: 'womens-super-league', name: 'Women’s Super League', country: 'GB', countryName: 'England', espn: 'eng.w.1', major: false },
  { key: 'la-liga-2', name: 'LaLiga Hypermotion', country: 'ES', countryName: 'Spain', espn: 'esp.2', major: false },
] as const

// Source identities are reviewed separately from their display names. Cups,
// women's competitions and qualifying rounds never inherit league TV rights.
export const FOOTBALL_COMPETITIONS:CompetitionDefinition[] = [
  ...ORIGINAL_FOOTBALL_COMPETITIONS.map(c=>({...sources.entries.find(e=>e.espn===c.espn),...c})),
  ...sources.entries.filter(e=>e.sport==='football'&&!ORIGINAL_FOOTBALL_COMPETITIONS.some(c=>c.espn===e.espn)),
]
export const ADDITIONAL_TEAM_COMPETITIONS:CompetitionDefinition[] = sources.entries.filter(e=>e.sport!=='football')

export const ESPN_TEAM_COMPETITIONS:CompetitionDefinition[] = [...FOOTBALL_COMPETITIONS,
  {key:'nba',name:'NBA',country:'US',countryName:'United States',espn:'nba',sport:'basketball',category:'basketball'},
  {key:'nfl',name:'NFL',country:'US',countryName:'United States',espn:'nfl',sport:'american-football',category:'football'},
  {key:'nhl',name:'NHL',country:'US',countryName:'United States',espn:'nhl',sport:'ice-hockey',category:'hockey'},
  ...ADDITIONAL_TEAM_COMPETITIONS,
]

export const SPORT_CATEGORIES = [
  { key: 'football', label: 'Football', shortLabel: 'Football' },
  { key: 'basketball', label: 'Basketball', shortLabel: 'Basketball' },
  { key: 'baseball', label: 'Baseball', shortLabel: 'Baseball' },
  { key: 'motorsport', label: 'Motorsport & F1', shortLabel: 'Motorsport' },
  { key: 'tennis', label: 'Tennis', shortLabel: 'Tennis' },
  { key: 'american-football', label: 'American Football', shortLabel: 'NFL & College' },
  { key: 'ice-hockey', label: 'Ice Hockey', shortLabel: 'Ice Hockey' },
  { key: 'combat-sports', label: 'Combat Sports', shortLabel: 'UFC & Boxing' },
  { key: 'rugby', label: 'Rugby Union', shortLabel: 'Rugby' },
  { key: 'cricket', label: 'Cricket', shortLabel: 'Cricket' },
] as const

export type SportCategoryKey = (typeof SPORT_CATEGORIES)[number]['key']

export function canonicalSportCategory(sport: string): SportCategoryKey | string {
  const s = sport.trim().toLowerCase()
  if (s === 'formula1' || s === 'f1' || s === 'motorsport') return 'motorsport'
  if (s === 'nfl' || s === 'american-football') return 'american-football'
  if (s === 'nhl' || s === 'hockey' || s === 'ice-hockey') return 'ice-hockey'
  if (s === 'ufc' || s === 'mma' || s === 'boxing' || s === 'combat-sports') return 'combat-sports'
  return s
}

export function sportCategoryLabel(sport: string): string {
  const canonical = canonicalSportCategory(sport)
  const found = SPORT_CATEGORIES.find(c => c.key === canonical)
  if (found) return found.label
  return sport ? sport[0].toUpperCase() + sport.slice(1) : 'Sports'
}

export function sportCategoryShortLabel(sport: string): string {
  const canonical = canonicalSportCategory(sport)
  const found = SPORT_CATEGORIES.find(c => c.key === canonical)
  if (found) return found.shortLabel
  return sport ? sport[0].toUpperCase() + sport.slice(1) : 'Sports'
}

export function sportCategoryOrder(sport: string): number {
  const canonical = canonicalSportCategory(sport)
  const idx = SPORT_CATEGORIES.findIndex(c => c.key === canonical)
  return idx >= 0 ? idx : 99
}

export const OTHER_SPORT_COMPETITIONS = [
  { key: 'nba', name: 'NBA', sport: 'basketball', country: 'US', countryName: 'United States', major: true },
  { key: 'euroleague', name: 'EuroLeague Basketball', sport: 'basketball', country: null, countryName: 'Europe', major: true },
  { key: 'eurocup', name: 'EuroCup Basketball', sport: 'basketball', country: null, countryName: 'Europe', major: false },
  { key: 'basketball-champions-league', name: 'Basketball Champions League', sport: 'basketball', country: null, countryName: 'Europe', major: false },
  { key: 'liga-acb', name: 'Liga ACB', sport: 'basketball', country: 'ES', countryName: 'Spain', major: false },
  { key: 'lnb-betclic-elite', name: 'LNB Betclic Élite', sport: 'basketball', country: 'FR', countryName: 'France', major: false },
  { key: 'formula-1', name: 'Formula 1', sport: 'motorsport', country: null, countryName: 'Global', major: true },
  { key: 'motogp', name: 'MotoGP', sport: 'motorsport', country: null, countryName: 'Global', major: true },
  { key: 'fia-wec', name: 'FIA World Endurance Championship', sport: 'motorsport', country: null, countryName: 'Global', major: false },
  { key: 'atp-tour', name: 'ATP Tour', sport: 'tennis', country: null, countryName: 'Global', major: true },
  { key: 'wta-tour', name: 'WTA Tour', sport: 'tennis', country: null, countryName: 'Global', major: true },
  { key: 'australian-open', name: 'Australian Open', sport: 'tennis', country: 'AU', countryName: 'Australia', major: true },
  { key: 'davis-cup', name: 'Davis Cup Finals', sport: 'tennis', country: null, countryName: 'Global', major: false },
  { key: 'nfl', name: 'NFL', sport: 'american-football', country: 'US', countryName: 'United States', major: true },
  { key: 'ncaa-football', name: 'NCAA College Football', sport: 'american-football', country: 'US', countryName: 'United States', major: false },
  { key: 'nhl', name: 'NHL', sport: 'ice-hockey', country: 'US', countryName: 'United States', major: true },
  { key: 'champions-hockey-league', name: 'Champions Hockey League', sport: 'ice-hockey', country: null, countryName: 'Europe', major: false },
  { key: 'ufc', name: 'UFC', sport: 'combat-sports', country: 'US', countryName: 'United States', major: true },
  { key: 'championship-boxing', name: 'Championship Boxing', sport: 'combat-sports', country: null, countryName: 'Global', major: true },
  { key: 'six-nations', name: 'Six Nations Championship', sport: 'rugby', country: null, countryName: 'Europe', major: true },
  { key: 'autumn-nations-series', name: 'Autumn Nations Series', sport: 'rugby', country: null, countryName: 'Europe', major: true },
  { key: 'european-rugby-champions-cup', name: 'European Rugby Champions Cup', sport: 'rugby', country: null, countryName: 'Europe', major: true },
  { key: 'epcr-challenge-cup', name: 'EPCR Challenge Cup', sport: 'rugby', country: null, countryName: 'Europe', major: false },
  { key: 'gallagher-premiership', name: 'Gallagher Premiership', sport: 'rugby', country: 'GB', countryName: 'England', major: false },
  { key: 'top-14', name: 'Top 14', sport: 'rugby', country: 'FR', countryName: 'France', major: false },
  { key: 'united-rugby-championship', name: 'United Rugby Championship', sport: 'rugby', country: null, countryName: 'Europe', major: false },
  { key: 'icc-world-test-championship', name: 'ICC World Test Championship', sport: 'cricket', country: null, countryName: 'Global', major: true },
  { key: 'icc-international-cricket', name: 'ICC International Series', sport: 'cricket', country: null, countryName: 'Global', major: true },
  { key: 'big-bash-league', name: 'Big Bash League', sport: 'cricket', country: 'AU', countryName: 'Australia', major: false },
  { key: 'indian-premier-league', name: 'Indian Premier League', sport: 'cricket', country: 'IN', countryName: 'India', major: true },
] as const

export const ALL_SPORT_COMPETITIONS = [
  ...FOOTBALL_COMPETITIONS.map(c => ({ ...c, sport: 'football' as const })),
  ...OTHER_SPORT_COMPETITIONS,
  ...ADDITIONAL_TEAM_COMPETITIONS.filter(c=>!OTHER_SPORT_COMPETITIONS.some(o=>o.key===c.key)),
  ...additional.entries.filter(c=>!OTHER_SPORT_COMPETITIONS.some(o=>o.key===c.key)),
]

const competitionByKey=new Map<string,any>([...OTHER_SPORT_COMPETITIONS,...ESPN_TEAM_COMPETITIONS].map(c=>[c.key,c]))
export function matchCompetition(key: string) { return competitionByKey.get(key) }

// Local leagues lead the schedule; international competitions remain available
// even when a local TV partner has not published event-specific coverage.
export function competitionPriority(key: string, country: string, hasLocalBroadcast = false) {
  const row = matchCompetition(key)
  if (row?.country === country) return 0
  if (hasLocalBroadcast) return 1
  return 2
}
