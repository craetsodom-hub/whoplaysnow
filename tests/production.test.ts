import test from 'node:test';
import assert from 'node:assert/strict';
import {espnMatches} from '../lib/matches/europe';
import {decorateEvent} from '../lib/artwork';
import {imageUrl,renderMatches,topCompetitions} from '../public/core.js';
import {eventMetadata,jsonLd} from '../lib/search-metadata';
import {competitionFromSource,fillMissingCompetitions} from '../lib/fixture-metadata';
test('missing competition enrichment requires the same event identity and never refreshes broadcast evidence',async()=>{
 const e={id:'tsdb-12345',sourceIds:{thesportsdb:'12345'},title:'Bulls vs Scarlets',startsAt:'2026-10-31T15:00:00Z',competition:'Rugby · competition not supplied',observedAt:'2026-10-29T07:00:00Z',broadcasts:[]};
 const row={'@type':'SportsEvent',name:e.title,startDate:e.startsAt,url:'https://www.thesportsdb.com/event/12345-bulls-scarlets',organizer:{name:'United Rugby Championship',url:'https://www.thesportsdb.com/league/4446'}};
 const html=(value:any)=>'<script type="application/ld+json">'+JSON.stringify(value)+'</script>';
 assert.equal(competitionFromSource(e,html(row)),'United Rugby Championship');
 assert.equal(competitionFromSource(e,html({...row,url:'https://www.thesportsdb.com/event/123456-other'})),undefined);
 assert.equal(competitionFromSource(e,html({...row,startDate:'2026-10-31T16:00:00Z'})),undefined);
 const [next]=await fillMissingCompetitions([e],async()=>new Response(html(row)));
 assert.equal(next.competition,'United Rugby Championship');assert.equal(next.observedAt,e.observedAt);assert.deepEqual(next.broadcasts,[]);
});
test('NBA and NHL source logos survive future collection without accepting another team or host',()=>{
 const now=Date.parse('2026-10-28T12:00Z');
 for(const sport of ['nba','nhl']){
 const league={key:sport,name:sport.toUpperCase(),espn:sport,category:sport==='nba'?'basketball':'hockey',sport:sport==='nba'?'basketball':'ice-hockey',country:'US'};
 const feed:any={leagues:[{slug:sport,logos:[{href:`https://a.espncdn.com/i/teamlogos/leagues/500/${sport}.png`}]}],events:[{id:'401892564',date:'2026-10-29T00:00Z',links:[{href:`https://www.espn.com/${sport}/game/_/gameId/401892564/away-home`}],competitions:[{id:'401892564',timeValid:true,status:{type:{name:'STATUS_SCHEDULED',state:'pre'}},competitors:['home','away'].map((side,i)=>({homeAway:side,team:{id:String(i+1),displayName:side,logo:`https://a.espncdn.com/i/teamlogos/${sport}/500/${i+1}.png`}}))}]}]};
 let [e]=espnMatches(feed,league,now);assert.ok(e.homeTeam?.badgeUrl?.includes('/'+sport+'/'));assert.ok(e.competitionLogo);
 feed.events[0].competitions[0].competitors[0].team.logo=`https://a.espncdn.com/i/teamlogos/${sport}/500/999.png`;
 [e]=espnMatches(feed,league,now);assert.equal(e.homeTeam?.badgeUrl,null);
 }
});
test('schema escapes hostile titles and does not invent location, offers or end time',()=>{
 const e:any={title:'Home </script><script>alert(1)</script>',startsAt:'2026-10-30T12:00Z',sport:'football'};
 const schema=eventMetadata(e,'https://whoplaysnow.com','/matches/test');assert.equal(schema.location,undefined);assert.equal(schema.endDate,undefined);assert.equal(schema.offers,undefined);assert.equal(jsonLd(schema).split('</script>').length,2);
});
test('artwork cannot inject javascript or protocol-relative URLs',()=>{assert.equal(imageUrl('javascript:alert(1)'), '');assert.equal(imageUrl('//evil.example/a.png'),'');assert.ok(imageUrl('/artwork/example.png'));});
test('artwork enrichment never creates or promotes broadcast availability',()=>{const e={sport:'basketball',competition:'NBA',homeTeam:{name:'Miami Heat'},broadcasts:[]};const out=decorateEvent(e);assert.equal(out.broadcasts.length,0);assert.ok(out.homeTeam.badgeUrl);assert.ok(out.competitionLogo);});
test('competition selector prioritizes only available leagues for the chosen sport and local day, capped at six',()=>{
 const names=['MLS','Championship','UEFA Europa League','Serie A','Ligue 1','Bundesliga','LaLiga','Premier League'];
 const events=names.map((competition,i)=>({id:String(i),title:'A vs B',sport:'football',competition,startsAt:'2026-10-30T20:00Z',broadcasts:[]}));
 events.push({id:'nba',title:'Basketball',sport:'basketball',competition:'NBA',startsAt:'2026-10-30T20:00Z',broadcasts:[]});
 const state={sport:'football',date:'2026-10-30',tz:'UTC',view:'schedule',saved:[],q:'',competition:'',country:'GB'};
 assert.deepEqual(topCompetitions(events,state).map(x=>x.event.competition),['Premier League','LaLiga','Bundesliga','Ligue 1','Serie A','UEFA Europa League']);
 assert.equal(topCompetitions(events,{...state,date:'2026-10-31'}).length,0);
 assert.deepEqual(topCompetitions(events,{...state,sport:'basketball'}).map(x=>x.event.competition),['NBA']);
 assert(!topCompetitions(events,state).some(x=>x.event.competition==='UEFA Champions League'));
});
