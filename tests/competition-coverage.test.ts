import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FOOTBALL_COMPETITIONS,ESPN_TEAM_COMPETITIONS} from '../lib/matches/competitions';
import {espnMatches,collectEuropeanSchedules} from '../lib/matches/europe';
import {competitionDirectory} from '../lib/directory-pages';
import provenance from '../data/competition-artwork-provenance.json' with {type:'json'};
import {competitionPath} from '../public/core.js';

test('domestic cups and supercups have separate source identities and branded directory entries between editions',()=>{
 const required=['esp.copa_del_rey','esp.super_cup','eng.fa','eng.charity','ger.dfb_pokal','ger.super_cup','ita.coppa_italia','ita.super_cup','fra.coupe_de_france','fra.super_cup','uefa.super_cup','sco.cis','ned.cup'];
 const directory=competitionDirectory([]);
 for(const slug of required){
  const c=FOOTBALL_COMPETITIONS.find(c=>c.espn===slug);assert(c,slug);
  const row=directory.find(r=>r.name===c.name);assert(row,slug);assert(row.event.competitionLogo,slug);assert.equal(row.events.length,0);
 }
 assert.equal(new Set(directory.map(r=>competitionPath(r.name))).size,directory.length);
});

test('new competition artwork is served locally with source identity and unaltered file hashes',()=>{
 assert(provenance.entries.length>200);
 for(const row of provenance.entries){
  assert(/^https:\/\/(?:sports\.core\.api\.espn\.com|www\.thesportsdb\.com|www\.ncaa\.com|rfef\.es|fbf\.com\.bo|vrouweneredivisie\.nl)\//.test(row.sourceUrl));
  assert(['competition','parent-competition','organizer','category'].includes(row.identity));
  assert(existsSync('public'+row.asset),row.sourceKey);
  assert.equal(createHash('sha256').update(readFileSync('public'+row.asset)).digest('hex'),row.sha256);
  if(row.identity==='parent-competition')assert('parent' in row);
 }
});

const now=Date.parse('2026-11-01T12:00Z');
const event=()=>({id:'401928514',date:'2026-11-03T18:00Z',links:[{href:'https://www.espn.com/soccer/match/_/gameId/401928514/anaitasuna-alaves'}],competitions:[{id:'401928514',timeValid:true,status:{type:{name:'STATUS_SCHEDULED',state:'pre'}},competitors:[{homeAway:'home',team:{id:'50001',displayName:'Anaitasuna'}},{homeAway:'away',team:{id:'96',displayName:'Alavés'}}],geoBroadcasts:[{region:'us',type:{shortName:'Streaming'},media:{shortName:'ESPN+'}}]}]});
test('Copa del Rey keeps its own identity, exact kickoff and explicit country listing',()=>{
 const league=FOOTBALL_COMPETITIONS.find(c=>c.espn==='esp.copa_del_rey')!;
 const [row]=espnMatches({leagues:[{slug:league.espn}],events:[event()]},league,now,120);
 assert.equal(row.competition,'Copa del Rey');assert.equal(row.startsAt,'2026-11-03T18:00:00.000Z');assert(row.competitionLogo?.startsWith('/artwork/'));
 assert.deepEqual(row.broadcasts.map(b=>[b.channel,b.territory,b.evidenceLevel]),[['ESPN+','US','C']]);
 assert.equal(row.broadcasts.filter(b=>b.territory==='ES').length,0);
});
test('undrawn teams and unannounced kickoff times cannot become confirmed cup fixtures',()=>{
 const league=FOOTBALL_COMPETITIONS.find(c=>c.espn==='esp.super_cup')!;
 for(const change of ['time','team','same-team']){
  const e=event();if(change==='time')e.competitions[0].timeValid=false;
  if(change==='team')e.competitions[0].competitors[0].team={id:'0',displayName:'TBD'};
  if(change==='same-team')e.competitions[0].competitors[1].team=e.competitions[0].competitors[0].team;
  assert.deepEqual(espnMatches({leagues:[{slug:league.espn}],events:[e]},league,now,120),[]);
 }
});
test('college and other team sports are fetched daily across month boundaries, with the full college group',async()=>{
 const calls:URL[]=[];
 await collectEuropeanSchedules(Date.parse('2026-11-30T12:00Z'),async(url:any)=>{const u=new URL(url);calls.push(u);return new Response(JSON.stringify({leagues:[{slug:u.pathname.split('/').at(-2)}],events:[]}),{headers:{'content-type':'application/json'}})},3);
 for(const slug of ['wnba','nbl','college-football','mens-college-basketball','womens-college-basketball','cfl','ufl','mlb','mens-college-hockey']){
  assert(ESPN_TEAM_COMPETITIONS.some(c=>c.espn===slug));
  const rows=calls.filter(u=>u.pathname.includes('/'+slug+'/'));
  assert.equal(rows.length,4);assert(rows.some(u=>u.searchParams.get('dates')==='20261201'));
  if(slug==='college-football')assert(rows.every(u=>u.searchParams.get('groups')==='90'));
  if(slug.includes('college-basketball'))assert(rows.every(u=>u.searchParams.get('groups')==='50'));
 }
});
test('a day whitelist skips only known empty days inside its explicitly published calendar',async()=>{
 const calls:string[]=[];
 await collectEuropeanSchedules(Date.parse('2026-11-30T12:00Z'),async(url:any)=>{const u=new URL(url),slug=u.pathname.split('/').at(-2);calls.push(String(url));return new Response(JSON.stringify({leagues:[{slug,...(slug==='nbl'?{calendarType:'day',calendarIsWhitelist:true,calendarStartDate:'2026-11-30T00:00Z',calendarEndDate:'2026-12-08T23:59Z',calendar:['2026-12-04T07:00Z']}:{} )}],events:[]}),{headers:{'content-type':'application/json'}})},10);
 const dates=calls.filter(u=>u.includes('/nbl/')).map(u=>new URL(u).searchParams.get('dates'));
 assert(dates.includes('20261204'));assert(!dates.includes('20261205'));assert(dates.includes('20261210'));
});
test('an oversized source result fails explicitly rather than silently truncating the competition',()=>{
 const league=FOOTBALL_COMPETITIONS[0];
 assert.throws(()=>espnMatches({leagues:[{slug:league.espn}],events:Array.from({length:300},event)},league,now),/truncated/);
});
