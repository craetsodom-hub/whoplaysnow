import reviewedFixtureCorrections from '../data/reviewed-fixture-corrections.json' with {type:'json'};
import { mergeOfficialMatches } from './matches/official';
import { currentBroadcasts, distinctBroadcasts } from './matches/guide';
import { fixtureObservationIsFresh } from './matches/publication';
import metadata from '../data/fixture-metadata.json' with {type:'json'};

const competitionAliases: Record<string,string> = {
 'Scottish Premier League':'Scottish Premiership', 'English League Championship':'Championship',
 'Australian A-League':'A-League Men', 'Argentinian Primera Division':'Argentine Liga Profesional',
 'Major League Soccer - Regular Season':'MLS', 'Major League Soccer - Cup Playoffs':'MLS', 'International Friendlies':'International Friendly', 'American Major League Soccer':'MLS', 'American NWSL':'NWSL', 'Spanish La Liga 2':'LaLiga Hypermotion',
};
// Reconcile only through the existing participant, competition and kickoff
// checks. Within a source tier, records with full participants come first so
// the merged fixture keeps their (undated) URL. Keep all source identities so bookmarked provider URLs still resolve.
export function reconcileEvents(events:any[]) {
 events=events.map(e=>{const correction=(reviewedFixtureCorrections as any)[e.id];if(!correction||e.title!==correction.title||e.competition!==correction.competition||Date.parse(e.startsAt)!==Date.parse(correction.previousStartsAt))return e;return {...e,startsAt:correction.startsAt,fixtureSource:{name:correction.sourceName,url:correction.sourceUrl,checkedAt:correction.checkedAt},broadcasts:e.broadcasts.filter((b:any)=>b.matchingMethod==='all-events'&&b.sourceType==='official-all-events')};});
 const normalized=events.map(e=>{const correction=(metadata as any)[e.id];const name=correction&&e.title===correction.title&&Date.parse(e.startsAt)===Date.parse(correction.startsAt)?correction.competition:e.competition;return {...e,competition:competitionAliases[name]||name};});
 const originals=new Map(normalized.map(e=>[e.id,e]));
 const groups=new Map<string,any[]>();
 for(const e of normalized){const key=[e.sport,e.competition,e.startsAt.slice(0,10)].join('|');const rows=groups.get(key)||[];rows.push(e);groups.set(key,rows);}
 return [...groups.values()].flatMap(rows=>mergeOfficialMatches([],rows.sort((a,b)=>Number(Boolean(a.fixtureSource))-Number(Boolean(b.fixtureSource))||Number(!(a.homeTeam&&a.awayTeam))-Number(!(b.homeTeam&&b.awayTeam)))))
  .map(e=>({...e,canonicalSlug:originals.get(e.id)?.canonicalSlug||e.canonicalSlug})).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
}
// Preserve contemporaneous official event allocations as historical information.
// Expired discovery/service rules never become historical match verification.
export function recordedBroadcasts(e:any,now=Date.now()){
 const start=Date.parse(e.startsAt);if(!Number.isFinite(start)||start>now-8*3600000||start<now-7*86400000||/cancel|postponed|confirm/i.test(e.phase||''))return [];
 const observed=Date.parse(e.fixtureSource?.checkedAt||e.observedAt);if(!Number.isFinite(observed)||observed<start-48*3600000||observed>start+8*3600000)return [];
 return distinctBroadcasts(e.broadcasts.filter((b:any)=>{
  const checked=Date.parse(b.checkedAt||b.verifiedAt),expires=Date.parse(b.validUntil);
  return b.official&&b.evidenceLevel==='A'&&b.sourceType!=='official-all-events'&&b.matchingMethod!=='all-events'&&/^https:\/\//.test(b.sourceUrl||'')&&Number.isFinite(checked)&&checked>=start-48*3600000&&checked<=start+8*3600000&&Number.isFinite(expires)&&expires>=start;
 }));
}
export function publicEvents(events:any[],now=Date.now()) {
 return events.map(e=>{
  const fresh=fixtureObservationIsFresh(e.fixtureSource?.checkedAt||e.observedAt,now);
  const disrupted=/cancel|postponed|confirm/i.test(e.phase||'');
  const recorded=recordedBroadcasts(e,now),historical=recorded.length>0;
  return {...e,phase:!fresh&&!disrupted&&Date.parse(e.startsAt)>now?'Schedule to be confirmed':e.phase,broadcastMode:historical?'recorded':'current',
   broadcasts:historical?recorded:fresh&&!disrupted?distinctBroadcasts(currentBroadcasts(e,now)):[]};
 });
}
