import catalog from '../data/verified-service-coverage.json' with {type:'json'};
import {fixtureObservationIsFresh} from './matches/publication';
import {channelLogo} from './artwork';
const key=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const rules=catalog.rules.map(r=>({...r,competitionKeys:new Set(r.competitions.map(key)),territorySet:new Set(r.territories)}));
const logos:Record<string,string>={'TOD by beIN':'/utility-identity/services/tod.svg','Sky Go':'/utility-identity/services/sky.png','NFL Game Pass on DAZN':'/artwork/aa7e47493bf3cedbc2bc561f.png','Disney+':'/utility-identity/services/disney-plus.svg','NWSL+':'/artwork/640099eeeceecbf70f1cb280.png','ESPN Deportes':'/artwork/b74de1a1f4eed5b5571abaa8.png','Premier Sports Player':'/utility-identity/services/premier-sports.svg','Premier Sports Asia':'/utility-identity/services/premier-sports.svg'};
// These are reviewed all-match subscriptions, not guesses at a linear channel.
// No blanket rule may expand a broadcaster into a territory its evidence excludes.
export function addVerifiedServices(event:any,countries?:string[],now=Date.now()){
 if(Date.parse(event.startsAt)<now-8*3600000||/cancel|postponed|confirm/i.test(event.phase||'')||!fixtureObservationIsFresh(event.fixtureSource?.checkedAt||event.observedAt,now))return event;
 const day=event.startsAt.slice(0,10),competition=key(event.competition);
 const applicable=rules.filter(r=>r.sport===event.sport&&r.competitionKeys.has(competition)&&day>=r.validFrom&&day<=r.validThrough);
 if(!applicable.length)return event;
 const ids=new Set(applicable.map(r=>r.id));
 const existing=event.broadcasts.filter((b:any)=>!ids.has(b.coverageRuleId));
 const additions=applicable.flatMap(r=>{
  if(now<Date.parse(r.checkedAt)||now>=Date.parse(r.reviewUntil))return [];
  const targets=[...new Set(countries||r.territories)].filter(c=>r.territorySet.has(c));
  return targets.map(territory=>({channel:r.channel,territory,languages:(r as any).languages||[],...((r as any).languageEvidence?{languageEvidence:(r as any).languageEvidence}:{}),official:true,evidenceLevel:'B',sourceType:'official-all-events',destinationPrecision:(r as any).destinationPrecision||'service',destinationType:(r as any).destinationPrecision||'service',matchingMethod:'all-events',coverageRuleId:r.id,...((r as any).feedEdition?{feedEdition:(r as any).feedEdition}:{}),sourceUrl:r.sourceUrl,scheduleUrl:r.sourceUrl,checkedAt:r.checkedAt,verifiedAt:r.checkedAt,validUntil:new Date(Math.min(Date.parse(r.reviewUntil),Date.parse(r.validThrough+'T23:59:59Z'))).toISOString(),logoUrl:logos[r.channel]||channelLogo(r.channel,territory)}));
 });
 return {...event,broadcasts:[...existing,...additions]};
}
export const verifiedServiceRules=rules;
