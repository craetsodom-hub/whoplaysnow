import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isLegacyPath} from '../lib/legacy';
import {teamPath,teamDirectory} from '../lib/teams';
import {eventIndexing,eventRobots,eventDescription,eventTitle,eventStructuredData,countryListings} from '../lib/event-seo';
import {updateSeoState,markSubmitted} from '../lib/seo-state';
import {buildSitemaps,sitemapIndex,urlset} from '../lib/sitemaps';
import {rightsByCountry} from '../lib/directory-pages';
import {eventIntro} from '../lib/page-intros';
import {assignEventPaths} from '../public/event-routes.js';

const now=Date.parse('2026-11-02T12:00:00Z'),DAY=86400000;
const iso=(offset:number)=>new Date(now+offset).toISOString();
const broadcast=(channel:string,territory:string,extra:any={})=>({channel,territory,official:true,evidenceLevel:'A',sourceType:'official-event',destinationPrecision:'channel',sourceUrl:'https://broadcaster.example/'+territory,checkedAt:iso(-3600000),validUntil:iso(3*DAY),languages:[],...extra});
const fixture=(over:any={})=>({id:'espn-1',title:'Barcelona vs Aston Villa',sport:'football',competition:'UEFA Champions League',startsAt:iso(DAY),homeTeam:{name:'Barcelona',badgeUrl:'/utility-identity/clubs/barcelona.png'},awayTeam:{name:'Aston Villa',badgeUrl:null},venue:{name:'Spotify Camp Nou',city:'Barcelona',country:'ES'},fixtureSource:{name:'ESPN',url:'https://www.espn.com/',checkedAt:iso(-3600000)},broadcasts:[broadcast('Paramount+','US'),broadcast('M+ Liga de Campeones 2','ES'),broadcast('TNT Sports 1','GB')],canonicalPath:'/uefa-champions-league/barcelona-vs-aston-villa',...over});

test('legacy film catalogue URLs are recognised without touching sports routes',()=>{
 for(const path of ['/movie/706857-bad-impulse','/tv/1399','/actor/239019-kit-harington','/sg/actor/7550-lina-bernardi','/sg/movie/1471660-untitled','/gb/streaming/netflix','/es/streaming/prime-video','/sitemap/catalog-000014.xml','/sitemaps/tv/44.xml','/_next/image','/gb','/search'])assert.equal(isLegacyPath(path),true,path);
 for(const path of ['/','/about','/competitions','/competitions/premier-league','/premier-league/arsenal-vs-chelsea','/nba/los-angeles-lakers-vs-boston-celtics','/teams/football/arsenal','/sports/basketball','/sitemap.xml','/sitemap-events-2026-11.xml','/robots.txt','/matches/x--espn-1','/api/schedule','/channels'])assert.equal(isLegacyPath(path),false,path);
});

test('team identities separate sports, women and age groups and skip placeholders',()=>{
 assert.equal(teamPath({sport:'football',competition:'Premier League'},{name:'Arsenal'}),'/teams/football/arsenal');
 assert.equal(teamPath({sport:'football',competition:'Women’s Super League'},{name:'Arsenal'}),'/teams/football/arsenal-women');
 assert.equal(teamPath({sport:'football',competition:'UEFA Womens Champions League'},{name:'Arsenal'}),'/teams/football/arsenal-women');
 assert.equal(teamPath({sport:'football',competition:'English Women\'s FA Cup'},{name:'Arsenal Women'}),'/teams/football/arsenal-women');
 assert.equal(teamPath({sport:'basketball',competition:'Liga ACB'},{name:'Real Madrid'}),'/teams/basketball/real-madrid');
 assert.equal(teamPath({sport:'football',competition:'FIFA Under-17 World Cup'},{name:'Spain'}),'/teams/football/spain-u17');
 assert.equal(teamPath({sport:'football',competition:'FIFA Under-17 Women\'s World Cup'},{name:'Spain'}),'/teams/football/spain-women-u17');
 for(const name of ['TBD','Winner Semi-final 1','W45','Team A/Team B',''])assert.equal(teamPath({sport:'football',competition:'FA Cup'},{name}),null,name);
 const rows=teamDirectory([fixture(),fixture({id:'espn-2',startsAt:iso(8*DAY)}),fixture({id:'espn-3',competition:'Spanish Liga F',homeTeam:{name:'Barcelona'},awayTeam:{name:'Real Madrid'}})],now);
 assert.equal(rows.get('/teams/football/barcelona').upcoming,2);assert.equal(rows.get('/teams/football/barcelona').indexable,true);
 assert.equal(rows.get('/teams/football/barcelona-women').indexable,false);
});

