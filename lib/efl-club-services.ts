import reviewed from '../data/efl-club-services.json' with {type:'json'};
import territoryCatalog from './matches/viewing-territories.json' with {type:'json'};
import {fixtureObservationIsFresh} from './matches/publication';
const excluded=new Set(reviewed.excludedTerritories);
export const eflStreamingTerritories=territoryCatalog.territories.filter(c=>!excluded.has(c));
const key=(name:string)=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
// These are reviewed club video subscriptions, not guesses at linear TV allocations.
export function addEFLClubServices(event:any,countries:string[]=eflStreamingTerritories,now=Date.now()){
 if(event.sport!=='football'||!['League One','League Two'].includes(event.competition)||event.startsAt.slice(0,10)<reviewed.validFrom||event.startsAt.slice(0,10)>reviewed.validThrough||Date.parse(event.startsAt)<now-8*3600000||/cancel|postponed|confirm/i.test(event.phase||'')||!fixtureObservationIsFresh(event.fixtureSource?.checkedAt||event.observedAt,now)||now<Date.parse(reviewed.checkedAt)||now>=Date.parse(reviewed.reviewUntil))return event;
 const participants=[event.homeTeam,event.awayTeam].filter(Boolean).flatMap(t=>[t.name,...t.aliases||[]]).filter((s:any)=>typeof s==='string').map(key);
 const clubs=reviewed.clubs.filter(c=>c.competition===event.competition&&c.aliases.some(a=>participants.includes(key(a))));
 if(!clubs.length)return event;
 const targets=[...new Set(countries)].filter(c=>eflStreamingTerritories.includes(c));
 const existing=event.broadcasts.filter((b:any)=>b.sourceUrl!==reviewed.sourceUrl);
 const additions=clubs.flatMap(club=>targets.map(territory=>({channel:club.name,territory,languages:[],official:true,evidenceLevel:'B',sourceType:'official-all-events',destinationPrecision:'service',feedEdition:'International service',destinationType:'service',matchingMethod:'all-events',sourceUrl:reviewed.sourceUrl,scheduleUrl:club.viewingUrl,viewingUrl:club.viewingUrl,checkedAt:reviewed.checkedAt,verifiedAt:reviewed.checkedAt,validUntil:reviewed.reviewUntil,logoUrl:club.logoPath})));
 return {...event,broadcasts:[...existing,...additions]};
}
