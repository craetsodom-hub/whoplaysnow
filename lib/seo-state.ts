import {createHash} from 'node:crypto';

// Only what a searcher sees: kickoff, status, names, venue and the set of
// channels per country. Evidence timestamps refresh on every collection and
// must not make every URL look modified.
export function seoFingerprint(e:any){
 return createHash('sha256').update(JSON.stringify([e.canonicalPath,e.title,e.competition,e.startsAt,e.phase||'',e.broadcastMode||'',e.venue?.name||'',e.homeTeam?.name||'',e.awayTeam?.name||'',[...new Set((e.broadcasts||[]).map((b:any)=>b.territory+'|'+b.channel))].sort()])).digest('hex').slice(0,24);
}

export function updateSeoState(previous:any,events:any[],now=Date.now()){
 const prior=previous?.version===1?previous.entries||{}:{},stamp=new Date(now).toISOString().replace(/\.\d{3}Z$/,'Z');
 const entries:Record<string,any>={},changed:any[]=[];
 for(const e of events){
  const hash=seoFingerprint(e),old=prior[e.id],same=old?.hash===hash;
  entries[e.id]={hash,path:e.canonicalPath,firstSeen:old?.firstSeen||stamp,changedAt:same?old.changedAt:stamp};
  if(!same)changed.push(e);
 }
 return {state:{version:1,updatedAt:stamp,entries},changed,seeded:previous?.version!==1};
}
