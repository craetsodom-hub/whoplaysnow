// Renders the site for Cloudflare by requesting every public URL from the
// unmodified Express app, so pages are byte-for-byte what the server produces.
// Output (dist/site): one file per page up to Cloudflare's free-plan file
// limit, binary packs for the overflow, redirects, retired URLs and event data
// the Worker needs, the schedule feed and per-country service additions.
// Usage: DATA_DIR=runtime tsx scripts/build-static.ts [--out dist/site]
import {mkdir,writeFile,rm,cp,readdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import type {AddressInfo} from 'node:net';
process.env.WPN_NO_LISTEN='1';process.env.WPN_SHARED_COUNTRY_VIEW='1';
// One snapshot for the whole build: every page reflects the same instant.
process.env.WPN_FREEZE_VIEW='1';
const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'dist/site';
const {app,schedule,sitemaps,countryCodes,baseView}=await import('../server.ts');
const {competitionDirectory}=await import('../lib/directory-pages');
const {addGlobalServices}=await import('../lib/global-services');
const {scheduleFeedEvent}=await import('../lib/broadcast-html');
const {matchSourceIds}=await import('../lib/matches/routes');
const {getIndexNowKey}=await import('../lib/indexnow');
const {competitionPath,sports}=await import('../public/core.js');
const {eventBasePath,routeSlug}=await import('../public/event-routes.js');
const {PACK_COUNT,packIndex,STATIC_FILE_LIMIT}=await import('../worker/packs');

const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
// Outlive the client's pooled sockets, or reused connections race the server's idle close.
server.keepAliveTimeout=120000;server.headersTimeout=125000;
const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
const started=Date.now(),now=Date.now();
const phase=(name:string)=>console.log(JSON.stringify({event:'staticBuildPhase',name,seconds:Math.round((Date.now()-started)/1000)}));
type Snapshot={status:number;type:string;location?:string;body:Buffer};
async function get(path:string,headers:Record<string,string>={},attempt=1):Promise<Snapshot>{
 let r:Response;
 try{r=await fetch(base+path,{redirect:'manual',headers,signal:AbortSignal.timeout(120000)});}
 catch(error){if(attempt<3)return get(path,headers,attempt+1);throw Error('Request failed: '+path,{cause:error});}
 const body=Buffer.from(await r.arrayBuffer()),type=r.headers.get('content-type')||'text/html; charset=utf-8';
 // The marker switches the browser script to resolve the visitor's country itself.
 return {status:r.status,type,location:r.headers.get('location')||undefined,body:type.startsWith('text/html')?Buffer.from(body.toString('utf8').replace('<html lang="en">','<html lang="en" data-static="1">')):body};
}
async function pool<T>(items:T[],size:number,run:(item:T)=>Promise<void>){let i=0;await Promise.all(Array.from({length:size},async()=>{while(i<items.length)await run(items[i++]);}));}

await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
let files=0;
const write=async(path:string,body:Buffer|string)=>{const file=join(out,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,body);files++;};
// Images and styles keep their current URLs; only top-level public files live under /assets.
for(const folder of ['artwork','channel-logos','utility-identity'])await cp('public/'+folder,join(out,folder),{recursive:true});
const countFiles=async(dir:string):Promise<number>=>{let n=0;for(const entry of await readdir(dir,{withFileTypes:true}))n+=entry.isDirectory()?await countFiles(join(dir,entry.name)):1;return n;};
files+=await countFiles(out);
const listFiles=async(dir:string,prefix=''):Promise<string[]>=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?listFiles(join(dir,e.name),prefix+'/'+e.name):[prefix+'/'+e.name]))).flat();
await write('_packs/public-files.json',JSON.stringify(await listFiles('public')));
for(const entry of await readdir('public',{withFileTypes:true}))if(entry.isFile())await write('assets/'+entry.name,(await get('/assets/'+entry.name)).body);

const data=await schedule('GB'),view=await baseView();
const packs=new Map<string,Snapshot>(),assets=new Map<string,Snapshot>();
const fileFor=(path:string)=>path==='/'?'index.html':/\.(xml|txt)$/.test(path)?path.slice(1):path.slice(1)+'.html';

