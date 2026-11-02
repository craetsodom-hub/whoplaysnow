// Shared by the static build and the Worker. A pack is
// [u32 header length][JSON header {key:[offset,length,status,type,location?]}][bodies].
export const PACK_COUNT=512;
export const STATIC_FILE_LIMIT=20000;
export function packIndex(key:string){let h=0x811c9dc5;for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0)%PACK_COUNT;}
