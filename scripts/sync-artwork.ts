import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {FOOTBALL_COMPETITIONS} from '../lib/matches/competitions';
const identity=JSON.parse(fs.readFileSync('data/utility-identity.json','utf8'));
const channels=JSON.parse(fs.readFileSync('data/channel-logos.json','utf8'));
const events=JSON.parse(fs.readFileSync('runtime/schedule.json','utf8')).events;
const output='data/artwork-cache.json';
const cache=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{urls:{},teams:{},competitions:{},channels:{}};
const norm=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const key=(sport:string,name:string)=>sport+'|'+norm(name);
const exists=(url:string)=>url?.startsWith('/')&&fs.existsSync('public'+url);
fs.mkdirSync('public/artwork',{recursive:true});
const failures:any[]=[];
async function download(url:string){
 if(!url?.startsWith('https://'))return undefined;
 if(exists(cache.urls[url]))return cache.urls[url];
 try{const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(String(r.status));const type=r.headers.get('content-type')||'';if(!/image\/(png|jpeg|webp|svg\+xml)/.test(type))throw Error('Not an image');const buf=Buffer.from(await r.arrayBuffer());if(buf.length>2_000_000)throw Error('Oversized');const ext=type.includes('svg')?'svg':type.includes('webp')?'webp':type.includes('jpeg')?'jpg':'png';if(ext==='svg'&&/<script|onload=|<foreignObject/i.test(buf.toString()))throw Error('Unsafe SVG');const path='/artwork/'+createHash('sha256').update(buf).digest('hex').slice(0,24)+'.'+ext;fs.writeFileSync('public'+path,buf);cache.urls[url]=path;return path;}catch(e){failures.push({url,error:String(e)});return undefined;}
}
const tasks:(()=>Promise<void>)[]=[];
for(const c of channels) tasks.push(async()=>{const path=exists(c.url)?c.url:await download(c.remoteUrl);if(path)for(const country of c.countries)for(const name of c.names)cache.channels[country+'|'+norm(name)]=path;});
const seen=new Set<string>();
for(const e of events){
 for(const t of [e.homeTeam,e.awayTeam].filter(Boolean)){
  const k=key(e.sport,t.name);if(seen.has(k))continue;seen.add(k);
  tasks.push(async()=>{const match=identity.clubs.find((x:any)=>x.sport===e.sport&&[x.name,...x.aliases].some((n:string)=>[t.name,...t.aliases||[]].some((v:string)=>norm(n)===norm(v))));let path=exists(match?.logo)?match.logo:undefined;
   if(!path&&t.badgeUrl)path=exists(t.badgeUrl)?t.badgeUrl:await download(t.badgeUrl);
   const id=t.sourceIds?.espn||t.sourceId?.match(/^espn:(\d+)$/)?.[1];
   const league=({'ice-hockey':'nhl',basketball:'nba','american-football':'nfl',baseball:'mlb',football:'soccer'} as any)[e.sport];
   if(!path&&id&&league)path=await download('https://a.espncdn.com/i/teamlogos/'+league+'/500/'+id+'.png');
   if(path)cache.teams[k]=path;
  });
 }
 for(const b of e.broadcasts)if(b.logoUrl)tasks.push(async()=>{const path=await download(b.logoUrl);if(path)cache.channels[b.territory+'|'+norm(b.channel)]=path;});
}
const comps=[...new Map(events.map((e:any)=>[key(e.sport,e.competition),e])).values()] as any[];
for(const e of comps)tasks.push(async()=>{
 const k=key(e.sport,e.competition);const match=identity.competitions.find((x:any)=>x.sport===e.sport&&[x.name,...x.aliases].some((n:string)=>norm(n)===norm(e.competition)));
 let path=exists(match?.logo)?match.logo:undefined;
 if(!path&&e.competitionLogo)path=await download(e.competitionLogo);
 const f=FOOTBALL_COMPETITIONS.find(x=>x.name===e.competition);
 const extra:any={'NHL':'hockey/nhl','NFL':'football/nfl','NBA':'basketball/nba','DFB-Pokal':'soccer/ger.dfb_pokal','EFL Cup':'soccer/eng.league_cup','UEFA Womens Champions League':'soccer/uefa.wchampions','Copa Argentina':'soccer/arg.copa','Formula 1':'racing/f1','German 2. Bundesliga':'soccer/ger.2'};
 const api=f?'soccer/'+f.espn:extra[e.competition];
 if(!path&&api)try{const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/'+api+'/scoreboard',{signal:AbortSignal.timeout(10000)});const data=await r.json();const logo=data.leagues?.[0]?.logos?.[0]?.href;if(logo)path=await download(logo);}catch{}
 if(path)cache.competitions[k]=path;
});
let done=0;async function worker(){while(tasks.length){const task=tasks.shift()!;await task();done++;if(done%100===0)console.log('Artwork tasks completed:',done);}}
await Promise.all(Array.from({length:6},worker));
fs.writeFileSync(output,JSON.stringify(cache,null,2)+'\n');
fs.mkdirSync('verification',{recursive:true});
fs.writeFileSync('verification/artwork-downloads.json',JSON.stringify({teams:Object.keys(cache.teams).length,competitions:Object.keys(cache.competitions).length,channelAliases:Object.keys(cache.channels).length,files:Object.keys(cache.urls).length,failures},null,2));
console.log(JSON.stringify({teams:Object.keys(cache.teams).length,competitions:Object.keys(cache.competitions).length,channels:Object.keys(cache.channels).length,failed:failures.length}));
