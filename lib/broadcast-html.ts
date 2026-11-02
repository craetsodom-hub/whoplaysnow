// Shared by the Express server and the Cloudflare Worker so both render the
// broadcaster panel and the schedule feed from one implementation.
import {esc,prettyDate,viewingChannels,internationalChannels,renderBroadcasterCard} from '../public/core.js';
export function renderInternational(e:any,c:string){
 const rows=internationalChannels(e,c);if(!rows.length)return '';
 return '<section class="international-options"><h3 class="broadcast-section-title">More broadcasters</h3><div class="compact-broadcaster-grid">'+rows.slice(0,3).map((b:any)=>renderBroadcasterCard(b,true)).join('')+'</div>'+(rows.length>3?'<details class="more-channels international-more"><summary>more <span>('+(rows.length-3)+')</span></summary><div class="compact-broadcaster-grid">'+rows.slice(3).map((b:any)=>renderBroadcasterCard(b,true)).join('')+'</div></details>':'')+'</section>';
}
export function renderBroadcasts(e:any,c:string){
 const listings=viewingChannels(e,c);const international=renderInternational(e,c);
 if(!listings.length)return e.broadcasts.length?international:'<div class="no-broadcast"><h3>Broadcast schedule sources</h3><p>Check the official event schedule for the latest viewing information.</p></div>';
 const section=(rows:any[],title:string)=>rows.length?'<section class="broadcast-options"><h3 class="broadcast-section-title">'+title+'</h3><div class="compact-broadcaster-grid">'+rows.map((b:any)=>renderBroadcasterCard(b)).join('')+'</div></section>':'';
 return (e.broadcastMode==='recorded'?'<p class="broadcast-history">Official channel assignments recorded for '+esc(prettyDate(e.startsAt,'UTC'))+'.</p>':'')+section(listings.filter((b:any)=>b.official),e.broadcastMode==='recorded'?'Official channel assignments':'Official broadcasters')+section(listings.filter((b:any)=>!b.official),'Additional TV listings')+international;
}
export const scheduleFeedEvent=({id,title,sport,competition,competitionLogo,startsAt,homeTeam,awayTeam,canonicalSlug,canonicalPath,phase,broadcastMode,broadcasts}:any)=>({id,title,sport,competition,competitionLogo,startsAt,homeTeam:homeTeam&&{name:homeTeam.name,badgeUrl:homeTeam.badgeUrl},awayTeam:awayTeam&&{name:awayTeam.name,badgeUrl:awayTeam.badgeUrl},canonicalSlug,canonicalPath,phase,broadcastMode,broadcasts:broadcasts.map(({channel,territory,logoUrl,destinationPrecision,feedEdition,feedLabel,evidenceLevel,languages,languageEvidence,official}:any)=>({channel,territory,logoUrl,destinationPrecision,feedEdition,feedLabel,evidenceLevel,official,languageEvidence,languages:languageEvidence?languages:[]}))});
