// Release gate: blocks a deploy that would bring Search Console errors back.
// It serves the exact build about to ship (dist/site through the Worker, with
// Cloudflare's static-asset rules from wrangler.jsonc) and fails if any of the
// problems Google reported on this site could reappear:
//  - a sitemap URL that is not 200, carries noindex, or names another canonical
//    ("Submitted URL marked noindex", "Redirect error", "Not found (404)", 5xx);
//  - an internal link that is broken or bounces through more than one redirect;
//  - a legacy film-catalogue URL that stops answering 410 Gone;
//  - an old /matches/{title}--{id} link to a live fixture that no longer
//    redirects to that fixture;
//  - an unknown URL answering 200 (a soft 404) or any 5xx.
// When it fails, the deploy step does not run and the previous version stays
// live; GitHub emails the repository owner about the failed run.
// Usage: tsx scripts/release-gate.ts [--dist dist/site] [--events 400]
//        tsx scripts/release-gate.ts --live   (the same checks against whoplaysnow.com;
//        run it from your own machine: Cloudflare blocks GitHub runner IPs)
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import worker from '../worker/index';

const option=(name:string,fallback:string)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const dist=option('--dist','dist/site'),eventSample=Number(option('--events','400')),liveMode=process.argv.includes('--live');
const origin='https://whoplaysnow.com';
const failures:string[]=[];const fail=(message:string)=>{failures.push(message);};

