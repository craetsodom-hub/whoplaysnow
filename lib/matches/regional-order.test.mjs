import test from 'node:test';
import assert from 'node:assert/strict';
import { regionalCompetitionOrder, regionalCompetitionRank } from './regional-order.ts';
import { exactChannelLogo, channelArtwork } from './channel-logos.ts';
test('Spain prioritizes European competitions in the requested order', () => {
 assert.deepEqual(regionalCompetitionOrder('ES').slice(0,5), ['champions-league','la-liga','premier-league','bundesliga','ligue-1']);
 assert(regionalCompetitionRank('champions-league','MA') < regionalCompetitionRank('serie-a','MA'));
 assert(regionalCompetitionRank('premier-league','NG') < regionalCompetitionRank('ligue-1','NG'));
 assert(regionalCompetitionRank('champions-league','US') < regionalCompetitionRank('saudi-pro-league','US'));
 assert(regionalCompetitionRank('copa-libertadores','BR') < regionalCompetitionRank('premier-league','BR'));
});
test('channel artwork never crosses a region or substitutes a numbered feed', () => {
 assert.match(channelArtwork('beIN SPORTS 1','MA').remoteUrl, /SPORTS1_DIGITAL/);
 assert.match(channelArtwork('beIN SPORTS EN 1','MA').remoteUrl, /ENGLISH/);
 assert.notEqual(exactChannelLogo('beIN SPORTS 1','MA'),exactChannelLogo('beIN SPORTS 2','MA'));
 assert.equal(exactChannelLogo('beIN SPORTS 1','AU'),null);
 assert.equal(exactChannelLogo('beIN SPORTS 123','MA'),null);
 assert.match(channelArtwork('Fox Deportes','US').remoteUrl, /LOGO-DEPORTES/);
 assert.equal(exactChannelLogo('Fox Sports 1','US'),null);
});
