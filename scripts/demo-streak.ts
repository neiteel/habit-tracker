// Dev only: give a daily habit N checked-in days before today and clear today, so the next tap on
// Today rolls the streak to N+1 (default 6 → the 7-day milestone). Writes to DATABASE_URL.
//   pnpm demo:streak "<habit name>" [days]
import { and, eq, gte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../src/server/schema.ts'
import { FALLBACK_TIME, lastNDays, localDay } from '../src/streak.ts'

const { habit, habitSchedule, checkIn, timeSettings } = schema
const [name, days = '6'] = process.argv.slice(2)
const n = Number(days)
if (!name || !Number.isInteger(n) || n < 1 || n > 365) throw new Error('usage: pnpm demo:streak "<habit name>" [days 1–365]')

const orm = drizzle(process.env.DATABASE_URL!, { schema })
const matches = await orm.query.habit.findMany({ where: eq(habit.name, name), with: { schedules: true } })
if (matches.length !== 1) throw new Error(`expected one habit named "${name}", found ${matches.length}`)
const h = matches[0]!
// shortcut: daily habits only; weekly/interval would need N weeks/windows of check-ins.
if (h.schedules.length !== 1 || h.schedules[0]!.kind !== 'daily') throw new Error('only works on a daily habit with no frequency edits')

const time = (await orm.query.timeSettings.findFirst({ where: eq(timeSettings.userId, h.userId) })) ?? FALLBACK_TIME
const today = localDay(new Date(), time)
const past = lastNDays(today, n + 1).slice(0, -1)
const from = past[0]!

await orm.batch([
  // The habit has to exist on those days for them to count.
  orm.update(habit).set({ createdOn: from }).where(eq(habit.id, h.id)),
  orm.update(habitSchedule).set({ effectiveFrom: from }).where(eq(habitSchedule.habitId, h.id)),
  orm.delete(checkIn).where(and(eq(checkIn.habitId, h.id), gte(checkIn.onDate, from))),
  // Recorded on the day itself (noon UTC), so the calendar doesn't mark them as backfilled.
  orm.insert(checkIn).values(past.map((d) => ({ habitId: h.id, onDate: d, createdAt: new Date(d + 'T12:00:00Z') }))),
])
console.log(`「${name}」: ${n} days checked in (${from} → ${past.at(-1)}), today cleared. Reload Today and tick it → ${n + 1}.`)
