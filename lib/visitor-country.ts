import territories from './matches/viewing-territories.json' with {type:'json'};
const supported=new Set(territories.territories);
export function visitorCountry(query:unknown,edge:unknown,_legacyCookie=''){
 const valid=(value:unknown):value is string=>typeof value==='string'&&supported.has(value);
 // An explicit page selection wins; automatic mode always follows the current edge location.
 if(valid(query))return query;
 return valid(edge)?edge:'GB';
}

export function pageCountry(query:unknown,mode:unknown,edge:unknown){return visitorCountry(mode==='manual'?query:undefined,edge);}
