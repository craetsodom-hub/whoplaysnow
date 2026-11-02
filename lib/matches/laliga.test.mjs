import test from 'node:test'
import assert from 'node:assert/strict'
import { laligaSchedule, collectLaLiga, LALIGA_CONSUMER_SCHEDULE } from './laliga.ts'
import { mergeOfficialMatches } from './official.ts'
import { preparePublication } from './publication.ts'
const now=Date.parse('2026-10-24T09:00:00Z')
const team=(id,slug,nickname)=>({id,slug,nickname,name:nickname,boundname:nickname,shortname:slug.slice(0,3),shield:{url:'https://assets.laliga.com/assets/2019/06/07/medium/racing.png'}})
const match=(overrides={})=>({id:102344,slug:'temporada-2026-2027-laliga-ea-sports-r-racing-club-rcd-espanyol-de-barcelona-10',season:{slug:'temporada-2026-2027'},competition:{id:1,slug:'primera-division'},status:'PreMatch',date:'2026-10-24T14:15:00+00:00',time:'2026-10-24T14:15:00+00:00',home_team:team(49,'r-racing-club','R. Racing Club'),away_team:team(8,'rcd-espanyol','RCD Espanyol de Barcelona'),channels:[{id:'67',name:'DAZN',countries:[]}],...overrides})
const payload=(rows=[match()],second=[])=>({props:{pageProps:{matches:{'laliga-easports':rows,'laliga-hypermotion':second}}}})

test('the official consumer schedule supplies exact Spanish fixture/channel assignments',()=>{
 const [event]=laligaSchedule(payload(),now).events
 assert.equal(event.id,'espn-401882831')
 assert.equal(event.startsAt,'2026-10-24T14:15:00.000Z')
 assert.equal(event.broadcasts[0].territory,'ES')
 assert.equal(event.broadcasts[0].evidenceLevel,'A')
 assert.equal(event.broadcasts[0].destinationPrecision,'service')
 assert.equal(event.broadcasts[0].sourceUrl,'https://www.laliga.com/partido/'+match().slug)
 assert.equal(event.sourceIds.laliga,'102344')
 assert.ok(event.homeTeam.aliases.includes('Racing Santander'))
 assert.ok(event.awayTeam.aliases.includes('Espanyol'))
 assert.equal(event.fixtureSource.checkedAt,new Date(now).toISOString())
})

