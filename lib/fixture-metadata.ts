// Fill an omitted competition only when the source page identifies the same
// event, title and kickoff. Artwork and metadata never refresh TV evidence.
export function competitionFromSource(event:any,html:string):string|undefined {
 const id=event.sourceIds?.thesportsdb;
 if(!/^\d+$/.test(id||''))return;
 for(const match of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)){
  try{const row=JSON.parse(match[1]);
   if(row['@type']!=='SportsEvent'||row.name!==event.title||Date.parse(row.startDate)!==Date.parse(event.startsAt))continue;
   const url=new URL(row.url);
   if(url.origin!=='https://www.thesportsdb.com'||!new RegExp('^/event/'+id+'(?:-|$)').test(url.pathname))continue;
   const name=row.organizer?.name;
   if(typeof name==='string'&&name.length<120&&!/[<>]/.test(name)&&row.organizer?.url?.startsWith('https://www.thesportsdb.com/league/'))return name;
  }catch{}
 }
}
export async function fillMissingCompetitions(events:any[],fetcher:typeof fetch=fetch){
 const targets=events.filter(e=>/competition not supplied/i.test(e.competition)&&/^\d+$/.test(e.sourceIds?.thesportsdb||'')).slice(0,20);
 const corrections=new Map<string,string>();let cursor=0;
 async function worker(){while(cursor<targets.length){const e=targets[cursor++];try{const response=await fetcher('https://www.thesportsdb.com/event/'+e.sourceIds.thesportsdb,{signal:AbortSignal.timeout(10000)});if(!response.ok)continue;const html=await response.text();if(html.length>2_000_000)continue;const name=competitionFromSource(e,html);if(name)corrections.set(e.id,name);}catch{}}}
 await Promise.all(Array.from({length:3},worker));
 return events.map(e=>corrections.has(e.id)?{...e,competition:corrections.get(e.id)}:e);
}
