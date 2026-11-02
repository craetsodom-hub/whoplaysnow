// Crawls the published sitemaps the way a search engine would and reports
// anything that would stop a submitted URL from being indexed. Submitted is not
// indexed: pair this report with Search Console's per-sitemap page indexing.
// Usage: tsx scripts/seo-audit.ts [--origin https://whoplaysnow.com] [--sample 20] [--output file.json]
import {writeFile} from 'node:fs/promises';

const option=(name:string,fallback:string)=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:fallback;};
const origin=option('--origin','https://whoplaysnow.com').replace(/\/$/,''),sample=Number(option('--sample','20')),output=option('--output','');
const agent='Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) WHOPLAYSNOW-seo-audit';
const failures:string[]=[],warnings:string[]=[];
const fetchText=async(path:string,redirect:RequestRedirect='manual')=>{const r=await fetch(path.startsWith('http')?path:origin+path,{redirect,headers:{'User-Agent':agent},signal:AbortSignal.timeout(30000)});return {status:r.status,headers:r.headers,text:await r.text()};};
const locs=(xml:string)=>[...xml.matchAll(/<loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)].map(m=>({loc:m[1].replace(/&amp;/g,'&'),lastmod:m[2]}));
async function pool<T,R>(items:T[],size:number,run:(item:T)=>Promise<R>){const out:R[]=[];let i=0;await Promise.all(Array.from({length:size},async()=>{while(i<items.length){const item=items[i++];out.push(await run(item));}}));return out;}

async function checkPage(url:string){
 const r=await fetchText(url);const h=r.text,g=(re:RegExp)=>(h.match(re)||[])[1];
 const page={url,status:r.status,title:g(/<title>([^<]*)<\/title>/),description:g(/<meta name="description" content="([^"]*)"/),robots:g(/<meta name="robots" content="([^"]*)"/)||'',canonical:g(/<link rel="canonical" href="([^"]*)"/),h1:(h.match(/<h1[\s>]/g)||[]).length,structured:[] as string[],issues:[] as string[]};
 if(r.status!==200)page.issues.push('status '+r.status);
 if(/noindex/i.test(page.robots)||/noindex/i.test(r.headers.get('x-robots-tag')||''))page.issues.push('noindex in sitemap');
 if(page.canonical!==url)page.issues.push('canonical '+page.canonical);
 if(!page.title)page.issues.push('missing title');
 if(!page.description||page.description.length<50)page.issues.push('weak description');
 if(page.h1!==1)page.issues.push(page.h1+' h1 elements');
 for(const m of h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)){try{const v=JSON.parse(m[1]);page.structured.push(...(v['@graph']?v['@graph'].map((x:any)=>x['@type']):[v['@type']]));}catch{page.issues.push('invalid JSON-LD');}}
 const after=g(/unavailable_after: ([^",]+)/);if(after&&Date.parse(after)<Date.now())page.issues.push('listed after unavailable_after');
 return page;
}

const robots=await fetchText('/robots.txt');
if(!robots.text.includes('Sitemap: '+origin+'/sitemap.xml'))failures.push('robots.txt does not declare the sitemap index');
if(/User-agent: \*\s*\nDisallow: \/\s*$/m.test(robots.text))failures.push('robots.txt blocks all crawlers');
const index=await fetchText('/sitemap.xml');
if(index.status!==200||!index.text.includes('<sitemapindex'))failures.push('sitemap index unavailable: '+index.status);
const files=locs(index.text),report:any={origin,checkedAt:new Date().toISOString(),sitemaps:[],pages:[],legacy:[]};
const seen=new Map<string,string>();
for(const file of files){
 const res=await fetchText(file.loc);const entries=locs(res.text);
 const duplicates=entries.filter(e=>seen.has(e.loc)).length;for(const e of entries)seen.set(e.loc,file.loc);
 const lastmod=entries.filter(e=>e.lastmod).length;
 report.sitemaps.push({sitemap:file.loc,status:res.status,urls:entries.length,withLastmod:lastmod,duplicates,lastmod:file.lastmod});
 if(res.status!==200)failures.push(file.loc+' returned '+res.status);
 if(entries.length>50000)failures.push(file.loc+' exceeds 50,000 URLs');
 if(duplicates)warnings.push(file.loc+' repeats '+duplicates+' URLs from earlier sitemaps');
 if(/events-/.test(file.loc)&&entries.length&&lastmod<entries.length*0.9)warnings.push(file.loc+' has lastmod on '+lastmod+'/'+entries.length+' URLs (collector seo-state missing?)');
 // Soonest fixtures matter most: their search window is closing.
 const picked=[...entries.slice(0,Math.ceil(sample/2)),...entries.slice(Math.ceil(sample/2)).sort(()=>Math.random()-.5).slice(0,Math.floor(sample/2))];
 report.pages.push(...await pool(picked.map(e=>e.loc),6,checkPage));
}
const titles=new Map<string,string[]>();for(const p of report.pages)if(p.title)titles.set(p.title,[...titles.get(p.title)||[],p.url]);
for(const [title,urls] of titles)if(urls.length>1)warnings.push('duplicate title "'+title+'" on '+urls.join(', '));
for(const p of report.pages){if(p.issues.length)failures.push(p.url+': '+p.issues.join('; '));if(/^\/[^/]+\/[^/]+$/.test(new URL(p.url).pathname)&&!/^\/(teams|competitions|sports)\//.test(new URL(p.url).pathname)&&!p.structured.includes('SportsEvent'))failures.push(p.url+': event page without SportsEvent');}
for(const path of ['/movie/706857-bad-impulse','/actor/239019-kit-harington','/sg/actor/7550-lina-bernardi','/gb/streaming/netflix','/sitemap/catalog-000014.xml','/sitemaps/tv/44.xml']){const r=await fetchText(path);report.legacy.push({path,status:r.status});if(r.status!==410)failures.push('legacy '+path+' returned '+r.status+' (expected 410)');}
report.summary={sitemaps:files.length,urls:seen.size,pagesChecked:report.pages.length,failures:failures.length,warnings:warnings.length};
report.failures=failures;report.warnings=warnings;
if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report.summary,sitemaps:report.sitemaps.map((s:any)=>({file:s.sitemap.replace(origin,''),urls:s.urls,withLastmod:s.withLastmod})),failures:failures.slice(0,25),warnings:warnings.slice(0,25)},null,1));
process.exitCode=failures.length?1:0;
