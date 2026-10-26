import '@tanstack/react-start/server-only'
import { and, asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import { z } from 'zod'
import type { HabitInput } from '../habit-input.ts'
import type { Schedule } from '../streak.ts'
import * as schema from './schema.ts'

const { habit, habitSchedule, checkIn } = schema

export const orm = drizzle(process.env.DATABASE_URL!, { schema })

export type Habit = { id: string; name: string; stackCue: string | null; createdOn: string; schedules: Schedule[]; checkIns: string[] }

type ScheduleRow = typeof habitSchedule.$inferSelect

const toSchedule = ({ effectiveFrom, kind, weeklyTarget, intervalDays }: ScheduleRow): Schedule =>
  kind === 'daily' ? { effectiveFrom, kind }
  : kind === 'weekly' ? { effectiveFrom, kind, weeklyTarget: weeklyTarget! }
  : { effectiveFrom, kind, intervalDays: intervalDays! }

// A non-UUID would make Postgres throw (22P02); to callers it is simply a habit that doesn't exist.
const isId = (id: string) => z.uuid().safeParse(id).success

async function find(userId: string, id?: string): Promise<Habit[]> {
  const rows = await orm.query.habit.findMany({
    // Every query is scoped to the signed-in user, so one user's ids are useless to another.
    where: id ? and(eq(habit.userId, userId), eq(habit.id, id)) : eq(habit.userId, userId),
    with: { schedules: true, checkIns: { columns: { onDate: true }, orderBy: asc(checkIn.onDate) } },
    orderBy: asc(habit.createdAt),
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    stackCue: r.stackCue,
    createdOn: r.createdOn,
    schedules: r.schedules.map(toSchedule),
    checkIns: r.checkIns.map((c) => c.onDate),
  }))
}

export const db = {
  list: (userId: string) => find(userId),
  async get(userId: string, id: string) {
    return isId(id) ? (await find(userId, id))[0] : undefined
  },
  async create(userId: string, { name, stackCue, schedule, createdOn }: HabitInput & { createdOn: string }): Promise<Habit> {
    const id = crypto.randomUUID()
    const first = { ...schedule, effectiveFrom: createdOn }
    await orm.batch([
      orm.insert(habit).values({ id, userId, name, stackCue, createdOn }),
      orm.insert(habitSchedule).values({ habitId: id, ...first }),
    ])
    return { id, name, stackCue: stackCue ?? null, createdOn, schedules: [first], checkIns: [] }
  },
  // Sets rather than flips: a flip read-then-wrote, so two quick taps could both see "done" and both delete.
  async setCheckIn(userId: string, id: string, date: string, done: boolean) {
    const h = await db.get(userId, id)
    if (!h) return undefined
    if (done) await orm.insert(checkIn).values({ habitId: id, onDate: date }).onConflictDoNothing()
    else await orm.delete(checkIn).where(and(eq(checkIn.habitId, id), eq(checkIn.onDate, date)))
    const others = h.checkIns.filter((d) => d !== date)
    return { ...h, checkIns: done ? [...others, date].sort() : others }
  },
  async remove(userId: string, id: string) {
    if (!isId(id)) return false
    const gone = await orm.delete(habit).where(and(eq(habit.id, id), eq(habit.userId, userId))).returning({ id: habit.id })
    return gone.length > 0
  },
}