test('indexing lifecycle: verified, imminent or priority fixtures only; finished fixtures expire from results',()=>{
 const listed=eventIndexing(fixture(),now);
 assert.deepEqual(listed,{indexable:true,sitemap:true,unavailableAfter:'2026-11-05T12:00:00+00:00'});
 assert.equal(eventRobots(listed),'max-image-preview:large, unavailable_after: 2026-11-05T12:00:00+00:00');
 const farLowerLeague=fixture({competition:'NCAA Women’s Basketball',sport:'basketball',startsAt:iso(40*DAY),broadcasts:[]});
 assert.equal(eventIndexing(farLowerLeague,now).indexable,false);
 assert.equal(eventIndexing({...farLowerLeague,startsAt:iso(5*DAY)},now).indexable,true);
 assert.equal(eventIndexing(fixture({competition:'Premier League',startsAt:iso(60*DAY),broadcasts:[]}),now).indexable,true);
 assert.equal(eventRobots(eventIndexing(fixture({phase:'Schedule to be confirmed'}),now)),'noindex,follow');
 const postponed=eventIndexing(fixture({phase:'Postponed'}),now);assert.equal(postponed.indexable,true);assert.equal(postponed.unavailableAfter,null);
 assert.equal(eventIndexing(fixture({startsAt:iso(-13*3600000)}),now).sitemap,false);
});

test('titles and descriptions name the fixture, date and real channels by country',()=>{
 const e=fixture();
 assert.equal(eventTitle(e),'Barcelona vs Aston Villa — TV channel & where to watch (3 Nov 2026)');
 const description=eventDescription(e);
 assert.match(description,/^Barcelona vs Aston Villa \(UEFA Champions League\): Tue 3 Nov 2026, 12:00 UK time\. Watch on M\+ Liga de Campeones 2 \(Spain\), TNT Sports 1 \(UK\), Paramount\+ \(US\)\.$/);
 const many=fixture({broadcasts:['GB','US','FR','DE','IT','PT','NL','CA','AU','IN','BR','MX'].map(c=>broadcast('Very Long Sports Network Name '+c,c))});
 const text=eventDescription(many);assert(text.length<=170,text);assert.match(text,/and in \d+ more countries\.$/);
 assert.match(eventDescription(fixture({broadcasts:[]})),/Kick-off time and TV channels by country/);
 assert.match(eventDescription(fixture({phase:'Cancelled'})),/has been cancelled/);
 assert.equal(countryListings(fixture({broadcasts:[broadcast('beIN SPORTS 1','FR',{feedLabel:'FR'}),broadcast('Paramount+','US')]}))[1].channels[0],'beIN SPORTS 1 FR');
});

