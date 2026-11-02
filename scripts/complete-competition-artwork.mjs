import fs from 'node:fs';
import {createHash} from 'node:crypto';
const cache=JSON.parse(fs.readFileSync('data/artwork-cache.json'));
const events=JSON.parse(fs.readFileSync('runtime/schedule.json')).events;
const norm=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases={'Major League Soccer - Regular Season':'MLS','American NWSL':'NWSL','Spanish La Liga 2':'LaLiga Hypermotion'};
const missing=[...new Map(events.filter(e=>!cache.competitions[e.sport+'|'+norm(e.competition)]).map(e=>[e.competition,e])).values()];
const results=[];
for(const e of missing){
 const key=e.sport+'|'+norm(e.competition);const alias=aliases[e.competition];
 if(alias&&cache.competitions[e.sport+'|'+norm(alias)]){cache.competitions[key]=cache.competitions[e.sport+'|'+norm(alias)];continue;}
 const sourceEvent=events.find(x=>x.competition===e.competition&&x.sourceIds?.thesportsdb);
 if(!sourceEvent){results.push({competition:e.competition,status:'no source identity'});continue;}
 try{
 const source='https://www.thesportsdb.com/event/'+sourceEvent.sourceIds.thesportsdb;
 const html=await (await fetch(source,{signal:AbortSignal.timeout(12000)})).text();
 const schemas=[...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m=>JSON.parse(m[1]));
 const event=schemas.find(s=>s['@type']==='SportsEvent');
 const league=event?.organizer?.url;if(!league?.startsWith('https://www.thesportsdb.com/league/'))throw Error('No league identity');
 const page=await (await fetch(league,{signal:AbortSignal.timeout(12000)})).text();
 const logo=page.match(/https:\/\/r2\.thesportsdb\.com\/images\/media\/league\/badge\/[a-zA-Z0-9._-]+\.png/)?.[0];
 if(!logo)throw Error('No league badge');
 const r=await fetch(logo,{signal:AbortSignal.timeout(12000)});if(!r.ok||!r.headers.get('content-type')?.startsWith('image/png'))throw Error('Bad image');
 const buf=Buffer.from(await r.arrayBuffer());const path='/artwork/'+createHash('sha256').update(buf).digest('hex').slice(0,24)+'.png';fs.writeFileSync('public'+path,buf);cache.urls[logo]=path;cache.competitions[key]=path;results.push({competition:e.competition,source,league,logo,path});
 }catch(error){results.push({competition:e.competition,error:String(error)});}
}
for(const [a,b] of Object.entries(aliases)){if(cache.competitions['football|'+norm(b)])cache.competitions['football|'+norm(a)]=cache.competitions['football|'+norm(b)];}
fs.writeFileSync('data/artwork-cache.json',JSON.stringify(cache,null,2)+'\n');fs.writeFileSync('verification/competition-artwork-sources.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
