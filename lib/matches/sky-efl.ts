import {parseSkyFixtureSchedule} from '../../vendor/whoseiptv/scripts/broadcast/sky-fixtures.mjs';
export const SKY_EFL_PAGES=[{slug:'championship',competition:'Championship',title:/Championship Football/i},{slug:'league-one',competition:'League One',title:/League 1 News/i},{slug:'league-two',competition:'League Two',title:/League 2 Football/i},{slug:'carabao-cup',competition:'EFL Cup',title:/Carabao Cup Fixtures/i}];
export function parseSkyCompetitionPage(html:string,slug:string,verifiedAt:string){
 const page=SKY_EFL_PAGES.find(p=>p.slug===slug);if(!page||!page.title.test(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||''))return [];
 const url='https://www.skysports.com/watch/football-on-sky/competitions/'+slug;
 return parseSkyFixtureSchedule(html,{},new Date(verifiedAt)).map((row:any)=>({...row,competition:page.competition,sourceUrl:url,broadcasts:row.broadcasts.map((b:any)=>({...b,sourceUrl:url,verifiedAt,checkedAt:verifiedAt}))}));
}
export const skyEflAdapter={id:'sky-efl-uk',parserTypes:['semantic-html'],trustedHosts:['www.skysports.com'],async collect({fetchText,verifiedAt}:any){const rows=[];for(const page of SKY_EFL_PAGES){const url='https://www.skysports.com/watch/football-on-sky/competitions/'+page.slug;const html=await fetchText(url);rows.push(...parseSkyCompetitionPage(html,page.slug,verifiedAt));}return rows;}};
