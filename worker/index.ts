// Cloudflare Worker for the pre-rendered site. Static files answer most
// requests without invoking it (free and unlimited); it handles only what
// depends on the request: the visitor's country, per-country broadcaster
// panels, calendar files, redirects, retired URLs and pages kept in packs.
// Everything it serves was rendered by the Express app at build time, or by
// the same shared functions the server uses.
import {packIndex} from './packs';
import {isLegacyPath} from '../lib/legacy';
import {addGlobalServices} from '../lib/global-services';
import {renderBroadcasts} from '../lib/broadcast-html';
import {matchCalendar} from '../lib/calendar-export';
import {canonicalMatchId} from '../lib/matches/event-aliases';
import {visitorCountry,pageCountry} from '../lib/visitor-country';
import {publicEventPath} from '../public/event-routes.js';
import {esc} from '../public/core.js';
import {usePublicFileManifest} from '../lib/public-files';
import territories from '../lib/matches/viewing-territories.json' with {type:'json'};

type Env={ASSETS:{fetch(input:Request|string):Promise<Response>};SITE_ORIGIN?:string};
type Entry={status:number;type:string;location?:string;body:Uint8Array};
const countryCodes=new Set<string>(territories.territories);
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"};
// The same countries the server localises every view for.
const viewCountries=(c:string)=>[c,'MA','GB','FR','ES','US','AU','BE','AT'];