// 1. Site pages, sitemaps and crawler files.
const pages=['/','/about','/privacy','/terms','/competitions','/channels',...sports.filter(([key]:any)=>key!=='football').map(([key]:any)=>'/sports/'+key),'/robots.txt','/sitemap.xml',...[...(await sitemaps()).keys()].map(name=>'/sitemap-'+name+'.xml'),'/'+getIndexNowKey()+'.txt',...competitionDirectory(data.events).map((row:any)=>competitionPath(row.name))];
const teams=[...data.teams.values()].filter((t:any)=>t.events.some((e:any)=>Date.parse(e.startsAt)>now-3*3600000)).sort((a:any,b:any)=>Number(b.indexable)-Number(a.indexable)||b.upcoming-a.upcoming).map((t:any)=>t.path);
// Soonest indexable fixtures first: if anything overflows into packs, it is the far future.
const events=[...data.events].sort((a:any,b:any)=>Number(Boolean(b.seo?.sitemap))-Number(Boolean(a.seo?.sitemap))||a.startsAt.localeCompare(b.startsAt));
const ordered=[...new Set([...pages,...teams,...events.map((e:any)=>e.canonicalPath)])];
const budget=STATIC_FILE_LIMIT-files-PACK_COUNT-countryCodes.size-50;
await pool(ordered.map((path,i)=>({path,i})),8,async({path,i})=>{const snap=await get(path);if(snap.status!==200)throw Error(path+' returned '+snap.status);(i<budget?assets:packs).set(path,snap);if((assets.size+packs.size)%2000===0)phase('pages '+(assets.size+packs.size)+'/'+ordered.length);});

phase('pages');
// 2. Redirects and retired URLs, answered by the Worker exactly as the server would.
const live=new Set(data.events.map((e:any)=>e.canonicalPath));
const moved=[...new Set([...data.events.flatMap((e:any)=>e.publicPathAliases||[]),...[...data.routes.keys()].filter((p:string)=>!live.has(p)),...data.events.filter((e:any)=>e.canonicalSlug).map((e:any)=>'/matches/'+e.canonicalSlug),'/sports/football','/matches'])];
await pool(moved,8,async path=>{packs.set(path,await get(path));});
// Error pages carry the requested URL (canonical, og:url); the Worker swaps in
// the real path for this placeholder. Express words them per route.
const missing='__wpn_not_found__';
packs.set('special:404',await get('/'+missing));
packs.set('special:404-team',await get('/teams/'+missing+'/'+missing));
packs.set('special:404-competition',await get('/competitions/'+missing));
packs.set('special:404-sport',await get('/sports/'+missing));
packs.set('special:404-match',await get('/'+missing+'/'+missing));
for(const segment of new Set(data.events.map((e:any)=>routeSlug(e.competition))))packs.set('special:404-match:'+segment,await get('/'+segment+'/'+missing));
packs.set('special:410',await get('/movie/'+missing));
// Unknown dated variants of a matchup resolve to its next meeting.
const nextByBase=new Map<string,any>();for(const e of data.events)if(Date.parse(e.startsAt)>now-3*3600000){const b=eventBasePath(e),seen=nextByBase.get(b);if(!seen||e.startsAt<seen.startsAt)nextByBase.set(b,e);}
for(const [b,e] of nextByBase)packs.set('base:'+b,{status:301,type:'text/plain',location:e.canonicalPath,body:Buffer.alloc(0)});

phase('redirects');
// 3. The channel directory is entirely country-specific: one page per country and mode.
for(const c of countryCodes){const auto=await get('/channels',{'CF-IPCountry':c});packs.set('channels:auto:'+c,auto);packs.set('channels:manual:'+c,await get('/channels?country='+c+'&countryMode=manual'));}