test('organizer channel artwork is retained only from the reviewed LaLiga asset host',()=>{
 const logo='https://assets.laliga.com/assets/2026/09/16/small/cf2f9db664e220f864789db422d830e5.png'
 const channel={id:'38',name:'Replay',countries:[],image:{url:logo,resizes:{small:logo}}}
 const [event]=laligaSchedule(payload([match({channels:[channel]})]),now).events
 assert.equal(event.broadcasts[0].logoUrl,logo)
 assert.equal(event.broadcasts[0].channel,'Replay')
 assert.equal(event.broadcasts[0].territory,'ES')
 for(const url of ['https://assets.laliga.com.evil.test/logo.png','javascript:alert(1)',logo+'?token=secret','https://assets.laliga.com/assets/2026/09/16/small/logo.svg']){
  const [row]=laligaSchedule(payload([match({channels:[{...channel,image:{url}}]})]),now).events
  assert.equal(row.broadcasts[0].logoUrl,undefined)
  assert.equal(row.broadcasts.length,1)
 }
});
test('unknown territories, invalid images, missing times and untrusted fixtures cannot invent listings',()=>{
 for(const change of [{time:null},{date:'2026-10-24T14:15:00'},{time:'2026-10-24T14:30:00Z'},{status:'FullTime'},{competition:{id:99,slug:'primera-division'}},{slug:'javascript-alert-1'},{home_team:team(8,'rcd-espanyol','Espanyol')}]) assert.equal(laligaSchedule(payload([match(change)]),now).events.length,0)
 assert.equal(laligaSchedule(payload([match({channels:[{id:'67',name:'Foreign TV',countries:[{id:'GB'}]}]})]),now).events[0].broadcasts.length,0)
 const noLogo=team(49,'r-racing-club','Racing');noLogo.shield.url='https://untrusted.example/image.png'
 assert.equal(laligaSchedule(payload([match({home_team:noLogo})]),now).events[0].homeTeam.badgeUrl,null)
 assert.throws(()=>laligaSchedule({props:{pageProps:{matches:{'laliga-easports':[]}}}},now))
})
test('postponed/cancelled organizer records withdraw their specific source event',()=>{
 for(const [status,phase]of [['Postponed','Postponed'],['Cancelled','Canceled'],['Canceled','Canceled']]) {
  const result=laligaSchedule(payload([match({status,time:null})]),now)
  assert.deepEqual(result.events,[])
  assert.deepEqual(result.fixtureUpdates,[{id:'espn-401882831',phase}])
 }
})
test('LaLiga Hypermotion stays a separate competition and keeps every published channel',()=>{
 const row=match({id:102744,slug:'temporada-2026-2027-laliga-hypermotion-cordoba-cf-sd-eibar-11',competition:{id:2,slug:'segunda-division'},home_team:team(100,'cordoba-cf','Córdoba CF'),away_team:team(101,'sd-eibar','SD Eibar'),channels:[{id:22,name:'LALIGA TV HYPERMOTION'},{id:23,name:'Orange Fútbol 2'}]})
 const [event]=laligaSchedule(payload([], [row]),now).events
 assert.equal(event.competitionKey,'la-liga-2')
 assert.equal(event.broadcasts.length,2)
 assert.ok(event.broadcasts.every(b=>b.territory==='ES'))
})
test('a fresh organizer allocation preserves the canonical fixture and participant identities',()=>{
 const [organizer]=laligaSchedule(payload(),now).events
 const prior={...organizer,title:'Racing Santander vs Espanyol',sourceIds:{espn:'401882831'},homeTeam:{name:'Racing Santander',aliases:[],sourceId:'espn:87',badgeUrl:'https://a.espncdn.com/i/teamlogos/soccer/500/87.png'},awayTeam:{name:'Espanyol',aliases:[],sourceId:'espn:88',badgeUrl:'https://a.espncdn.com/i/teamlogos/soccer/500/88.png'},broadcasts:[]}
 const [merged]=mergeOfficialMatches([prior],[organizer])
 assert.equal(merged.id,prior.id)
 assert.equal(merged.sourceIds.espn,'401882831')
 assert.equal(merged.sourceIds.laliga,'102344')
 assert.equal(merged.homeTeam.sourceIds.espn,'87')
 assert.equal(merged.homeTeam.sourceIds.laliga,'49')
 assert.ok(merged.homeTeam.aliases.includes('Racing Santander'))
 const previous=preparePublication(prior,undefined,now)
 assert.equal(preparePublication(merged,previous,now+1000).slug,previous.slug)
 assert.equal(merged.broadcasts[0].channel,'DAZN')
 const other={...organizer,id:'different-event',startsAt:'2026-10-25T14:15:00Z'}
 assert.equal(mergeOfficialMatches([prior],[other]).length,2)
})
test('the collector uses one fixed public page and fails closed on unavailable source content',async()=>{
 let url
 const result=await collectLaLiga(now,async input=>{url=input;return new Response('<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(payload())+'</script>',{headers:{'Content-Type':'text/html'}})})
 assert.equal(url,LALIGA_CONSUMER_SCHEDULE)
 assert.equal(result.events.length,1)
 assert.equal(result.sources[0].ok,true)
 for(const response of [new Response('unavailable',{status:503}),new Response('<html>Changed format</html>',{headers:{'content-type':'text/html'}})]) {
  const result=await collectLaLiga(now,async()=>response)
  assert.equal(result.events.length,0)
  assert.equal(result.sources[0].ok,false)
 }
})

test('an explicit organizer withdrawal of the kickoff time is not ignored',()=>{
 const result=laligaSchedule(payload([match({time:null})]),now)
 assert.equal(result.events.length,0)
 assert.deepEqual(result.fixtureUpdates,[{id:'espn-401882831',phase:'Kickoff to be confirmed'}])
})

test('identical teams and kickoff never merge different recognized divisions',()=>{
 const [event]=laligaSchedule(payload(),now).events
 const other={...event,id:'another-id',competition:'LaLiga Hypermotion',competitionKey:'la-liga-2'}
 assert.equal(mergeOfficialMatches([event],[other]).length,2)
})

test('a newer complete organizer allocation retires its old channel without erasing independent countries',()=>{
 const [event]=laligaSchedule(payload(),now).events
 const old={...event.broadcasts[0],channel:'Old channel',checkedAt:new Date(now-3600000).toISOString()}
 const independent={...old,channel:'Independent guide',sourceType:'direct-publisher',sourceUrl:'https://www.espn.com/soccer/match/_/gameId/401882831'}
 const foreign={...old,territory:'FR',channel:'French channel'}
 const previous=preparePublication({...event,broadcasts:[old,independent,foreign]},undefined,now-1000)
 const next=preparePublication(event,previous,now)
 assert.deepEqual(next.event.broadcasts.map(b=>b.channel).sort(),['DAZN','French channel','Independent guide'])
 const older={...event,broadcasts:[{...event.broadcasts[0],checkedAt:new Date(now-7200000).toISOString()}]}
 assert.ok(preparePublication(older,previous,now).event.broadcasts.some(b=>b.channel==='Old channel'))
})
