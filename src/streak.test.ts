import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeStreak, lastNDays, localDay } from './streak.ts'

const taipei = (dayStartMinutes = 0) => ({ timeZone: 'Asia/Taipei', dayStartMinutes })
const la = (dayStartMinutes = 0) => ({ timeZone: 'America/Los_Angeles', dayStartMinutes })

test('localDay uses the local calendar date, not UTC', () => {
  const t = new Date('2026-10-26T17:00:00Z') // Taipei 10-27 01:00, Los Angeles 10-26 10:00
  assert.equal(localDay(t, taipei()), '2026-10-27')
  assert.equal(localDay(t, la()), '2026-10-26')
})
test('localDay: before the day start still counts as yesterday', () => {
  assert.equal(localDay(new Date('2026-10-26T17:00:00Z'), taipei(240)), '2026-10-26') // 01:00 < 04:00
  assert.equal(localDay(new Date('2026-10-26T20:00:00Z'), taipei(240)), '2026-10-27') // exactly 04:00
  assert.equal(localDay(new Date('2026-10-31T17:00:00Z'), taipei(240)), '2026-10-31') // rolls back across a month
})
test('localDay: day start holds on wall-clock time across DST', () => {
  // 2026-03-08 Los Angeles springs forward at 02:00 → 03:00 (PDT, UTC-7).
  assert.equal(localDay(new Date('2026-03-08T10:30:00Z'), la(240)), '2026-03-07') // 03:30, before 04:00
  assert.equal(localDay(new Date('2026-03-08T11:30:00Z'), la(240)), '2026-03-08') // 04:30
  // 2026-11-01 falls back at 02:00 → 01:00 (PST, UTC-8).
  assert.equal(localDay(new Date('2026-11-01T09:30:00Z'), la(240)), '2026-10-31') // the second 01:30
  assert.equal(localDay(new Date('2026-11-01T12:00:00Z'), la(240)), '2026-11-01') // 04:00 PST
})

test('lastNDays ends on today', () => {
  assert.deepEqual(lastNDays('2026-03-01', 3), ['2026-02-27', '2026-02-28', '2026-03-01'])
})

// --- daily ---
const daily = (from: string) => [{ effectiveFrom: from, kind: 'daily' as const }]

test('daily: consecutive days ending today', () => {
  const s = computeStreak({ createdOn: '2026-10-01', schedules: daily('2026-10-01'), checkIns: ['2026-10-24', '2026-10-25', '2026-10-26'], today: '2026-10-26' })
  assert.equal(s.current, 3)
  assert.equal(s.status, 'done')
})
test('daily: today not done yet is pending, not broken', () => {
  const s = computeStreak({ createdOn: '2026-10-01', schedules: daily('2026-10-01'), checkIns: ['2026-10-24', '2026-10-25'], today: '2026-10-26' })
  assert.equal(s.current, 2)
  assert.equal(s.status, 'pending')
})
test('daily: a missed past day breaks the streak; best keeps the longer run', () => {
  const s = computeStreak({
    createdOn: '2026-09-01', schedules: daily('2026-09-01'),
    checkIns: ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-03'], today: '2026-10-03',
  })
  assert.equal(s.current, 1)
  assert.equal(s.best, 3) // 09-29 → 10-01 crosses the month boundary
})
test('daily: check-ins before the habit existed do not count', () => {
  const s = computeStreak({ createdOn: '2026-10-25', schedules: daily('2026-10-25'), checkIns: ['2026-10-23', '2026-10-24', '2026-10-25'], today: '2026-10-25' })
  assert.equal(s.current, 1)
})
test('daily: no check-ins yet', () => {
  const s = computeStreak({ createdOn: '2026-10-26', schedules: daily('2026-10-26'), checkIns: [], today: '2026-10-26' })
  assert.deepEqual([s.current, s.best, s.status], [0, 0, 'pending'])
})
