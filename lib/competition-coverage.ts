import {ESPN_TEAM_COMPETITIONS} from './matches/competitions';
import {decorateEvent} from './artwork';

// Empty editions, withheld kickoff times and failed collectors are different
// states. Keep the distinction visible to operations after every refresh.
export function auditCompetitionCoverage(snapshot:any,now=Date.now()){
 const events=snapshot.events.filter((e:any)=>Date.parse(e.startsAt)>=now&&!/cancel|postpon|confirm/i.test(e.phase||''));
 const artwork=new Map<string,{name:string;sport:string;events:number}>();
 for(const e of events)if(!decorateEvent(e).competitionLogo){const id=e.sport+'|'+e.competition;const row=artwork.get(id)||{name:e.competition,sport:e.sport,events:0};row.events++;artwork.set(id,row);}
 const competitions=ESPN_TEAM_COMPETITIONS.map(c=>{
  const sources=(snapshot.sources||[]).filter((s:any)=>s.name.startsWith('ESPN · '+c.name+' · '));
  const fixtures=events.filter((e:any)=>e.competitionKey===c.key||e.sport===(c.sport||'football')&&e.competition===c.name).length;
  return {sourceCode:c.espn,name:c.name,sport:c.sport||'football',fixtures,checkedSlices:sources.length,failedSlices:sources.filter((s:any)=>!s.ok).length,state:fixtures?'published':sources.some((s:any)=>s.ok)?'awaiting-published-fixtures':'source-unavailable'};
 });
 return {checkedAt:new Date(now).toISOString(),sourceCompetitions:competitions.length,activeCompetitions:new Set(events.map((e:any)=>e.sport+'|'+e.competition)).size,upcomingEvents:events.length,missingArtwork:[...artwork.values()],sourceFailures:competitions.filter(c=>c.failedSlices>0||c.state==='source-unavailable'),competitions};
}
