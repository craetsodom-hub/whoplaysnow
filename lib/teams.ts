import {routeSlug} from '../public/event-routes.js';
import {sportKey} from '../public/core.js';

// Clubs share names across sports, genders and age groups (Arsenal and Arsenal
// Women, Real Madrid football and basketball, Spain and Spain U17). Identity is
// derived from the competition so their fixtures never merge into one page.
const womens=/wom[ae]n|\bwsl\b|liga f\b|femenil|f[eé]minin|premi[eè]re ligue|vrouwen|frauen|reina|\bw championship|nwsl|wnba|usl super league|northern super league/i;
const placeholder=/^(tbd|tba|tbc|to be (determined|announced|confirmed)|winners?|losers?|runners?[- ]up|[wl]\d+)\b|\//i;
export const TEAM_MIN_UPCOMING=2;

export function teamPath(e:any,team:any){
 const name=String(team?.name||'').trim();
 if(!name||placeholder.test(name))return null;
 const age=String(e.competition||'').match(/under[- ]?(\d{2})|\bu-?(\d{2})\b/i),ageTag=age?'u'+(age[1]||age[2]):'';
 const suffix=[womens.test(e.competition||'')&&!/\bwom[ae]n\b/i.test(name)?'women':'',ageTag&&!new RegExp('\\bu-?'+ageTag.slice(1)+'\\b','i').test(name)?ageTag:''].filter(Boolean).join('-');
 return '/teams/'+sportKey(e.sport)+'/'+routeSlug(name)+(suffix?'-'+suffix:'');
}

export function teamDirectory(events:any[],now=Date.now()){
 const rows=new Map<string,any>();
 for(const e of events)for(const team of [e.homeTeam,e.awayTeam]){
  const path=teamPath(e,team);if(!path)continue;
  const row=rows.get(path)||{path,name:team.name,sport:e.sport,team,events:[],upcoming:0,competitions:new Set<string>()};
  row.events.push(e);row.competitions.add(e.competition);if(Date.parse(e.startsAt)>now)row.upcoming++;
  if(!row.team.badgeUrl&&team.badgeUrl)row.team=team;
  rows.set(path,row);
 }
 for(const row of rows.values())row.indexable=row.upcoming>=TEAM_MIN_UPCOMING;
 return rows;
}
