import { open, mkdir, readFile, unlink, writeFile, rename, copyFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { collectionLeaseExpired } from '../lib/collection-lock';
const dir=resolve(process.env.DATA_DIR||'runtime');
await mkdir(dir,{recursive:true});
const lock=dir+'/collection.lock';
async function acquire(){
 try {return await open(lock,'wx');}
 catch(e:any){
  if(e.code!=='EEXIST')throw e;
  const prior=await readFile(lock,'utf8').then(JSON.parse).catch(()=>null);
  // An incomplete newly-created lock is held; never race its writer.
  if(!collectionLeaseExpired(prior,(await stat(lock)).mtimeMs))return null;
  // The child is killed at 12 minutes and systemd bounds the container at
  // 14 minutes. PIDs cannot identify a previous run across Docker namespaces.
  // The 15-minute lease therefore safely recovers a killed container's lock.
  await unlink(lock);return open(lock,'wx');
 }
}
const handle=await acquire();
if(!handle){console.log(JSON.stringify({event:'collectionSkipped',reason:'already-running'}));process.exit(0);}
await handle.writeFile(JSON.stringify({pid:process.pid,at:Date.now()}));await handle.close();
let child:any;
const status=async(value:any)=>{await writeFile(dir+'/collection-status.json.tmp',JSON.stringify(value));await rename(dir+'/collection-status.json.tmp',dir+'/collection-status.json');};
const stop=()=>child?.kill('SIGTERM');process.on('SIGTERM',stop);process.on('SIGINT',stop);
try {
 for(const file of ['schedule.json','archive.json'])await copyFile(dir+'/'+file,dir+'/'+file+'.previous').catch((e:any)=>{if(e.code!=='ENOENT')throw e;});
 const startedAt=new Date().toISOString();
 child=spawn(process.execPath,['--import','tsx','scripts/collect.ts'],{stdio:'inherit',env:process.env});
 const timeout=setTimeout(()=>child.kill('SIGKILL'),12*60_000);
 const code=await new Promise<number>((ok,fail)=>{child.once('error',fail);child.once('exit',(code:any)=>ok(code??1));}).finally(()=>clearTimeout(timeout));
 await status({startedAt,finishedAt:new Date().toISOString(),ok:code===0,exitCode:code});
 if(code!==0)process.exitCode=code;
} catch(e:any){await status({finishedAt:new Date().toISOString(),ok:false,error:e.code||e.name});throw e;}
finally{await unlink(lock);}
