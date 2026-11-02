import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index';
import {PACK_COUNT,packIndex} from './packs';

// Builds packs exactly as scripts/build-static.ts does and serves them like the ASSETS binding.
function assetsFor(entries:Record<string,{status:number;type:string;location?:string;body:string}>){
 const buckets=new Map<number,[string,any][]>();for(const entry of Object.entries(entries)){const n=packIndex(entry[0]);buckets.set(n,[...buckets.get(n)||[],entry]);}
 const files=new Map<string,Buffer>();
 for(const [n,rows] of buckets){let offset=0;const header:any={},bodies:Buffer[]=[];for(const [key,e] of rows){const body=Buffer.from(e.body);header[key]=[offset,body.length,e.status,e.type,...(e.location?[e.location]:[])];offset+=body.length;bodies.push(body);}const head=Buffer.from(JSON.stringify(header)),size=Buffer.alloc(4);size.writeUInt32LE(head.length);files.set('/_packs/'+n+'.bin',Buffer.concat([size,head,...bodies]));}
 files.set('/api/schedule.json',Buffer.from('{"events":[]}'));files.set('/_packs/public-files.json',Buffer.from(JSON.stringify(['/utility-identity/services/tod.svg'])));
 return {fetch:async(input:Request|string)=>{const path=new URL(typeof input==='string'?input:input.url).pathname,file=files.get(path);return file?new Response(file):new Response('missing',{status:404});}};
}
const html=(body:string,status=200,location?:string)=>({status,type:'text/html; charset=utf-8',body,location});
const event={id:'espn-1',title:'Barcelona vs Aston Villa',sport:'football',competition:'UEFA Champions League',startsAt:new Date(Date.now()+86400000).toISOString(),canonicalPath:'/uefa-champions-league/barcelona-vs-aston-villa',homeTeam:{name:'Barcelona'},awayTeam:{name:'Aston Villa'},fixtureSource:{checkedAt:new Date().toISOString()},broadcasts:[{channel:'Paramount+',territory:'US',official:true,evidenceLevel:'A',destinationPrecision:'service',languages:[]},{channel:'M+ Liga de Campeones 2',territory:'ES',official:true,evidenceLevel:'A',destinationPrecision:'channel',languages:[]}]};
const env={SITE_ORIGIN:'https://whoplaysnow.com',ASSETS:assetsFor({
 'special:404':html('<link rel="canonical" href="https://whoplaysnow.com/__wpn_not_found__"><h1>PAGE NOT FOUND.</h1>',404),'special:404-match':html('<h1>MATCH NOT FOUND.</h1>',404),'special:410':html('<link rel="canonical" href="https://whoplaysnow.com/movie/__wpn_not_found__"><h1>WE’RE ALL ABOUT SPORT NOW.</h1>',410),
 '/ncaa/far-future-vs-game':html('<h1>packed page</h1>'),
 '/premier-league/old-name-vs-club':html('',301,'/premier-league/new-name-vs-club'),
 '/uefa-champions-league/ajax-vs-celtic':html('<h1>THIS FIXTURE HAS FINISHED.</h1>',410),
 'base:/uefa-champions-league/barcelona-vs-aston-villa':{status:301,type:'text/plain',location:'/uefa-champions-league/barcelona-vs-aston-villa',body:''},
 'channels:auto:ES':html('channels ES auto'),'channels:manual:FR':html('channels FR manual'),
 'id:espn-1':{status:200,type:'application/json',body:JSON.stringify(event)},'id:tsdb-9':{status:200,type:'application/json',body:JSON.stringify({ref:'espn-1'})},
})};
const call=(path:string,headers:Record<string,string>={},method='GET')=>worker.fetch(new Request('https://whoplaysnow.com'+path,{method,headers,redirect:'manual'}),env as any);

test('packs spread keys deterministically across a fixed number of files',()=>{
 assert.equal(packIndex('/a'),packIndex('/a'));
 const used=new Set(Array.from({length:5000},(_,i)=>packIndex('/p/'+i)));assert(used.size>PACK_COUNT*0.9);
 for(const n of used)assert(n>=0&&n<PACK_COUNT);
});

test('worker serves packed pages, redirects and retired URLs with the server status codes',async()=>{
 const packed=await call('/ncaa/far-future-vs-game');assert.equal(packed.status,200);assert.equal(await packed.text(),'<h1>packed page</h1>');assert.equal(packed.headers.get('x-frame-options'),'DENY');
 const moved=await call('/premier-league/old-name-vs-club?country=ES&countryMode=manual');assert.equal(moved.status,301);assert.equal(moved.headers.get('location'),'/premier-league/new-name-vs-club?country=ES&countryMode=manual');
 assert.equal((await call('/uefa-champions-league/ajax-vs-celtic')).status,410);
 const dated=await call('/uefa-champions-league/barcelona-vs-aston-villa-2025-10-01');assert.equal(dated.status,301);assert.equal(dated.headers.get('location'),'/uefa-champions-league/barcelona-vs-aston-villa');
 const legacy=await call('/sg/actor/7550-lina-bernardi');assert.equal(legacy.status,410);assert.equal(legacy.headers.get('x-robots-tag'),'noindex');assert.match(await legacy.text(),/ALL ABOUT SPORT/);assert.match(await (await call('/movie/550')).text(),/whoplaysnow\.com\/movie\/550"/);
 const missing=await call('/nothing/here-at-all');assert.equal(missing.status,404);assert.match(await missing.text(),/MATCH NOT FOUND/);
 const page=await call('/not-a-page');assert.equal(page.status,404);assert.match(await page.text(),/href="https:\/\/whoplaysnow\.com\/not-a-page"/);
 assert.equal((await call('/Premier-League/X')).headers.get('location'),'https://whoplaysnow.com/premier-league/x');
 const headOnly=await call('/ncaa/far-future-vs-game',{},'HEAD');assert.equal(headOnly.status,200);assert.equal(await headOnly.text(),'');
 assert.equal((await call('/x',{},'POST')).status,405);
});

test('worker localises the channel directory, location and broadcaster panel per visitor',async()=>{
 assert.equal(await (await call('/channels',{'CF-IPCountry':'ES'})).text(),'channels ES auto');
 assert.equal(await (await call('/channels?country=FR&countryMode=manual',{'CF-IPCountry':'ES'})).text(),'channels FR manual');
 assert.deepEqual(await (await call('/api/location',{'CF-IPCountry':'MA'})).json(),{country:'MA'});
 const panel:any=await (await call('/api/event/espn-1?country=ES')).json();
 assert.equal(panel.event.id,'espn-1');assert.match(panel.broadcastHtml,/M\+ Liga de Campeones 2/);assert.match(panel.broadcastHtml,/Official broadcasters/);
 const aliased:any=await (await call('/api/event/tsdb-9?country=US')).json();assert.match(aliased.broadcastHtml,/Paramount\+/);
 assert.equal((await call('/api/event/nope')).status,404);
 const ics=await call('/calendar/espn-1.ics');assert.equal(ics.headers.get('content-type'),'text/calendar; charset=utf-8');assert.match(await ics.text(),/URL:https:\/\/whoplaysnow.com\/uefa-champions-league\/barcelona-vs-aston-villa/);
});