test('event markup fills performer, organizer, endDate and attendance mode only from real data',()=>{
 const g:any=eventStructuredData(fixture(),'https://whoplaysnow.com','/uefa-champions-league/barcelona-vs-aston-villa')['@graph'][0];
 assert.deepEqual(g.performer.map((t:any)=>t.name),['Barcelona','Aston Villa']);
 assert.deepEqual(g.organizer,{'@type':'SportsOrganization',name:'UEFA Champions League',url:'https://whoplaysnow.com/competitions/uefa-champions-league'});
 assert.equal(g.endDate,new Date(Date.parse(fixture().startsAt)+115*60000).toISOString());
 assert.equal(g.eventAttendanceMode,'https://schema.org/OfflineEventAttendanceMode');
 assert.equal(g.offers,undefined);
 const nfl:any=eventStructuredData(fixture({sport:'american football',competition:'NFL'}),'https://whoplaysnow.com','/x/y')['@graph'][0];
 assert.equal(Date.parse(nfl.endDate)-Date.parse(nfl.startDate),195*60000);
 // No honest estimate or no real organizer: leave the field out.
 const other:any=eventStructuredData(fixture({sport:'tennis',competition:'International Friendly',venue:undefined}),'https://whoplaysnow.com','/x/y')['@graph'][0];
 assert.equal(other.endDate,undefined);assert.equal(other.organizer,undefined);assert.equal(other.eventAttendanceMode,undefined);
 const provisional:any=eventStructuredData(fixture({phase:'Schedule to be confirmed'}),'https://whoplaysnow.com','/x/y')['@graph'][0];
 assert.equal(provisional.endDate,undefined);
});

test('event intro answers when and where to watch from the fixture data only',()=>{
 const e=fixture({startsAt:'2026-11-21T12:30:00Z',venue:{name:'Etihad Stadium',city:'Manchester',country:'GB'},homeTeam:{name:'Manchester City'},awayTeam:{name:'Fulham'},competition:'Premier League'});
 const text=eventIntro(e,[{code:'GB',name:'United Kingdom',label:'UK',channels:['TNT Sports 1','discovery+']},{code:'US',name:'United States',label:'US',channels:['Peacock']}] as any);
 assert.equal(text,'Manchester City play Fulham in the Premier League on Saturday 21 November 2026 at Etihad Stadium, Manchester. Kick-off is 12:30 UK time (13:30 CET, 07:30 US Eastern). In the UK it is shown on TNT Sports 1 and discovery+. Broadcasters in 1 other country are listed below.');
 assert.match(eventIntro(e,[]),/No TV channel has been confirmed yet/);
 assert.match(eventIntro(fixture({phase:'Schedule to be confirmed'}),[]),/still to be confirmed/);
 assert.doesNotMatch(eventIntro(fixture({phase:'Schedule to be confirmed'}),[]),/Kick-off is/);
});

test('structured data links each verified listing to the event as a BroadcastEvent',()=>{
 const data:any=eventStructuredData(fixture(),'https://whoplaysnow.com',fixture().canonicalPath);
 const [event,...broadcasts]=data['@graph'];
 assert.equal(event['@type'],'SportsEvent');assert.equal(event.startDate,fixture().startsAt);assert.equal(event.homeTeam.url,'https://whoplaysnow.com/teams/football/barcelona');
 assert.deepEqual(event.image,['https://whoplaysnow.com/utility-identity/clubs/barcelona.png']);
 assert.equal(broadcasts.length,3);
 assert.deepEqual(broadcasts[0].publishedOn,{'@type':'BroadcastService',name:'M+ Liga de Campeones 2',broadcastDisplayName:'M+ Liga de Campeones 2',areaServed:{'@type':'Country',name:'Spain'}});
 assert.equal(broadcasts[0].broadcastOfEvent['@id'],event['@id']);
 const provisional:any=eventStructuredData(fixture({phase:'Schedule to be confirmed'}),'https://whoplaysnow.com','/x/y');
 assert.equal(provisional['@graph'][0].startDate,undefined);assert(provisional['@graph'].slice(1).every((b:any)=>!b.startDate));
});

test('sitemap lastmod changes only when visible content changes',()=>{
 const first=updateSeoState(null,[fixture()],now);assert.equal(first.seeded,true);
 const heartbeat=updateSeoState(first.state,[fixture({broadcasts:fixture().broadcasts.map((b:any)=>({...b,checkedAt:iso(0),validUntil:iso(9*DAY)})),fixtureSource:{name:'ESPN',checkedAt:iso(0)}})],now+3600000);
 assert.equal(heartbeat.changed.length,0);assert.equal(heartbeat.state.entries['espn-1'].changedAt,first.state.entries['espn-1'].changedAt);assert.equal(heartbeat.seeded,false);
 const newChannel=updateSeoState(heartbeat.state,[fixture({broadcasts:[...fixture().broadcasts,broadcast('DAZN','CA')]})],now+7200000);
 assert.equal(newChannel.changed.length,1);assert.equal(newChannel.state.entries['espn-1'].changedAt,'2026-11-02T14:00:00Z');
 const moved=updateSeoState(newChannel.state,[fixture({startsAt:iso(2*DAY),broadcasts:[...fixture().broadcasts,broadcast('DAZN','CA')]})],now+3*3600000);
 assert.equal(moved.changed.length,1);assert.equal(moved.state.entries['espn-1'].firstSeen,first.state.entries['espn-1'].firstSeen);
});

