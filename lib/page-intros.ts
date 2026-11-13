import {esc,sportKey,competitionPath} from '../public/core.js';

// Visible, data-derived introductions: every number and broadcaster comes from
// the current fixtures and rights, so the text changes as the schedule does
// and never repeats a template across pages with nothing behind it.
const DAY=86400000;
const markets=[['GB','the UK'],['US','the US'],['ES','Spain'],['FR','France'],['DE','Germany'],['IT','Italy'],['AU','Australia'],['CA','Canada']];
const shortDate=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short',year:'numeric'});
const list=(items:string[])=>items.length<2?items.join(''):items.slice(0,-1).join(', ')+' and '+items.at(-1);
const plural=(n:number,one:string,many=one+'s')=>n.toLocaleString('en-GB')+' '+(n===1?one:many);
const live=(e:any,now:number)=>Date.parse(e.startsAt)>now&&!/cancel|postpon|confirm/i.test(e.phase||'');

const linkList=(rows:{name:string;count:number}[])=>rows.length?'<ul class="link-columns">'+rows.map(r=>'<li><a href="'+competitionPath(r.name)+'">'+esc(r.name)+' <small>'+esc(plural(r.count,'fixture'))+'</small></a></li>').join('')+'</ul>':'';
// directory: rows from competitionDirectory(), whose names match the competition page URLs.
export function sportGuide(events:any[],directory:any[],sport:string,label:string,now=Date.now()){
 const upcoming=events.filter(e=>sportKey(e.sport)===sport&&live(e,now));
 const week=upcoming.filter(e=>Date.parse(e.startsAt)<now+7*DAY).length;
 const rows=directory.filter(r=>sportKey(r.event.sport)===sport).map(r=>({name:r.name,count:r.events.filter((e:any)=>live(e,now)).length})).filter(r=>r.count);
 const countries=new Set(upcoming.flatMap(e=>(e.broadcasts||[]).map((b:any)=>b.territory))).size;
 const name=label.toLowerCase();
 const intro=upcoming.length
  ?plural(upcoming.length,'upcoming '+name+' fixture')+' across '+plural(rows.length,'competition')+', '+(week?week.toLocaleString('en-GB')+' of them in the next 7 days':'none in the next 7 days')+'.'+(countries?' TV listings currently cover '+plural(countries,'country','countries')+'.':'')+' Choose a competition for its full fixture list and broadcasters by country.'
  :'No '+name+' fixtures are published right now. Competitions appear here as soon as their schedules are released.';
 return '<section class="directory-section sport-guide"><h2>'+esc(label.toUpperCase())+' COMPETITIONS</h2><p>'+esc(intro)+'</p>'+linkList(rows.slice(0,24))+(rows.length>24?'<details><summary>Show all '+rows.length+' competitions</summary>'+linkList(rows.slice(24))+'</details>':'')+'</section>';
}

// rights: rows from rightsByCountry(); events: this competition's upcoming fixtures.
export function competitionIntro(name:string,events:any[],rights:any[],noun='fixture'){
 const first=events[0]?.startsAt,last=events.at(-1)?.startsAt;
 const lead=events.length?plural(events.length,'upcoming '+name+' '+noun)+(first&&last&&first.slice(0,10)!==last.slice(0,10)?', from '+shortDate.format(new Date(first))+' to '+shortDate.format(new Date(last)):'')+'.':'No upcoming '+name+' '+noun+'s are published yet.';
 const byCode=new Map(rights.map(r=>[r.code,r]));
 const named=markets.flatMap(([code,place])=>{const r:any=byCode.get(code);if(!r)return [];const channels=[...(r.holders.size?r.holders:r.listed)].slice(0,2) as string[];return channels.length?[list(channels)+' in '+place]:[];}).slice(0,3);
 const covered=rights.length;
 const broadcasters=named.length?' Broadcasters include '+list(named)+(covered>named.length?', with '+plural(covered,'country','countries')+' listed below':'')+'.':covered?' Broadcasters are listed below for '+plural(covered,'country','countries')+'.':'';
 return '<p class="directory-intro">'+esc(lead+broadcasters)+' Kick-off times below are in UK time; each match page shows your local time and the channels in your country.</p>';
}


// Event pages: one factual paragraph answering the questions people search
// for ("what time is X vs Y", "what channel is X vs Y on"), built only from the
// fixture record. listings: countryListings() rows, venue country first.
const clock=(zone:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const longFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long',year:'numeric'});
const longDate={format:(d:Date)=>longFormat.format(d).replace(',','')};
export function eventIntro(e:any,listings:{name:string;label:string;channels:string[]}[]){
 const start=new Date(e.startsAt);if(!Number.isFinite(start.getTime()))return '';
 const teams=e.homeTeam?.name&&e.awayTeam?.name,matchup=teams?e.homeTeam.name+' vs '+e.awayTeam.name:e.title;
 const term=['football','rugby','american-football'].includes(sportKey(e.sport))?'Kick-off':'Start time';
 const where=e.venue?.name?' at '+[e.venue.name,e.venue.city].filter(Boolean).join(', '):'';
 if(/cancel/i.test(e.phase||''))return matchup+' ('+e.competition+'), scheduled for '+longDate.format(start)+where+', has been cancelled.';
 if(/postpon/i.test(e.phase||''))return matchup+' ('+e.competition+') has been postponed from '+longDate.format(start)+'. The new date and TV channels will appear here once they are published.';
 if(/confirm/i.test(e.phase||''))return matchup+' ('+e.competition+') is expected around '+longDate.format(start)+where+'. The exact date and time are still to be confirmed, so TV listings will follow once the schedule is verified.';
 const lead=(teams?e.homeTeam.name+' play '+e.awayTeam.name:matchup+' takes place')+' '+(/friendl/i.test(e.competition)?'in a friendly':'in the '+e.competition)+' on '+longDate.format(start)+where+'. '+term+' is '+clock('Europe/London').format(start)+' UK time ('+clock('Europe/Paris').format(start)+' CET, '+clock('America/New_York').format(start)+' US Eastern).';
 if(!listings.length)return lead+' No TV channel has been confirmed yet; this page updates as broadcasters publish their schedules.';
 const [first,...rest]=listings,shown=(e.broadcastMode==='recorded'?'was listed on ':'is shown on ');
 return lead+' In '+(first.label==='UK'||first.label==='US'?'the '+first.label:first.label)+' it '+shown+list(first.channels.slice(0,3))+(first.channels.length>3?' and '+(first.channels.length-3)+' more':'')+'.'+(rest.length?' Broadcasters in '+plural(rest.length,'other country','other countries')+' are listed below.':'');
}
