import {readFile,writeFile,rename} from 'node:fs/promises';
import {assignEventPaths} from '../public/event-routes.js';
import {reconcileEvents} from '../lib/snapshot';
const dir=process.env.DATA_DIR||'runtime';
const snapshot=JSON.parse(await readFile(dir+'/schedule.json','utf8'));
const prior=await readFile(dir+'/event-routes.json','utf8').then(JSON.parse).catch((e:any)=>{if(e.code!=='ENOENT')throw e;return {}});
const result=assignEventPaths(reconcileEvents(snapshot.events),prior);
await writeFile(dir+'/event-routes.json.tmp',JSON.stringify(result.registry));await rename(dir+'/event-routes.json.tmp',dir+'/event-routes.json');
console.log(JSON.stringify({event:'eventRoutesMigrated',events:result.events.length,uniquePaths:new Set(result.events.map((e:any)=>e.canonicalPath)).size}));
