import test from 'node:test';
import assert from 'node:assert/strict';
import {assignEventPaths,eventBasePath,publicEventPath} from '../public/event-routes.js';
import {eventPath,renderMatches} from '../public/core.js';
import {matchCalendar} from '../lib/calendar-export';
const fixture=(id='espn-401879246',startsAt='2026-11-01T16:30:00Z')=>({id,competition:'Premier League',sport:'football',title:'Liverpool vs Arsenal',startsAt,homeTeam:{name:'Liverpool'},awayTeam:{name:'Arsenal'},canonicalSlug:'liverpool-vs-arsenal--'+id,broadcasts:[]});
test('event pages use competition and participants across sports without provider IDs',()=>{
 assert.equal(eventPath(fixture()),'/premier-league/liverpool-vs-arsenal');
 assert.equal(eventBasePath({...fixture(),competition:'NBA',title:'Boston Celtics at LA Lakers',homeTeam:{name:'Los Angeles Lakers'},awayTeam:{name:'Boston Celtics'}}),'/nba/los-angeles-lakers-vs-boston-celtics');
 assert.equal(eventBasePath({...fixture(),competition:'Formula 1',title:'São Paulo Grand Prix',homeTeam:null,awayTeam:null}),'/formula-1/sao-paulo-grand-prix');
 assert.equal(eventBasePath({...fixture(),competition:'Süper Lig',homeTeam:{name:'Fenerbahçe'},awayTeam:{name:'Kasımpaşa'}}),'/super-lig/fenerbahce-vs-kasimpasa');
 assert.equal(eventBasePath({...fixture(),homeTeam:{name:'Strømsgodset'},awayTeam:{name:'Moss'}}),'/premier-league/stromsgodset-vs-moss');
});
test('repeated matchups get stable distinct dates, independent of array order and provider',()=>{
 const a=fixture(),b=fixture('sky-12345','2027-01-01T20:00:00Z'),c=fixture('nba-0000000001','2027-01-01T22:00:00Z');
 const initial=assignEventPaths([c,b,a]);
 assert.equal(initial.events.find(e=>e.id===a.id).canonicalPath,'/premier-league/liverpool-vs-arsenal');
 assert.equal(initial.events.find(e=>e.id===b.id).canonicalPath,'/premier-league/liverpool-vs-arsenal-2027-01-01');
 assert.equal(initial.events.find(e=>e.id===c.id).canonicalPath,'/premier-league/liverpool-vs-arsenal-2027-01-01-2');
 const refreshed=assignEventPaths([b,c],initial.registry);
 for(const e of refreshed.events)assert.equal(e.canonicalPath,initial.events.find(old=>old.id===e.id).canonicalPath);
 assert(!JSON.stringify(refreshed.events.map(publicEventPath)).includes('espn'));
});
test('name corrections and dated reschedules retain redirect aliases and never reassign an old page to another event',()=>{
 const initial=assignEventPaths([fixture(),fixture('espn-22222','2027-01-01T20:00Z')]);
 const changed=assignEventPaths([{...fixture(),competition:'FA Cup'},fixture('espn-22222','2027-01-02T20:00Z'),fixture('espn-33333','2027-02-01T20:00Z')],initial.registry);
 assert.equal(changed.events[0].canonicalPath,'/fa-cup/liverpool-vs-arsenal');
 assert(changed.events[0].publicPathAliases.includes('/premier-league/liverpool-vs-arsenal'));
 assert.equal(changed.events[1].canonicalPath,'/premier-league/liverpool-vs-arsenal-2027-01-02');
 assert(changed.events[1].publicPathAliases.includes('/premier-league/liverpool-vs-arsenal-2027-01-01'));
 assert.equal(changed.events[2].canonicalPath,'/premier-league/liverpool-vs-arsenal-2027-02-01');
});
test('unsafe or conflicting persisted routes fail closed',()=>{
 for(const entries of [{a:{path:'//evil.example/path',aliases:[]}},{a:{path:'/nba/a-vs-b',aliases:[]},b:{path:'/nba/a-vs-b',aliases:[]}}])assert.throws(()=>assignEventPaths([fixture()],{version:1,entries}));
});
test('rendered links and calendar details use the same clean canonical path',()=>{
 const e=assignEventPaths([fixture()]).events[0],path=publicEventPath(e);
 const html=renderMatches([e],{sport:'football',date:'2026-11-01',tz:'UTC',q:'',view:'schedule',saved:[],country:'MA'});
 assert(html.includes('href="'+path+'"'));assert(!html.includes('/matches/'));
 assert(matchCalendar(e,'https://whoplaysnow.com'+path).replace(/\r\n /g,'').includes('URL:https://whoplaysnow.com'+path));
});
test('a provider duplicate without participants merges into one page and its URL redirects',async()=>{
 const {reconcileEvents}=await import('../lib/snapshot');
 const espn={id:'espn-401861162',title:'Moldova vs Kazakhstan',sport:'football',competition:'UEFA Nations League',startsAt:'2026-11-13T17:00:00.000Z',homeTeam:{name:'Moldova'},awayTeam:{name:'Kazakhstan'},broadcasts:[]};
 const tsdb={id:'tsdb-2442832',title:'Moldova vs Kazakhstan',sport:'football',competition:'UEFA Nations League',startsAt:'2026-11-13T17:00:00.000Z',homeTeam:null,awayTeam:null,broadcasts:[{channel:'Sky Sport Calcio',territory:'IT'}]};
 // Yesterday both were published separately; the bare record took a dated URL.
 const before=assignEventPaths([espn,tsdb]);
 assert.equal(before.events.find((e:any)=>e.id===tsdb.id).canonicalPath,'/uefa-nations-league/moldova-vs-kazakhstan-2026-11-13');
 for(const order of [[tsdb,espn],[espn,tsdb]]){
  const merged=reconcileEvents(order);
  assert.equal(merged.length,1);
  assert.equal(merged[0].id,espn.id);
  assert.equal(merged[0].homeTeam.name,'Moldova');
  assert.equal(merged[0].broadcasts.length,1);
  const after=assignEventPaths(merged,before.registry).events[0];
  assert.equal(after.canonicalPath,'/uefa-nations-league/moldova-vs-kazakhstan');
  assert(after.publicPathAliases.includes('/uefa-nations-league/moldova-vs-kazakhstan-2026-11-13'));
 }
});
test('competition naming variants of one fixture reconcile',async()=>{
 const {reconcileEvents}=await import('../lib/snapshot');
 const a={id:'espn-401919978',title:'Qatar vs Australia',sport:'football',competition:'International Friendly',startsAt:'2026-11-13T14:45:00.000Z',homeTeam:{name:'Qatar'},awayTeam:{name:'Australia'},broadcasts:[]};
 const b={...a,id:'tsdb-2606353',competition:'International Friendlies',homeTeam:null,awayTeam:null};
 assert.equal(reconcileEvents([a,b]).length,1);
 // Different fixtures at the same time stay apart.
 assert.equal(reconcileEvents([a,{...b,title:'Japan vs Ghana'}]).length,2);
});
