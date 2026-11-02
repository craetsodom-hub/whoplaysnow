import fs from 'node:fs';
import {createHash} from 'node:crypto';
const source='https://www.laliga.com/iframes/external-consumer-broadcast';
const response=await fetch(source,{signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('LaLiga source unavailable');
const html=await response.text();const match=html.match(/<script\b[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if(!match)throw Error('LaLiga source format changed');
const data=JSON.parse(match[1]);
const channels=[...new Map(Object.values(data.props.pageProps.matches).flat().flatMap(e=>e.channels.map(c=>[c.id,c]))).values()];
const cache=JSON.parse(fs.readFileSync('data/artwork-cache.json'));
const norm=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const provenance=[];
for(const channel of channels){
 if(channel.countries?.length&&!channel.countries.some(c=>c.id==='ES'))continue;
 const url=channel.image?.resizes?.small||channel.image?.url;
 if(!/^https:\/\/assets\.laliga\.com\/assets\/\d{4}\/\d{2}\/\d{2}\/(?:xsmall|small|medium|large|xlarge)\/[a-zA-Z0-9_-]+\.png$/.test(url||''))continue;
 const result=await fetch(url,{signal:AbortSignal.timeout(10000)});
 if(!result.ok||!result.headers.get('content-type')?.startsWith('image/png'))continue;
 const bytes=Buffer.from(await result.arrayBuffer());if(bytes.length>2_000_000)continue;
 const path='/artwork/'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'.png';
 fs.writeFileSync('public'+path,bytes);cache.urls[url]=path;cache.channels['ES|'+norm(channel.name)]=path;
 provenance.push({name:channel.name,country:'ES',source,sourceChannelId:channel.id,url,path,checkedAt:new Date().toISOString()});
}
fs.writeFileSync('data/artwork-cache.json',JSON.stringify(cache,null,2)+'\n');
fs.writeFileSync('data/laliga-artwork-provenance.json',JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({logos:provenance.length,channels:provenance.map(c=>c.name)}));
