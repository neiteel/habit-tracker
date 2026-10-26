import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canCheckIn, computeStreak, dayStatus, frozenDates, lastNDays, localDay, monthGrid, progress } from './streak.ts'

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
test('daily: a gap longer than the freezes breaks the streak; best keeps the longer run', () => {
  const s = computeStreak({
    createdOn: '2026-09-01', schedules: daily('2026-09-01'),
    checkIns: ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-05'], today: '2026-10-05', // 10-02 → 10-04 missed
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
test('weekly: closed weeks below target beyond the freezes break the streak', () => {
  const s = computeStreak({
    createdOn: '2026-10-05', schedules: weekly('2026-10-05', 3),
    checkIns: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-19', '2026-10-20'], today: '2026-11-04', // weeks of 10-12, 10-19, 10-26 short
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
test('interval: checking in on day X+1 needs a freeze', () => {
  const s = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: ['2026-10-01', '2026-10-05'], today: '2026-10-05' })
  assert.deepEqual([s.current, s.frozen], [2, ['2026-10-04']])
})
test('interval: missing more windows than the freezes starts over', () => {
  const s = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: ['2026-10-01', '2026-10-11'], today: '2026-10-11' })
  assert.deepEqual([s.current, s.best], [1, 1])
})
test('interval: the open window is pending until its deadline passes', () => {
  const alive = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: ['2026-10-01'], today: '2026-10-04' })
  assert.deepEqual([alive.current, alive.status], [1, 'pending'])
  const lapsed = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: ['2026-10-01'], today: '2026-10-11' }) // 3 windows closed
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

// --- freezes: 2 per habit per calendar month, only when they cover the whole gap ---
const range = (from: string, to: string, skip: string[] = []) => {
  const out: string[] = []
  for (let d = new Date(from + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10)
    if (!skip.includes(iso)) out.push(iso)
  }
  return out
}

test('freeze: one missed day is covered and does not add to the count', () => {
  const s = computeStreak({ createdOn: '2026-10-20', schedules: daily('2026-10-20'), checkIns: ['2026-10-20', '2026-10-21', '2026-10-23', '2026-10-24'], today: '2026-10-24' })
  assert.deepEqual([s.current, s.frozen, s.freezesLeft], [4, ['2026-10-22'], 1])
})
test('freeze: a gap longer than the freezes left breaks the streak and spends none', () => {
  const s = computeStreak({ createdOn: '2026-10-20', schedules: daily('2026-10-20'), checkIns: ['2026-10-20', '2026-10-24'], today: '2026-10-24' })
  assert.deepEqual([s.current, s.frozen, s.freezesLeft], [1, [], 2])
})
test('freeze: the allowance is per calendar month and resets on the 1st', () => {
  const s = computeStreak({
    createdOn: '2026-10-01', schedules: daily('2026-10-01'),
    checkIns: range('2026-10-01', '2026-11-05', ['2026-10-05', '2026-10-15', '2026-10-25', '2026-11-03']), today: '2026-11-05',
  })
  // 10-25 is October's third miss, so the streak breaks there; November gets a fresh pair.
  assert.deepEqual([s.current, s.best, s.frozen, s.freezesLeft], [10, 22, ['2026-10-05', '2026-10-15', '2026-11-03'], 1])
})
test('freeze: nothing is spent before there is a streak to protect', () => {
  const s = computeStreak({ createdOn: '2026-10-20', schedules: daily('2026-10-20'), checkIns: ['2026-10-23'], today: '2026-10-23' })
  assert.deepEqual([s.current, s.frozen, s.freezesLeft], [1, [], 2])
})
test('freeze: a backfilled check-in hands the freeze back', () => {
  const s = computeStreak({ createdOn: '2026-10-20', schedules: daily('2026-10-20'), checkIns: range('2026-10-20', '2026-10-24'), today: '2026-10-24' })
  assert.deepEqual([s.current, s.frozen, s.freezesLeft], [5, [], 2])
})
test('freeze: weekly covers a whole ISO week', () => {
  const s = computeStreak({
    createdOn: '2026-10-05', schedules: weekly('2026-10-05', 2),
    checkIns: ['2026-10-05', '2026-10-06', '2026-10-13', '2026-10-19', '2026-10-20'], today: '2026-10-26',
  })
  assert.deepEqual([s.current, s.frozen, s.status], [2, ['2026-W42'], 'pending'])
})
test('freeze: weekly week key across the new year is 2026-W53', () => {
  const s = computeStreak({
    createdOn: '2026-12-21', schedules: weekly('2026-12-21', 2),
    checkIns: ['2026-12-21', '2026-12-22', '2027-01-04', '2027-01-05'], today: '2027-01-06',
  })
  assert.deepEqual([s.current, s.frozen], [2, ['2026-W53']])
})
test('freeze: interval covers one X-day window, keyed by its deadline', () => {
  const s = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: ['2026-10-01', '2026-10-06'], today: '2026-10-06' })
  assert.deepEqual([s.current, s.frozen], [2, ['2026-10-04']])
})
test('freeze: interval gap of three windows is too long for two freezes', () => {
  const s = computeStreak({ createdOn: '2026-10-01', schedules: every('2026-10-01', 3), checkIns: ['2026-10-01', '2026-10-12'], today: '2026-10-12' })
  assert.deepEqual([s.current, s.frozen], [1, []])
})

