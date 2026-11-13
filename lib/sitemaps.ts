export type SitemapEntry={path:string;lastmod?:string};
const xmlEsc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const latest=(values:(string|undefined)[])=>values.filter(Boolean).sort().at(-1);

export function urlset(origin:string,entries:SitemapEntry[]){
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+entries.map(u=>'<url><loc>'+xmlEsc(origin+u.path)+'</loc>'+(u.lastmod?'<lastmod>'+u.lastmod+'</lastmod>':'')+'</url>').join('\n')+'\n</urlset>\n';
}
export function sitemapIndex(origin:string,files:Map<string,SitemapEntry[]>){
 return '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+[...files].map(([name,entries])=>{const lastmod=latest(entries.map(e=>e.lastmod));return '<sitemap><loc>'+xmlEsc(origin+'/sitemap-'+name+'.xml')+'</loc>'+(lastmod?'<lastmod>'+lastmod+'</lastmod>':'')+'</sitemap>';}).join('\n')+'\n</sitemapindex>\n';
}

// Split by page type and kickoff month so Search Console reports indexing per
// file: a falling ratio in one month or page type is visible immediately.
// lastmod is the time an event's public content last changed (collector
// fingerprint), never the collection heartbeat, so Google can trust it.
export function buildSitemaps({pages,competitions,teams,events,state,watch=[]}:{pages:SitemapEntry[];competitions:{path:string;events:any[]}[];teams:{path:string;events:any[]}[];events:any[];state:Record<string,any>;watch?:{path:string;events:any[]}[]}){
 const changed=(e:any)=>state[e.id]?.changedAt as string|undefined;
 const files=new Map<string,SitemapEntry[]>([['pages',pages]]);
 files.set('competitions',competitions.map(c=>({path:c.path,lastmod:latest(c.events.map(changed))})));
 if(teams.length)files.set('teams',teams.map(t=>({path:t.path,lastmod:latest(t.events.map(changed))})));
 if(watch.length)files.set('watch',watch.map(w=>({path:w.path,lastmod:latest(w.events.map(changed))})));
 for(const e of [...events].sort((a,b)=>a.startsAt.localeCompare(b.startsAt))){
  const name='events-'+e.startsAt.slice(0,7);
  if(!files.has(name))files.set(name,[]);
  files.get(name)!.push({path:e.canonicalPath,lastmod:changed(e)});
 }
 return files;
}
