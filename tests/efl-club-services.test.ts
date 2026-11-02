import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {addGlobalServices} from '../lib/global-services';
import {eflStreamingTerritories} from '../lib/efl-club-services';
import reviewed from '../data/efl-club-services.json' with {type:'json'};
const now=Date.parse(reviewed.checkedAt)+1000;
const event={sport:'football',competition:'League One',startsAt:'2026-10-31T15:00:00.000Z',observedAt:new Date(now).toISOString(),homeTeam:{name:'Barnsley'},awayTeam:{name:'Burton Albion'},broadcasts:[{channel:'Sky Sports Football',territory:'GB',sourceUrl:'https://www.skysports.com'}]};
test('EFL club services use reviewed participant brands and overseas country restrictions',()=>{
 for(const territory of ['MA','MT','ES','FR','US','AU','JP']){const out=addGlobalServices(event,[territory],now);assert.deepEqual(out.broadcasts.map((b:any)=>b.channel),['Sky Sports Football','iFollow Barnsley','iFollow Brewers']);for(const b of out.broadcasts.slice(1)){assert.equal(b.territory,territory);assert.equal(b.destinationPrecision,'service');assert.equal(b.sourceUrl,reviewed.sourceUrl);assert.ok(existsSync('public'+b.logoUrl));assert.match(b.viewingUrl,/^https:/);}}
 assert.equal(addGlobalServices(event,undefined,now).broadcasts.length,1+2*eflStreamingTerritories.length);
 for(const territory of [...reviewed.excludedTerritories,'ZZ'])assert.equal(addGlobalServices(event,[territory],now).broadcasts.length,1);
 const projected=addGlobalServices(addGlobalServices(event,['FR'],now),['MA'],now);assert.equal(projected.broadcasts.length,3);assert.ok(projected.broadcasts.slice(1).every((b:any)=>b.territory==='MA'));
});
test('EFL streaming never leaks into cups, Championship, other clubs, seasons or stale fixtures',()=>{
 for(const change of [{competition:'Championship'},{competition:'FA Cup'},{competition:'Carabao Cup'},{competition:'League Two'},{sport:'basketball'},{homeTeam:{name:'Barnsley U21'},awayTeam:{name:'Other club'}},{phase:'Postponed'},{startsAt:'2027-08-01T15:00Z'},{startsAt:new Date(now-9*3600000).toISOString()},{observedAt:'2020-01-01'}])assert.equal(addGlobalServices({...event,...change},['MA'],now).broadcasts.length,1);
 assert.equal(addGlobalServices(event,['MA'],Date.parse(reviewed.reviewUntil)).broadcasts.length,1);
 assert.equal(addGlobalServices(event,['MA'],Date.parse(reviewed.checkedAt)-1).broadcasts.length,1);
 const two=addGlobalServices({...event,competition:'League Two',homeTeam:{name:'Tranmere Rovers'},awayTeam:{name:'Salford City'}},['MA'],now);assert.deepEqual(two.broadcasts.slice(1).map((b:any)=>b.channel),['SCFC TV','Rovers TV']);
});
