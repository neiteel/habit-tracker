import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema.ts'

const url = process.env.DATABASE_URL_TEST
// These tests wipe the user table, so refuse anything that could be the real database.
if (!url || url === process.env.DATABASE_URL) {
  throw new Error('Set DATABASE_URL_TEST to a Neon test branch that differs from DATABASE_URL')
}
const db = drizzle(url, { schema })
const { user, habit, habitSchedule, checkIn } = schema
// The app's store reads DATABASE_URL at import time, so point it at the test branch first.
process.env.DATABASE_URL = url
const { db: store } = await import('./db.ts')

// Postgres error codes, unwrapped from Drizzle's query error.
const pgCode = (code: string) => (e: unknown) => ((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code) === code
const UNIQUE = pgCode('23505')
const CHECK = pgCode('23514')

before(() => db.delete(user)) // cascades through every table that references a user

async function newHabit(userId: string) {
  await db.insert(user).values({ id: userId, name: userId, email: `${userId}@test.local` })
  const [h] = await db.insert(habit).values({ userId, name: 'Read 20 pages', createdOn: '2026-10-26' }).returning()
  return h!
}

test('a habit day can be checked in only once', async () => {
  const h = await newHabit('u-unique')
  await db.insert(checkIn).values({ habitId: h.id, onDate: '2026-10-26' })
  await assert.rejects(db.insert(checkIn).values({ habitId: h.id, onDate: '2026-10-26' }), UNIQUE)
})

test('schedules reject frequency fields that do not match the kind', async () => {
  const h = await newHabit('u-check')
  await assert.rejects(db.insert(habitSchedule).values({ habitId: h.id, effectiveFrom: '2026-10-26', kind: 'weekly' }), CHECK)
  await assert.rejects(db.insert(habitSchedule).values({ habitId: h.id, effectiveFrom: '2026-10-26', kind: 'daily', intervalDays: 3 }), CHECK)
  await assert.rejects(db.insert(habitSchedule).values({ habitId: h.id, effectiveFrom: '2026-10-26', kind: 'interval', intervalDays: 1 }), CHECK)
  await db.insert(habitSchedule).values({ habitId: h.id, effectiveFrom: '2026-10-26', kind: 'weekly', weeklyTarget: 3 })
})

test('habit names must be 1–80 characters', async () => {
  await db.insert(user).values({ id: 'u-name', name: 'u-name', email: 'u-name@test.local' })
  await assert.rejects(db.insert(habit).values({ userId: 'u-name', name: '', createdOn: '2026-10-26' }), CHECK)
  await assert.rejects(db.insert(habit).values({ userId: 'u-name', name: 'x'.repeat(81), createdOn: '2026-10-26' }), CHECK)
})

test('deleting a user removes their habits, schedules and check-ins', async () => {
  const h = await newHabit('u-cascade')
  await db.insert(habitSchedule).values({ habitId: h.id, effectiveFrom: '2026-10-26', kind: 'daily' })
  await db.insert(checkIn).values({ habitId: h.id, onDate: '2026-10-26' })
  await db.delete(user).where(eq(user.id, 'u-cascade'))
  assert.equal((await db.select().from(habit).where(eq(habit.id, h.id))).length, 0)
  assert.equal((await db.select().from(habitSchedule).where(eq(habitSchedule.habitId, h.id))).length, 0)
  assert.equal((await db.select().from(checkIn).where(eq(checkIn.habitId, h.id))).length, 0)
})

// --- the app's store (src/server/db.ts) ---
async function newUser(id: string) {
  await db.insert(user).values({ id, name: id, email: `${id}@test.local` })
}

test('store: a created habit persists as daily with its local creation date', async () => {
  await newUser('u-store')
  const created = await store.create('u-store', { name: 'Walk 8k steps', createdOn: '2026-10-26' })
  const [h] = await store.list('u-store')
  assert.equal(h!.id, created.id)
  assert.deepEqual([h!.name, h!.createdOn, h!.schedules, h!.checkIns], ['Walk 8k steps', '2026-10-26', [{ effectiveFrom: '2026-10-26', kind: 'daily' }], []])
})

test('store: toggling a day adds then removes the check-in', async () => {
  await newUser('u-toggle')
  const h = await store.create('u-toggle', { name: 'Read', createdOn: '2026-10-26' })
  assert.deepEqual((await store.toggle('u-toggle', h.id, '2026-10-26'))!.checkIns, ['2026-10-26'])
  assert.deepEqual((await store.toggle('u-toggle', h.id, '2026-10-26'))!.checkIns, [])
})

test('store: one user cannot see, check in or delete another user\'s habit', async () => {
  await newUser('u-alice')
  await newUser('u-bob')
  const h = await store.create('u-alice', { name: 'Alice only', createdOn: '2026-10-26' })
  assert.deepEqual(await store.list('u-bob'), [])
  assert.equal(await store.get('u-bob', h.id), undefined)
  assert.equal(await store.toggle('u-bob', h.id, '2026-10-26'), undefined)
  assert.equal(await store.remove('u-bob', h.id), false)
  assert.deepEqual((await store.get('u-alice', h.id))!.checkIns, []) // untouched
  assert.equal(await store.remove('u-alice', h.id), true)
  assert.equal(await store.get('u-alice', h.id), undefined)
})

test('store: a malformed id is just a missing habit', async () => {
  await newUser('u-malformed')
  assert.equal(await store.get('u-malformed', 'not-a-uuid'), undefined)
})
