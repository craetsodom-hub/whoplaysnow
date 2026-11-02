import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:3100';
const report=[];async function check(path,status=200){const at=Date.now();const r=await fetch(base+path);const text=await r.text();assert.equal(r.status,status,path);report.push({path,status:r.status,ms:Date.now()-at,bytes:Buffer.byteLength(text)});return {r,text};}
const health=JSON.parse((await check('/healthz')).text);assert(health.events>100);
for(const p of ['/','/?date=2026-99-99','/?date=2026-02-31&tz=INVALID','/about','/privacy','/terms','/robots.txt','/sitemap.xml','/assets/app.js','/assets/style.css'])await check(p);
await check('/movie/old-title',410);await check('/matches/unknown',404);
const data=JSON.parse((await check('/api/schedule')).text);
const sample=data.events.find(e=>Date.parse(e.startsAt)>Date.now()&&e.broadcasts.some(b=>b.territory==='US'))||data.events.find(e=>e.broadcasts.length);
assert(sample);const path='/matches/'+encodeURI(sample.canonicalSlug);await check(path);
const api=JSON.parse((await check('/api/event/'+sample.id+'?country=US')).text);assert.equal(api.event.id,sample.id);
const calendar=(await check('/calendar/'+sample.id+'.ics')).text;assert(calendar.startsWith('BEGIN:VCALENDAR\r\n'));assert(calendar.includes('DTSTART:'));assert(!calendar.includes('undefined'));
await Promise.all(Array.from({length:20},()=>check('/healthz')));
console.log(JSON.stringify({base,health,sample:{path,id:sample.id,title:sample.title,broadcasts:sample.broadcasts.slice(0,2)},report},null,2));
