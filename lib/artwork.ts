import artworkCache from '../data/artwork-cache.json' with {type:'json'};
import {publicFileExists} from './public-files';
import identity from '../data/utility-identity.json' with {type:'json'};
import overrides from '../data/channel-artwork-overrides.json' with {type:'json'};
import feeds from '../data/channel-feed-identities.json' with {type:'json'};
import {exactChannelLogo} from './matches/channel-logos';
const cache:any=artworkCache;
export const normalizeArtworkName=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const key=(sport:string,name:string)=>sport+'|'+normalizeArtworkName(name);
const local=(url:any)=>typeof url==='string'&&url.startsWith('/')&&!url.startsWith('//')&&publicFileExists(url)?url:undefined;
const safeImage=(url:any)=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:undefined;}catch{return undefined;}};
export function channelLogo(channel:string,country:string,source?:string){
 const override=overrides.entries.find((r:any)=>r.countries.includes(country)&&r.names.some((n:string)=>normalizeArtworkName(n)===normalizeArtworkName(channel))) as any;
 const cached=cache.channels[country+'|'+normalizeArtworkName(channel)];
 const service=identity.services.find(s=>normalizeArtworkName(s.name)===normalizeArtworkName(channel));
 const url=local(override?.logo)||local(cached)||local(exactChannelLogo(channel,country))||local(service?.logo)||local(source)||local(cache.urls[source||''])||safeImage(source);
 return local((overrides.normalized as Record<string,string>)[url||''])||url;
}
export function channelFeedLabel(b:any,now=Date.now()){
 const rule=feeds.rules.find(r=>r.countries.includes(b.territory)&&r.names.some(n=>normalizeArtworkName(n)===normalizeArtworkName(b.channel))&&now>=Date.parse(r.checkedAt)&&now<Date.parse(r.reviewUntil));
 return rule?{feedLabel:rule.label,feedIdentitySource:rule.sourceUrl}:{};
}
export function decorateEvent(e:any){
 const team=(t:any)=>t&&({...t,badgeUrl:local(cache.teams[key(e.sport,t.name)])||local(t.badgeUrl)||local(cache.urls[t.badgeUrl])||safeImage(t.badgeUrl)});
 return {...e,homeTeam:team(e.homeTeam),awayTeam:team(e.awayTeam),competitionLogo:local(cache.competitions[key(e.sport,e.competition)])||local(e.competitionLogo)||safeImage(e.competitionLogo),broadcasts:e.broadcasts.map((b:any)=>({...b,...channelFeedLabel(b),logoUrl:channelLogo(b.channel,b.territory,b.logoUrl)}))};
}