phase('channels');
// 4. Event records for /api/event and calendar files, keyed by every resolvable ID.
const json=(value:any):Snapshot=>({status:200,type:'application/json',body:Buffer.from(JSON.stringify(value))});
const aliasCounts=new Map<string,string[]>();
for(const e of view.events){packs.set('id:'+e.id,json(e));for(const [provider,id] of Object.entries(matchSourceIds(e))){const prefix=provider==='thesportsdb'?'tsdb':provider;if(!['espn','sky','nba','laliga','tsdb'].includes(prefix))continue;const key=prefix+'-'+id;if(key!==e.id)aliasCounts.set(key,[...aliasCounts.get(key)||[],e.id]);}}
for(const [key,ids] of aliasCounts)if(ids.length===1&&!packs.has('id:'+key))packs.set('id:'+key,json({ref:ids[0]}));

phase('eventRecords');
// 5. Schedule feed plus per-country worldwide-service rows (deduplicated).
const feed=await get('/api/schedule');await write('api/schedule.json',feed.body);
const feedRows=new Map(data.events.map((e:any)=>[e.id,new Set(scheduleFeedEvent(e).broadcasts.map((b:any)=>JSON.stringify(b)))]));
let serviceFiles=0;
// Countries are localised independently, so one all-territory pass yields every
// country's extra rows (those for its own territory that the GB feed lacks).
const extraByCountry=new Map<string,Map<string,string[]>>();
for(const e of view.events){const have=feedRows.get(e.id)!;for(const row of scheduleFeedEvent(addGlobalServices(e,undefined,now)).broadcasts){const text=JSON.stringify(row);if(have.has(text))continue;const perEvent=extraByCountry.get(row.territory)||new Map();perEvent.set(e.id,[...perEvent.get(e.id)||[],text]);extraByCountry.set(row.territory,perEvent);}}
for(const c of countryCodes){
 const rows:string[]=[],index=new Map<string,number>(),byEvent:Record<string,number[]>={};
 for(const [id,extra] of extraByCountry.get(c)||[])byEvent[id]=extra.map((b:string)=>{if(!index.has(b)){index.set(b,rows.length);rows.push(b);}return index.get(b)!;});
 if(rows.length){await write('api/schedule-services/'+c+'.json','{"rows":['+rows.join(',')+'],"events":'+JSON.stringify(byEvent)+'}');serviceFiles++;}
}

phase('services');
// 6. Write pages and packs.
for(const [path,snap] of assets)await write(fileFor(path),snap.body);
const buckets=Array.from({length:PACK_COUNT},()=>[] as [string,Snapshot][]);
for(const entry of packs)buckets[packIndex(entry[0])].push(entry);
for(const [n,entries] of buckets.entries()){
 let offset=0;const header:Record<string,any[]>={};
 for(const [key,snap] of entries){header[key]=[offset,snap.body.length,snap.status,snap.type,...(snap.location?[snap.location]:[])];offset+=snap.body.length;}
 const head=Buffer.from(JSON.stringify(header)),size=Buffer.alloc(4);size.writeUInt32LE(head.length);
 await write('_packs/'+n+'.bin',Buffer.concat([size,head,...entries.map(([,snap])=>snap.body)]));
}
// Cloudflare already serves assets with max-age=0, must-revalidate; rules below
// only lengthen it, since matching rules are merged rather than replaced.
await write('_headers',`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
/assets/*
  Cache-Control: public, max-age=3600
/artwork/*
  Cache-Control: public, max-age=31536000, immutable
/channel-logos/*
  Cache-Control: public, max-age=604800
/utility-identity/*
  Cache-Control: public, max-age=604800
/sitemap*
  Cache-Control: public, max-age=900
/_packs/*
  X-Robots-Tag: noindex
/api/*
  X-Robots-Tag: noindex
`);
server.close();
const report={generatedAt:data.generatedAt,files,staticPages:assets.size,packedEntries:packs.size,packedPages:[...packs.values()].filter(s=>s.status===200&&s.type.startsWith('text/html')).length,serviceFiles,seconds:Math.round((Date.now()-started)/1000)};
if(files>STATIC_FILE_LIMIT)throw Error('Static file limit exceeded: '+JSON.stringify(report));
console.log(JSON.stringify({event:'staticBuild',...report}));
