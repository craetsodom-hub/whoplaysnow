// Runs the Cloudflare Worker against a built dist/site and compares every
// request-dependent response with a reference Express server (the VPS build).
// Usage: tsx scripts/verify-worker.ts --reference http://127.0.0.1:3100 [--dist dist/site] [--sample 40]
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import worker from '../worker/index';
const option=(name:string,fallback:string)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const reference=option('--reference','http://127.0.0.1:3100'),dist=option('--dist','dist/site'),sample=Number(option('--sample','40'));
const env={SITE_ORIGIN:'https://whoplaysnow.com',ASSETS:{fetch:async(input:Request|string)=>{const path=new URL(typeof input==='string'?input:input.url).pathname;try{return new Response(await readFile(join(dist,decodeURIComponent(path))));}catch{return new Response('missing',{status:404});}}}};
const viaWorker=(path:string,headers:Record<string,string>={})=>worker.fetch(new Request('https://whoplaysnow.com'+path,{headers,redirect:'manual'}),env as any);
const viaReference=(path:string,headers:Record<string,string>={})=>fetch(reference+path,{headers,redirect:'manual'});
const norm=(t:string)=>t.replace(/\?v=[0-9a-f]{12}/g,'?v=X').replace('<html lang="en" data-static="1">','<html lang="en">');
const mismatches:any[]=[];let checks=0;
async function same(label:string,path:string,headers:Record<string,string>={},body=true){
 checks++;const [a,b]=await Promise.all([viaWorker(path,headers),viaReference(path,headers)]);
 const location=(r:Response)=>(r.headers.get('location')||'').replace(/^https?:\/\/[^/]+/,'');
 const [ta,tb]=body?[norm(await a.text()),norm(await b.text())]:['',''];
 if(a.status!==b.status||location(a)!==location(b)||ta!==tb)mismatches.push({label,path,headers,worker:[a.status,location(a),ta.slice(0,160)],reference:[b.status,location(b),tb.slice(0,160)]});
}
const feed=JSON.parse(await readFile(join(dist,'api/schedule.json'),'utf8'));
const events=feed.events.filter((_:any,i:number)=>i%Math.max(1,Math.floor(feed.events.length/sample))===0);
// Broadcaster panels: the Worker re-localises per visitor exactly like the server.
for(const e of events)for(const country of ['GB','ES','US','DE','MA','NZ','BR']){
 checks++;const [a,b]=await Promise.all([viaWorker('/api/event/'+encodeURIComponent(e.id)+'?country='+country),viaReference('/api/event/'+encodeURIComponent(e.id)+'?country='+country)]);
 const [ja,jb]=[await a.json() as any,await b.json() as any];
 if(a.status!==b.status||ja.broadcastHtml!==jb.broadcastHtml||JSON.stringify(ja.event?.broadcasts)!==JSON.stringify(jb.event?.broadcasts))mismatches.push({label:'event panel',id:e.id,country,worker:String(ja.broadcastHtml).slice(0,200),reference:String(jb.broadcastHtml).slice(0,200)});
}
for(const e of events.slice(0,10)){checks++;const [a,b]=await Promise.all([viaWorker('/calendar/'+encodeURIComponent(e.id)+'.ics'),viaReference('/calendar/'+encodeURIComponent(e.id)+'.ics')]);const strip=(t:string)=>t.replace(/DTSTAMP:\S+/,'');if(strip(await a.text())!==strip(await b.text()))mismatches.push({label:'calendar',id:e.id});}
for(const country of ['GB','ES','US','MA','AU']){await same('channels auto','/channels',{'CF-IPCountry':country});await same('channels manual','/channels?country='+country+'&countryMode=manual',{'CF-IPCountry':'GB'});}
for(const path of ['/movie/706857-bad-impulse','/sg/actor/7550-lina-bernardi','/gb/streaming/netflix','/sitemap/catalog-000014.xml','/sports/football','/matches','/nothing/here-at-all','/not-a-page'])await same('fixed route',path);
for(const e of events.slice(0,15)){if(e.canonicalSlug)await same('legacy match URL','/matches/'+e.canonicalSlug,{},false);await same('dated variant',e.canonicalPath+'-2020-01-01',{},false);}
console.log(JSON.stringify({checks,mismatches:mismatches.length,examples:mismatches.slice(0,5)},null,1));
process.exitCode=mismatches.length?1:0;
