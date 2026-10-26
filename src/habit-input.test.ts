import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayStartInput, habitInput, timeZoneInput } from './habit-input.ts'

test('habitInput: accepts each frequency with its own field', () => {
  assert.equal(habitInput.safeParse({ name: 'Read', schedule: { kind: 'daily' } }).success, true)
  assert.equal(habitInput.safeParse({ name: 'Gym', schedule: { kind: 'weekly', weeklyTarget: 3 } }).success, true)
  assert.equal(habitInput.safeParse({ name: 'Call mum', schedule: { kind: 'interval', intervalDays: 3 } }).success, true)
})
test('habitInput: matches the database limits (weekly 1–7, interval 2–30)', () => {
  for (const schedule of [
    { kind: 'weekly', weeklyTarget: 0 }, { kind: 'weekly', weeklyTarget: 8 }, { kind: 'weekly' },
    { kind: 'interval', intervalDays: 1 }, { kind: 'interval', intervalDays: 31 }, { kind: 'interval', intervalDays: 2.5 },
  ]) assert.equal(habitInput.safeParse({ name: 'x', schedule }).success, false, JSON.stringify(schedule))
})
test('habitInput: trims the name and the stacking cue, and limits their length', () => {
  const ok = habitInput.parse({ name: '  Read  ', stackCue: '  after brushing teeth ', schedule: { kind: 'daily' } })
  assert.deepEqual([ok.name, ok.stackCue], ['Read', 'after brushing teeth'])
  assert.equal(habitInput.safeParse({ name: '   ', schedule: { kind: 'daily' } }).success, false)
  assert.equal(habitInput.safeParse({ name: 'x', stackCue: 'y'.repeat(121), schedule: { kind: 'daily' } }).success, false)
})
test('habitInput: an empty cue is no cue', () => {
  assert.equal(habitInput.parse({ name: 'Read', stackCue: '  ', schedule: { kind: 'daily' } }).stackCue, undefined)
})

test('timeZoneInput: accepts real IANA zones and rejects made-up ones', () => {
  for (const tz of ['Asia/Taipei', 'America/Los_Angeles', 'UTC']) assert.equal(timeZoneInput.safeParse(tz).success, true, tz)
  for (const tz of ['Mars/Olympus_Mons', '', 'Asia/Taipei; drop table']) assert.equal(timeZoneInput.safeParse(tz).success, false, tz)
})
test('dayStartInput: whole hours from midnight to 06:00, in minutes', () => {
  for (const m of [0, 60, 240, 360]) assert.equal(dayStartInput.safeParse(m).success, true, String(m))
  for (const m of [-60, 30, 420]) assert.equal(dayStartInput.safeParse(m).success, false, String(m))
})
