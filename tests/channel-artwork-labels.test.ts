import test from 'node:test';
import assert from 'node:assert/strict';
import {channelFeedLabel,channelLogo,decorateEvent} from '../lib/artwork';
import {channelDisplayName,channelFeedKey,channelPreviewGroups,internationalChannels} from '../public/core.js';
const now=Date.parse('2026-11-02T12:00:00Z');
test('reviewed beIN edition labels do not invent audio or change regional availability',()=>{
 const row={channel:'beIN SPORTS 2',territory:'MA'};
 const reviewed={...row,...channelFeedLabel(row,now)};
 assert.equal(channelDisplayName(reviewed),'beIN SPORTS 2 AR');
 assert.equal(reviewed.languages,undefined);
 assert.deepEqual(channelFeedLabel({...row,territory:'FR'},now),{});
 assert.deepEqual(channelFeedLabel({...row,channel:'beIN SPORTS XTRA 9'},now),{});
 assert.deepEqual(channelFeedLabel(row,Date.parse('2026-12-02')),{});
 assert.equal(channelDisplayName({...row,...channelFeedLabel({...row,channel:'beIN SPORTS XTRA 1'},now),channel:'beIN SPORTS XTRA 1'}),'beIN SPORTS XTRA 1 AR/EN');
 assert.equal(channelDisplayName({channel:'beIN SPORTS EN 1',territory:'MA'}),'beIN SPORTS 1 EN');
 assert.notEqual(channelFeedKey(reviewed),channelFeedKey({...row,territory:'FR'}));
 const groups=channelPreviewGroups({broadcasts:[{...reviewed,territory:'QA'},{channel:'Foreign channel',territory:'AU'}]},'ES');
 assert.equal(channelDisplayName(groups.primary[0]),'beIN SPORTS 2 AR');
});
test('channel labels remove parentheses and retain country disambiguation',()=>{
 assert.equal(channelDisplayName({channel:'KTVD-TV (My20)',territory:'US'}),'KTVD-TV My20 US');
 assert.equal(channelDisplayName({channel:'Sky Sports Main Event',territory:'GB'}),'Sky Sports Main Event UK/IE');
 assert.equal(channelDisplayName({channel:'beIN SPORTS 2',territory:'FR'}),'beIN SPORTS 2 FR');
});
test('local source artwork and reviewed aliases are usable without a collector refresh',()=>{
 assert(channelLogo('3cat','ES')?.startsWith('/channel-logos/'));
 assert(channelLogo('Premier Sports 2 UK','GB')?.includes('premier-sports'));
 const decorated=decorateEvent({sport:'football',competition:'LaLiga',broadcasts:[{channel:'beIN SPORTS 2',territory:'MA',logoUrl:'/utility-identity/services/sky.png'}]});
 assert(decorated.broadcasts[0].logoUrl);
});
test('more broadcasters excludes the same local feed while preserving other language and country editions',()=>{
 const broadcasts=[{channel:'beIN SPORTS 2',territory:'MA',feedLabel:'AR'},{channel:'beIN SPORTS 2',territory:'QA',feedLabel:'AR'},{channel:'beIN SPORTS EN 2',territory:'QA'},{channel:'beIN SPORTS 2',territory:'FR'}];
 const more=internationalChannels({broadcasts},'MA');
 assert.deepEqual(new Set(more.map(channelDisplayName)),new Set(['beIN SPORTS 2 EN','beIN SPORTS 2 FR']));
});
