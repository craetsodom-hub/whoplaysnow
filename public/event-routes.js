// Shared by the collector, server and browser. Provider IDs stay internal.
export const routeSlug=value=>String(value||'').replace(/[øØ]/g,'o').replace(/[łŁ]/g,'l').replace(/ß/g,'ss').replace(/[ðđÐĐ]/g,'d').replace(/[þÞ]/g,'th').replace(/[æÆ]/g,'ae').replace(/[œŒ]/g,'oe').replace(/ı/g,'i').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,150).replace(/-$/,'')||'sports-event';
export const eventBasePath=e=>'/'+routeSlug(e.competition)+'/'+routeSlug(e.homeTeam?.name&&e.awayTeam?.name?e.homeTeam.name+' vs '+e.awayTeam.name:e.title);
export const publicEventPath=e=>e.canonicalPath||eventBasePath(e);
const safePath=path=>typeof path==='string'&&/^\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path);

// Reserve published paths permanently. Repeated fixtures receive a date, then
// a numeric suffix for same-day repetitions. Provider IDs stay out of URLs.
export function assignEventPaths(events,prior={}){
 const entries=prior.version===1?structuredClone(prior.entries||{}):{};
 // A duplicate merged into another fixture hands its published paths to the
 // survivor as aliases: they 301 to the surviving page instead of competing.
 for(const e of events)for(const merged of e.mergedIds||[]){
  const gone=entries[merged];if(!gone||merged===e.id)continue;delete entries[merged];
  const own=entries[e.id],moved=[gone.path,...gone.aliases||[]];
  if(own)own.aliases=[...new Set([...own.aliases||[],...moved])].filter(p=>p!==own.path);
  else entries[e.id]={...gone,aliases:[...gone.aliases||[]]};
 }
 const occupied=new Map();
 for(const [id,entry] of Object.entries(entries))for(const path of [entry.path,...entry.aliases||[]]){
  if(!safePath(path))throw Error('Invalid persisted event path');
  if(occupied.has(path)&&occupied.get(path)!==id)throw Error('Conflicting persisted event paths');
  occupied.set(path,id);
 }
 const results=new Map();
 for(const e of [...events].sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt))||String(a.id).localeCompare(String(b.id)))){
  const base=eventBasePath(e),old=entries[e.id],day=String(e.startsAt).slice(0,10);
  let path=old?.base===base&&(!old.dated||old.day===day)?old.path:base;
  let dated=old?.base===base&&old.dated||false;
  // A fixture that already owns the undated path (inherited from a merged
  // duplicate) publishes it again; the dated path becomes its alias.
  if(dated&&old?.aliases?.includes(base)){path=base;dated=false;}
  if(occupied.has(path)&&occupied.get(path)!==e.id||dated&&old?.day!==day){path=base+'-'+day;dated=true;}
  const stem=path;let n=2;while(occupied.has(path)&&occupied.get(path)!==e.id)path=stem+'-'+n++;
  if(!safePath(path))throw Error('Invalid generated event path');
  const aliases=[...new Set([...(old?.aliases||[]),...(old&&old.path!==path?[old.path]:[])])].filter(p=>p!==path);
  entries[e.id]={base,path,dated,day,aliases};occupied.set(path,e.id);
  results.set(e.id,{...e,canonicalPath:path,publicPathAliases:aliases});
 }
 return {events:events.map(e=>results.get(e.id)),registry:{version:1,entries}};
}