test('IndexNow announces every page version once, including unchanged new pages and retired URLs',()=>{
 const first=updateSeoState(null,[fixture()],now);
 const second=updateSeoState(first.state,[fixture(),fixture({id:'espn-2',canonicalPath:'/premier-league/b-vs-c'})],now+3600000);
 assert.deepEqual(second.pending.map((e:any)=>e.id),['espn-1','espn-2']);
 markSubmitted(second.state,['espn-1','espn-2']);
 const third=updateSeoState(second.state,[fixture()],now+7200000);
 assert.equal(third.pending.length,0);
 assert.deepEqual(third.removed,['/premier-league/b-vs-c']);
 const fourth=updateSeoState(third.state,[fixture({broadcasts:[...fixture().broadcasts,broadcast('DAZN','CA')]})],now+3*3600000);
 assert.deepEqual(fourth.pending.map((e:any)=>e.id),['espn-1']);assert.equal(fourth.removed.length,0);
});

test('sitemaps split by page type and kickoff month with trustworthy lastmod',()=>{
 const a=fixture(),b=fixture({id:'espn-2',startsAt:'2027-01-10T15:00:00Z',canonicalPath:'/laliga/real-madrid-vs-barcelona'});
 const files=buildSitemaps({pages:[{path:'/'}],competitions:[{path:'/competitions/uefa-champions-league',events:[a]}],teams:[],events:[b,a],state:{'espn-1':{changedAt:'2026-11-01T10:00:00Z'}}});
 assert.deepEqual([...files.keys()],['pages','competitions','events-2026-11','events-2027-01']);
 const index=sitemapIndex('https://whoplaysnow.com',files);
 assert.match(index,/<loc>https:\/\/whoplaysnow.com\/sitemap-events-2026-11.xml<\/loc><lastmod>2026-11-01T10:00:00Z<\/lastmod>/);
 assert.match(index,/<loc>https:\/\/whoplaysnow.com\/sitemap-events-2027-01.xml<\/loc><\/sitemap>/);
 assert.match(urlset('https://whoplaysnow.com',files.get('events-2026-11')!),/<url><loc>https:\/\/whoplaysnow.com\/uefa-champions-league\/barcelona-vs-aston-villa<\/loc><lastmod>2026-11-01T10:00:00Z<\/lastmod><\/url>/);
 assert.match(urlset('https://x.test',[{path:'/a?b=1&c=2'}]),/a\?b=1&amp;c=2/);
});

test('competition rights by country use current official rights and label match-listing fallbacks',()=>{
 const rights=[{territory:'ES',holders:[{name:'DAZN'},{name:'Movistar Plus+'}],sourceType:'official-rights',sourceUrl:'https://www.laliga.com/rights',season:'2026/27',validThrough:'2027-06-30'},{territory:'FR',holders:[{name:'Old Partner'}],sourceType:'official-rights',validThrough:'2025-06-30'},{territory:'IT',holders:[{name:'Rumour TV'}],sourceType:'press'}];
 const rows=rightsByCountry([fixture({broadcastRights:rights})],now);
 assert.deepEqual(rows.map(r=>[r.code,[...r.holders],[...r.listed]]),[['ES',['DAZN','Movistar Plus+'],['M+ Liga de Campeones 2']],['GB',[],['TNT Sports 1']],['US',[],['Paramount+']]]);
 assert.equal(rows[0].source,'https://www.laliga.com/rights');
});

