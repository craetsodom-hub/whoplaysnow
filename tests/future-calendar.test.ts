import test from 'node:test';
import assert from 'node:assert/strict';
import {collectEuropeanSchedules} from '../lib/matches/europe';
import {auditFutureSchedule} from '../lib/future-quality';
import {reconcileEvents,publicEvents} from '../lib/snapshot';
import {matchCalendar} from '../lib/calendar-export';
import {eventMetadata} from '../lib/search-metadata';
const now=Date.parse('2026-11-01T12:00Z');
const fixture=(at=now)=>({id:'espn-123456',title:'Home vs Away',sport:'football',competition:'Premier League',startsAt:'2027-01-15T15:00Z',canonicalSlug:'home-vs-away--espn-123456',homeTeam:{name:'Home',badgeUrl:'/home.png'},awayTeam:{name:'Away',badgeUrl:'/away.png'},competitionLogo:'/league.png',fixtureSource:{name:'ESPN',url:'https://www.espn.com/soccer/match/_/gameId/123456',checkedAt:new Date(at).toISOString()},broadcasts:[]});
const empty=async(url:any)=>new Response(JSON.stringify({leagues:[{slug:new URL(url).pathname.split('/').at(-2)}],events:[]}),{headers:{'content-type':'application/json'}});
test('four-month calendar refreshes distant dates, preserves evidence clocks on cache hits and retries expired slices',async()=>{
 const seed:any={version:1,slices:{'eng.1|202701':{checkedAt:new Date(now-3600000).toISOString(),events:[fixture(now-3600000)],fixtureUpdates:[]}}};
 const calls:string[]=[];
 const cached=await collectEuropeanSchedules(now,async(url:any)=>{calls.push(String(url));return empty(url)},120,seed);
 assert.equal(cached.events.find(e=>e.id==='espn-123456')?.fixtureSource?.checkedAt,seed.slices['eng.1|202701'].checkedAt);
 assert(!calls.some(url=>url.includes('/eng.1/')&&url.includes('dates=202701')));
 assert(calls.some(url=>url.includes('/nba/')&&url.includes('dates=202702')));
 assert(calls.some(url=>url.includes('/eng.1/')&&url.includes('dates=202611')));
 assert.equal(cached.cache.slices['eng.1|202701'].checkedAt,seed.slices['eng.1|202701'].checkedAt);
 seed.slices['eng.1|202701'].checkedAt=new Date(now-13*3600000).toISOString();seed.slices['eng.1|202701'].events=[fixture(now-13*3600000)];
 const retry=await collectEuropeanSchedules(now,async(url:any)=>String(url).includes('/eng.1/')&&String(url).includes('dates=202701')?new Response('',{status:503}):empty(url),120,seed);
 assert.equal(retry.events.find(e=>e.id==='espn-123456')?.fixtureSource?.checkedAt,seed.slices['eng.1|202701'].checkedAt);
 assert.equal(retry.sources.find(s=>s.name==='ESPN · Premier League · 202701')?.ok,false);
 seed.slices['eng.1|202701'].checkedAt=new Date(now-49*3600000).toISOString();
 const expired=await collectEuropeanSchedules(now,async(url:any)=>String(url).includes('/eng.1/')&&String(url).includes('dates=202701')?new Response('',{status:503}):empty(url),120,seed);
 assert(!expired.events.some(e=>e.id==='espn-123456'));
});
test('new official responses replace cached fixtures, including removals and reschedules',async()=>{
 const checkedAt=new Date(now-13*3600000).toISOString();
 const result=await collectEuropeanSchedules(now,empty,120,{version:1,slices:{'eng.1|202701':{checkedAt,events:[fixture(now-13*3600000) as any],fixtureUpdates:[]}}});
 assert(!result.events.some(e=>e.id==='espn-123456'));
 assert.equal(result.cache.slices['eng.1|202701'].checkedAt,new Date(now).toISOString());
});
test('quality audit counts stale fixtures and coverage gaps without inventing channels or dropping events',()=>{
 const good:any={...fixture(),startsAt:'2026-11-02T15:00Z',broadcasts:[{channel:'Official TV',territory:'GB',logoUrl:'/tv.png',sourceUrl:'https://www.skysports.com/event',official:true,evidenceLevel:'A',checkedAt:new Date(now).toISOString(),validUntil:new Date(now+3600000).toISOString()}]};
 const stale={...fixture(now-49*3600000),id:'espn-123457',canonicalSlug:'stale',startsAt:'2026-11-03T15:00Z'};
 const unknown={...fixture(),id:'espn-123458',canonicalSlug:'unknown',startsAt:'2026-11-04T15:00Z'};
 const report=auditFutureSchedule({generatedAt:new Date(now).toISOString(),events:[good,stale,unknown]},now);
 assert.equal(report.upcomingEvents,3);assert.equal(report.staleFixtures,1);assert.equal(report.windows[0].withAnyListing,1);assert.equal(report.windows[0].withoutAnyListing,2);
 assert.equal(report.windows[0].disruptedOrUnconfirmed,1);assert.deepEqual(report.issueCounts,{});assert.deepEqual(report.markets,[{country:'GB',withListing:1}]);
});
test('quality audit detects invalid metadata, duplicates and unsafe channel evidence',()=>{
 const e:any={...fixture(),broadcasts:[{channel:'Wrong',territory:'XX',sourceUrl:'javascript:alert(1)',checkedAt:new Date(now+3600000).toISOString(),official:true,evidenceLevel:'C'}]};
 const report=auditFutureSchedule({events:[e,{...e,competitionLogo:null}]},now);
 for(const code of ['duplicate-id','duplicate-slug','duplicate-fixture','invalid-broadcast','invalid-broadcast-clock','invalid-official-evidence','missing-channel-artwork','missing-event-artwork'])assert(report.issueCounts[code]>0,code);
});
test('MLS aliases share competition artwork and retain old provider URLs',()=>{
 const e:any={...fixture(),competition:'MLS'};
 const rows=reconcileEvents([e,{...e,id:'tsdb-987654',competition:'American Major League Soccer'}]);
 assert.equal(rows.length,1);assert.equal(rows[0].competition,'MLS');
});
test('calendar exports preserve Unicode, escape injected properties and distinguish tentative and cancelled fixtures',()=>{
 const e={...fixture(),title:'Équipe; '.repeat(30)+'\r\nSTATUS:CONFIRMED',venue:{name:'Ground, North',city:'Paris',country:'FR'}};
 const url='https://whoplaysnow.com/matches/example';
 const ics=matchCalendar(e,url,now),unfolded=ics.replace(/\r\n /g,'');
 assert(ics.includes('STATUS:CONFIRMED\r\n'));assert(unfolded.includes('\\nSTATUS:CONFIRMED'));assert(unfolded.includes('LOCATION:Ground\\, North\\, Paris\\, FR'));
 for(const line of ics.split('\r\n'))assert(Buffer.byteLength(line)<=75);
 assert(unfolded.includes('Équipe\\; '.repeat(30)));
 assert(matchCalendar({...e,phase:'Postponed'},url,now).includes('STATUS:TENTATIVE'));
 assert(matchCalendar({...e,phase:'Cancelled'},url,now).includes('STATUS:CANCELLED'));
 assert(matchCalendar({...e,fixtureSource:{...e.fixtureSource,checkedAt:new Date(now-49*3600000).toISOString()}},url,now).includes('STATUS:TENTATIVE'));
 assert(!ics.includes('DTEND:'));
});
test('search metadata omits unconfirmed kickoffs while preserving source-backed dates and cancellation status',()=>{
 const e=fixture();assert.equal(eventMetadata(e,'https://whoplaysnow.com','/example').startDate,e.startsAt);
 assert.equal(eventMetadata({...e,phase:'Kickoff to be confirmed'},'https://whoplaysnow.com','/example').startDate,undefined);
 assert.equal(eventMetadata({...e,phase:'Cancelled'},'https://whoplaysnow.com','/example').eventStatus,'https://schema.org/EventCancelled');
});
test('old fixture observations cannot erase an explicit postponement or cancellation',()=>{
 for(const phase of ['Postponed','Cancelled','Kickoff to be confirmed'])assert.equal(publicEvents([{...fixture(now-49*3600000),phase}],now)[0].phase,phase);
 assert.equal(publicEvents([fixture(now-49*3600000)],now)[0].phase,'Schedule to be confirmed');
});
