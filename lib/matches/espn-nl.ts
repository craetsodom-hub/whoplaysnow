import {eventIdentityEvidence} from '../../vendor/whoseiptv/scripts/broadcast/identity.mjs';
export const ESPN_NL_SCHEDULE='https://www.espn.nl/watch/speelkalender/_/type/upcoming';
const competitions:Record<string,{competition:string,sport:string}>={'VriendenLoterij Eredivisie':{competition:'Eredivisie',sport:'football'},'Eurojackpot KNVB Beker':{competition:'KNVB Beker',sport:'football'},'Keuken Kampioen Divisie':{competition:'Eerste Divisie',sport:'football'},NBA:{competition:'NBA',sport:'basketball'},NHL:{competition:'NHL',sport:'ice-hockey'},NFL:{competition:'NFL',sport:'american-football'}};
export function espnNLState(html:string){const marker="window['__espnfitt__']=";const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes(marker));if(!script)throw Error('ESPN Netherlands schedule state missing');return JSON.parse(script.slice(script.indexOf(marker)+marker.length).trim().replace(/;$/,''));}
export function applyESPNNL(events:any[],state:any,checkedAt:number,now=Date.now(),sourceUrl=ESPN_NL_SCHEDULE){
 if(sourceUrl!==ESPN_NL_SCHEDULE&&!(sourceUrl.startsWith(ESPN_NL_SCHEDULE+'/startDate/')&&/^[0-9]{8}$/.test(sourceUrl.slice((ESPN_NL_SCHEDULE+'/startDate/').length))))return events;
 if(checkedAt>now+60000||now-checkedAt>=12*3600000)return events;
 const groups=state?.page?.content?.watch?.arngs;if(!Array.isArray(groups))return events;
 const additions=new Map<string,any[]>();
 for(const group of groups)for(const section of group.sctgys||[]){const meta=competitions[section.nme];if(!meta)continue;for(const row of section.arngs||[]){
 if(!['live','upcoming'].includes(row.tp)||/samenvatting|highlights|replay|herhaling/i.test(row.nme||''))continue;
 const title=String(row.nme||'').replace(/^(?:NBA|NHL|NFL):\s*/,'');const pair=title.match(/^(.+?)\s+(?:-|vs\.?)\s+(.+?)$/i);const start=Date.parse(row.stme);if(!pair||!Number.isFinite(start))continue;
 const possible=events.filter(e=>Date.parse(e.startsAt)>now&&!/cancel|postpone|confirm/i.test(e.phase||'')&&Math.abs(Date.parse(e.startsAt)-start)<=15*60000&&[pair.slice(1),[pair[2],pair[1]]].some(teams=>eventIdentityEvidence({...e,startUtcEpochSeconds:Date.parse(e.startsAt)/1000},{...meta,homeTeam:teams[0],awayTeam:teams[1],startUtcEpochSeconds:start/1000},900)));
 if(possible.length!==1)continue;const e=possible[0];for(const b of row.bcsts||[]){const m=String(b.code||'').match(/^NL_ESPN([1-4]|_EXTRA)$/);if(!m||!['linear','online'].includes(b.tp))continue;const channel=m[1]==='_EXTRA'?'ESPN Extra':'ESPN '+m[1];const logo=(row.nwimg||[]).find((i:any)=>i.alt===b.abbr)?.image;
 const listing={channel,territory:'NL',languages:[],official:true,sourceType:'direct-broadcaster',evidenceLevel:'A',destinationPrecision:'channel',matchingMethod:'official-title-competition-kickoff',sourceUrl,scheduleUrl:sourceUrl,checkedAt:new Date(checkedAt).toISOString(),verifiedAt:new Date(checkedAt).toISOString(),validUntil:new Date(checkedAt+12*3600000).toISOString(),...(/^https:\/\/a\.espncdn\.com\/watchespn\/images\/web\/network_logos\/channel_logo_nl_espn(?:[1-4]|_extra)_2x\.png$/.test(logo||'')?{logoUrl:logo}:{})};additions.set(e.id,[...additions.get(e.id)||[],listing]);}
 }}
 return events.map(e=>{const rows=additions.get(e.id);return rows?.length?{...e,broadcasts:[...e.broadcasts.filter((b:any)=>b.sourceUrl!==sourceUrl),...new Map(rows.map(b=>[b.channel,b])).values()]}:e;});
}
export function espnNLDays(now=Date.now()){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const start=Date.parse(today+'T00:00:00Z');
 return Array.from({length:7},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));
}
export const espnNLDayURL=(day:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00Z').toISOString().slice(0,10)!==day)throw Error('Invalid ESPN schedule day');return ESPN_NL_SCHEDULE+'/startDate/'+day.replaceAll('-','');};
export async function enrichESPNNL(events:any[],prior:any={},fetcher:typeof fetch=fetch,now=Date.now()){
 const days=espnNLDays(now);const saved=prior.days&&typeof prior.days==='object'?prior.days:{};
 // Migrate the old one-page cache without refreshing its observation clock.
 if(!prior.days&&prior.checkedAt&&prior.state){const dated=String(prior.reviewedSourceUrl||'').match(/startDate\/(\d{4})(\d{2})(\d{2})$/);saved[dated?dated.slice(1).join('-'):days[0]]={checkedAt:prior.checkedAt,state:prior.state};}
 const cache:any={version:2,days:{}};let failed=0;
 for(let i=0;i<days.length;i+=3)await Promise.all(days.slice(i,i+3).map(async day=>{
  let entry=saved[day];const stamp=Number(entry?.checkedAt);
  if(!Number.isFinite(stamp)||stamp>now+60000||now-stamp>=3*3600000)try{
   const r=await fetcher(espnNLDayURL(day),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);
   const html=await r.text();if(html.length>5000000)throw Error('Oversized schedule');const state=espnNLState(html);
   if(!Array.isArray(state?.page?.content?.watch?.arngs))throw Error('Invalid schedule');
   entry={checkedAt:now,state:{page:{content:{watch:{arngs:state.page.content.watch.arngs}}}}};
  }catch{failed++;}
  if(entry&&Number.isFinite(Number(entry.checkedAt))&&entry.checkedAt<=now+60000&&now-entry.checkedAt<12*3600000)cache.days[day]=entry;
 }));
 let result=events;for(const day of days){const entry=cache.days[day];if(entry)result=applyESPNNL(result,entry.state,entry.checkedAt,now,espnNLDayURL(day));}
 return {events:result,cache,source:{name:'ESPN Netherlands · official numbered channels',ok:failed===0,detail:failed?failed+' dated pages unavailable; original evidence expiry preserved':'Seven dated schedules checked against exact teams, competition and kickoff'}};
}

// Matching uses reconciled identities; publication must keep the canonical record's own identity and fixture clock.
export function mergeESPNNLListings(original:any,enriched:any){
 if(original.id!==enriched.id||original.sport!==enriched.sport||Date.parse(original.startsAt)!==Date.parse(enriched.startsAt))return original;
 const listings=enriched.broadcasts.filter((b:any)=>b.sourceType==='direct-broadcaster'&&(b.sourceUrl===ESPN_NL_SCHEDULE||b.sourceUrl?.startsWith(ESPN_NL_SCHEDULE+'/startDate/')));
 if(!listings.length)return original;
 const replaced=new Set(listings.map((b:any)=>b.sourceUrl));
 return {...original,broadcasts:[...original.broadcasts.filter((b:any)=>!replaced.has(b.sourceUrl)),...listings]};
}