async function withServer(files:Record<string,any>,run:(base:string)=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'wpn-seo-'));
 for(const [name,value] of Object.entries(files))await writeFile(join(dir,name),JSON.stringify(value));
 const port=34000+Math.floor(Math.random()*2000);
 const child=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,DATA_DIR:dir,PORT:String(port),SITE_ORIGIN:'https://whoplaysnow.com'},stdio:'ignore'});
 try{
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
  await run(base);
 }finally{child.kill();await rm(dir,{recursive:true,force:true});}
}

test('server: legacy 410s, expired fixture redirects, robots, sitemaps and event metadata',{timeout:60000},async()=>{
 const t=Date.now(),at=(offset:number)=>new Date(t+offset).toISOString();
 const live=(id:string,startsAt:string,over:any={})=>({...fixture({id,startsAt,fixtureSource:{name:'ESPN',url:'https://www.espn.com/',checkedAt:at(-3600000)},broadcasts:[broadcast('Paramount+','US',{checkedAt:at(-3600000),validUntil:at(3*DAY)}),broadcast('M+ Liga de Campeones 2','ES',{checkedAt:at(-3600000),validUntil:at(3*DAY)})],...over}),canonicalPath:undefined});
 const next=live('espn-9',at(30*DAY)),soon=live('espn-8',at(2*DAY),{homeTeam:{name:'Barcelona'},awayTeam:{name:'Inter'},title:'Barcelona vs Inter'});
 // The previous meeting has left the dataset but its URL is remembered.
 const registry={version:1,entries:{'espn-old':{base:'/uefa-champions-league/barcelona-vs-aston-villa',path:'/uefa-champions-league/barcelona-vs-aston-villa',dated:false,day:'2025-10-01',aliases:[]},'espn-gone':{base:'/uefa-champions-league/ajax-vs-celtic',path:'/uefa-champions-league/ajax-vs-celtic',dated:false,day:'2025-10-01',aliases:[]}}};
 const routed=assignEventPaths([next,soon],registry);
 const nextPath=routed.events.find((e:any)=>e.id==='espn-9').canonicalPath;
 assert.equal(nextPath,'/uefa-champions-league/barcelona-vs-aston-villa-'+next.startsAt.slice(0,10));
 await withServer({'schedule.json':{generatedAt:at(0),sources:[],events:[next,soon]},'event-routes.json':registry,'seo-state.json':{version:1,entries:{'espn-8':{changedAt:'2026-11-01T09:00:00Z'}}}},async base=>{
  const get=(path:string)=>fetch(base+path,{redirect:'manual'});
  for(const path of ['/movie/706857-bad-impulse','/sg/actor/7550-lina-bernardi','/gb/streaming/netflix','/sitemap/catalog-000014.xml']){const r=await get(path);assert.equal(r.status,410,path);assert.equal(r.headers.get('x-robots-tag'),'noindex');}
  const expired=await get('/uefa-champions-league/barcelona-vs-aston-villa');
  assert.equal(expired.status,301);assert.equal(expired.headers.get('location'),nextPath);
  assert.equal((await get('/uefa-champions-league/ajax-vs-celtic')).status,410);
  assert.equal((await get('/uefa-champions-league/nobody-vs-nothing')).status,404);
  const page=await (await get('/uefa-champions-league/barcelona-vs-inter')).text();
  assert.match(page,/<title>Barcelona vs Inter — TV channel &amp; where to watch \(\d+ \w+ \d{4}\)<\/title>/);
  assert.match(page,/<meta name="robots" content="max-image-preview:large, unavailable_after: [^"]+">/);
  assert.match(page,/<h1 class="event-matchup" aria-label="Barcelona vs Inter">/);
  assert.match(page,/Watch on M\+ Liga de Campeones 2 \(Spain\), Paramount\+ \(US\)/);
  assert.match(page,/<details class="country-guide"><summary>TV channels by country <span>\(2\)<\/span>/);
  assert.match(page,/"@type":"BroadcastEvent"/);
  assert.match(page,/href="\/teams\/football\/barcelona"/);
  const robots=await (await get('/robots.txt')).text();
  assert.match(robots,/Disallow: \/\*\?\*country=/);assert.doesNotMatch(robots,/Disallow: \/movie/);
  const index=await (await get('/sitemap.xml')).text();
  assert.match(index,/<sitemapindex/);assert.match(index,/sitemap-pages.xml/);assert.match(index,/sitemap-teams.xml/);
  const month='sitemap-events-'+soon.startsAt.slice(0,7)+'.xml';
  const events=await (await get('/'+month)).text();
  assert.match(events,/<loc>https:\/\/whoplaysnow.com\/uefa-champions-league\/barcelona-vs-inter<\/loc><lastmod>2026-11-01T09:00:00Z<\/lastmod>/);
  assert.equal((await get('/sitemap-nope.xml')).status,404);
  // Teams without artwork fall back to the sport icon instead of failing.
  assert.equal((await get('/teams/football/aston-villa')).status,200);
  const team=await get('/teams/football/barcelona');assert.equal(team.status,200);assert.match(await team.text(),/<meta name="robots" content="max-image-preview:large">/);
  assert.equal((await get('/a3382bc18e63463a8bc0c2c2b24fb7a7.txt')).status,200);
 });
});

