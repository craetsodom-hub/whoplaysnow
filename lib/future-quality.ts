import {publicEvents} from './snapshot';
import {fixtureObservationIsFresh} from './matches/publication';
import territoryCatalog from './matches/viewing-territories.json' with {type:'json'};

const territories=new Set(territoryCatalog.territories);
const https=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const key=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
type Issue={code:string;id:string;title:string;detail?:string};
// Coverage gaps are reported independently of data errors. Neither category
// removes fixtures or supplies a channel unsupported by its source.
export function auditFutureSchedule(snapshot:any,now=Date.now(),project=(event:any)=>event){
 const issues:Issue[]=[],ids=new Set<string>(),slugs=new Set<string>(),paths=new Set<string>(),identities=new Map<string,any[]>();
 const competitions=new Map<string,any>(),markets=new Map<string,number>();
 const windows=[7,30,120].map(days=>({days,events:0,freshFixtures:0,disruptedOrUnconfirmed:0,withAnyListing:0,withOfficialListing:0,withoutAnyListing:0}));
 const upcoming=snapshot.events.filter((e:any)=>!Number.isFinite(Date.parse(e.startsAt))||Date.parse(e.startsAt)>=now);
 const visible=publicEvents(upcoming,now);
 let missingArtwork=0,missingVenues=0,staleFixtures=0,missingFixtureSources=0;
 for(let i=0;i<upcoming.length;i++){
  const raw=upcoming[i],event=project(visible[i]);
  const issue=(code:string,detail?:string)=>issues.push({code,id:raw.id,title:raw.title,...(detail?{detail}:{})});
  const start=Date.parse(raw.startsAt),fresh=fixtureObservationIsFresh(raw.fixtureSource?.checkedAt||raw.observedAt,now);
  if(!Number.isFinite(start))issue('invalid-start');
  if(ids.has(raw.id))issue('duplicate-id');ids.add(raw.id);
  if(raw.canonicalSlug&&slugs.has(raw.canonicalSlug))issue('duplicate-slug');if(raw.canonicalSlug)slugs.add(raw.canonicalSlug);
  if(raw.canonicalPath&&paths.has(raw.canonicalPath))issue('duplicate-public-path');if(raw.canonicalPath)paths.add(raw.canonicalPath);
  if(!raw.fixtureSource||!https(raw.fixtureSource.url)||!raw.fixtureSource.name){missingFixtureSources++;issue('missing-fixture-source');}
  if(!fresh)staleFixtures++;
  if(!raw.title||!raw.sport||!raw.competition||/competition not supplied/i.test(raw.competition))issue('incomplete-identity');
  if(Boolean(raw.homeTeam)!==Boolean(raw.awayTeam))issue('incomplete-participants');
  if(raw.homeTeam&&raw.awayTeam){
   if(key(raw.homeTeam.name)===key(raw.awayTeam.name))issue('identical-participants');
   const identity=[raw.sport,key(raw.competition),key(raw.homeTeam.name),key(raw.awayTeam.name)].join('|');
   const previous=identities.get(identity)||[];
   for(const other of previous)if(Math.abs(start-Date.parse(other.startsAt))<=15*60000)issue('duplicate-fixture',other.id);
   previous.push(raw);identities.set(identity,previous);
  }
  const artwork=[!event.competitionLogo&&'competition',event.homeTeam&&!event.homeTeam.badgeUrl&&'home',event.awayTeam&&!event.awayTeam.badgeUrl&&'away'].filter(Boolean);
  if(artwork.length){missingArtwork++;issue('missing-event-artwork',artwork.join(', '));}
  if(!event.venue?.name)missingVenues++;
  const rows=event.broadcasts||[],official=rows.some((b:any)=>b.official&&['A','B'].includes(b.evidenceLevel));
  for(const b of rows){
   if(!b.channel||!territories.has(b.territory)||!https(b.sourceUrl))issue('invalid-broadcast',b.channel+' '+b.territory);
   const checked=Date.parse(b.checkedAt||b.verifiedAt),expiry=Date.parse(b.validUntil);
   if(!Number.isFinite(checked)||checked>now+60000||Number.isFinite(expiry)&&expiry<=now)issue('invalid-broadcast-clock',b.channel+' '+b.territory);
   if(b.official&&!['A','B'].includes(b.evidenceLevel))issue('invalid-official-evidence',b.channel+' '+b.territory);
   if(!b.logoUrl)issue('missing-channel-artwork',b.channel+' '+b.territory);
  }
  for(const country of new Set(rows.map((b:any)=>b.territory)))markets.set(country as string,(markets.get(country as string)||0)+1);
  const group=competitions.get(raw.sport+'|'+raw.competition)||{sport:raw.sport,competition:raw.competition,events:0,freshFixtures:0,withAnyListing:0,withOfficialListing:0,missingExamples:[]};
  group.events++;if(fresh)group.freshFixtures++;if(rows.length)group.withAnyListing++;if(official)group.withOfficialListing++;
  if(!rows.length&&group.missingExamples.length<5)group.missingExamples.push({id:raw.id,title:raw.title,startsAt:raw.startsAt,phase:event.phase});
  competitions.set(raw.sport+'|'+raw.competition,group);
  for(const w of windows)if(start<now+w.days*86400000){w.events++;if(fresh)w.freshFixtures++;if(/cancel|postpon|confirm/i.test(event.phase||''))w.disruptedOrUnconfirmed++;if(rows.length)w.withAnyListing++;else w.withoutAnyListing++;if(official)w.withOfficialListing++;}
 }
 const issueCounts=Object.fromEntries([...new Set(issues.map(i=>i.code))].sort().map(code=>[code,issues.filter(i=>i.code===code).length]));
 return {checkedAt:new Date(now).toISOString(),snapshotGeneratedAt:snapshot.generatedAt,upcomingEvents:upcoming.length,staleFixtures,missingFixtureSources,eventsMissingArtwork:missingArtwork,eventsWithoutVenue:missingVenues,windows,issueCounts,issues,competitions:[...competitions.values()].sort((a,b)=>b.events-a.events),markets:[...markets].sort(([a],[b])=>a.localeCompare(b)).map(([country,withListing])=>({country,withListing}))};
}
