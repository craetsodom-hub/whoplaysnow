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
  // submitted: the fingerprint last accepted by IndexNow. A URL is pending until
  // its current version has been submitted once, so pages that never change
  // after their first collection are still announced.
  entries[e.id]={hash,path:e.canonicalPath,firstSeen:old?.firstSeen||stamp,changedAt:same?old.changedAt:stamp,...(old?.submitted?{submitted:old.submitted}:{})};
  if(!same)changed.push(e);
 }
 // Paths that stopped being a live page (merged, renamed or retired) now answer
 // 301 or 410; search engines should recrawl them rather than keep them.
 const live=new Set(Object.values(entries).map((e:any)=>e.path));
 const removed=[...new Set(Object.entries(prior).filter(([id,e]:any)=>(!entries[id]||entries[id].path!==e.path)&&e.path&&!live.has(e.path)).map(([,e]:any)=>e.path as string))];
 const pending=events.filter(e=>entries[e.id].submitted!==entries[e.id].hash);
 return {state:{version:1,updatedAt:stamp,entries},changed,pending,removed,seeded:previous?.version!==1};
}

export function markSubmitted(state:any,ids:Iterable<string>){for(const id of ids)if(state.entries[id])state.entries[id].submitted=state.entries[id].hash;return state;}
