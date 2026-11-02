import skyEflRights from '../../data/sky-efl-rights.json';
import {skyEflAdapter} from './sky-efl';
import {OFFICIAL_BROADCAST_ADAPTERS} from '../../vendor/whoseiptv/scripts/broadcast/adapters/index.mjs';
import {discoverOfficialDestinations} from '../../vendor/whoseiptv/scripts/broadcast/discovery.mjs';
import {resolveExactBroadcasts} from '../../vendor/whoseiptv/scripts/broadcast/resolver.mjs';
import {augmentWithOfficialRights} from '../../vendor/whoseiptv/scripts/official-rights.mjs';
import rights from '../../vendor/whoseiptv/config/official-event-broadcasters.json';
import {normalizeMatches} from './feed';
const officialAdapters=[...OFFICIAL_BROADCAST_ADAPTERS,skyEflAdapter].map(adapter=>({...adapter,collect:async(context:any)=>(await adapter.collect(context)).map((candidate:any)=>({...candidate,sourceAdapter:adapter.id}))}));
export function matchOfficialSchedules(events:any[],candidates:any[],checkedAt:number,now=Date.now()){
 if(checkedAt>now+60000||now-checkedAt>=12*3600000)return events;
 const seen=new Set<string>(),duplicateIds=new Set<string>();for(const e of events){if(seen.has(e.id))duplicateIds.add(e.id);seen.add(e.id);}
 const fixtures=events.filter(e=>!duplicateIds.has(e.id)&&Date.parse(e.startsAt)>now&&!/cancel|postponed|confirm/i.test(e.phase||'')).map(e=>({...e,startUtcEpochSeconds:Date.parse(e.startsAt)/1000,status:'confirmed',broadcasts:[]}));
 const matches=resolveExactBroadcasts(augmentWithOfficialRights(fixtures,{...rights,competitions:[...rights.competitions,...skyEflRights.competitions]}),candidates);
 // Resolve against the whole calendar so ambiguity checks cross batch boundaries.
 // Only actual assignments need broadcast validation. Keep the external feed's
 // 5,000-row limit intact while validating a larger internal calendar in slices.
 const assigned=matches.filter((e:any)=>e.broadcasts?.length),byId=new Map();
 for(let offset=0;offset<assigned.length;offset+=1000){
  const feed=normalizeMatches({schemaVersion:1,generatedAtEpochSeconds:Math.floor(checkedAt/1000),validUntilEpochSeconds:Math.floor((checkedAt+12*3600000)/1000),events:assigned.slice(offset,offset+1000)},now,166);
  for(const e of feed.events)byId.set(e.id,e.broadcasts);
 }
 if(!byId.size)return events;
 return events.map(e=>{const additions=byId.get(e.id)||[];const keys=new Set(additions.map(b=>b.territory+'|'+b.channel+'|'+b.sourceUrl));return {...e,broadcasts:[...e.broadcasts.filter((b:any)=>!keys.has(b.territory+'|'+b.channel+'|'+b.sourceUrl)),...additions]};});
}
export async function enrichOfficialSchedules(events:any[],prior:any={},fetcher:typeof fetch=fetch,now=Date.now()){
 let cache=prior;
 if(cache.version!==4||!cache.checkedAt||now-cache.checkedAt>=3*3600000||!cache.attempts?.some((a:any)=>a.id===skyEflAdapter.id)){
 const hosts=new Set(officialAdapters.flatMap(a=>a.trustedHosts));let requests=0;
 const result=await discoverOfficialDestinations(officialAdapters,{events:events.map(e=>({...e,startUtcEpochSeconds:Date.parse(e.startsAt)/1000})),verifiedAt:new Date(now).toISOString(),nowEpochSeconds:Math.floor(now/1000),fetchText:async(url:string)=>{const parsed=new URL(url);if(parsed.protocol!=='https:'||!hosts.has(parsed.hostname)||++requests>250)throw Error('Official source request outside contract');const response=await fetcher(url,{signal:AbortSignal.timeout(15000)});if(!response.ok){const error:any=new Error('HTTP '+response.status);error.status=response.status;throw error;}const text=await response.text();if(text.length>10000000)throw Error('Official response too large');return text;}});
 // Keep failed adapters' previous evidence at its original timestamp, while
 // retaining usable rows from a partial fetch with their own fresh timestamp.
 const batches=result.attempts.map((a:any)=>({adapter:a.id,checkedAt:now,candidates:result.candidates.filter((c:any)=>c.sourceAdapter===a.id)}));
 cache={version:4,checkedAt:now,attempts:result.attempts,batches:batches.flatMap((b:any)=>{
  if(result.attempts.find((a:any)=>a.id===b.adapter)?.success)return [b];
  const previous=(prior.batches||[]).filter((old:any)=>old.adapter===b.adapter&&old.checkedAt<=now&&now-old.checkedAt<12*3600000);
  return [...previous,...(b.candidates.length||!previous.length?[b]:[])];
 })};
 }
 let output=events;for(const batch of cache.batches||[])output=matchOfficialSchedules(output,batch.candidates,batch.checkedAt,now);
 return {events:output,cache,sources:(cache.attempts||[]).map((a:any)=>({name:'Direct official schedule · '+a.id,ok:a.success,detail:a.candidates+' candidates'+(a.failure?'; '+a.failure:'')}))};
}