// --- schedule changes apply going forward (SPEC-habits §6) ---
test('schedule: changing only the target keeps the streak', () => {
  const s = computeStreak({
    createdOn: '2026-10-05',
    schedules: [{ effectiveFrom: '2026-10-05', kind: 'weekly', weeklyTarget: 3 }, { effectiveFrom: '2026-10-21', kind: 'weekly', weeklyTarget: 2 }],
    checkIns: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-19', '2026-10-20'],
    today: '2026-10-25',
  })
  // The week of the change (10-19) is judged by the new target of 2.
  assert.deepEqual([s.current, s.status], [3, 'done'])
})
test('schedule: switching kind starts over, spends no freeze, and best only compares the new kind', () => {
  const s = computeStreak({
    createdOn: '2026-10-20',
    schedules: [{ effectiveFrom: '2026-10-20', kind: 'daily' }, { effectiveFrom: '2026-10-26', kind: 'interval', intervalDays: 2 }],
    checkIns: ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-24', '2026-10-26'],
    today: '2026-10-26',
  })
  // The daily run (4 days, 10-23 frozen) ends at the switch; the 10-25 gap left behind spends nothing.
  assert.deepEqual([s.current, s.best, s.frozen, s.freezesLeft], [1, 1, ['2026-10-23'], 1])
})
test('schedule: a new interval judges the gap from the last check-in under the old one', () => {
  const s = computeStreak({
    createdOn: '2026-10-01',
    schedules: [{ effectiveFrom: '2026-10-01', kind: 'interval', intervalDays: 3 }, { effectiveFrom: '2026-10-06', kind: 'interval', intervalDays: 5 }],
    checkIns: ['2026-10-01', '2026-10-04', '2026-10-09'], // 10-04 → 10-09 is 5 days: on time under X=5
    today: '2026-10-09',
  })
  assert.deepEqual([s.current, s.frozen], [3, []])
})

// --- which days can be checked in (D4: today, plus backfilling the two days before) ---
test('canCheckIn: today, yesterday and the day before', () => {
  for (const d of ['2026-10-26', '2026-10-25', '2026-10-24']) assert.equal(canCheckIn(d, '2026-10-26', '2026-10-01'), true, d)
})
test('canCheckIn: rejects three days ago and the future', () => {
  assert.equal(canCheckIn('2026-10-23', '2026-10-26', '2026-10-01'), false)
  assert.equal(canCheckIn('2026-10-27', '2026-10-26', '2026-10-01'), false)
})
test('canCheckIn: rejects days before the habit existed', () => {
  assert.equal(canCheckIn('2026-10-25', '2026-10-26', '2026-10-26'), false)
})

// --- what the Today row shows for the period in progress ---
test('progress: weekly counts this ISO week only', () => {
  const p = progress({ effectiveFrom: '2026-10-01', kind: 'weekly', weeklyTarget: 3 }, ['2026-10-25', '2026-10-26', '2026-10-28'], '2026-10-28')
  assert.deepEqual(p, { kind: 'weekly', done: 2, target: 3 }) // 10-25 is last week's Sunday
})
test('progress: interval counts days left until the window closes', () => {
  const s = { effectiveFrom: '2026-10-01', kind: 'interval', intervalDays: 3 } as const
  assert.deepEqual(progress(s, ['2026-10-24'], '2026-10-26'), { kind: 'interval', daysLeft: 1 })
  assert.deepEqual(progress(s, ['2026-10-23'], '2026-10-26'), { kind: 'interval', daysLeft: 0 }) // due today
  assert.deepEqual(progress(s, [], '2026-10-26'), { kind: 'interval', daysLeft: null }) // not started
})
test('progress: daily has nothing extra to show', () => {
  assert.deepEqual(progress({ effectiveFrom: '2026-10-01', kind: 'daily' }, [], '2026-10-26'), { kind: 'daily' })
})

// --- calendar on the habit detail page ---
test('monthGrid: Monday-first weeks, padded with nulls', () => {
  const g = monthGrid('2026-10') // 2026-10-01 is a Thursday
  assert.deepEqual(g.slice(0, 4), [null, null, null, '2026-10-01'])
  assert.equal(g.length % 7, 0)
  assert.equal(g.filter(Boolean).length, 31)
  assert.equal(g.at(-1) === null || g.at(-1) === '2026-10-31', true)
})
test('monthGrid: February in a leap year', () => {
  assert.equal(monthGrid('2028-02').filter(Boolean).length, 29)
})
test('frozenDates: daily and interval keys are dates; a weekly key covers its whole ISO week', () => {
  assert.deepEqual([...frozenDates(['2026-10-22'])], ['2026-10-22'])
  assert.deepEqual([...frozenDates(['2026-W42'])], ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
  assert.deepEqual([...frozenDates(['2026-W53'])].slice(0, 1), ['2026-12-28'])
  assert.deepEqual([...frozenDates(['2027-W01'])].slice(0, 1), ['2027-01-04'])
})
test('dayStatus: done, frozen, missed (daily only), open, future and before the habit', () => {
  const ctx = { today: '2026-10-26', createdOn: '2026-10-10', done: new Set(['2026-10-20']), frozen: new Set(['2026-10-21']), daily: true }
  assert.equal(dayStatus('2026-10-20', ctx), 'done')
  assert.equal(dayStatus('2026-10-21', ctx), 'frozen')
  assert.equal(dayStatus('2026-10-22', ctx), 'missed')
  assert.equal(dayStatus('2026-10-26', ctx), 'open')
  assert.equal(dayStatus('2026-10-27', ctx), 'future')
  assert.equal(dayStatus('2026-10-09', ctx), 'before')
  assert.equal(dayStatus('2026-10-22', { ...ctx, daily: false }), 'open') // weekly/interval days are not misses on their own
})
