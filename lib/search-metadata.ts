export const slug=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const jsonLd=(value:any)=>'<script type="application/ld+json">'+JSON.stringify(value).replace(/</g,'\\u003c')+'</script>';
export function eventMetadata(e:any,origin:string,path:string){
 const schema:any={'@context':'https://schema.org','@type':'SportsEvent',name:e.title,startDate:e.startsAt,sport:e.sport,url:origin+path,description:'Fixture schedule and country-specific broadcaster information for '+e.title+'.',eventStatus:'https://schema.org/'+(/cancel/i.test(e.phase||'')?'EventCancelled':/postpon/i.test(e.phase||'')?'EventPostponed':'EventScheduled')};
 if(e.homeTeam)schema.homeTeam={'@type':'SportsTeam',name:e.homeTeam.name};
 if(e.awayTeam)schema.awayTeam={'@type':'SportsTeam',name:e.awayTeam.name};
 if(e.venue?.name)schema.location={'@type':'Place',name:e.venue.name,...(e.venue.city?{address:{'@type':'PostalAddress',addressLocality:e.venue.city,...(e.venue.country?{addressCountry:e.venue.country}:{})}}:{})};
 if(e.competitionLogo)schema.image=new URL(e.competitionLogo,origin).href;
 // A provisional date must not become a precise search-engine kickoff claim.
 if(/confirm/i.test(e.phase||''))delete schema.startDate;
 return schema;
}
