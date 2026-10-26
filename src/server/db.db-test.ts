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
