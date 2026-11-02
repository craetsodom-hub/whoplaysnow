import type { MatchVenue } from './feed'
import { toIsoCountryCode } from '../country-codes'

const text = (value: unknown, max = 220) => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : ''
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
// This consumes fixture-specific venue records, never a home team's usual ground
// or the competition's country. Neutral and overseas fixtures keep their venue.
export function fixtureVenue(input: unknown, sourceUrl: string, checkedAt: string): MatchVenue | undefined {
 const row=obj(input), address=obj(row.address), name=text(row.fullName ?? row.name,160)
 if(!name || /^(?:tbd|tba|unknown|to be (?:confirmed|determined|announced))$/i.test(name)) return undefined
 try { const u=new URL(sourceUrl); if(u.protocol!=='https:'||u.port||u.username||u.password||!['www.espn.com','www.laliga.com'].includes(u.hostname)) return undefined } catch { return undefined }
 if(!Number.isFinite(Date.parse(checkedAt))) return undefined
 const city=text(address.city ?? row.city), region=text(address.state), country=toIsoCountryCode(text(address.country))?.toUpperCase()
 const streetAddress=text(typeof row.address==='string'?row.address:address.streetAddress), postalCode=text(address.postalCode,30)
 // The reviewed organizer payload contains inconsistent coordinates for at
 // least one stadium. Do not publish them without independent corroboration.
 return {name,...(city?{city}:{}),...(region?{region}:{}),...(country?{country}:{}),...(streetAddress?{streetAddress}:{}),...(postalCode?{postalCode}:{}),sourceUrl,checkedAt}
}
export function venueLocation(venue: MatchVenue | undefined) {
 if(!venue) return undefined
 const address={...(venue.streetAddress?{streetAddress:venue.streetAddress}:{}),...(venue.city?{addressLocality:venue.city}:{}),...(venue.region?{addressRegion:venue.region}:{}),...(venue.country?{addressCountry:venue.country}:{}),...(venue.postalCode?{postalCode:venue.postalCode}:{})}
 return {'@type':'Place',name:venue.name,...(Object.keys(address).length?{address:{'@type':'PostalAddress',...address}}:{})}
}
