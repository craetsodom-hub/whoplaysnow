import test from 'node:test'
import assert from 'node:assert/strict'
import { fixtureVenue, venueLocation } from './venue.ts'
import { espnMatches } from './europe.ts'
import { mergeOfficialMatches } from './official.ts'
import { preparePublication } from './publication.ts'
const checkedAt='2026-10-24T14:00:00Z', now=Date.parse(checkedAt)
const sourceUrl='https://www.espn.com/nfl/game/_/gameId/401873011/steelers-saints'
const source={fullName:'Stade de France',address:{city:'Saint-Denis',country:'France'}}
const league={key:'nfl',name:'NFL',country:'US',espn:'nfl',sport:'american-football',category:'football'}
const payload={leagues:[{slug:'nfl'}],events:[{id:'401873011',date:'2026-10-25T13:30Z',links:[{href:sourceUrl}],competitions:[{id:'401873011',timeValid:true,status:{type:{name:'STATUS_SCHEDULED',state:'pre'}},neutralSite:true,venue:source,competitors:[{homeAway:'home',team:{id:'1',displayName:'Saints'}},{homeAway:'away',team:{id:'2',displayName:'Steelers'}}]}]}]}
test('overseas and neutral fixtures use the actual source venue, not the league country or home ground',()=>{
 const [event]=espnMatches(payload,league,now)
 assert.equal(event.competitionCountry,'US')
 assert.deepEqual(event.venue,{name:'Stade de France',city:'Saint-Denis',country:'FR',sourceUrl,checkedAt:new Date(checkedAt).toISOString()})
 assert.deepEqual(venueLocation(event.venue),{'@type':'Place',name:'Stade de France',address:{'@type':'PostalAddress',addressLocality:'Saint-Denis',addressCountry:'FR'}})
 const missing=structuredClone(payload);delete missing.events[0].competitions[0].venue
 assert.equal(espnMatches(missing,league,now)[0].venue,undefined)
 assert.equal(venueLocation(undefined),undefined)
})
test('organizer street address remains verbatim and uncorroborated coordinates stay out of markup',()=>{
 const venue=fixtureVenue({name:'Spotify Camp Nou',city:'Barcelona',address:'Avenida Arístides Maillol s/n 08028 Barcelona.',latitude:'41.3472082',longitude:'1.7076351'},'https://www.laliga.com/partido/example',checkedAt)
 assert.equal(venue.streetAddress,'Avenida Arístides Maillol s/n 08028 Barcelona.')
 assert.equal(venue.country,undefined)
 assert.equal(venueLocation(venue).geo,undefined)
 assert.equal(venueLocation(venue).address.streetAddress,venue.streetAddress)
 for(const input of [{name:'TBD'},{name:'unknown'},null,{}])assert.equal(fixtureVenue(input,sourceUrl,checkedAt),undefined)
 assert.equal(fixtureVenue(source,'https://attacker.example/fixture',checkedAt),undefined)
 assert.equal(fixtureVenue(source,sourceUrl,'not-a-date'),undefined)
})
test('independent broadcast merges retain same-kickoff venues but never carry a venue across rescheduling',()=>{
 const [event]=espnMatches(payload,league,now)
 const next={...event,venue:undefined}
 assert.deepEqual(mergeOfficialMatches([event],[next])[0].venue,event.venue)
 assert.equal(mergeOfficialMatches([event],[{...next,startsAt:'2026-10-26T13:30:00Z'}])[0].venue,undefined)
 const prior=preparePublication(event,undefined,now)
 assert.equal(preparePublication({...event,venue:{...event.venue,checkedAt:'2026-10-24T15:00:00Z'}},prior,now+3600000).changedAt,prior.changedAt)
 assert.notEqual(preparePublication({...event,venue:{...event.venue,name:'New confirmed venue'}},prior,now+3600000).hash,prior.hash)
})
