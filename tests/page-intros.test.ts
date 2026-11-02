import test from 'node:test';
import assert from 'node:assert/strict';
import {sportGuide,competitionIntro} from '../lib/page-intros';

const now=Date.parse('2026-11-02T12:00:00Z'),DAY=86400000;
const fixture=(competition:string,offset:number,over:any={})=>({sport:'basketball',competition,startsAt:new Date(now+offset).toISOString(),broadcasts:[{territory:'US',channel:'ESPN'}],...over});

test('sport pages summarise real fixtures and link every competition with upcoming games',()=>{
 const events=[fixture('NBA',DAY),fixture('NBA',10*DAY,{broadcasts:[{territory:'GB',channel:'Sky'}]}),fixture('Liga ACB',2*DAY),fixture('NBA',-DAY),fixture('NBA',3*DAY,{phase:'Postponed'})];
 const directory=[{name:'NBA',event:{sport:'basketball'},events:events.filter(e=>e.competition==='NBA')},{name:'Spanish Liga ACB',event:{sport:'basketball'},events:events.filter(e=>e.competition==='Liga ACB')},{name:'Six Nations',event:{sport:'rugby'},events:[]}];
 const html=sportGuide(events,directory,'basketball','Basketball',now);
 assert.match(html,/3 upcoming basketball fixtures across 2 competitions, 2 of them in the next 7 days\. TV listings currently cover 2 countries\./);
 assert.match(html,/<a href="\/competitions\/nba">NBA <small>2 fixtures<\/small><\/a>/);
 assert.match(html,/<a href="\/competitions\/spanish-liga-acb">Spanish Liga ACB <small>1 fixture<\/small><\/a>/);
 assert.doesNotMatch(html,/Six Nations/);
 assert.match(sportGuide([],[],'tennis','Tennis',now),/No tennis fixtures are published right now/);
 const many=Array.from({length:30},(_,i)=>({name:'Cup '+i,event:{sport:'basketball'},events:[fixture('Cup '+i,DAY)]}));
 assert.match(sportGuide(many.flatMap(r=>r.events),many,'basketball','Basketball',now),/<details><summary>Show all 30 competitions<\/summary>/);
});

test('competition intros name the date range and real broadcasters in key markets',()=>{
 const rights=[{code:'GB',holders:new Set(['Sky Sports','TNT Sports']),listed:new Set()},{code:'US',holders:new Set(),listed:new Set(['Peacock'])},{code:'NO',holders:new Set(['Viaplay']),listed:new Set()}];
 const events=[fixture('Premier League',DAY),fixture('Premier League',40*DAY)];
 const html=competitionIntro('Premier League',events,rights);
 assert.match(html,/2 upcoming Premier League fixtures, from 3 Nov 2026 to 12 Dec 2026\./);
 assert.match(html,/Broadcasters include Sky Sports and TNT Sports in the UK and Peacock in the US, with 3 countries listed below\./);
 assert.match(competitionIntro('Formula 1',[],[],'race'),/No upcoming Formula 1 races are published yet\./);
 assert.match(competitionIntro('<b>X</b>',[],[]),/&lt;b&gt;X&lt;\/b&gt;/);
});
