import test from 'node:test';
import assert from 'node:assert/strict';
import {visitorCountry,pageCountry} from '../lib/visitor-country';
import {compareEvents,competitionRank,eventImportance,competitionPriority,sports,renderMatches} from '../public/core.js';
test('current browsing country wins over legacy saved preferences; explicit page choices remain available',()=>{
 assert.equal(visitorCountry(undefined,'MA'),'MA');
 assert.equal(visitorCountry('FR','MA'),'FR');
 assert.equal(visitorCountry(undefined,'MA','wpn_country=US; other=1'),'MA');
 for(const edge of ['XX','T1','<script>','ma',undefined])assert.equal(visitorCountry(undefined,edge),'GB');
 assert.equal(visitorCountry('invalid','MA','wpn_country=XX'),'MA');
 for(const edge of ['ES','US','FR','JP','BR','MT','AU','ZA','IN','CA'])assert.equal(visitorCountry(undefined,edge,'wpn_country=GB'),edge);
 assert.equal(visitorCountry('auto','ES','wpn_country=US'),'ES');
});
test('every sport has a vector identity and a competition prominence policy',()=>{
 for(const [key,,icon] of sports){assert.ok(competitionPriority[key].length);assert.ok(icon.includes('<svg'));assert.ok(icon.includes('<path'));}
});
test('important leagues precede earlier minor fixtures and prominent matchups precede routine games',()=>{
 const make=(id,competition,title,startsAt,home,away)=>({id,competition,title,startsAt,sport:'football',canonicalSlug:id,broadcasts:[],homeTeam:{name:home},awayTeam:{name:away}});
 const minor=make('minor','League Two','A vs B','2026-11-01T10:00Z','A','B');
 const routine=make('routine','Premier League','A vs B','2026-11-01T12:00Z','A','B');
 const headline=make('headline','Premier League','Liverpool vs Arsenal','2026-11-01T20:00Z','Liverpool','Arsenal');
 assert.deepEqual([minor,routine,headline].sort(compareEvents).map(e=>e.id),['headline','routine','minor']);
 assert.ok(eventImportance({...routine,title:'Cup Final'})>eventImportance({...routine,title:'Cup Semi-final'}));
 assert.ok(competitionRank({sport:'formula1',competition:'Formula 1'})<100);
 const html=renderMatches([minor,routine,headline],{sport:'football',date:'2026-11-01',tz:'UTC',country:'MA',saved:[],view:'schedule'});
 assert.ok(html.indexOf('/premier-league/liverpool-vs-arsenal')<html.indexOf('/premier-league/a-vs-b'));assert.ok(html.indexOf('/premier-league/a-vs-b')<html.indexOf('/league-two/a-vs-b'));
});

test('old automatically appended country URLs cannot freeze the visitor location',()=>{assert.equal(pageCountry('ES',undefined,'MA'),'MA');assert.equal(pageCountry('US','auto','JP'),'JP');assert.equal(pageCountry('ES','manual','MA'),'ES');assert.equal(pageCountry('invalid','manual','MA'),'MA');});
