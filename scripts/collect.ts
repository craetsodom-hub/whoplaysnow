import {enrichESPNNL,mergeESPNNLListings} from '../lib/matches/espn-nl';
import {enrichMelita} from '../lib/matches/melita';
import {enrichOfficialSchedules} from '../lib/matches/direct-official';
import {applyAllEventDestinations} from '../lib/matches/all-event';
import reviewedDestinations from '../lib/matches/reviewed-destinations.json';
import {enrichEventTV} from '../lib/matches/event-tv';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { collectMatches } from '../lib/matches/collect';
import { MATCH_FEED_URL, MATCH_COVERAGE_URL } from '../lib/matches/feed';
import { preparePublication, sourceAliases } from '../lib/matches/publication';
import { isCanonicalMatchId } from '../lib/matches/event-aliases';
import { isUnsupportedFixture } from '../lib/matches/fixture-integrity';
import { reconcileEvents, publicEvents } from '../lib/snapshot';
import {updateSeoState,markSubmitted} from '../lib/seo-state';
import {eventIndexing} from '../lib/event-seo';
import {submitIndexNowUrls,INDEXNOW_MAX_URLS_PER_REQUEST} from '../lib/indexnow';
import { fillMissingCompetitions } from '../lib/fixture-metadata';
import {auditFutureSchedule} from '../lib/future-quality';
import {auditCompetitionCoverage} from '../lib/competition-coverage';
import {decorateEvent} from '../lib/artwork';
import {addGlobalServices} from '../lib/global-services';
import {assignEventPaths} from '../public/event-routes.js';
const dir=process.env.DATA_DIR||'runtime';
await mkdir(dir,{recursive:true});
const prior=await readFile(dir+'/archive.json','utf8').then(JSON.parse).catch(()=>({records:[]}));
const records=new Map(prior.records.map((r:any)=>[r.event.id,r]));
const aliases=new Map<string,Set<string>>();
for(const r of prior.records) for(const a of sourceAliases(r.event)){ const ids=aliases.get(a)||new Set(); ids.add(r.event.id); aliases.set(a,ids); }
const now=Date.now();
const europeanCache=await readFile(dir+'/european-calendar-cache.json','utf8').then(JSON.parse).catch(()=>({}));
const feed=await collectMatches(MATCH_FEED_URL,MATCH_COVERAGE_URL,now,120,europeanCache);
if(feed.calendarCache){await writeFile(dir+'/european-calendar-cache.json.tmp',JSON.stringify(feed.calendarCache));await rename(dir+'/european-calendar-cache.json.tmp',dir+'/european-calendar-cache.json');}
feed.events=await fillMissingCompetitions(feed.events);
if(!feed.events.length || !feed.sources?.some(s=>s.ok)) throw Error('Empty or failed collection: preserving previous snapshot');
let rejected=0, accepted=0;
for(const event of feed.events){
 if(!isCanonicalMatchId(event.id)||isUnsupportedFixture(event))continue;
 const ids=new Set(sourceAliases(event).flatMap(a=>[...(aliases.get(a)||[])]));
 if(ids.size>1){rejected++;continue;}
 const prev=records.get([...ids][0]||event.id) as any;
 try {const next=preparePublication(event,prev,now); records.set(next.event.id,next); accepted++; for(const a of sourceAliases(next.event)){const ids=aliases.get(a)||new Set();ids.add(next.event.id);aliases.set(a,ids);}} catch{rejected++;}
}
for(const update of feed.fixtureUpdates||[]){const old=records.get(update.id) as any; if(old) records.set(update.id,preparePublication({...old.event,phase:update.phase,broadcasts:[]},old,now));}
const espnNLCache=await readFile(dir+'/espn-nl-cache.json','utf8').then(JSON.parse).catch(()=>({}));
const espnNL=await enrichESPNNL(reconcileEvents([...records.values()].map((r:any)=>r.event)),espnNLCache);
for(const event of espnNL.events){const previous=records.get(event.id) as any;if(previous){const merged=mergeESPNNLListings(previous.event,event);if(merged===previous.event)continue;const next=preparePublication(merged,previous,now);records.set(event.id,{...next,observedAt:previous.observedAt});}}
feed.sources=[...feed.sources||[],espnNL.source];
await writeFile(dir+'/espn-nl-cache.json.tmp',JSON.stringify(espnNL.cache));await rename(dir+'/espn-nl-cache.json.tmp',dir+'/espn-nl-cache.json');
const melitaCache=await readFile(dir+'/melita-cache.json','utf8').then(JSON.parse).catch(()=>({}));
const melita=await enrichMelita([...records.values()].map((r:any)=>r.event),melitaCache);
for(const event of melita.events){const previous=records.get(event.id) as any;if(previous){const next=preparePublication(event,previous,now);records.set(event.id,{...next,observedAt:previous.observedAt});}}
feed.sources=[...feed.sources||[],melita.source];
await writeFile(dir+'/melita-cache.json.tmp',JSON.stringify(melita.cache));await rename(dir+'/melita-cache.json.tmp',dir+'/melita-cache.json');
const officialCache=await readFile(dir+'/official-schedule-cache.json','utf8').then(JSON.parse).catch(()=>({}));
const direct=await enrichOfficialSchedules([...records.values()].map((r:any)=>r.event),officialCache);
for(const event of direct.events){const previous=records.get(event.id) as any;if(previous){const next=preparePublication(event,previous,now);records.set(event.id,{...next,observedAt:previous.observedAt});}}
feed.sources=[...feed.sources||[],...direct.sources];
await writeFile(dir+'/official-schedule-cache.json.tmp',JSON.stringify(direct.cache));await rename(dir+'/official-schedule-cache.json.tmp',dir+'/official-schedule-cache.json');
const tvCache=await readFile(dir+'/event-tv-cache.json','utf8').then(JSON.parse).catch(()=>({}));
const tv=await enrichEventTV(applyAllEventDestinations([...records.values()].map((r:any)=>r.event),reviewedDestinations.allEventDestinations,now,new Date(now+24*3600000).toISOString()),tvCache);
for(const event of tv.events){const previous=records.get(event.id) as any;if(previous){const next=preparePublication(event,previous,now);records.set(event.id,{...next,observedAt:previous.observedAt});}}
feed.sources=[...feed.sources||[],tv.source];
await writeFile(dir+'/event-tv-cache.json.tmp',JSON.stringify(tv.cache));await rename(dir+'/event-tv-cache.json.tmp',dir+'/event-tv-cache.json');
const all=[...records.values()] as any[];
const events=all.filter(r=>!isUnsupportedFixture(r.event)&&isCanonicalMatchId(r.event.id)).map(r=>({...r.event,canonicalSlug:r.slug,observedAt:r.observedAt})).filter(e=>Date.parse(e.startsAt)>now-7*86400000 && Date.parse(e.startsAt)<now+166*86400000).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
if(!accepted) throw Error('No accepted fixtures: preserving previous snapshot');
const routeRegistry=await readFile(dir+'/event-routes.json','utf8').then(JSON.parse).catch((e:any)=>{if(e.code!=='ENOENT')throw e;return {}});
const routed=assignEventPaths(reconcileEvents(events),routeRegistry);
await writeFile(dir+'/event-routes.json.tmp',JSON.stringify(routed.registry));await rename(dir+'/event-routes.json.tmp',dir+'/event-routes.json');
const snapshot={generatedAt:new Date(now).toISOString(),sources:feed.sources,events:routed.events};
const competitionCoverage=auditCompetitionCoverage(snapshot,now);
await writeFile(dir+'/competition-coverage.json.tmp',JSON.stringify(competitionCoverage));await rename(dir+'/competition-coverage.json.tmp',dir+'/competition-coverage.json');
console.log(JSON.stringify({event:'competitionCoverage',sourceCompetitions:competitionCoverage.sourceCompetitions,activeCompetitions:competitionCoverage.activeCompetitions,missingArtwork:competitionCoverage.missingArtwork,sourceFailures:competitionCoverage.sourceFailures}));
await writeFile(dir+'/archive.json.tmp',JSON.stringify({records:all})); await rename(dir+'/archive.json.tmp',dir+'/archive.json');
// Written before the schedule: the server reloads both when schedule.json
// changes, so sitemap lastmod never precedes the content it describes.
const visible=publicEvents(routed.events,now);
const seo=updateSeoState(await readFile(dir+'/seo-state.json','utf8').then(JSON.parse).catch(()=>null),visible,now);
await writeFile(dir+'/seo-state.json.tmp',JSON.stringify(seo.state));await rename(dir+'/seo-state.json.tmp',dir+'/seo-state.json');
await writeFile(dir+'/schedule.json.tmp',JSON.stringify(snapshot)); await rename(dir+'/schedule.json.tmp',dir+'/schedule.json');
// IndexNow reaches Bing, Yandex, Seznam and Naver within minutes; Google reads
// the sitemap lastmod instead. Every indexable fixture is announced once per
// visible version (new pages included, not only edits), plus URLs that stopped
// being pages. The first run only seeds state, never a blast.
const eligible=seo.seeded?[]:seo.pending.filter(e=>eventIndexing(e,now).sitemap);
const changedUrls=[...eligible.map(e=>e.canonicalPath),...(seo.seeded?[]:seo.removed)];
const acceptedIds=new Set<string>();
for(let i=0;i<changedUrls.length;i+=INDEXNOW_MAX_URLS_PER_REQUEST){
 const batch=changedUrls.slice(i,i+INDEXNOW_MAX_URLS_PER_REQUEST);
 const result:any=await submitIndexNowUrls(batch,{siteUrl:process.env.SITE_ORIGIN,fetchImpl:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(30000)})}).catch((error:any)=>({accepted:false,status:null,submitted:0,error:String(error)}));
 console.log(JSON.stringify({event:'indexNow',...result,urls:undefined,responseText:result.accepted?undefined:String(result.responseText||'').slice(0,300)}));
 if(result.accepted){const sent=new Set(batch);for(const e of eligible)if(sent.has(e.canonicalPath))acceptedIds.add(e.id);}
}
if(acceptedIds.size){markSubmitted(seo.state,acceptedIds);await writeFile(dir+'/seo-state.json.tmp',JSON.stringify(seo.state));await rename(dir+'/seo-state.json.tmp',dir+'/seo-state.json');}
console.log(JSON.stringify({event:'seoState',events:visible.length,changed:seo.changed.length,seeded:seo.seeded,indexNowUrls:changedUrls.length,indexNowAccepted:acceptedIds.size,removedUrls:seo.removed.length}));
const quality=auditFutureSchedule(snapshot,Date.now(),e=>addGlobalServices(decorateEvent(e)));
await writeFile(dir+'/schedule-quality.json.tmp',JSON.stringify(quality));await rename(dir+'/schedule-quality.json.tmp',dir+'/schedule-quality.json');
console.log(JSON.stringify({event:'scheduleQuality',upcomingEvents:quality.upcomingEvents,staleFixtures:quality.staleFixtures,windows:quality.windows,issueCounts:quality.issueCounts}));
console.log(JSON.stringify({event:'scheduleUpdated',at:snapshot.generatedAt,events:snapshot.events.length,collected:feed.events.length,accepted,rejected,sourceFailures:feed.sources?.filter(s=>!s.ok)}));
