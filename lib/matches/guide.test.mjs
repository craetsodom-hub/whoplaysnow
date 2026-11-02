import test from 'node:test';
import assert from 'node:assert/strict';
import { broadcastsIn, channelIdentity, verifiedLanguages, broadcastKind, buildGuides, buildPlanningGuides, relatedPlanningGuides, hasIndexableBroadcast, distinctBroadcasts } from './guide.ts';
import { mergeOfficialMatches } from './official.ts';
import { upcomingSchedule } from './discovery.ts';
const now = Date.parse('2026-10-18T10:00:00Z');
const b = (extra = {}) => ({ channel: 'Sky Sports Premier League', territory: 'GB', languages: [], official: true, evidenceLevel: 'A', sourceType: 'direct-broadcaster', sourceUrl: 'https://www.skysports.com/fixture', destinationPrecision: 'channel', ...extra });
const e = (extra = {}) => ({ id: 'stable-event', title: 'Home vs Away', sport: 'football', competition: 'Premier League', startsAt: '2026-10-19T18:00:00Z', homeTeam: { name: 'Home Club' }, awayTeam: { name: 'Away Club' }, broadcasts: [b()], ...extra });
test('new service audio evidence supersedes older unspecified duplicates without merging distinct feeds', () => {
  const old = b({ channel: 'Disney+', territory: 'FR', evidenceLevel: 'B', destinationPrecision: 'service', verifiedAt: '2026-08-23' });
  const fresh = { ...old, verifiedAt: '2026-10-18', languages: ['fr'], languageEvidence: { scope: 'feed-audio' } };
  assert.deepEqual(distinctBroadcasts([old, fresh]), [fresh]);
  assert.deepEqual(distinctBroadcasts([fresh, old]), [fresh]);
  assert.equal(distinctBroadcasts([fresh, { ...fresh, channel: 'Disney+ Spanish feed', languages: ['es'] }]).length, 2);
});
test('indexing includes useful official services but excludes third-party-only and expired evidence', () => {
  assert(hasIndexableBroadcast(e({ broadcasts: [b({ evidenceLevel: 'B', destinationPrecision: 'service' })] }), now));
  assert(!hasIndexableBroadcast(e({ broadcasts: [b({ official: false, evidenceLevel: 'C' })] }), now));
  assert(!hasIndexableBroadcast(e({ broadcasts: [b({ validUntil: '2026-10-01T00:00:00Z' })] }), now));
});
test('country and language intersect; foreign alternatives never satisfy local selection', () => {
  const event = e({ broadcasts: [b(), b({ territory: 'FR', languages: ['ar'], languageEvidence: { scope: 'event-audio' } })] });
  assert.equal(broadcastsIn(event, 'US', 'ar', now).length, 0);
  assert.equal(broadcastsIn(event, 'GB', 'ar', now).length, 0);
  assert.equal(broadcastsIn(event, 'FR', 'ar', now).length, 1);
});
test('channel number, territory, regional name, quality and audio variants preserve identities', () => {
  const channels = [b(), b({ channel: 'Sky Sports Main Event' }), b({ channel: 'Sky Sport 1 Austria', territory: 'AT' }), b({ channel: 'beIN SPORTS 1', territory: 'MA' }), b({ channel: 'beIN SPORTS 2', territory: 'MA' }), b({ channel: 'beIN SPORTS 1', territory: 'FR' }), b({ channel: 'beIN SPORTS EN 1', territory: 'MA' })];
  assert.equal(new Set(channels.map(channelIdentity)).size, channels.length);
  assert.deepEqual(verifiedLanguages(b({ languages: ['en'] })), []);
});
test('platform, all-event service and third-party listing stay separate', () => {
  assert.equal(broadcastKind(b({ destinationPrecision: 'service' })), 'Live streaming');
  assert.equal(broadcastKind(b({ evidenceLevel: 'B' })), 'Streams every match');
  assert.equal(broadcastKind(b({ official: false, evidenceLevel: 'C' })), 'TV guide listing');
});
test('rescheduling retains stable event identity but discards old channel assignments', () => {
  const old = e({ broadcasts: [b({ territory: 'FR' })] });
  const updated = e({ startsAt: '2026-10-20T19:00:00Z' });
  const merged = mergeOfficialMatches([old], [updated]);
  assert.equal(merged.length, 1); assert.equal(merged[0].id, old.id);
  assert.deepEqual(merged[0].broadcasts.map(b => b.territory), ['GB']);
});
test('expired destinations are withheld and one-event schedules are not SEO landing pages', () => {
  assert.equal(broadcastsIn(e({ broadcasts: [b({ validUntil: new Date(now - 1).toISOString() })] }), 'GB', 'all', now).length, 0);
  assert.deepEqual(buildGuides([e()], now), []);
  assert(buildGuides([e(), e({ id: 'another-event' })], now).some(g => g.kind === 'competition'));
});

