import fs from 'node:fs';
import {createHash} from 'node:crypto';
const cache=JSON.parse(fs.readFileSync('data/artwork-cache.json'));
const events=JSON.parse(fs.readFileSync('runtime/schedule.json')).events;
const norm=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const missing=[...new Map(events.flatMap(e=>e.broadcasts.filter(b=>!cache.channels[b.territory+'|'+norm(b.channel)]).map(b=>[b.territory+'|'+b.channel,b]))).values()];
const channels=await(await fetch('https://iptv-org.github.io/api/channels.json',{signal:AbortSignal.timeout(20000)})).json();
const logos=await(await fetch('https://iptv-org.github.io/api/logos.json',{signal:AbortSignal.timeout(20000)})).json();
const rows=[];
for(const b of missing){
 const name=norm(b.channel);
 const channel=channels.find(c=>c.country===b.territory&&[c.name,...c.alt_names||[]].some(n=>norm(n)===name));
 if(!channel)continue;
 const logo=logos.find(l=>l.channel===channel.id&&l.url?.startsWith('https://'));
 if(!logo)continue;
 try{const r=await fetch(logo.url,{signal:AbortSignal.timeout(8000)});const type=r.headers.get('content-type')||'';if(!r.ok||!/^image\/(png|jpeg|webp)/.test(type))continue;const buf=Buffer.from(await r.arrayBuffer());if(buf.length>2e6)continue;const ext=type.includes('webp')?'webp':type.includes('jpeg')?'jpg':'png';const path='/artwork/'+createHash('sha256').update(buf).digest('hex').slice(0,24)+'.'+ext;fs.writeFileSync('public'+path,buf);cache.urls[logo.url]=path;cache.channels[b.territory+'|'+name]=path;rows.push({channel:b.channel,territory:b.territory,identity:channel.id,source:logo.url,path});}catch{}
}
// These variants retain their full name beside the shared service brand artwork.
const family=[[/^DAZN(?: |$)/i,'dazn'],[/^Prime Video(?: |$)/i,'prime video'],[/^TNT Sports \d+$/i,'tnt sports'],[/^Canal\+ Sport France$/i,'canal plus sport'],[/^Fubo$/i,'fubo']];
for(const b of missing){const k=b.territory+'|'+norm(b.channel);if(cache.channels[k])continue;for(const [re,base] of family)if(re.test(b.channel)){const entry=Object.entries(cache.channels).find(([key])=>key.endsWith('|'+base));if(entry){cache.channels[k]=entry[1];rows.push({channel:b.channel,territory:b.territory,sharedBrand:base,path:entry[1]});}break;}}
fs.writeFileSync('data/artwork-cache.json',JSON.stringify(cache,null,2)+'\n');fs.writeFileSync('verification/channel-artwork-sources.json',JSON.stringify(rows,null,2));console.log('Additional channel identities:',rows.length);
