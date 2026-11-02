import test from 'node:test';import assert from 'node:assert/strict';import {matchOfficialSchedules} from '../lib/matches/direct-official';
const now=Date.parse('2026-10-29T12:00Z');const event={id:'espn-401882822',title:'Barcelona vs Alaves',sport:'football',competition:'LaLiga',startsAt:'2026-10-31T20:00:00Z',homeTeam:{name:'Barcelona'},awayTeam:{name:'Alaves'},broadcasts:[],fixtureSource:{checkedAt:'2026-10-28T12:00Z'}};
const candidate={sport:'football',competition:'LaLiga',homeTeam:'Barcelona',awayTeam:'Alaves',startUtcEpochSeconds:Date.parse(event.startsAt)/1000,broadcasts:[{channelName:'beIN SPORTS 1',region:'MENA',displayRegion:'MENA',regionTerritories:['MA','QA'],rightsHolder:'beIN Sports',sourceType:'official-broadcaster-schedule',destinationVerified:true,sourceUrl:'https://www.beinsports.com/en-mena/tv-guide',verifiedAt:new Date(now).toISOString(),destinationType:'linear'}]};
test('direct official matching expands only supported rights countries and preserves fixture clocks',()=>{const [out]=matchOfficialSchedules([event],[candidate],now,now);assert.ok(out.broadcasts.some(b=>b.territory==='MA'));assert.ok(out.broadcasts.every(b=>['MA','QA'].includes(b.territory)&&b.official));assert.deepEqual(out.fixtureSource,event.fixtureSource);});
test('direct official matching rejects mismatched fixtures and stale cached assignments',()=>{assert.equal(matchOfficialSchedules([event],[{...candidate,awayTeam:'Valencia'}],now,now)[0].broadcasts.length,0);assert.equal(matchOfficialSchedules([event],[candidate],now-13*3600000,now)[0].broadcasts.length,0);});


test('direct official listings beyond one week survive normalization without extending evidence expiry',()=>{const starts=now+14*86400000;const later={...event,startsAt:new Date(starts).toISOString()};const [out]=matchOfficialSchedules([later],[{...candidate,startUtcEpochSeconds:starts/1000}],now,now);assert.ok(out.broadcasts.some(b=>b.territory==='MA'));assert.ok(out.broadcasts.every(b=>Date.parse(b.validUntil)<=now+12*3600000));});

test('official assignments survive a calendar above 5000 events without dropping later fixtures',()=>{
 const filler=Array.from({length:6000},(_,i)=>({...event,id:'filler-'+i,startsAt:'2026-11-04T20:00:00Z',homeTeam:{name:'Unrelated home '+i},awayTeam:{name:'Unrelated away '+i}}));
 const later={...event,id:'later',startsAt:'2026-11-05T20:00:00Z'};
 const output=matchOfficialSchedules([event,...filler,later],[candidate,{...candidate,startUtcEpochSeconds:Date.parse(later.startsAt)/1000}],now,now);
 assert.equal(output.length,6002);assert(output[0].broadcasts.some((b:any)=>b.territory==='MA'));assert(output.at(-1).broadcasts.some((b:any)=>b.territory==='QA'));
 assert(output.slice(1,-1).every((e:any)=>e.broadcasts.length===0));assert.deepEqual(output.at(-1).fixtureSource,event.fixtureSource);
});
test('ambiguous events across a validation boundary and conflicting source IDs cannot inherit channels',()=>{
 const filler=Array.from({length:6000},(_,i)=>({...event,id:'filler-'+i,startsAt:'2026-11-04T20:00:00Z'}));
 const ambiguous=matchOfficialSchedules([event,...filler,{...event,id:'same-fixture'}],[candidate],now,now);
 assert(ambiguous.every((e:any)=>!e.broadcasts.length));
 const conflicting=matchOfficialSchedules([event,{...event,title:'Different event',awayTeam:{name:'Valencia'}}],[candidate],now,now);
 assert(conflicting.every((e:any)=>!e.broadcasts.length));
});