test('competition guide URLs stay stable when a shared fixture lacks the publisher competition key', () => {
  const events = [e({ competition: 'UEFA Champions League', competitionKey: 'champions-league' }), e({ id: 'other', competition: 'UEFA Champions League' })];
  const guides = buildGuides(events, now).filter(g => g.kind === 'competition');
  assert.equal(guides.length, 1);
  assert.equal(guides[0].slug, 'champions-league');
  assert.equal(guides[0].events.length, 2);
});

test('planning guides retain the full future horizon when the seven-day browser list is empty', () => {
  const events = [e({ id: 'november', startsAt: '2026-11-10T18:00:00Z' }), e({ id: 'december', startsAt: '2026-12-10T18:00:00Z' })];
  const feed = { state: 'ready', expiresAt: new Date(now + 900000).toISOString(), events };
  assert.deepEqual(upcomingSchedule(feed, now), []);
  assert.equal(buildPlanningGuides(events, now).find(g => g.kind === 'competition').events.length, 2);
});

test('a recently started event retains links to existing future competition and team schedules',()=>{
 const event=e({id:'started',startsAt:new Date(now-60_000).toISOString(),broadcasts:[]})
 const future=[e({id:'next',startsAt:'2026-11-10T18:00:00Z'}),e({id:'later',startsAt:'2026-12-10T18:00:00Z'})]
 const guides=buildPlanningGuides([event,...future],now),related=relatedPlanningGuides(event,guides,now)
 assert.equal(guides.some(guide=>guide.events.some(row=>row.id===event.id)),false)
 assert.deepEqual(related.map(guide=>guide.kind).sort(),['competition','team','team'])
 assert.ok(related.every(guide=>guides.includes(guide)))
})

test('related schedules preserve competition aliases and never borrow a team from a different sport',()=>{
 const event=e({competition:'UEFA Champions League',broadcasts:[]})
 const guides=buildPlanningGuides([e({id:'a',competition:'UEFA Champions League',competitionKey:'champions-league'}),e({id:'b',competition:'UEFA Champions League',competitionKey:'champions-league'})],now)
 assert.equal(relatedPlanningGuides(event,guides,now).find(guide=>guide.kind==='competition').slug,'champions-league')
 const other=relatedPlanningGuides({...event,sport:'basketball',competition:'Different competition'},guides,now)
 assert.deepEqual(other,[])
})

test('a missing or one-event schedule is never manufactured and expired channels are not revived',()=>{
 const event=e({broadcasts:[b({validUntil:new Date(now-1).toISOString()})]})
 assert.deepEqual(relatedPlanningGuides(event,buildPlanningGuides([e()],now),now),[])
 const guides=buildPlanningGuides([e({id:'a'}),e({id:'b'})],now)
 assert.equal(relatedPlanningGuides(event,guides,now).some(guide=>guide.kind==='channel'),false)
})

test('an expired shared feed cannot erase independently current persisted guides', () => {
  const events = [e(), e({ id: 'second', startsAt: '2026-10-21T18:00:00Z' })];
  const feed = { state: 'ready', expiresAt: new Date(now - 1).toISOString(), events };
  assert.deepEqual(upcomingSchedule(feed, now), []);
  const guide = buildPlanningGuides(events, now).find(g => g.kind === 'competition');
  assert.equal(guide.events.length, 2);
  assert.equal(guide.events[0], events[0]);
  assert.equal(guide.events[0].broadcasts[0].sourceUrl, 'https://www.skysports.com/fixture');
});

test('planning guides still withhold expired evidence and third-party-only listings', () => {
  for (const broadcast of [b({ validUntil: new Date(now - 1).toISOString() }), b({ official: false, evidenceLevel: 'C' })]) {
    assert.deepEqual(buildPlanningGuides([e({ broadcasts: [broadcast] }), e({ id: 'second', broadcasts: [broadcast] })], now), []);
  }
});

test('past fixtures do not qualify an otherwise single-event planning guide', () => {
  assert.deepEqual(buildPlanningGuides([e({ startsAt: '2026-10-17T18:00:00Z' }), e({ id: 'future' })], now), []);
});
