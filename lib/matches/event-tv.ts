import territories from './viewing-territories.json' with {type:'json'};
import labels from './country-labels.json' with {type:'json'};
import {sportKey} from '../../public/core.js';
const normalized=(s:unknown)=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const countries=new Map(Object.entries(labels).filter(([code])=>territories.territories.includes(code)).map(([code,name])=>[normalized(name),code]));
for(const [name,code] of Object.entries({'United States':'US','United Kingdom':'GB','UK':'GB','USA':'US','South Korea':'KR','Czech Republic':'CZ','Russia':'RU','Turkey':'TR'}))countries.set(normalized(name),code);
export function eventTVListings(event:any,payload:any,now=Date.now()){
 const id=event.sourceIds?.thesportsdb||(/^tsdb-([0-9]+)$/.exec(event.id)?.[1]);if(!id||!Array.isArray(payload?.tvevent))return [];
 return payload.tvevent.flatMap((row:any)=>{
  const territory=countries.get(normalized(row.strCountry));
  const kickoff=Date.parse(String(row.dateEvent)+'T'+String(row.strTime).replace(/Z$/,'')+'Z');
  if(String(row.idEvent)!==String(id)||!territory||kickoff!==Date.parse(event.startsAt)||sportKey(String(row.strSport||''))!==sportKey(event.sport)||normalized(row.strEvent)!==normalized(event.title)||typeof row.strChannel!=='string'||!row.strChannel.trim())return [];
  const logo=/^https:\/\/(?:r2\.)?thesportsdb\.com\/images\/media\/channel\/logo\/[A-Za-z0-9_.-]+\.(?:png|jpg|webp)$/i.test(row.strLogo||'')?row.strLogo:undefined;
  return [{channel:row.strChannel.trim(),territory,languages:[],logoUrl:logo,sourceUrl:'https://www.thesportsdb.com/event/'+id,scheduleUrl:'https://www.thesportsdb.com/event/'+id,official:false,sourceType:'source-event',evidenceLevel:'C',destinationPrecision:'channel',matchingMethod:'source-event-id-title-kickoff',checkedAt:new Date(now).toISOString(),verifiedAt:new Date(now).toISOString(),validUntil:new Date(Math.min(now+12*3600000,Date.parse(event.startsAt)+4*3600000)).toISOString()}];
 });
}
export async function enrichEventTV(events:any[],cache:Record<string,any>={},fetcher:typeof fetch=fetch,now=Date.now()){
 let requests=0,successes=0,throttled=false;const output=[];
 // Oldest lookup first prevents a busy near-term schedule from starving later events.
 const ordered=[...events].sort((a,b)=>{const id=(e:any)=>e.sourceIds?.thesportsdb||(/^tsdb-([0-9]+)$/.exec(e.id)?.[1]);return (cache[id(a)]?.checkedAt||0)-(cache[id(b)]?.checkedAt||0)||Date.parse(a.startsAt)-Date.parse(b.startsAt);});
 for(const event of ordered){const id=event.sourceIds?.thesportsdb||(/^tsdb-([0-9]+)$/.exec(event.id)?.[1]);let row=cache[id];
  if(id&&!/cancel|postponed|confirm/i.test(event.phase||'')&&Date.parse(event.startsAt)>now&&Date.parse(event.startsAt)<now+166*86400000){
   if((!row||now-row.checkedAt>6*3600000)&&requests<40&&!throttled){if(requests)await new Promise(resolve=>setTimeout(resolve,2100));requests++;try{const r=await fetcher('https://www.thesportsdb.com/api/v1/json/123/lookuptv.php?id='+encodeURIComponent(id),{signal:AbortSignal.timeout(10000)});if(r.status===429)throttled=true;if(r.ok){const payload=await r.json();if(Array.isArray(payload?.tvevent)||payload?.tvevent===null){row={checkedAt:now,payload};cache[id]=row;successes++;}}}catch{} }
   const listings=row&&now-row.checkedAt<12*3600000?eventTVListings(event,row.payload,row.checkedAt):[];
   // Official listings always take precedence; retain countries the source does not cover.
   const existing=event.broadcasts||[];const fresh=new Set(listings.map((b:any)=>b.territory+'|'+normalized(b.channel)));
   output.push({...event,broadcasts:[...existing.filter((b:any)=>b.official||!fresh.has(b.territory+'|'+normalized(b.channel))),...listings.filter((b:any)=>!existing.some((x:any)=>x.official&&x.territory===b.territory&&normalized(x.channel)===normalized(b.channel)))]});
  }else output.push(event);
 }
 return {events:output,cache,source:{name:'TheSportsDB exact-event TV listings',ok:requests===0||successes>0,detail:successes+' fresh event lookups; country, event identity and kickoff checked'}};
}
