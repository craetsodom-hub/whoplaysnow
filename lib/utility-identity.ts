import identity from '@/data/utility-identity.json'
import { ALL_SPORT_COMPETITIONS } from './matches/competitions'

type ServiceIdentity = { slug: string; name: string; logo: string; sourceUrl?: string }
export type CompetitionIdentity = { key: string; name: string; aliases: string[]; sport: string; country?: string; logo?: string | null; sourceUrl?: string }
const assets = identity as { services: ServiceIdentity[]; competitions: CompetitionIdentity[]; clubs: { name: string; aliases: string[]; sport: string; logo: string }[] }
const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function serviceLogo(slug: string): string | null {
  return assets.services.find(service => service.slug === slug)?.logo ?? null
}

export function clubLogo(name: string, sport: string): string | null {
  return assets.clubs.find(club => (club.sport === sport || (club.sport === 'motorsport' && sport === 'formula1')) && [club.name, ...club.aliases].some(alias => normalize(alias) === normalize(name)))?.logo ?? null
}

export function competitionIdentity(name: string, sport: string): CompetitionIdentity {
  const match = assets.competitions.find(competition => (competition.sport === sport || (competition.sport === 'motorsport' && sport === 'formula1') || (competition.sport === 'formula1' && sport === 'motorsport')) && [competition.name, ...competition.aliases].some(alias => normalize(alias) === normalize(name)))
  const known = ALL_SPORT_COMPETITIONS.find(row => (row.sport === sport || (row.sport === 'motorsport' && sport === 'formula1')) && normalize(row.name) === normalize(name))
  return match ?? (known ? { key: known.key, name: known.name, country: known.countryName, aliases: [], sport, logo: null } : { key: normalize(`${sport}-${name}`).replace(/ /g, '-'), name: name || 'Other scheduled events', aliases: [], sport, logo: null })
}
