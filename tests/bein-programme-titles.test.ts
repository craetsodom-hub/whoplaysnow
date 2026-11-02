import test from 'node:test';
import assert from 'node:assert/strict';
import {beinMenaAdapter,parseBeinMenaApi} from '../vendor/whoseiptv/scripts/broadcast/adapters/bein-mena.mjs';
import {matchOfficialSchedules,enrichOfficialSchedules} from '../lib/matches/direct-official';
// Synthetic allocations in the observed first-party EPG shape; these never seed production.
const now=Date.parse('2026-11-01T10:00:00Z');
const row=(channel='beIN SPORTS 1',league='English Premier League')=>({live:true,replay:false,startDate:'2026-11-01T16:00:00Z',channel:{name:channel,externalId:'10401',provider:{name:'epg.bein'}},data:{m_date:null,m_time:'',teama:'',teamb:'',competition_name:'',Live:'True',ChannelName:channel,ChannelCode:'10401',Duration:'03:15:00',Title:{English:`Liverpool vs Arsenal - ${league} 2026/2027 - Week 9`},Category:{English:league}}});
const fixture=()=>({id:'espn-401879246',sport:'football',competition:'Premier League',title:'Liverpool vs Arsenal',startsAt:'2026-11-01T16:30:00Z',homeTeam:{name:'Liverpool'},awayTeam:{name:'Arsenal'},fixtureSource:{checkedAt:new Date(now).toISOString()},broadcasts:[]});
test('beIN English Premier League programme titles reach Arabic and English viewing destinations',async()=>{
 const rows=[row(),row('beIN SPORTS EN 1')];
 const candidates=await beinMenaAdapter.collect({verifiedAt:new Date(now).toISOString(),fetchText:async(url:string)=>url.includes('/api/')?JSON.stringify({rows}):''});
 assert.equal(candidates.length,2);
 const [event]=matchOfficialSchedules([fixture()],candidates,now,now);
 const channels=event.broadcasts.filter(b=>b.territory==='MA');
 assert.deepEqual(new Set(channels.map(b=>b.channel)),new Set(['beIN SPORTS 1','beIN SPORTS EN 1']));
 assert(channels.every(b=>b.official&&b.evidenceLevel==='A'));
 assert(channels.every(b=>Date.parse(b.validUntil)<=now+12*3600000));
 assert.equal(event.startsAt,fixture().startsAt);
});
test('beIN full league names normalize without weakening programme identity checks',()=>{
 for(const separator of ['v','vs','v.','vs.']){const value=row();value.data.Title.English=value.data.Title.English.replace(' vs ',' '+separator+' ');assert.equal(parseBeinMenaApi({rows:[value]})[0]?.awayTeam,'Arsenal');}
 for(const [title,category,expected] of [['English Premier League','English Premier League','Premier League'],['Premier League','English Premier League','Premier League'],['French Ligue 1','French Ligue 1','Ligue 1'],['German Bundesliga','German Bundesliga','Bundesliga']]){
  const value=row('beIN SPORTS 1',title);value.data.Category.English=category;
  assert.equal(parseBeinMenaApi({rows:[value]})[0]?.competition,expected);
 }
 for(const mutate of [(r:any)=>r.data.Category.English='UEFA Youth League',(r:any)=>r.data.Title.English+=' Highlights',(r:any)=>r.data.teama='Partial identity',(r:any)=>r.replay=true,(r:any)=>r.live=false,(r:any)=>r.channel.provider.name='epg.apac.aus']){
  const value=row();mutate(value);assert.deepEqual(parseBeinMenaApi({rows:[value]}),[]);
 }
});
test('a recognized programme still requires matching teams, competition, kickoff window and territorial rights',async()=>{
 const candidates=await beinMenaAdapter.collect({verifiedAt:new Date(now).toISOString(),fetchText:async(url:string)=>url.includes('/api/')?JSON.stringify({rows:[row()]}):''});
 for(const change of [{awayTeam:{name:'Chelsea'}},{competition:'UEFA Champions League'},{startsAt:'2026-11-02T16:30:00Z'}])assert.equal(matchOfficialSchedules([{...fixture(),...change}],candidates,now,now)[0].broadcasts.length,0);
 const valid=matchOfficialSchedules([fixture()],candidates,now,now)[0];assert(!valid.broadcasts.some(b=>['ES','GB','US','TR'].includes(b.territory)));
});
test('one failed EPG page retains fresh matches and preserves old evidence on its original clock',async()=>{
 const oldTime=now-3600000;
 const old={adapter:'bein-mena',checkedAt:oldTime,candidates:[{sport:'football',competition:'Premier League',homeTeam:'Liverpool',awayTeam:'Arsenal',startUtcEpochSeconds:Date.parse(fixture().startsAt)/1000,broadcasts:[{channelName:'beIN SPORTS EN 1',region:'MENA',displayRegion:'MENA',regionTerritories:['MA'],rightsHolder:'beIN Sports',sourceType:'official-broadcaster-schedule',destinationVerified:true,sourceUrl:'https://www.beinsports.com/en-mena/tv-guide',verifiedAt:new Date(oldTime).toISOString(),destinationType:'linear'}]}]};
 const fetcher=async(url:any)=>String(url).includes('/api/opta/')?String(url).includes('offset=100')?new Response('',{status:503}):new Response(JSON.stringify({count:200,rows:[row()]})):new Response('');
 const out=await enrichOfficialSchedules([fixture()],{batches:[old]},fetcher as typeof fetch,now);
 assert(out.sources.find(s=>s.name.endsWith('bein-mena'))?.ok===false);
 const batches=out.cache.batches.filter(b=>b.adapter==='bein-mena');
 assert.equal(batches.length,2);assert.equal(batches[0].checkedAt,oldTime);assert.equal(batches[1].checkedAt,now);
 const listings=out.events[0].broadcasts.filter(b=>b.territory==='MA');
 assert(listings.some(b=>b.channel==='beIN SPORTS 1'));
 assert(listings.some(b=>b.channel==='beIN SPORTS EN 1'&&Date.parse(b.validUntil)===oldTime+12*3600000));
});
test('oversized beIN slots use corroborated explicit GMT kickoff without widening the matching window',async()=>{
 const rows=['beIN SPORTS 1','beIN SPORTS EN 1'].map((channel,i)=>{
  const r=row(channel);r.startDate=`2026-11-06T19:${i?'30':'45'}:00Z`;
  r.data.Duration=i?'05:30:00':'16:15:00';
  r.data.Title.English='Everton vs Coventry City - English Premier League 2026/2027 - Week 10';
  const editorial='Everton vs Coventry City\r\nAt 6-11-2026, MECCA 23:00, GMT 20:00\r\nPremier League\r\nSeason 2026/2027\r\nHill Dickinson Stadium Stadium\r\n';
  Object.assign(r.data,{Remarks:{English:editorial},Synopsis:{English:editorial}});return r;
 });
 for(const r of rows){const parsed=parseBeinMenaApi({rows:[r]})[0];assert.equal(parsed.startUtcEpochSeconds,Date.parse('2026-11-06T20:00:00Z')/1000);assert.equal(parsed.programmeWindow,undefined);}
 const source=await beinMenaAdapter.collect({verifiedAt:new Date(now).toISOString(),fetchText:async(url:string)=>url.includes('/api/')?JSON.stringify({rows}):''});
 const event={...fixture(),id:'espn-401879242',title:'Everton vs Coventry City',homeTeam:{name:'Everton'},awayTeam:{name:'Coventry City'},startsAt:'2026-11-06T20:00:00Z'};
 const recovered=matchOfficialSchedules([event],source,now,now)[0];
 assert.equal(recovered.broadcasts.filter(b=>b.territory==='MA').length,2);
 assert.equal(matchOfficialSchedules([{...event,startsAt:'2026-11-06T22:00:00Z'}],source,now,now)[0].broadcasts.length,0);
 for(const mutate of [(r:any)=>r.data.Synopsis.English+=' contradiction',(r:any)=>{r.data.Remarks.English=r.data.Synopsis.English=r.data.Remarks.English.replace('MECCA 23:00','MECCA 22:00')},(r:any)=>{r.data.Remarks.English=r.data.Synopsis.English=r.data.Remarks.English.replace('6-11-2026','30-2-2026')},(r:any)=>r.data.Remarks.English=r.data.Synopsis.English=r.data.Remarks.English.replace('Everton vs Coventry City','Everton vs Chelsea')]){
  const r=structuredClone(rows[0]);mutate(r);assert.deepEqual(parseBeinMenaApi({rows:[r]}),[]);
 }
});
