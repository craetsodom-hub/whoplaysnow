import test from 'node:test'
import assert from 'node:assert/strict'
import { matchDate } from './calendar.ts'

test('kickoff and date stay consistent across viewer midnight', () => {
  const kickoff = '2026-10-20T22:30:00Z'
  assert.equal(matchDate(kickoff, 'Asia/Tokyo', 'time'), '07:30')
  assert.equal(matchDate(kickoff, 'Asia/Tokyo', 'day'), '2026-10-21')
  assert.equal(matchDate(kickoff, 'America/New_York', 'day'), '2026-10-20')
})
test('European daylight-saving transition uses the match date, not the current offset', () => {
  assert.equal(matchDate('2026-10-24T19:00:00Z', 'Europe/Paris', 'time'), '21:00')
  assert.equal(matchDate('2026-10-25T19:00:00Z', 'Europe/Paris', 'time'), '20:00')
  assert.match(matchDate('2026-10-25T19:00:00Z', 'Europe/Paris', 'full'), /25 Oct.*20:00/)
})