// A few hundred KB per pack; keep recently used ones for the isolate's lifetime.
const packs=new Map<number,{header:Record<string,any[]>;bytes:Uint8Array}>();
async function lookup(env:Env,origin:string,key:string):Promise<Entry|null>{
 const n=packIndex(key);let pack=packs.get(n);
 if(!pack){
  const res=await env.ASSETS.fetch(new Request(origin+'/_packs/'+n+'.bin'));if(!res.ok)return null;
  const bytes=new Uint8Array(await res.arrayBuffer()),size=new DataView(bytes.buffer,bytes.byteOffset).getUint32(0,true);
  pack={header:JSON.parse(new TextDecoder().decode(bytes.subarray(4,4+size))),bytes:bytes.subarray(4+size)};
  if(packs.size>=24)packs.delete(packs.keys().next().value!);packs.set(n,pack);
 }
 const row=pack.header[key];if(!row)return null;
 const [offset,length,status,type,location]=row;return {status,type,location,body:pack.bytes.subarray(offset,offset+length)};
}
async function eventRecord(env:Env,origin:string,raw:string){
 const id=canonicalMatchId(raw),hit=await lookup(env,origin,'id:'+id);if(!hit)return null;
 const value=JSON.parse(new TextDecoder().decode(hit.body));
 return value.ref?eventRecord(env,origin,value.ref):value;
}
// Logo resolution checks which artwork files exist; the build lists them.
let manifest:Promise<void>|undefined;
const publicFiles=(env:Env,origin:string)=>manifest??=env.ASSETS.fetch(new Request(origin+'/_packs/public-files.json')).then(r=>r.json()).then((files:string[])=>usePublicFileManifest(files)).catch(error=>{manifest=undefined;throw error;});
const reply=(entry:Entry,head:boolean,extra:Record<string,string>={})=>new Response(head?null:entry.body,{status:entry.status,headers:{...security,'Content-Type':entry.type,'Cache-Control':'public, max-age=0, must-revalidate',...(entry.location?{Location:entry.location}:{}),...extra}});
const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{...security,'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}});

export default {async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url),path=url.pathname,origin=url.origin,head=request.method==='HEAD',edge=request.headers.get('CF-IPCountry'),now=Date.now();
 if(request.method!=='GET'&&!head)return new Response('Method not allowed',{status:405,headers:{...security,Allow:'GET, HEAD'}});
 // Pre-rendered error pages name the request in their canonical link: swap the
 // build's placeholder path for this one, escaped the way the server escapes it.
 const special=async(key:string,status:number,placeholder:string,extra:Record<string,string>={})=>{const entry=await lookup(env,origin,key);if(!entry)return new Response('Not found',{status});return reply({...entry,status,body:new TextEncoder().encode(new TextDecoder().decode(entry.body).replaceAll(placeholder,esc(path)))},head,extra);};
 const missing='__wpn_not_found__';
 const notFound=async()=>{const parts=path.split('/').slice(1);
  if(parts[0]==='teams'&&parts.length===3)return special('special:404-team',404,'/teams/'+missing+'/'+missing);
  if(parts.length===2&&parts[0]==='competitions')return special('special:404-competition',404,'/competitions/'+missing);
  if(parts.length===2&&parts[0]==='sports')return special('special:404-sport',404,'/sports/'+missing);
  if(parts.length===2){const segment=parts[0].toLowerCase();if(await lookup(env,origin,'special:404-match:'+segment))return special('special:404-match:'+segment,404,'/'+segment+'/'+missing);return special('special:404-match',404,'/'+missing+'/'+missing);}
  return special('special:404',404,'/'+missing);};
 // Legacy film catalogue: permanently gone, before any sports route (as on the server).
 if(isLegacyPath(path))return special('special:410',410,'/movie/'+missing,{'X-Robots-Tag':'noindex'});
 if(path==='/api/location')return json({country:visitorCountry(undefined,edge)});
 if(path==='/api/schedule')return env.ASSETS.fetch(new Request(origin+'/api/schedule.json'));
 const apiEvent=path.match(/^\/api\/event\/([^/]+)$/);
 if(apiEvent){
  const country=visitorCountry(url.searchParams.get('country'),edge),base=await eventRecord(env,origin,decodeURIComponent(apiEvent[1]));
  if(!base)return json({error:'Not found'},404);
  await publicFiles(env,origin);
  const e=addGlobalServices(addGlobalServices(base,viewCountries(country),now));
  return json({event:e,broadcastHtml:renderBroadcasts(e,country)});
 }
 const calendar=path.match(/^\/calendar\/([^/]+)$/);
 if(calendar){
  const country=visitorCountry(url.searchParams.get('country'),edge),base=await eventRecord(env,origin,decodeURIComponent(calendar[1]).replace(/\.ics$/,''));
  if(!base)return new Response('Not Found',{status:404,headers:security});
  await publicFiles(env,origin);
  const e=addGlobalServices(base,viewCountries(country),now);
  return new Response(head?null:matchCalendar(e,(env.SITE_ORIGIN||origin)+publicEventPath(e)),{headers:{...security,'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="match.ics"','Cache-Control':'private, no-store'}});
 }
 if(path==='/channels'){
  const requested=url.searchParams.get('country'),manual=url.searchParams.get('countryMode')==='manual'&&countryCodes.has(requested||'');
  const entry=await lookup(env,origin,manual?'channels:manual:'+requested:'channels:auto:'+pageCountry(requested,url.searchParams.get('countryMode'),edge));
  return entry?reply(entry,head,{'Cache-Control':'private, no-store'}):env.ASSETS.fetch(request);
 }
 if(/[A-Z]/.test(path))return Response.redirect(origin+path.toLowerCase()+url.search,301);
 if(path.length>1&&path.endsWith('/'))return Response.redirect(origin+path.replace(/\/+$/,'')+url.search,301);
 const entry=await lookup(env,origin,path);
 if(entry){
  // Event redirects keep an explicit country choice, like the server.
  if(entry.status===301&&entry.location&&countryCodes.has(url.searchParams.get('country')||'')){const p=new URLSearchParams({country:url.searchParams.get('country')!});if(url.searchParams.get('countryMode')==='manual')p.set('countryMode','manual');return reply({...entry,location:entry.location+'?'+p},head);}
  return reply(entry,head);
 }
 // An unseen dated variant of a matchup resolves to its next meeting.
 if(/^\/[a-z0-9-]+\/[a-z0-9-]+$/.test(path)){const next=await lookup(env,origin,'base:'+path.replace(/-\d{4}-\d{2}-\d{2}(?:-\d+)?$/,''));if(next?.location&&next.location!==path)return reply(next,head);}
 return notFound();
}};
