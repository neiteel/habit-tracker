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

// --- weekly (ISO weeks, Monday first). 2026-10-26 is a Monday. ---
const weekly = (from: string, weeklyTarget: number) => [{ effectiveFrom: from, kind: 'weekly' as const, weeklyTarget }]

test('weekly: this week below target is pending; met weeks count', () => {
  const s = computeStreak({
    createdOn: '2026-10-05', schedules: weekly('2026-10-05', 3),
    checkIns: ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-18', '2026-10-19', '2026-10-21', '2026-10-25', '2026-10-27'],
    today: '2026-10-28',
  })
  assert.equal(s.current, 3)
  assert.equal(s.status, 'pending')
})
test('weekly: reaching the target this week makes it done', () => {
  const s = computeStreak({
    createdOn: '2026-10-19', schedules: weekly('2026-10-19', 2),
    checkIns: ['2026-10-19', '2026-10-20', '2026-10-26', '2026-10-27'], today: '2026-10-28',
  })
  assert.deepEqual([s.current, s.status], [2, 'done'])
})
test('weekly: a closed week below target breaks the streak', () => {
  const s = computeStreak({
    createdOn: '2026-10-12', schedules: weekly('2026-10-12', 3),
    checkIns: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-19', '2026-10-20'], today: '2026-10-28',
  })
  assert.deepEqual([s.current, s.best], [0, 1])
})
test('weekly: the creation week only asks for the days that were left', () => {
  // Created on Saturday with a target of 3: only Sat + Sun remain, so 2 is enough.
  const met = computeStreak({ createdOn: '2026-10-24', schedules: weekly('2026-10-24', 3), checkIns: ['2026-10-24', '2026-10-25'], today: '2026-10-26' })
  assert.equal(met.current, 1)
  const missed = computeStreak({ createdOn: '2026-10-24', schedules: weekly('2026-10-24', 3), checkIns: ['2026-10-25'], today: '2026-10-26' })
  assert.equal(missed.current, 0)
})
test('weekly: ISO week 2026-W53 spans the new year as one week', () => {
  const s = computeStreak({
    createdOn: '2026-12-21', schedules: weekly('2026-12-21', 2),
    checkIns: ['2026-12-21', '2026-12-23', '2026-12-30', '2027-01-02', '2027-01-05', '2027-01-06'], today: '2027-01-06',
  })
  assert.deepEqual([s.current, s.status], [3, 'done'])
})

// --- interval: check in again within X days of the last check-in ---
const every = (from: string, intervalDays: number) => [{ effectiveFrom: from, kind: 'interval' as const, intervalDays }]

test('interval: checking in on day X keeps the streak', () => {
  const s = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: ['2026-10-01', '2026-10-04'], today: '2026-10-04' })
  assert.deepEqual([s.current, s.status], [2, 'done'])
})
test('interval: checking in on day X+1 starts over', () => {
  const s = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: ['2026-10-01', '2026-10-05'], today: '2026-10-05' })
  assert.deepEqual([s.current, s.best], [1, 1])
})
test('interval: the open window is pending until its deadline passes', () => {
  const alive = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: ['2026-10-01'], today: '2026-10-04' })
  assert.deepEqual([alive.current, alive.status], [1, 'pending'])
  const lapsed = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: ['2026-10-01'], today: '2026-10-05' })
  assert.deepEqual([lapsed.current, lapsed.best, lapsed.status], [0, 1, 'pending'])
})
test('interval: every on-time check-in counts, even inside one window', () => {
  const s = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: ['2026-10-01', '2026-10-02'], today: '2026-10-02' })
  assert.equal(s.current, 2)
})
test('interval: nothing to count before the first check-in', () => {
  const s = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: [], today: '2026-10-09' })
  assert.deepEqual([s.current, s.status], [0, 'pending'])
})
