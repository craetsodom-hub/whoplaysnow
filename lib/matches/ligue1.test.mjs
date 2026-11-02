import test from 'node:test'
import assert from 'node:assert/strict'
import { ligue1Match } from './ligue1.ts'
const now = Date.parse('2026-10-16T12:00:00Z'), url = 'https://ma-api.ligue1.fr/championship-match/l1_championship_match_73882'
const data = { id: 'l1_championship_match_73882', type: 'l1_championship_match', championshipId: 1, period: 'preMatch', date: '2026-10-17T15:15:00.000Z', home: { clubIdentity: { name: 'RC Strasbourg Alsace', id: 'club-15' } }, away: { clubIdentity: { name: 'Paris Saint-Germain', id: 'club-13' } }, broadcasters: { local: [{ name: { 'fr-FR': 'Ligue 1+ 3' }, link: 'https://ligue1plus.fr/' }] } }
test('Ligue 1 uses exact league event clock and domestic channel; it does not invent other countries', () => {
  const result = ligue1Match(data, url, now)
  assert.equal(result.startsAt, data.date); assert.equal(result.broadcasts[0].territory, 'FR'); assert.equal(result.broadcasts[0].channel, 'Ligue 1+ 3'); assert.equal(result.broadcasts[0].official, true)
  assert.equal(result.homeTeam.name, 'RC Strasbourg Alsace')
  assert.equal(ligue1Match({ ...data, period: 'fullTime' }, url, now), null)
  assert.throws(() => ligue1Match({ ...data, id: 'l1_championship_match_12345' }, url, now))
  assert.equal(ligue1Match({ ...data, broadcasters: { local: [] } }, url, now), null)
  const logo = 'https://s3.eu-west-1.amazonaws.com/image.mpg/7f0c4f0c-37e4-411f-b765-fbe1b5f4732e'
  assert.equal(ligue1Match({ ...data, home: { clubIdentity: { name: 'Le Mans FC', assets: { logo: { small: logo } } } } }, url, now).homeTeam.badgeUrl, logo)
})
