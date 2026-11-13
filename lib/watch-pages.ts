import {eventPath,esc,competitionPath,competitionBadge,sportKey} from '../public/core.js';
import {routeSlug} from '../public/event-routes.js';
import countries from './matches/country-labels.json' with {type:'json'};
import territories from './matches/viewing-territories.json' with {type:'json'};
import {competitionDirectory,rightsByCountry} from './directory-pages';
import {channelName} from './event-seo';

// "Where to watch <competition> in <country>" pages. Each one exists only
// when there is a real answer for that country: published season rights, or
// channels in at least MIN_LISTED upcoming match listings. Everything on the
// page comes from those rights and listings, in the country's own time zone.
const MIN_LISTED=3;
const viewing=new Set<string>(territories.territories);
export const countryName=(code:string)=>(countries as any)[code]||code;
export const countrySlug=(code:string)=>routeSlug(countryName(code));
export const watchPath=(competition:string,code:string)=>competitionPath(competition)+'/'+countrySlug(code);

// Main time zone per market; countries not listed show UK time.
const zones:Record<string,string>={GB:'Europe/London',IE:'Europe/Dublin',US:'America/New_York',CA:'America/Toronto',ES:'Europe/Madrid',FR:'Europe/Paris',DE:'Europe/Berlin',IT:'Europe/Rome',PT:'Europe/Lisbon',NL:'Europe/Amsterdam',BE:'Europe/Brussels',CH:'Europe/Zurich',AT:'Europe/Vienna',LU:'Europe/Luxembourg',DK:'Europe/Copenhagen',SE:'Europe/Stockholm',NO:'Europe/Oslo',FI:'Europe/Helsinki',IS:'Atlantic/Reykjavik',PL:'Europe/Warsaw',CZ:'Europe/Prague',SK:'Europe/Bratislava',HU:'Europe/Budapest',RO:'Europe/Bucharest',BG:'Europe/Sofia',GR:'Europe/Athens',CY:'Asia/Nicosia',MT:'Europe/Malta',HR:'Europe/Zagreb',SI:'Europe/Ljubljana',RS:'Europe/Belgrade',BA:'Europe/Sarajevo',AL:'Europe/Tirane',MK:'Europe/Skopje',ME:'Europe/Podgorica',UA:'Europe/Kyiv',EE:'Europe/Tallinn',LV:'Europe/Riga',LT:'Europe/Vilnius',TR:'Europe/Istanbul',IL:'Asia/Jerusalem',MA:'Africa/Casablanca',DZ:'Africa/Algiers',TN:'Africa/Tunis',EG:'Africa/Cairo',SA:'Asia/Riyadh',AE:'Asia/Dubai',QA:'Asia/Qatar',KW:'Asia/Kuwait',BH:'Asia/Bahrain',OM:'Asia/Muscat',JO:'Asia/Amman',LB:'Asia/Beirut',IQ:'Asia/Baghdad',IN:'Asia/Kolkata',PK:'Asia/Karachi',BD:'Asia/Dhaka',LK:'Asia/Colombo',NP:'Asia/Kathmandu',SG:'Asia/Singapore',MY:'Asia/Kuala_Lumpur',ID:'Asia/Jakarta',TH:'Asia/Bangkok',VN:'Asia/Ho_Chi_Minh',PH:'Asia/Manila',HK:'Asia/Hong_Kong',TW:'Asia/Taipei',CN:'Asia/Shanghai',JP:'Asia/Tokyo',KR:'Asia/Seoul',AU:'Australia/Sydney',NZ:'Pacific/Auckland',ZA:'Africa/Johannesburg',NG:'Africa/Lagos',GH:'Africa/Accra',KE:'Africa/Nairobi',UG:'Africa/Kampala',TZ:'Africa/Dar_es_Salaam',ET:'Africa/Addis_Ababa',SN:'Africa/Dakar',CI:'Africa/Abidjan',CM:'Africa/Douala',MX:'America/Mexico_City',BR:'America/Sao_Paulo',AR:'America/Argentina/Buenos_Aires',CL:'America/Santiago',CO:'America/Bogota',PE:'America/Lima',EC:'America/Guayaquil',VE:'America/Caracas',UY:'America/Montevideo',PY:'America/Asuncion',BO:'America/La_Paz',CR:'America/Costa_Rica',PA:'America/Panama',GT:'America/Guatemala',SV:'America/El_Salvador',HN:'America/Tegucigalpa',DO:'America/Santo_Domingo',PR:'America/Puerto_Rico',JM:'America/Jamaica',TT:'America/Port_of_Spain'};
const zoneFor=(code:string)=>zones[code]||'Europe/London';
const when=(iso:string,zone:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(new Date(iso)).replace(/,/g,'');
const list=(items:string[])=>items.length<2?items.join(''):items.slice(0,-1).join(', ')+' and '+items.at(-1);
const live=(e:any,now:number)=>Date.parse(e.startsAt)>now&&!/cancel|postpon|confirm/i.test(e.phase||'');

export type WatchPage={competition:string;code:string;path:string;events:any[];holders:string[];listed:number;season?:string;source?:string};

// One row per competition and country with a real answer, from the GB view
// (official rights cover every country; listings cover the localised markets).
export function watchPages(events:any[],now=Date.now()):WatchPage[]{
 const pages:WatchPage[]=[];
 for(const row of competitionDirectory(events.filter(e=>live(e,now)))){
  const upcoming=row.events;if(!upcoming.length)continue;
  for(const r of rightsByCountry(row.events,now)){
   if(!viewing.has(r.code))continue;
   const listed=upcoming.filter(e=>(e.broadcasts||[]).some((b:any)=>b.territory===r.code)).length;
   if(!r.holders.size&&listed<MIN_LISTED)continue;
   pages.push({competition:row.name,code:r.code,path:watchPath(row.name,r.code),events:upcoming,holders:[...r.holders],listed,season:r.season,source:r.source});
  }
 }
 return pages;
}

export function watchPageHtml(page:WatchPage,localized:any[],siblings:WatchPage[],now=Date.now()){
 const {competition,code}=page,country=countryName(code),zone=zoneFor(code);
 const fixtures=localized.filter(e=>live(e,now)).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
 const channelsFor=(e:any)=>[...new Set((e.broadcasts||[]).filter((b:any)=>b.territory===code).map(channelName))] as string[];
 const allChannels=[...new Set(fixtures.flatMap(channelsFor))];
 const next=fixtures[0],nextChannels=next?channelsFor(next):[];
 const matchup=(e:any)=>e.homeTeam?.name&&e.awayTeam?.name?e.homeTeam.name+' vs '+e.awayTeam.name:e.title;
 const intro=[
  page.holders.length?competition+' rights in '+country+' are held by '+list(page.holders)+(page.season?' for the '+page.season+' season':'')+'.':'',
  allChannels.length?'Upcoming '+competition+' match listings in '+country+' name '+list(allChannels.slice(0,5))+(allChannels.length>5?' and '+(allChannels.length-5)+' more':'')+'.':'No match-by-match listings for '+country+' are published yet; they appear here as broadcasters confirm them.',
  next?'The next fixture is '+matchup(next)+' on '+when(next.startsAt,zone)+(nextChannels.length?', on '+list(nextChannels)+'.':'.'):'',
  'Times below are in '+(zones[code]?country+' local time':'UK time')+'.'
 ].filter(Boolean).join(' ');
 const rows=fixtures.slice(0,60).map(e=>{const ch=channelsFor(e);return '<li><a href="'+eventPath(e)+'"><time datetime="'+esc(e.startsAt)+'">'+esc(when(e.startsAt,zone))+'</time><span>'+esc(matchup(e))+'</span></a><small>'+(ch.length?esc(ch.join(', ')):'Not listed yet in '+esc(country))+'</small></li>';}).join('');
 const others=siblings.filter(s=>s.competition===competition&&s.code!==code).sort((a,b)=>countryName(a.code).localeCompare(countryName(b.code)));
 const body='<main id="main" class="directory-page"><a class="back-link" href="'+competitionPath(competition)+'">← '+esc(competition)+'</a><section class="directory-hero">'+competitionBadge(localized[0]||page.events[0])+'<div><span class="kicker">'+esc(country.toUpperCase())+' TV GUIDE</span><h1>Where to watch '+esc(competition)+' in '+esc(country)+'</h1></div></section><p class="directory-intro">'+esc(intro)+'</p>'
  +(page.holders.length?'<section class="directory-section"><h2>Rights holders in '+esc(country)+'</h2><p>'+esc(list(page.holders))+(page.season?' · '+esc(page.season):'')+'. A rights holder may show only some fixtures; check each match below.'+(page.source?' Source: <a href="'+esc(page.source)+'" rel="noopener noreferrer" target="_blank">'+esc(new URL(page.source).hostname.replace(/^www\./,''))+'</a>.':'')+'</p></section>':'')
  +'<section class="directory-section"><h2>Upcoming '+esc(competition)+' fixtures on TV in '+esc(country)+'</h2>'+(rows?'<ul class="fixture-list watch-list">'+rows+'</ul>':'<p>No upcoming fixtures are published right now.</p>')+(fixtures.length>60?'<p><a href="'+competitionPath(competition)+'">All '+fixtures.length+' '+esc(competition)+' fixtures →</a></p>':'')+'</section>'
  +(others.length?'<section class="directory-section"><h2>Where to watch '+esc(competition)+' in other countries</h2><ul class="link-columns">'+others.map(s=>'<li><a href="'+s.path+'">'+esc(countryName(s.code))+'</a></li>').join('')+'</ul></section>':'')
  +'<section class="directory-section"><h2>Before you subscribe</h2><p>Rights are sold by territory and can change between seasons. Coverage of a single match depends on the broadcaster’s schedule, your package and local blackout rules. Open a fixture for its verified listing and source.</p></section></main>';
 const title='Where to watch '+competition+' in '+country+': TV channels & times';
 const description=competition+' on TV in '+country+': '+(page.holders.length?list(page.holders.slice(0,3)):list(allChannels.slice(0,3))||'broadcasters')+'. '+(fixtures.length?fixtures.length+' upcoming fixtures with '+(zones[code]?'local':'UK')+' kick-off times and channels.':'Fixtures and channels as they are published.');
 return {title,body,description};
}
