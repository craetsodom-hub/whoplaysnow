import countries from './matches/country-labels.json' with {type:'json'};
import {channelAudio,compareBroadcasters,competitionRank,competitionPriority,sportKey} from '../public/core.js';
import {teamPath} from './teams';

const DAY=86400000;
const shortNames:Record<string,string>={GB:'UK',US:'US',AE:'UAE'};
const marketOrder=['GB','US','ES','FR','DE','IT','PT','NL','IE','CA','AU','IN','MA','SA','AE','BR','MX','AR','JP','ZA'];
export const countryName=(code:string)=>(countries as any)[code]||code;
// Within a country group the region suffix the cards use ("Paramount+ US") is redundant; keep audio labels.
export const channelName=(b:any)=>{const name=String(b.channel||'').replace(/[()]/g,'').replace(/\s+/g,' ').trim(),labels=b.feedLabel?String(b.feedLabel).split('/'):channelAudio(b);return name+labels.filter((code:string)=>!new RegExp('\\b'+code+'\\b','i').test(name)).map((code:string)=>' '+code).join('');};
const ukDate=(value:string,opts:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',...opts}).format(new Date(value));

// A page is indexable when it can answer "where can I watch this?" or will
// soon be searched. Unconfirmed schedules never are. Far-future fixtures with
// no verified listing wait, except priority competitions whose demand starts
// weeks ahead. unavailable_after retires finished fixtures from results before
// the page leaves the dataset, instead of letting Google serve a stale page.
export function eventIndexing(e:any,now=Date.now()){
 const start=Date.parse(e.startsAt);
 const priority=competitionRank(e)<(competitionPriority[sportKey(e.sport)]||[]).length;
 const indexable=Number.isFinite(start)&&!/confirm/i.test(e.phase||'')&&(e.broadcasts?.length>0||priority||start<now+10*DAY);
 return {indexable,sitemap:indexable&&start>now-12*3600000,unavailableAfter:indexable&&!/postpon/i.test(e.phase||'')?new Date(start+2*DAY).toISOString().replace('.000Z','+00:00'):null};
}
export const eventRobots=(seo:any)=>seo.indexable?'max-image-preview:large'+(seo.unavailableAfter?', unavailable_after: '+seo.unavailableAfter:''):'noindex,follow';

// Venue country first: it is where most people searching for the fixture live.
export function countryListings(e:any){
 const groups=new Map<string,any[]>();
 for(const b of e.broadcasts||[]){if(!groups.has(b.territory))groups.set(b.territory,[]);groups.get(b.territory)!.push(b);}
 const rank=(code:string)=>code===e.venue?.country?-1:marketOrder.includes(code)?marketOrder.indexOf(code):marketOrder.length;
 return [...groups].map(([code,rows])=>({code,name:countryName(code),label:shortNames[code]||countryName(code),channels:[...new Set(rows.sort((a,b)=>compareBroadcasters(a,b,code)).map(channelName))]})).sort((a,b)=>rank(a.code)-rank(b.code)||a.name.localeCompare(b.name));
}

export const eventHeading=(e:any)=>e.homeTeam?.name&&e.awayTeam?.name?e.homeTeam.name+' vs '+e.awayTeam.name:e.title;
export const eventTitle=(e:any)=>eventHeading(e)+' — TV channel & where to watch ('+ukDate(e.startsAt,{day:'numeric',month:'short',year:'numeric'})+')';
export function eventDescription(e:any){
 const when=ukDate(e.startsAt,{weekday:'short',day:'numeric',month:'short',year:'numeric'}).replace(',','')+', '+ukDate(e.startsAt,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+' UK time';
 const name=eventHeading(e)+' ('+e.competition+')';
 if(/cancel/i.test(e.phase||''))return name+' has been cancelled. It was scheduled for '+when+'.';
 if(/postpon/i.test(e.phase||''))return name+' has been postponed from '+when+'. The new date and TV channels will appear here once published.';
 if(/confirm/i.test(e.phase||''))return name+': date and time to be confirmed. TV channels by country appear once the schedule is verified.';
 const lead=name+': '+when+'.';
 const rows=countryListings(e);
 if(!rows.length)return lead+' '+(['football','rugby','american-football'].includes(sportKey(e.sport))?'Kick-off':'Start')+' time and TV channels by country, updated as broadcasters confirm coverage.';
 const parts:string[]=[];
 for(const [i,row] of rows.entries()){
  const part=row.channels.slice(0,i?1:2).join(', ')+' ('+row.label+')',rest=rows.length-i-1;
  const sentence=(list:string[],more:number)=>' '+(e.broadcastMode==='recorded'?'Shown on ':'Watch on ')+list.join(', ')+(more?' and in '+more+' more '+(more===1?'country':'countries'):'')+'.';
  if(parts.length&&(lead+sentence([...parts,part],rest)).length>165)return lead+sentence(parts,rows.length-parts.length);
  parts.push(part);
 }
 return lead+' '+(e.broadcastMode==='recorded'?'Shown on ':'Watch on ')+parts.join(', ')+'.';
}

// schema.org models "where to watch" directly: each verified listing is a
// BroadcastEvent of the SportsEvent, published on a service in one country.
export function eventStructuredData(e:any,origin:string,path:string){
 const url=origin+path,id=url+'#event',abs=(v:any)=>typeof v==='string'&&/^(https:\/\/|\/(?!\/))/.test(v)?new URL(v,origin).href:null;
 const team=(t:any)=>{if(!t)return undefined;const page=teamPath(e,t);return {'@type':'SportsTeam',name:t.name,...(page?{url:origin+page}:{}),...(abs(t.badgeUrl)?{logo:abs(t.badgeUrl)}:{})};};
 const status=/cancel/i.test(e.phase||'')?'EventCancelled':/postpon/i.test(e.phase||'')?'EventPostponed':'EventScheduled';
 const event:any={'@type':'SportsEvent','@id':id,name:eventHeading(e),url,description:eventDescription(e),sport:e.sport,eventStatus:'https://schema.org/'+status};
 // A provisional date must not become a precise search-engine kickoff claim.
 if(!/confirm/i.test(e.phase||''))event.startDate=e.startsAt;
 if(e.homeTeam&&e.awayTeam){event.homeTeam=team(e.homeTeam);event.awayTeam=team(e.awayTeam);event.competitor=[event.homeTeam,event.awayTeam];}
 if(e.venue?.name)event.location={'@type':'Place',name:e.venue.name,...(e.venue.city?{address:{'@type':'PostalAddress',addressLocality:e.venue.city,...(e.venue.country?{addressCountry:e.venue.country}:{})}}:{})};
 const images=[...new Set([e.homeTeam?.badgeUrl,e.awayTeam?.badgeUrl,e.competitionLogo].map(abs).filter(Boolean))];
 if(images.length)event.image=images;
 const seen=new Set<string>(),broadcasts:any[]=[];
 for(const row of countryListings(e))for(const channel of row.channels){
  if(broadcasts.length>=40||seen.has(row.code+'|'+channel))continue;seen.add(row.code+'|'+channel);
  broadcasts.push({'@type':'BroadcastEvent',name:eventHeading(e)+' on '+channel+' ('+row.label+')',isLiveBroadcast:true,...(event.startDate?{startDate:event.startDate}:{}),broadcastOfEvent:{'@id':id},publishedOn:{'@type':'BroadcastService',name:channel,broadcastDisplayName:channel,areaServed:{'@type':'Country',name:row.name}}});
 }
 return {'@context':'https://schema.org','@graph':[event,...broadcasts]};
}