const exists=async(file:string)=>{try{return (await stat(file)).isFile();}catch{return false;}};
const fromDist=(path:string)=>join(dist,decodeURIComponent(path));
// Header rules from _headers that matter to crawlers (X-Robots-Tag).
const headerRules:{pattern:RegExp;robots:string}[]=[];
if(!liveMode){let pattern:RegExp|null=null;for(const line of (await readFile(join(dist,'_headers'),'utf8').catch(()=>'')).split('\n')){if(/^\S/.test(line)){pattern=new RegExp('^'+line.trim().replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$');continue;}const m=line.match(/^\s+X-Robots-Tag:\s*(.+)$/i);if(m&&pattern)headerRules.push({pattern,robots:m[1].trim()});}}
const env={SITE_ORIGIN:origin,ASSETS:{fetch:async(input:Request|string)=>{const path=new URL(typeof input==='string'?input:input.url).pathname;try{return new Response(await readFile(fromDist(path)));}catch{return new Response('missing',{status:404});}}}};

type Result={status:number;location:string;robots:string;body:string};
// Cloudflare order: static file (auto-trailing-slash HTML handling), else the Worker.
async function serve(url:string):Promise<Result>{
 const {pathname:path}=new URL(url,origin);
 if(liveMode){
  const r=await fetch(origin+path+new URL(url,origin).search,{redirect:'manual',headers:{'User-Agent':'WHOPLAYSNOW-release-gate/1.0 (+https://whoplaysnow.com/about)'},signal:AbortSignal.timeout(30000)});
  const type=r.headers.get('content-type')||'';
  return {status:r.status,location:(r.headers.get('location')||'').replace(origin,''),robots:r.headers.get('x-robots-tag')||'',body:/html|xml|text/.test(type)?await r.text():''};
 }
 // Static assets are matched case-sensitively (every built file is lowercase).
 if(path!=='/channels'&&!/[A-Z]/.test(path)){
  const candidates=path==='/'?['index.html']:path.endsWith('/')?[path+'index.html']:[path,path+'.html'];
  for(const candidate of candidates)if(/\.[a-z0-9]+$/i.test(candidate)&&await exists(fromDist(candidate))){
   const robots=headerRules.filter(r=>r.pattern.test(path)).map(r=>r.robots).join(',');
   return {status:200,location:'',robots,body:/\.(html|xml|txt)$/.test(candidate)?await readFile(fromDist(candidate),'utf8'):''};
  }
  if(!path.endsWith('/')&&await exists(fromDist(path+'/index.html')))return {status:307,location:path+'/',robots:'',body:''};
 }
 const r=await worker.fetch(new Request(origin+path+new URL(url,origin).search,{redirect:'manual'}),env as any);
 const type=r.headers.get('content-type')||'';
 return {status:r.status,location:(r.headers.get('location')||'').replace(origin,''),robots:r.headers.get('x-robots-tag')||'',body:/html|xml|text/.test(type)?await r.text():''};
}
// Follows redirects the way Googlebot does and returns every hop.
async function follow(url:string){const hops:Result[]=[];let current=url;for(let i=0;i<5;i++){const r=await serve(current);hops.push(r);if(r.status<300||r.status>=400||!r.location)break;current=r.location;}return hops;}
async function pool<T>(items:T[],size:number,run:(item:T)=>Promise<void>){let i=0;await Promise.all(Array.from({length:size},async()=>{while(i<items.length)await run(items[i++]);}));}
const attr=(html:string,re:RegExp)=>(html.match(re)||[])[1]||'';
const locs=(xml:string)=>[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,'&'));

// 1. Crawler files.
const robots=await serve('/robots.txt');
if(robots.status!==200)fail('robots.txt returned '+robots.status);
if(!robots.body.includes('Sitemap: '+origin+'/sitemap.xml'))fail('robots.txt does not declare '+origin+'/sitemap.xml');
if(/User-agent: \*\s*\n(?:Allow:[^\n]*\n)*Disallow: \/\s*$/m.test(robots.body))fail('robots.txt blocks the whole site');

// 2. Every URL in every sitemap must be indexable exactly as submitted.
const index=await serve('/sitemap.xml');
if(index.status!==200||!index.body.includes('<sitemapindex'))fail('sitemap index returned '+index.status);
const submitted=new Map<string,string>();
for(const file of locs(index.body)){
 if(!file.startsWith(origin+'/'))fail('sitemap index lists a foreign URL: '+file);
 const res=await serve(file.slice(origin.length));
 if(res.status!==200){fail(file+' returned '+res.status);continue;}
 for(const loc of locs(res.body)){if(submitted.has(loc))fail(loc+' is listed twice ('+submitted.get(loc)+', '+file+')');submitted.set(loc,file);}
}
if(submitted.size<10)fail('sitemaps list only '+submitted.size+' URLs');
const pages=new Map<string,string>();
await pool([...submitted.keys()],liveMode?12:32,async loc=>{
 if(!loc.startsWith(origin+'/')){fail('sitemap lists a foreign URL: '+loc);return;}
 const r=await serve(loc.slice(origin.length)),where=' ('+submitted.get(loc)!.replace(origin,'')+')';
 if(r.status!==200){fail(loc+' returned '+r.status+(r.location?' -> '+r.location:'')+where);return;}
 const meta=attr(r.body,/<meta name="robots" content="([^"]*)"/);
 if(/noindex/i.test(meta+' '+r.robots))fail(loc+' is in a sitemap but marked noindex'+where);
 const canonical=attr(r.body,/<link rel="canonical" href="([^"]*)"/);
 if(canonical!==loc)fail(loc+' declares canonical '+(canonical||'(none)')+where);
 pages.set(loc,r.body);
});

// 3. Internal links on every directory page and a spread of fixture pages.
const directory=[...submitted].filter(([,file])=>!/sitemap-events-/.test(file)).map(([loc])=>loc);
const fixtures=[...submitted].filter(([,file])=>/sitemap-events-/.test(file)).map(([loc])=>loc);
const spread=fixtures.filter((_,i)=>i%Math.max(1,Math.floor(fixtures.length/eventSample))===0);
const linkedFrom=new Map<string,string>();
for(const loc of [...directory,...spread]){const html=pages.get(loc);if(!html)continue;
 for(const m of html.matchAll(/<(?:a|link)\b[^>]*?\bhref="(\/[^"#]*)"/g)){
  const href=m[1].replace(/&amp;/g,'&'),path=href.split('?')[0];
  // Disallowed in robots.txt or handled by the browser script: never crawled.
  if(/^\/(api|calendar)\//.test(path)||/[?&](country|countryMode|q|view|competition)=/.test(href))continue;
  if(!linkedFrom.has(path))linkedFrom.set(path,loc);
 }
}
await pool([...linkedFrom.keys()],liveMode?12:32,async path=>{
 const hops=await follow(path),last=hops.at(-1)!,from=' (linked from '+linkedFrom.get(path)!.replace(origin,'')+')';
 if(last.status!==200)fail('internal link '+path+' ends in '+last.status+from);
 else if(hops.length>2)fail('internal link '+path+' takes '+(hops.length-1)+' redirects'+from);
});

// 4. Legacy film catalogue: permanently gone, never 404 or 200.
for(const path of ['/movie/706857-bad-impulse','/movie/550','/actor/239019-kit-harington','/tv/1399-game-of-thrones','/sg/actor/7550-lina-bernardi','/gb/streaming/netflix','/sitemap/catalog-000014.xml','/sitemaps/tv/44.xml']){
 const r=await serve(path);if(r.status!==410)fail('legacy '+path+' returned '+r.status+' (expected 410)');
}

// 5. Old /matches/{title}--{id} links to fixtures still on the schedule.
const feed=(liveMode?await (await fetch(origin+'/api/schedule')).json():JSON.parse(await readFile(join(dist,'api/schedule.json'),'utf8'))).events as any[];
const live=feed.filter((_,i)=>i%Math.max(1,Math.floor(feed.length/eventSample))===0);
await pool(live,16,async e=>{
 const segment=e.canonicalPath?.split('/')[2]?.replace(/-\d{4}-\d{2}-\d{2}(?:-\d+)?$/,'');if(!segment)return;
 const path='/matches/'+segment+'--'+encodeURIComponent(String(e.id).toLowerCase()),hops=await follow(path),last=hops.at(-1)!;
 if(hops[0].status!==301||hops[0].location.split('?')[0]!==e.canonicalPath)fail(path+' should 301 to '+e.canonicalPath+', got '+hops[0].status+' '+hops[0].location);
 else if(last.status!==200)fail(path+' redirects to '+e.canonicalPath+' which returns '+last.status);
});

// 6. Retired fixtures, moved URLs and unknown pages answer with honest status codes.
const expect=async(path:string,status:number,target?:string)=>{const hops=await follow(path);if(hops[0].status!==status)fail(path+' returned '+hops[0].status+' (expected '+status+')');if(target!==undefined&&hops.at(-1)!.status!==200)fail(path+' redirects to a page returning '+hops.at(-1)!.status);};
await expect('/sports/football',301,'/');await expect('/matches',301,'/');await expect('/Competitions',301,'/competitions');
await expect('/matches/real-madrid-vs-barcelona--espn-401882832',410);
await expect('/not-a-page',404);await expect('/nothing/here-at-all',404);await expect('/matches/foo--bar',404);await expect('/teams/football/no-such-team',404);

console.log(JSON.stringify({sitemapUrls:submitted.size,internalLinks:linkedFrom.size,fixturesChecked:live.length,failures:failures.length,examples:failures.slice(0,30)},null,1));
if(failures.length)console.error('Release gate failed: this build would put Search Console errors back. The deploy was skipped and the live site is unchanged.');
process.exitCode=failures.length?1:0;
