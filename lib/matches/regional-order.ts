// Editorial discovery order, not measured audience rankings. The selected
// viewing country chooses a regional profile; it never changes broadcast rights.
const europe = 'AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH TR UA GB VA'.split(' ')
const africa = 'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW'.split(' ')
const americas = 'US CA MX CR PA GT HN SV NI BZ CU DO HT JM TT BS BB'.split(' ')
const southAmerica = 'AR BO BR CL CO EC GY PY PE SR UY VE'.split(' ')
const multiSportOrder = [
  'nba', 'euroleague', 'eurocup', 'basketball-champions-league', 'liga-acb', 'lnb-betclic-elite',
  'formula-1', 'motogp', 'fia-wec',
  'australian-open', 'atp-tour', 'wta-tour', 'davis-cup',
  'nfl', 'ncaa-football',
  'nhl', 'champions-hockey-league',
  'ufc', 'championship-boxing',
  'six-nations', 'autumn-nations-series', 'european-rugby-champions-cup', 'epcr-challenge-cup', 'gallagher-premiership', 'top-14', 'united-rugby-championship',
  'icc-world-test-championship', 'icc-international-cricket', 'indian-premier-league', 'big-bash-league',
]
const globalOrder = ['champions-league', 'premier-league', 'la-liga', 'bundesliga', 'serie-a', 'ligue-1', 'europa-league', 'conference-league', ...multiSportOrder]
export function regionalCompetitionOrder(country: string): string[] {
  if (country === 'ES') return ['champions-league', 'la-liga', 'premier-league', 'bundesliga', 'ligue-1', 'serie-a', 'europa-league', 'conference-league', 'liga-acb', ...multiSportOrder]
  const domestic: Record<string, string> = { GB: 'premier-league', DE: 'bundesliga', IT: 'serie-a', FR: 'ligue-1', PT: 'primeira-liga', NL: 'eredivisie', TR: 'super-lig', BE: 'belgian-pro-league' }
  if (europe.includes(country)) return [...new Set(['champions-league', ...(domestic[country] ? [domestic[country]] : []), ...globalOrder])]
  if (africa.includes(country)) return ['champions-league', 'premier-league', 'la-liga', 'caf-champions-league', 'africa-cup-of-nations', 'ligue-1', 'bundesliga', 'serie-a', 'europa-league', ...multiSportOrder]
  if (southAmerica.includes(country)) return ['copa-libertadores', 'champions-league', 'la-liga', 'premier-league', 'brasileirao', 'argentine-primera', 'serie-a', 'bundesliga', 'ligue-1', ...multiSportOrder]
  if (americas.includes(country)) return ['champions-league', 'premier-league', 'liga-mx', 'mls', 'la-liga', 'serie-a', 'bundesliga', 'ligue-1', 'nfl', 'nba', 'nhl', 'ncaa-football', 'ufc', ...multiSportOrder]
  return globalOrder
}
export function regionalCompetitionRank(key: string, country: string) {
  const rank = regionalCompetitionOrder(country).indexOf(key)
  return rank < 0 ? 100 : rank
}
