import fs from 'node:fs';
const events=JSON.parse(fs.readFileSync('runtime/schedule.json')).events;
const overrides={};
for(const e of events.filter(x=>x.competition.includes('not supplied'))){
 const url='https://www.thesportsdb.com/event/'+e.sourceIds.thesportsdb;
 const html=await(await fetch(url)).text();
 const rows=[...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m=>JSON.parse(m[1]));
 const row=rows.find(x=>x['@type']==='SportsEvent');
 if(row&&row.name===e.title&&Date.parse(row.startDate)===Date.parse(e.startsAt)&&row.organizer?.name){overrides[e.id]={title:e.title,startsAt:e.startsAt,competition:row.organizer.name,sourceUrl:url};}
}
fs.writeFileSync('data/fixture-metadata.json',JSON.stringify(overrides,null,2)+'\n');
const cache=JSON.parse(fs.readFileSync('data/artwork-cache.json'));delete cache.competitions['rugby|rugby competition not supplied'];
cache.competitions['football|laliga hypermotion']=cache.competitions['football|spanish la liga 2'];
fs.writeFileSync('data/artwork-cache.json',JSON.stringify(cache,null,2)+'\n');console.log(overrides);
