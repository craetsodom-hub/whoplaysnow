import {eventIdentityEvidence} from '../../vendor/whoseiptv/scripts/broadcast/identity.mjs';
export const MELITA_SCHEDULE='https://www.melita.com/wp-json/tv/v1/sportsschedule';
const aliases:Record<string,string>={'EFL Carabao Cup':'EFL Cup','EFL Championship':'Championship','Bundesliga 2':'German 2. Bundesliga','English Premier League':'Premier League'};
const maltaClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Malta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const localTime=(date:string)=>{const p=maltaClock.formatToParts(new Date(date));const get=(key:string)=>p.find(x=>x.type===key)?.value;return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;};
export function applyMelita(events:any[],payload:any,checkedAt:number,now=Date.now()){
 if(!Array.isArray(payload?.sports_schedule)||checkedAt>now+60000||now-checkedAt>=12*3600000)return events;
 const additions=new Map<string,any[]>();const byLocalTime=new Map<string,any[]>();for(const e of events)if(Date.parse(e.startsAt)>now&&!/cancel|postponed|confirm/i.test(e.phase||'')){const key=localTime(e.startsAt);byLocalTime.set(key,[...byLocalTime.get(key)||[],e]);}
 for(const sport of payload.sports_schedule)for(const league of sport.leagues||[])for(const row of league.game_details||[]){
  if(String(row.delayed)!=='0'||!/^([1-8])$/.test(String(row.tsn_channel))||!row.team_1||!row.team_2)continue;
  const possible=(byLocalTime.get(row.date_time)||[]).filter(e=>eventIdentityEvidence({...e,startUtcEpochSeconds:Date.parse(e.startsAt)/1000},{sport:String(sport.sport_category_name).toLowerCase(),competition:aliases[league.league_name]||league.league_name,homeTeam:row.team_1,awayTeam:row.team_2,startUtcEpochSeconds:Date.parse(e.startsAt)/1000},0));
  if(possible.length!==1)continue;const event=possible[0];const b={channel:'TSN '+row.tsn_channel,territory:'MT',languages:[],logoUrl:'https://www.melita.com/wp-content/plugins/melita-tv-pages/img/sports/tsn-logos/TSN'+row.tsn_channel+'-live.png',official:true,sourceType:'direct-broadcaster',evidenceLevel:'A',destinationPrecision:'channel',matchingMethod:'official-teams-competition-malta-kickoff',sourceUrl:MELITA_SCHEDULE,scheduleUrl:'https://www.melita.com/sportschedule/',checkedAt:new Date(checkedAt).toISOString(),verifiedAt:new Date(checkedAt).toISOString(),validUntil:new Date(checkedAt+12*3600000).toISOString()};additions.set(event.id,[...additions.get(event.id)||[],b]);
 }
 return events.map(e=>{const rows=additions.get(e.id)||[];return rows.length?{...e,broadcasts:[...e.broadcasts.filter((b:any)=>!(b.sourceUrl===MELITA_SCHEDULE&&b.territory==='MT')),...rows]}:e;});
}
export async function enrichMelita(events:any[],prior:any={},fetcher:typeof fetch=fetch,now=Date.now()){
 let cache=prior;let ok=true;
 if(!cache.checkedAt||now-cache.checkedAt>3*3600000)try{const response=await fetcher(MELITA_SCHEDULE,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('HTTP '+response.status);const payload=await response.json();if(!Array.isArray(payload?.sports_schedule))throw Error('Invalid Melita schedule');cache={checkedAt:now,payload};}catch{ok=false;}
 return{events:applyMelita(events,cache.payload,cache.checkedAt||0,now),cache,source:{name:'Melita · official Malta TSN schedule',ok,detail:ok?'Exact teams, competition, live flag and Europe/Malta kickoff checked':'Source unavailable; cached evidence retains original expiry'}};
}
