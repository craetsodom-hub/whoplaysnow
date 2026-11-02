import {existsSync} from 'node:fs';
// Artwork ships with the release and never changes while it runs, so each
// path is checked on disk once. The Worker has no disk: it supplies the
// build's manifest of public files instead.
let manifest:Set<string>|undefined;
const checked=new Map<string,boolean>();
export function usePublicFileManifest(files:Iterable<string>){manifest=new Set(files);}
export function publicFileExists(url:string){
 if(manifest)return manifest.has(url);
 let found=checked.get(url);if(found===undefined){found=existsSync('public'+url);checked.set(url,found);}
 return found;
}
