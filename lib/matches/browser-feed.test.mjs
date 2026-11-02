import test from 'node:test'
import assert from 'node:assert/strict'
import { packMatchFeed, unpackMatchFeed } from './browser-feed.ts'
import { discoverSchedule } from './discovery.ts'

test('packing preserves every fixture, territory, channel, expiry and evidence level', () => {
  const now = Date.parse('2026-10-24T09:00:00Z')
  const expiresAt = new Date(now + 86400000).toISOString()
  const broadcasts = ['ES', 'FR', 'GB', 'US'].map(territory => ({ territory, channel: `Channel ${territory}`, official: true, sourceType: 'official-event', sourceUrl: 'https://www.laliga.com/event', checkedAt: new Date(now).toISOString(), validUntil: expiresAt, languages: [], evidenceLevel: 'A' }))
  const feed = { state: 'ready', generatedAt: new Date(now).toISOString(), expiresAt, rejected: 0, events: Array.from({length:100}, (_,i) => ({ id:`espn-${100000+i}`, title:`Home ${i} vs Away`, competition:'LaLiga', sport:'football', startsAt:new Date(now+3600000+i*60000).toISOString(), homeTeam:null, awayTeam:null, broadcasts: i%2 ? broadcasts : [...broadcasts, {...broadcasts[0], validUntil:new Date(now+7200000).toISOString(), evidenceLevel:'C'}] })) }
  const packed = packMatchFeed(feed)
  const restored = unpackMatchFeed(JSON.parse(JSON.stringify(packed)))
  assert.deepEqual(restored, feed)
  assert.equal(packed.broadcasts.length, 5)
  assert.ok(JSON.stringify(packed).length < JSON.stringify(feed).length * .35)
  for (const country of ['ES','FR','GB','US','JP']) for (const query of ['', 'Channel ES', 'Home']) {
    const filters = {country, query, includeGlobal:true}
    assert.deepEqual(discoverSchedule(restored, filters, now), discoverSchedule(feed, filters, now))
  }
  assert.equal(unpackMatchFeed(feed), feed)
})

test('entity tables retain optional source facts and distinct evidence without mutating the input', () => {
  const now = Date.parse('2026-10-24T09:00:00Z'),expiresAt=new Date(now+86400000).toISOString()
  const home={name:'Same name',badgeUrl:'/first.png',sourceId:'123',sourceIds:{espn:'42'},aliases:['Home']}
  const channel={channel:'Channel',territory:'ES',languages:['es'],sourceUrl:'https://www.laliga.com/event',sourceType:'official-event',official:true,evidenceLevel:'A',validUntil:expiresAt}
  const base={id:'espn-1',title:'Home vs Away',sport:'football',competition:'LaLiga',startsAt:new Date(now+3600000).toISOString(),homeTeam:home,awayTeam:null,broadcasts:[channel]}
  const input={state:'ready',generatedAt:new Date(now).toISOString(),expiresAt,rejected:2,fixtureUpdates:[{id:'espn-9',phase:'Cancelled'}],sources:[{name:'Organizer',ok:true}],events:[
    {...base,canonicalSlug:'old-canonical--espn-1',competitionLogo:null,competitionCountry:'ES',phase:'Scheduled',venue:{name:'Neutral venue',country:'FR',sourceUrl:'https://www.laliga.com/event',checkedAt:new Date(now).toISOString()},broadcastRights:[{territory:'ES',holders:[{name:'Service',kind:'streaming'}],sourceType:'official-rights',sourceUrl:'https://www.laliga.com/rights',season:'2026-27',validThrough:'2027-06-30'}]},
    {...base,id:'espn-2',homeTeam:{...home,badgeUrl:'/second.png'},broadcastRights:[],broadcasts:[{...channel,evidenceLevel:'C',validUntil:new Date(now-1).toISOString()}]},
    {...base,id:'espn-3',phase:'Postponed',broadcasts:[]},
  ]}
  const before=structuredClone(input),packed=packMatchFeed(input)
  assert.deepEqual(unpackMatchFeed(JSON.parse(JSON.stringify(packed))),input)
  assert.deepEqual(input,before)
  assert.equal(packed.participants.length,3)
  assert.equal(packed.broadcasts.length,2)
  assert.equal(packed.competitions.length,2)
  assert.equal(packed.rights.length,2)
})

test('existing broadcast-table pages and empty expired feeds still decode', () => {
  const broadcast={channel:'Channel',territory:'GB',languages:[],sourceUrl:'https://www.skysports.com',official:true,sourceType:'official-event'}
  const row={id:'espn-1',title:'Fixture',sport:'football',competition:'League',startsAt:'2026-10-25T12:00:00Z',homeTeam:null,awayTeam:null,broadcasts:[0]}
  const header={state:'ready',generatedAt:null,expiresAt:null,rejected:0}
  const legacy={...header,encoding:'broadcast-table-v1',broadcasts:[broadcast],events:[row]}
  assert.deepEqual(unpackMatchFeed(legacy),{...header,events:[{...row,broadcasts:[broadcast]}]})
  for(const state of ['unavailable','expired']){
    const input={...header,state,events:[]}
    assert.deepEqual(unpackMatchFeed(JSON.parse(JSON.stringify(packMatchFeed(input)))),input)
  }
})
