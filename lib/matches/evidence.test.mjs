import test from 'node:test'
import assert from 'node:assert/strict'
import { listingEvidence } from './evidence.ts'

test('listing citations preserve real external evidence and never expose the compact marker as a source',()=>{
 const checkedAt='2026-10-24T09:00:00Z'
 assert.deepEqual(listingEvidence({sourceUrl:'https://www.laliga.com/partido/fixture',checkedAt}),{url:'https://www.laliga.com/partido/fixture',checkedAt})
 for(const sourceUrl of ['https://whoplaysnow.com','https://www.whoplaysnow.com/source','javascript:alert(1)','http://example.com/source','https://name:password@example.com/source','https://example.com:8443/source','not a URL']) assert.equal(listingEvidence({sourceUrl}),null)
 assert.equal(listingEvidence({sourceUrl:'https://www.espn.com/soccer/match/_/gameId/401882831',checkedAt:'invalid'}).checkedAt,undefined)
})