test('server: competition watch pages per country exist only with a real answer and are linked and listed',{timeout:60000},async()=>{
 const t=Date.now(),at=(offset:number)=>new Date(t+offset).toISOString();
 const live=(id:string,offset:number,home:string,away:string,extra:any[]=[])=>({...fixture({id,startsAt:at(offset),title:home+' vs '+away,homeTeam:{name:home},awayTeam:{name:away},fixtureSource:{name:'ESPN',url:'https://www.espn.com/',checkedAt:at(-3600000)},broadcasts:[broadcast('M+ Liga de Campeones 2','ES',{checkedAt:at(-3600000),validUntil:at(9*DAY)}),...extra]}),canonicalPath:undefined});
 const us=[broadcast('Paramount+','US',{checkedAt:at(-3600000),validUntil:at(9*DAY)})];
 const events=[live('espn-1',DAY,'Barcelona','Inter',us),live('espn-2',2*DAY,'Ajax','Celtic'),live('espn-3',3*DAY,'Porto','Lazio')];
 await withServer({'schedule.json':{generatedAt:at(0),sources:[],events}},async base=>{
  const get=(path:string)=>fetch(base+path,{redirect:'manual'});
  const spain=await get('/competitions/uefa-champions-league/spain');assert.equal(spain.status,200);
  const html=await spain.text();
  assert.match(html,/<h1>Where to watch UEFA Champions League in Spain<\/h1>/);
  assert.match(html,/<link rel="canonical" href="https:\/\/whoplaysnow.com\/competitions\/uefa-champions-league\/spain">/);
  assert.match(html,/<meta name="robots" content="max-image-preview:large">/);
  assert.match(html,/match listings in Spain name M\+ Liga de Campeones 2/);
  assert.match(html,/Spain local time/);
  assert.match(html,/href="\/uefa-champions-league\/ajax-vs-celtic"/);
  // One listed fixture is not a viewing guide for a country.
  assert.equal((await get('/competitions/uefa-champions-league/united-states')).status,404);
  assert.equal((await get('/competitions/uefa-champions-league/Spain')).status,301);
  const competition=await (await get('/competitions/uefa-champions-league')).text();
  assert.match(competition,/<dt><a href="\/competitions\/uefa-champions-league\/spain">Spain<\/a><\/dt>/);
  const event=await (await get('/uefa-champions-league/ajax-vs-celtic')).text();
  assert.match(event,/<dt><a href="\/competitions\/uefa-champions-league\/spain">Spain<\/a><\/dt>/);
  assert.match(await (await get('/sitemap.xml')).text(),/sitemap-watch.xml/);
  assert.match(await (await get('/sitemap-watch.xml')).text(),/<loc>https:\/\/whoplaysnow.com\/competitions\/uefa-champions-league\/spain<\/loc>/);
 });
});
