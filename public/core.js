import {publicEventPath} from './event-routes.js';
const actionDrawings={bookmark:'<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-9 3v4m-2-2h4"/>',share:'<path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2"/>',arrowLeft:'<path d="m10 5-7 7 7 7M3 12h18"/>',arrowRight:'<path d="m14 5 7 7-7 7M3 12h18"/>'};
export const actionIcon=name=>'<svg class="action-icon action-icon-'+name+'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(actionDrawings[name]||actionDrawings.bookmark)+'</svg>';
export const saveButtonContent=(active,compact=false)=>actionIcon('bookmark')+(compact?'':'<span>'+(active?'Saved':'Save')+'</span>');
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Football, basketball, American football, baseball, tennis and cricket paths:
// Tabler Icons, Copyright (c) 2020-2026 Paweł Kuna, MIT.
// Source: https://github.com/tabler/tabler-icons (icons/outline/ball-*.svg, cricket.svg).
// Full notice: /assets/licenses/tabler-icons.txt. Other sport drawings are original.
const sportDrawings={
 football:'<circle cx="12" cy="12" r="9"/><path d="M12 7l4.76 3.45L15 16H9l-1.76-5.55L12 7Zm0 0V3m3 13 2.5 3m-.74-8.55L20.5 9m-11.44 7.05L6.5 19m.74-8.55L3.5 9"/>',
 basketball:'<circle cx="12" cy="12" r="9"/><path d="m5.65 5.65 12.7 12.7m-12.7 0 12.7-12.7M12 3a9 9 0 0 0 9 9M3 12a9 9 0 0 1 9 9"/>',
 'american-football':'<path d="m15 9-6 6m1-3 2 2m0-4 2 2M8 21a5 5 0 0 0-5-5M16 3C8.82 3 3 8.82 3 16a5 5 0 0 0 5 5c7.18 0 13-5.82 13-13a5 5 0 0 0-5-5Zm0 0a5 5 0 0 0 5 5"/>',
 'ice-hockey':'<path d="m3.5 3 2.4-1 8.4 15H21v3H12.5L3.5 3Z"/><ellipse cx="5.5" cy="17.8" rx="3.5" ry="1.2"/><path d="M2 17.8v2.4a3.5 1.2 0 0 0 7 0v-2.4"/>',
 baseball:'<circle cx="12" cy="12" r="9"/><path d="M12.495 3.02a9 9 0 0 1-9.475 9.475M20.98 11.505a9 9 0 0 0-9.475 9.475M9 9l2 2m2 2 2 2m-4-8 2 1m-6 3 1 2m8-2 1 2m-6 3 2 1"/>',
 tennis:'<circle cx="12" cy="12" r="9"/><path d="M6 5.3a9 9 0 0 1 0 13.4M18 5.3a9 9 0 0 0 0 13.4"/>',
 motorsport:'<path d="M5 22V3h16v12H5"/><path d="M5 3h4v4H5zm8 0h4v4h-4zM9 7h4v4H9zm8 0h4v4h-4zM5 11h4v4H5zm8 0h4v4h-4z" fill="currentColor" stroke="none"/>',
 rugby:'<g transform="rotate(45 12 12)"><ellipse cx="12" cy="12" rx="7" ry="10"/><path d="M12 2c-5.5 5-5.5 15 0 20M12 2c5.5 5 5.5 15 0 20"/></g>',
 cricket:'<path d="m11.105 18.79-1 .992a4.159 4.159 0 0 1-6.038-5.715l.157-.166L12.506 5.5l1.5 1.5 3.45-3.391a2.08 2.08 0 0 1 3.057 2.815l-.116.126-3.391 3.45 1.5 1.5-3.668 3.617M10.5 7.5l6 6"/><circle cx="14" cy="18" r="3"/>',
 combat:'<path d="m8 18-2.6-3.2C4.5 13.7 4 12.5 4 11.2a2.1 2.1 0 0 1 4-1V7.5a5 5 0 0 1 5-5h2a5.5 5.5 0 0 1 5.5 5.5v3.5c0 2.5-1.3 4.4-2.5 6.5M8 10.2l1.4 1.4a3 3 0 0 1 .9 2.1"/><rect x="8" y="18" width="10" height="4" rx="1"/>'
};
export const sportIcon=key=>'<svg class="sport-icon sport-icon-'+key+'" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(sportDrawings[key]||sportDrawings.football)+'</svg>';
export const sports=[['football','Football'],['basketball','Basketball'],['american-football','American football'],['ice-hockey','Ice hockey'],['baseball','Baseball'],['tennis','Tennis'],['motorsport','Motorsport'],['rugby','Rugby'],['cricket','Cricket'],['combat','Combat sports']].map(([key,label])=>[key,label,sportIcon(key)]);
export const sportKey=s=>{s=s.toLowerCase();return /soccer|football/.test(s)&&!/american/.test(s)?'football':/american|nfl/.test(s)?'american-football':/motor|formula|racing/.test(s)?'motorsport':/boxing|mma|combat/.test(s)?'combat':s.replaceAll(' ','-')};
export const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const dateFormats=new Map();
export const dateKey=(date,tz)=>{let format=dateFormats.get(tz);if(!format){format=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});if(dateFormats.size>32)dateFormats.clear();dateFormats.set(tz,format)}return format.format(new Date(date));};
export const timeLabel=(date,tz)=>new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(date));
export const prettyDate=(date,tz,opts={})=>new Intl.DateTimeFormat('en-GB',{timeZone:tz,weekday:'long',day:'numeric',month:'long',...opts}).format(new Date(date));
export const eventPath=publicEventPath;
export const competitionPriority={football:['Premier League','LaLiga','Bundesliga','Ligue 1','Serie A','UEFA Champions League','UEFA Europa League','UEFA Conference League','FIFA World Cup','UEFA European Championship','Africa Cup of Nations','Copa America','UEFA Womens Champions League','Copa del Rey','FA Cup','Coppa Italia','DFB-Pokal','Coupe de France','Supercopa de España','Supercoppa Italiana','German Supercup','UEFA Super Cup','EFL Cup','Copa Libertadores','Eredivisie','Liga Portugal','Saudi Pro League','MLS','Brazilian Serie A','Argentine Liga Profesional','Liga MX','Championship','Scottish Premiership','Belgian Pro League','Süper Lig','Women’s Super League','NWSL','AFC Champions League Elite','LaLiga Hypermotion','German 2. Bundesliga','A-League Men','J.League','Danish Superliga','Allsvenskan','Eliteserien','League One','League Two'],basketball:['NBA','EuroLeague Basketball','EuroCup Basketball','Basketball Champions League','Spanish Liga ACB','French LNB','German BBL','Greek Basket League','Australian NBL','Russian VTB United League'],'american-football':['NFL','NCAA College Football','CFL','UFL'],'ice-hockey':['NHL','IIHF World Championship','Champions Hockey League','SHL','Liiga','DEL'],baseball:['MLB','World Baseball Classic','NPB','KBO'],tennis:['Wimbledon','US Open','Australian Open','Roland Garros','ATP Finals','WTA Finals','ATP Tour','WTA Tour','Davis Cup Finals'],motorsport:['Formula 1','MotoGP','NASCAR Cup Series','IndyCar','FIA World Endurance Championship','Formula 2','World Rally Championship'],rugby:['Six Nations','Autumn Nations Series','United Rugby Championship','English Prem Rugby','French Top 14','European Rugby Champions Cup'],cricket:['ICC Cricket World Cup','ICC T20 World Cup','Indian Premier League','ICC World Test Championship','ICC International Series','Big Bash League','The Hundred'],combat:['UFC','Boxing','ONE Championship','PFL','Bellator']};
// Editorial prominence, not measured audience figures. Unknown competitions remain visible.
export function competitionRank(event){const list=competitionPriority[sportKey(event.sport)]||[];const i=list.findIndex(name=>name.toLowerCase()===event.competition.toLowerCase());return i<0?100:i;}
const featuredParticipants={football:['Real Madrid','Barcelona','Manchester United','Manchester City','Liverpool','Arsenal','Chelsea','Bayern Munich','Bayern München','Paris Saint-Germain','Juventus','Inter Milan','AC Milan','Atlético Madrid'],basketball:['Los Angeles Lakers','Boston Celtics','Golden State Warriors','New York Knicks','Chicago Bulls'],'american-football':['Kansas City Chiefs','Dallas Cowboys','San Francisco 49ers','Philadelphia Eagles','Green Bay Packers'],'ice-hockey':['Toronto Maple Leafs','Montreal Canadiens','New York Rangers','Boston Bruins','Edmonton Oilers'],baseball:['New York Yankees','Los Angeles Dodgers','Boston Red Sox','Chicago Cubs'],tennis:['Novak Djokovic','Carlos Alcaraz','Jannik Sinner','Iga Swiatek','Aryna Sabalenka','Coco Gauff'],rugby:['New Zealand','South Africa','Ireland','England','France'],cricket:['India','Australia','England','Pakistan'],motorsport:[],combat:[]};
export function eventImportance(event){const title=event.title||'';const stage=/\b(final|super bowl|world series|championship fight)\b/i.test(title)&&!/(semi|quarter)[ -]?final/i.test(title)?100:/\b(semi[ -]?final|playoffs?|grand prix|main event)\b/i.test(title)?60:0;const teams=featuredParticipants[sportKey(event.sport)]||[];return stage+teams.filter(name=>[event.homeTeam?.name,event.awayTeam?.name].some(team=>team?.toLowerCase()===name.toLowerCase())||(!event.homeTeam&&!event.awayTeam&&title.toLowerCase().includes(name.toLowerCase()))).length*10;}
export function compareEvents(a,b){return competitionRank(a)-competitionRank(b)||eventImportance(b)-eventImportance(a)||Date.parse(a.startsAt)-Date.parse(b.startsAt)||String(a.id).localeCompare(String(b.id));}
export function topCompetitions(events,state){const eligible=selectEvents(events,{...state,competition:'',q:'',watch:false});const groups=new Map();for(const event of eligible){if(!groups.has(event.competition))groups.set(event.competition,{event,count:0});groups.get(event.competition).count++;}return [...groups.values()].sort((a,b)=>competitionRank(a.event)-competitionRank(b.event)||b.count-a.count||a.event.competition.localeCompare(b.event.competition)).slice(0,6);}
export function renderCompetitionFilters(events,state){const groups=topCompetitions(events,state);return groups.length?groups.map(({event,count})=>'<button class="competition-tile '+(state.competition===event.competition?'selected':'')+'" type="button" data-competition="'+esc(event.competition)+'" aria-pressed="'+(state.competition===event.competition)+'">'+competitionBadge(event)+'<span><strong>'+esc(event.competition)+'</strong><small>'+count+' '+(count===1?'match':'matches')+'</small></span></button>').join(''):'<p class="competition-empty">No competitions scheduled for this selection. Choose another date below.</p>';}
export function selectEvents(events,state){return events.filter(e=>(state.view==='saved'||state.sport==='all'||sportKey(e.sport)===state.sport)&&(!state.competition||e.competition===state.competition)&&(!state.q||[e.title,e.competition,e.sport,e.homeTeam?.name,e.awayTeam?.name].join(' ').toLowerCase().includes(state.q.toLowerCase()))&&(state.view!=='saved'||state.saved.includes(e.id))&&(state.view==='saved'||dateKey(e.startsAt,state.tz)===state.date)&&(!state.watch||e.broadcasts.some(b=>b.territory===state.country)));}
export const imageUrl=v=>typeof v==='string'&&((v.startsWith('/')&&!v.startsWith('//'))||/^https:\/\//.test(v))?esc(v):'';
export const competitionPath=name=>'/competitions/'+name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const channelBadge=b=>b?.logoUrl&&imageUrl(b.logoUrl)?'<img class="channel-logo" src="'+imageUrl(b.logoUrl)+'" alt="" loading="lazy" width="88" height="48">':'<span class="channel-placeholder" aria-hidden="true">'+esc(String(b?.channel||'TV').replace(/[^\p{L}\p{N}]/gu,'').slice(0,4))+'</span>';
export const competitionBadge=e=>e.competitionLogo&&imageUrl(e.competitionLogo)?'<img class="competition-logo" src="'+imageUrl(e.competitionLogo)+'" alt="" loading="lazy" width="36" height="36">':'<span class="competition-icon" aria-hidden="true">'+(sports.find(x=>x[0]===sportKey(e.sport))?.[2]||'◈')+'</span>';
export const badge=t=>t?.badgeUrl&&imageUrl(t.badgeUrl)?'<img class="team-badge" src="'+imageUrl(t.badgeUrl)+'" alt="" loading="lazy" width="32" height="32" referrerpolicy="no-referrer">':'<span class="team-badge monogram" aria-hidden="true">'+esc((t?.name||'W').slice(0,2).toUpperCase())+'</span>';
// Curated broadcaster prominence, not a claim about measured audience figures.
const broadcasterBrands=['Sky Sports','beIN Sports','ESPN','DAZN','TNT Sports','Canal+','Movistar','SuperSport','NBC Sports','CBS Sports','Fox Sports','Paramount+','Peacock','Viaplay','Apple TV','Prime Video','NBA League Pass','NHL.TV','TV4','TV 2','TSN','RDS','Fubo','SporTV','Premiere','Sport TV','Eleven Sports','Ziggo Sport','Kayo','Stan Sport'];
const localBrands={ES:['Movistar','DAZN','Orange','RTVE'],GB:['Sky Sports','TNT Sports','BBC','ITV','Prime Video'],IE:['Sky Sports','TNT Sports','RTE','Virgin Media'],MA:['beIN Sports','Arryadia','Al Aoula'],FR:['Canal+','beIN Sports','RMC Sport','DAZN','France TV'],US:['ESPN','ABC','NBC','Fox','CBS','Paramount+','Peacock','Prime Video','Apple TV'],NL:['ESPN','Ziggo Sport','Viaplay'],DE:['Sky','DAZN','RTL'],IT:['Sky Sport','DAZN','NOW'],CA:['TSN','Sportsnet','RDS']};
const broadcasterKey=name=>String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\+/g,' plus ').replace(/[^a-z0-9]+/g,' ').trim().replace(/^sky sport(?= |$)/,'sky sports').replace(/^m plus(?= |$)/,'movistar plus');
function brandIndex(name,brands){const value=broadcasterKey(name);const found=brands.findIndex(brand=>{const key=broadcasterKey(brand);return value===key||value.startsWith(key+' ')||(value.startsWith(key)&&/^[0-9]/.test(value.slice(key.length)))});return found<0?100:found;}
export function broadcasterRank(b,country){return brandIndex(b.channel,b.territory===country&&localBrands[country]?localBrands[country]:broadcasterBrands);}
const marketOrder=['GB','US','FR','ES','DE','IT','NL','AU','CA','JP','BR'];
export function compareBroadcasters(a,b,country){
 const section=b=>(b.territory===country?0:2)+(b.official?0:1);
 const precision=b=>b.destinationPrecision==='service'?1:b.destinationPrecision==='network'?2:0;
 const market=b=>{const i=marketOrder.indexOf(b.territory);return i<0?100:i;};
 const flagship=b=>/^sky sports main event(?: |$)/i.test(b.channel)?0:1;
 return section(a)-section(b)||broadcasterRank(a,country)-broadcasterRank(b,country)||precision(a)-precision(b)||(a.evidenceLevel||'C').localeCompare(b.evidenceLevel||'C')||flagship(a)-flagship(b)||a.channel.localeCompare(b.channel,undefined,{numeric:true})||market(a)-market(b)||a.territory.localeCompare(b.territory);
}
// A territory is a feed edition, never evidence of commentary language.
export function channelEdition(b){
 const name=String(b.channel||'');
 if(b.feedEdition==='International service'&&b.official&&b.destinationPrecision==='service')return 'International service';
 if(/^bein(?:\s|$)/i.test(name)&&arabicMarkets.has(b.territory))return 'MENA';
 if(/^sky sports(?:\s|$)/i.test(name)&&['GB','IE'].includes(b.territory))return 'UK/IE';
 if(/^(?:NBA League Pass|NHL\.TV|MLS Season Pass)$/i.test(name))return 'Global';
 return b.territory==='GB'?'UK':b.territory;
}
export function channelAudio(b){
 const explicit=[...String(b.channel||'').matchAll(/\b(AR|EN|FR|ES|DE|IT|PT|NL|Arabic|English|French|Spanish|German|Italian|Portuguese|Dutch)\b/gi)].map(m=>({arabic:'AR',english:'EN',french:'FR',spanish:'ES',german:'DE',italian:'IT',portuguese:'PT',dutch:'NL'}[m[1].toLowerCase()]||m[1].toUpperCase()));
 const verified=b.languageEvidence&&['event-audio','feed-audio'].includes(b.languageEvidence.scope)?(b.languages||[]).map(code=>String(code).toUpperCase()):[];
 return [...new Set([...explicit,...verified])].sort();
}
export const channelFeedKey=b=>String(b.channel||'').trim().toLowerCase()+'|'+channelEdition(b)+'|'+channelAudio(b).join('/');
export function channelDisplayName(b){
 const name=String(b.channel||'').replace(/[()]/g,'').replace(/\s+/g,' ').trim().replace(/^(beIN SPORTS) (EN|FR) ([12])$/i,'$1 $3 $2');
 const audio=channelAudio(b),labels=b.feedLabel?b.feedLabel.split('/'):audio;
 const missing=labels.filter(code=>!new RegExp('\\b'+code+'\\b','i').test(name));
 const edition=channelEdition(b),region=edition==='MENA'?(labels.length?'':b.territory):['International service','Global'].includes(edition)?(b.territory==='GB'?'UK':b.territory):edition;
 return name+(missing.length?' '+missing.join('/'):'')+(region&&!new RegExp('\\b'+region+'$','i').test(name)?' '+region:'');
}
export function channelAudioLabel(b){const audio=channelAudio(b);const edition=channelEdition(b);return edition+(edition==='International service'?'':' feed')+' · '+(audio.length?'Audio: '+audio.join(' / '):'Audio not specified');}
export function viewingChannels(event,country){const rows=event.broadcasts.filter(b=>b.territory===country).sort((a,b)=>compareBroadcasters(a,b,country));return [...new Map(rows.map(b=>[channelFeedKey(b),b])).values()];}
export function renderChannelList(event,country){return viewingChannels(event,country).map(b=>'<span class="listed-channel">'+channelBadge(b)+'<span><strong title="'+esc(channelDisplayName(b))+'">'+esc(channelDisplayName(b))+'</strong></span></span>').join('');}
export function renderBroadcasterCard(b,international=false){const name=esc(channelDisplayName(b));return '<article class="broadcaster'+(international?' international-broadcaster':'')+'">'+channelBadge(b)+'<div class="broadcaster-info"><h4 title="'+name+'">'+name+'</h4></div></article>';}
const arabicMarkets=new Set(['MA','DZ','TN','LY','EG','SD','MR','SA','QA','AE','BH','KW','OM','YE','IQ','JO','LB','PS','SY','DJ','SO','KM']);
export function isArabicBroadcaster(b){
 const name=String(b.channel||'');
 if((b.languageEvidence&&b.languages?.includes('ar'))||/\b(?:AR|Arabic)\b|عرب/i.test(name))return true;
 if(/\b(?:EN|English|FR|French|ES|Spanish)\b/i.test(name))return false;
 // Regional broadcaster identity, not an inference about the commentary language.
 return [b.territory,...b.countries||[]].some(c=>arabicMarkets.has(c))&&/bein|ssc|abu dhabi|dubai|al[ -]?kass|arryadia|al aoula|thmanyah|on[ -]?time|riyadiya/i.test(name);
}
export function channelPreviewGroups(event,country){
 const rows=[...event.broadcasts].sort((a,b)=>compareBroadcasters(a,b,country));
 const groups=new Map();for(const b of rows){const key=channelFeedKey(b);if(!groups.has(key))groups.set(key,{...b,countries:[]});const group=groups.get(key);if(!group.countries.includes(b.territory))group.countries.push(b.territory);}
 const selected=[];const used=new Set();
 const pin=predicate=>{const candidate=rows.find(b=>predicate(b)&&!used.has(channelFeedKey(b)));if(!candidate)return;const key=channelFeedKey(candidate),group=groups.get(key);selected.push({...candidate,countries:[candidate.territory,...group.countries.filter(c=>c!==candidate.territory)]});used.add(key);};
 pin(b=>b.territory===country);pin(isArabicBroadcaster);pin(b=>b.territory==='GB');
 const queues=[[],[],[],[]];for(const [key,b] of groups){if(used.has(key))continue;queues[b.countries.includes(country)?0:isArabicBroadcaster(b)?1:b.countries.includes('GB')?2:3].push(b);}
 // Other countries never fill an absent priority slot. Keep every alternative under more.
 const additional=[];while(queues.some(q=>q.length))for(const queue of queues)if(queue.length)additional.push(queue.shift());
 return {primary:selected,additional};
}
export function previewChannels(event,country){const {primary,additional}=channelPreviewGroups(event,country);return [...primary,...additional];}
export function internationalChannels(event,country){const local=new Set(viewingChannels(event,country).map(channelFeedKey));return previewChannels({...event,broadcasts:event.broadcasts.filter(b=>b.territory!==country&&!local.has(channelFeedKey(b)))},country);}
const countryNames=new Intl.DisplayNames(['en'],{type:'region'});
export function renderChannelPreview(event,country){
 const {primary,additional}=channelPreviewGroups(event,country);const rows=[...primary,...additional];const card=b=>'<a class="listed-channel" href="'+eventPath(event)+'?country='+esc(b.territory)+'&amp;countryMode=manual">'+channelBadge(b)+'<span><strong title="'+esc(channelDisplayName(b))+'">'+esc(channelDisplayName(b))+'</strong></span></a>';
 if(!rows.length)return '<a class="listing-source" href="'+eventPath(event)+'?country='+esc(country)+'">View event & broadcast sources ↗</a>';
 // If none of the preferred regions is listed, expose actual sourced alternatives
 // with their region in the title instead of showing an empty channel column.
 const visible=primary.length?primary:additional.slice(0,3),remaining=primary.length?additional:additional.slice(3);
 return '<div class="channel-list channel-preview">'+visible.map(card).join('')+'</div>'+(remaining.length?'<details class="more-channels"><summary aria-label="Show '+remaining.length+' more broadcasters for '+esc(event.title)+'">more <span>('+remaining.length+')</span></summary><div class="channel-list">'+remaining.map(card).join('')+'</div></details>':'');
}
export function eventRow(e,s){const started=Date.parse(e.startsAt)<Date.now();const phase=e.broadcastMode==='recorded'?'Past scheduled start':e.phase&&/postponed|cancel|confirm|final|finished/i.test(e.phase)?e.phase:started?'Started':'Scheduled';return '<article class="match-row"><div class="kickoff"><time datetime="'+esc(e.startsAt)+'">'+timeLabel(e.startsAt,s.tz)+'</time><span class="'+(/cancel|postponed/i.test(phase)?'warning':'')+'">'+esc(s.view==='saved'?prettyDate(e.startsAt,s.tz,{weekday:'short',month:'short'}):phase)+'</span></div><a class="match-teams" href="'+eventPath(e)+'">'+(e.homeTeam&&e.awayTeam?'<span>'+badge(e.homeTeam)+'<strong>'+esc(e.homeTeam.name)+'</strong></span><span>'+badge(e.awayTeam)+'<strong>'+esc(e.awayTeam.name)+'</strong></span>':'<span><span class="event-symbol">'+(sports.find(x=>x[0]===sportKey(e.sport))?.[2]||'◈')+'</span><strong>'+esc(e.title)+'</strong></span>')+'</a><div class="watch-cell"><span class="eyebrow">'+(e.broadcastMode==='recorded'?'RECORDED TV LISTINGS':'WHERE TO WATCH')+'</span>'+renderChannelPreview(e,s.country)+'</div><button class="save-match '+(s.saved.includes(e.id)?'is-saved':'')+'" data-save="'+esc(e.id)+'" data-save-title="'+esc(e.title)+'" title="'+(s.saved.includes(e.id)?'Remove from saved events':'Save event')+'" aria-label="'+(s.saved.includes(e.id)?'Remove from saved events: ':'Save event: ')+esc(e.title)+'" aria-pressed="'+s.saved.includes(e.id)+'">'+saveButtonContent(s.saved.includes(e.id),true)+'</button></article>';}
export function renderMatches(events,s){const selected=selectEvents(events,s).sort((a,b)=>s.view==='saved'?dateKey(a.startsAt,s.tz).localeCompare(dateKey(b.startsAt,s.tz))||compareEvents(a,b):compareEvents(a,b));if(!selected.length)return '<div class="empty"><span>'+actionIcon(s.view==='saved'?'bookmark':'calendar')+'</span><h2>'+(s.view==='saved'?'No saved events yet.':'No events found.')+'</h2><p>'+(s.view==='saved'?'Use the bookmark icon to save events here.':'Try another date, sport or competition. Broadcaster listings may arrive closer to the event.')+'</p><button class="primary" data-reset>'+(s.view==='saved'?'Browse events':'Reset filters')+'</button></div>';const groups=new Map();for(const e of selected){const k=e.competition; if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}return [...groups].map(([name,list])=>'<section class="competition-group"><div class="competition-heading">'+competitionBadge(list[0])+'<h2><a href="'+competitionPath(name)+'">'+esc(name)+'</a></h2><span>'+list.length+' '+(list.length===1?'event':'events')+'</span></div>'+list.map(e=>eventRow(e,s)).join('')+'</section>').join('');}
