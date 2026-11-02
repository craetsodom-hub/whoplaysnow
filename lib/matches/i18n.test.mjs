import test from 'node:test'
import assert from 'node:assert/strict'
import { MATCH_MESSAGES, matchCopy, matchCountry, matchLanguageAlternates, matchPhase } from './i18n.ts'
import { MATCH_LOCALES, matchPath } from './routes.ts'
import { eventQuestions } from './event-content.ts'
import { matchDate } from './calendar.ts'
const now = Date.parse('2026-10-24T09:00:00Z')
const event = { id: 'espn-401882830', title: 'Rayo Vallecano vs Elche', sport: 'football', competition: 'LaLiga', startsAt: '2026-10-24T12:00:00Z', homeTeam: { name: 'Rayo Vallecano' }, awayTeam: { name: 'Elche' }, broadcasts: [{ territory: 'ES', channel: 'Movistar LALIGA', official: true, evidenceLevel: 'A', sourceType: 'direct-organizer', sourceUrl: 'https://www.laliga.com/event', checkedAt: new Date(now).toISOString(), validUntil: '2026-10-25T09:00:00Z', languages: [] }] }
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

test('every routed language has complete content and identical interpolation variables', () => {
 for (const locale of MATCH_LOCALES) {
  assert.deepEqual(Object.keys(MATCH_MESSAGES[locale]).sort(), Object.keys(MATCH_MESSAGES.en).sort())
  for (const [key, text] of Object.entries(MATCH_MESSAGES.en)) {
   assert.ok(MATCH_MESSAGES[locale][key].trim(), `${locale}/${key}`)
   assert.deepEqual(placeholders(MATCH_MESSAGES[locale][key]), placeholders(text), `${locale}/${key}`)
  }
  if (locale !== 'en') for (const key of ['where', 'metaTitle', 'metaDescription', 'missingAnswer']) assert.notEqual(MATCH_MESSAGES[locale][key], MATCH_MESSAGES.en[key])
 }
})
test('every real language links to its own canonical and the same complete alternate set', () => {
 const links = matchLanguageAlternates(event)
 assert.equal(links['x-default'], matchPath(event))
 for (const locale of MATCH_LOCALES) assert.equal(links[locale], matchPath(event, locale))
 assert.equal(new Set(Object.values(links)).size, MATCH_LOCALES.length)
})
test('translated country answers do not transfer Spanish match evidence to other countries', () => {
 for (const locale of MATCH_LOCALES) {
  const spanish = eventQuestions(event, 'ES', locale, now)
  const british = eventQuestions(event, 'GB', locale, now)
  assert.ok(spanish[0].answer.includes('Movistar LALIGA'))
  assert.equal(british[0].answer, matchCopy(locale, 'missingAnswer', {country: matchCountry('GB', locale)}))
  assert.ok(!british[0].answer.includes('Movistar'))
  assert.ok(british[2].answer.includes('Movistar'))
  const expiredFuture={...event,startsAt:'2026-10-26T12:00:00Z'}
  assert.equal(eventQuestions(expiredFuture, 'ES', locale, now + 25 * 3600000)[0].answer, matchCopy(locale, 'missingAnswer', {country: matchCountry('ES', locale)}))
 }
})

test('past answers preserve saved territory records without presenting them as current viewing offers', () => {
 for (const locale of MATCH_LOCALES) {
  const past=eventQuestions({...event,broadcasts:[]},'ES',locale,now+3*86400000,{historicalBroadcasts:event.broadcasts})
  assert.ok(past[0].answer.includes('Movistar LALIGA'))
  assert.notEqual(past[0].question,eventQuestions(event,'ES',locale,now)[0].question)
  assert.ok(past[1].answer.includes('(UTC)'))
  const foreign=eventQuestions(event,'GB',locale,now+3*86400000)
  assert.ok(!foreign[0].answer.includes('Movistar'))
  assert.ok(foreign[2].answer.includes('Movistar'))
 }
})

test('postponed, cancelled and unconfirmed starts do not reuse old broadcasters or promise a new kickoff', () => {
 for (const locale of MATCH_LOCALES) for (const phase of ['Postponed','Cancelled','Schedule to be confirmed']) {
  const answers=eventQuestions({...event,phase},'ES',locale,now)
  assert.ok(answers.every(row=>!row.answer.includes('Movistar')))
  assert.ok(answers[1].answer.includes(matchPhase(phase,false,locale)))
  assert.ok(answers[1].answer.includes('(UTC)'))
  assert.ok(!answers.some(row=>/\{\w+\}/.test(row.answer)))
 }
})

test('historical answers never revive withdrawn all-event claims', () => {
 const withdrawn={...event.broadcasts[0],channel:'Withdrawn service',evidenceLevel:'B',sourceUrl:'https://www.beinsports.com/en-au'}
 for(const locale of MATCH_LOCALES){
  const answers=eventQuestions({...event,broadcasts:[]},'ES',locale,now+3*86400000,{historicalBroadcasts:[...event.broadcasts,withdrawn]})
  assert.ok(answers[0].answer.includes('Movistar LALIGA'))
  assert.ok(answers.every(row=>!row.answer.includes('Withdrawn service')))
 }
})

test('answer dates keep the actual instant across local midnight and invalid zones fall back to UTC', () => {
 const midnight={...event,startsAt:'2026-10-24T00:30:00Z'}
 const local=eventQuestions(midnight,'US','en',now,{timeZone:'America/Los_Angeles'})[1].answer
 assert.ok(local.includes('23 October 2026')&&local.includes('(America/Los_Angeles)'))
 const fallback=eventQuestions(midnight,'US','en',now,{timeZone:'not-a-zone'})[1].answer
 assert.ok(fallback.includes('24 October 2026')&&fallback.includes('(UTC)'))
})
test('country names and displayed dates use the actual page language without changing the instant', () => {
 assert.equal(matchCountry('DE', 'es'), 'Alemania')
 assert.equal(matchCountry('DE', 'fr'), 'Allemagne')
 assert.equal(matchCountry('ES', 'ar'), 'إسبانيا')
 assert.notEqual(matchDate(event.startsAt, 'UTC', 'full', 'fr'), matchDate(event.startsAt, 'UTC', 'full', 'en'))
 assert.equal(matchDate(event.startsAt, 'Europe/Paris', 'time', 'en'), '14:00')
})

test('all 250 viewing countries preserve territory evidence in every routed language', async () => {
 const { default: territories } = await import('./viewing-territories.json', { with: { type: 'json' } })
 for (const locale of MATCH_LOCALES) for (const country of territories.territories) {
  const answer = eventQuestions(event, country, locale, now)[0].answer
  assert.equal(answer.includes('Movistar LALIGA'), country === 'ES', `${locale}/${country}`)
  assert.ok(matchCountry(country, locale).length > 0)
  assert.ok(!/\{\w+\}/.test(answer), `${locale}/${country}`)
 }
})
