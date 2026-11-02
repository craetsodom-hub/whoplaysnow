import fs from 'node:fs';
import {createHash} from 'node:crypto';
const cache=JSON.parse(fs.readFileSync('data/artwork-cache.json'));const provenance=[];
for(let n=1;n<=8;n++){
 const url=`https://www.melita.com/wp-content/plugins/melita-tv-pages/img/sports/tsn-logos/TSN${n}-live.png`;
 const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`${n}: ${r.status}`);
 const bytes=Buffer.from(await r.arrayBuffer());if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.length>2000000)throw Error('Invalid PNG');
 const path='/artwork/'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'.png';fs.writeFileSync('public'+path,bytes);cache.urls[url]=path;cache.channels[`MT|tsn ${n}`]=path;
 provenance.push({name:`TSN ${n}`,country:'MT',source:'https://www.melita.com/sportschedule/',url,path,checkedAt:new Date().toISOString()});
}
fs.writeFileSync('data/artwork-cache.json',JSON.stringify(cache,null,2)+'\n');fs.writeFileSync('data/melita-artwork-provenance.json',JSON.stringify(provenance,null,2)+'\n');console.log('Verified and cached '+provenance.length+' official TSN logos');
