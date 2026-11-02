export const COLLECTION_LEASE_MS=15*60_000;
export function collectionLeaseExpired(record:any,mtimeMs:number,now=Date.now()){
 const at=Number.isFinite(record?.at)?record.at:mtimeMs;
 return Number.isFinite(at)&&now-at>=COLLECTION_LEASE_MS;
}
