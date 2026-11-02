import test from 'node:test'
import assert from 'node:assert/strict'
import { safeChannelArtwork } from './channel-artwork.ts'
import { exactChannelLogo } from './channel-logos.ts'
import { isUnconfirmedLegacyChannel } from './channel-status.ts'
const logo = 'https://a.espncdn.com/guid/322a7e47-3cdb-3b5c-ab1b-678e1f2c27e5/logos/default-dark.png'
test('source artwork accepts only the captured channel-media CDN contract', () => {
  assert.equal(safeChannelArtwork(logo), logo)
  for (const value of [logo.replace('https:', 'http:'), logo + '?tracking=1', logo.replace('a.espncdn.com', 'other.example'), logo.replace('a.espncdn.com', 'user:password@a.espncdn.com'), logo.replace('/logos/default-dark.png', '/arbitrary.svg')]) assert.equal(safeChannelArtwork(value), undefined)
})
test('artwork lookup keeps numbered feeds and territories separate', () => {
  assert.notEqual(exactChannelLogo('beIN SPORTS 1', 'MA'), exactChannelLogo('beIN SPORTS 2', 'MA'))
  assert.equal(exactChannelLogo('beIN SPORTS 99', 'MA'), null)
  assert.equal(exactChannelLogo('Sky Sports Premier League', 'US'), null)
  assert.equal(exactChannelLogo('Sky Sports NFL', 'GB'), null)
  assert(exactChannelLogo('Sky Sports Action', 'GB'))
  assert.notEqual(exactChannelLogo('Ligue 1+ 5', 'FR'), exactChannelLogo('Ligue 1+ 6', 'FR'))
})
test('legacy French third-party labels cannot be guessed into current CANAL+ Live listings', () => {
  assert(isUnconfirmedLegacyChannel('MultiSports 6 FR', 'FR', '2026-10-23T18:00:00Z'))
  assert(!isUnconfirmedLegacyChannel('MultiSports 6 FR', 'FR', '2024-01-01T18:00:00Z'))
  assert(!isUnconfirmedLegacyChannel('MultiSports 6 FR', 'US', '2026-10-23T18:00:00Z'))
  assert(!isUnconfirmedLegacyChannel('CANAL+ Live 6', 'FR', '2026-10-23T18:00:00Z'))
})
