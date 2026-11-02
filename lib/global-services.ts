import {addVerifiedServices} from './verified-services';
import {addEFLClubServices} from './efl-club-services';
import nhl from '../data/nhl-global-service.json' with {type:'json'};
import reviewed from '../data/nba-global-service.json' with {type:'json'};
import territoryCatalog from './matches/viewing-territories.json' with {type:'json'};
import {fixtureObservationIsFresh} from './matches/publication';
import {channelLogo} from './artwork';
const excluded=new Set(reviewed.excludedTerritories);
export const nbaTerritories=territoryCatalog.territories.filter(c=>!excluded.has(c));
// Resolve at request time: no country-by-fixture duplication in the stored schedule.
function addNBAService(event:any,countries:string[]=nbaTerritories,now=Date.now()){
 if(event.sport!=='basketball'||event.competition!=='NBA'||!/^(2026|2027)-/.test(event.startsAt)||event.startsAt<'2026-10-01'||event.startsAt>'2027-07-01'||Date.parse(event.startsAt)<now-8*3600000||/cancel|postponed|confirm/i.test(event.phase||'')||!fixtureObservationIsFresh(event.fixtureSource?.checkedAt||event.observedAt,now)||now<Date.parse(reviewed.checkedAt)||now>=Date.parse(reviewed.reviewUntil))return event;
 const existing=event.broadcasts.filter((b:any)=>b.sourceUrl!==reviewed.sourceUrl);
 const additions=[...new Set(countries)].filter(c=>nbaTerritories.includes(c)).map(territory=>({channel:'NBA League Pass',territory,languages:[],official:true,evidenceLevel:'B',sourceType:'official-all-events',destinationPrecision:'service',feedEdition:'International service',destinationType:'service',matchingMethod:'all-events',sourceUrl:reviewed.sourceUrl,scheduleUrl:reviewed.availabilityUrl,viewingUrl:reviewed.viewingUrl,checkedAt:reviewed.checkedAt,verifiedAt:reviewed.checkedAt,validUntil:reviewed.reviewUntil,logoUrl:channelLogo('NBA League Pass',territory)}));
 return {...event,broadcasts:[...existing,...additions]};
}

export const nhlTerritories=nhl.territories;
export function addGlobalServices(event:any,countries?:string[],now=Date.now()){
 event=addVerifiedServices(event,countries,now);
 const next=addNBAService(addEFLClubServices(event,countries,now),countries,now);
 if(event.sport!=='ice-hockey'||event.competition!=='NHL'||event.startsAt<'2026-10-01'||event.startsAt>'2027-07-01'||Date.parse(event.startsAt)<now-8*3600000||/cancel|postponed|confirm/i.test(event.phase||'')||!fixtureObservationIsFresh(event.fixtureSource?.checkedAt||event.observedAt,now)||now<Date.parse(nhl.checkedAt)||now>=Date.parse(nhl.reviewUntil))return next;
 const existing=next.broadcasts.filter((b:any)=>b.sourceUrl!==nhl.sourceUrl);
 const additions=[...new Set(countries??nhlTerritories)].filter(c=>nhlTerritories.includes(c)).map(territory=>({channel:nhl.name,territory,languages:[],official:true,evidenceLevel:'B',sourceType:'official-all-events',destinationPrecision:'service',feedEdition:'International service',destinationType:'service',matchingMethod:'all-events',sourceUrl:nhl.sourceUrl,scheduleUrl:nhl.availabilityUrl,viewingUrl:nhl.viewingUrl,checkedAt:nhl.checkedAt,verifiedAt:nhl.checkedAt,validUntil:nhl.reviewUntil,logoUrl:nhl.logoPath}));
 return {...next,broadcasts:[...existing,...additions]};
}
