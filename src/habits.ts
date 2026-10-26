// Server functions: safe to import anywhere. The compiler replaces handler bodies with RPC
// stubs in the client bundle, so `db` (server-only) never ships to the browser.
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { requireUser } from './server/auth'
import { type Habit, db } from './server/db'
import { dayStartInput, habitInput, timeZoneInput } from './habit-input'
import { FALLBACK_TIME, type TimeSettings, backfilledDays, canCheckIn, computeStreak, localDay, progress } from './streak'

const isoDay = z.iso.date()
// Any string from the client: a malformed id is just a missing habit (404), not a 500.
const id = z.string().max(64)

/** The signed-in user and their clock: every "today" on the server is the user's local habit day. */
async function userAndTime() {
  const user = await requireUser()
  const time = (await db.timeSettings(user.id)) ?? FALLBACK_TIME
  return { user, time, today: localDay(new Date(), time) }
}

const view = (h: Habit, time: TimeSettings) => {
  const today = localDay(new Date(), time)
  const s = computeStreak({ ...h, today })
  return {
    ...h,
    today,
    // doneToday = this period's goal is met; checkedInToday = today's box is ticked (differs for weekly).
    doneToday: s.status === 'done',
    checkedInToday: h.checkIns.includes(today),
    streak: s.current,
    freezesLeft: s.freezesLeft,
    frozen: s.frozen,
    backfilled: backfilledDays(h.recordedAt, time),
    progress: progress(h.schedules.at(-1)!, h.checkIns, today),
  }
}

export const listHabits = createServerFn({ method: 'GET' })
  .validator(z.object({ filter: z.enum(['all', 'todo', 'done']) }))
  .handler(async ({ data }) => {
    const { user, time } = await userAndTime()
    const all = (await db.list(user.id)).map((h) => view(h, time))
    return data.filter === 'all' ? all : all.filter((h) => h.doneToday === (data.filter === 'done'))
  })

export const getHabit = createServerFn({ method: 'GET' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const { user, time } = await userAndTime()
    const h = await db.get(user.id, data.id)
    if (!h) throw notFound()
    return view(h, time)
  })

export const getStats = createServerFn({ method: 'GET' }).handler(async () => {
  const { user, time } = await userAndTime()
  const all = (await db.list(user.id)).map((h) => view(h, time))
  return {
    total: all.length,
    doneToday: all.filter((h) => h.doneToday).length,
    bestStreak: Math.max(0, ...all.map((h) => h.streak)),
    freezesLeft: all.reduce((n, h) => n + h.freezesLeft, 0),
  }
})

export const getTime = createServerFn({ method: 'GET' }).handler(async () => {
  const { time, today } = await userAndTime()
  return { ...time, today }
})

/**
 * The browser reports its zone on load. The first report creates the settings; a different zone
 * later (travel, a new device) replaces it, and the caller tells the user.
 */
export const syncTimeZone = createServerFn({ method: 'POST' })
  .validator(z.object({ timeZone: timeZoneInput }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return db.syncTimeZone(user.id, data.timeZone)
  })

export const saveDayStart = createServerFn({ method: 'POST' })
  .validator(z.object({ dayStartMinutes: dayStartInput }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    await db.saveTimeSettings(user.id, data)
  })

export const createHabit = createServerFn({ method: 'POST' })
  .validator(habitInput)
  .handler(async ({ data }) => {
    const { user, time, today } = await userAndTime()
    return view(await db.create(user.id, { ...data, createdOn: today }), time)
  })

export const updateHabit = createServerFn({ method: 'POST' })
  .validator(habitInput.extend({ id }))
  .handler(async ({ data: { id, ...input } }) => {
    const { user, time, today } = await userAndTime()
    const h = await db.update(user.id, id, input, today)
    if (!h) throw notFound()
    return view(h, time)
  })

export const setCheckIn = createServerFn({ method: 'POST' })
  .validator(z.object({ id, date: isoDay, done: z.boolean() }))
  .handler(async ({ data }) => {
    const { user, time, today } = await userAndTime()
    const habit = await db.get(user.id, data.id)
    if (!habit) throw notFound()
    // The client sends the date, so the server decides whether that day is still open.
    if (!canCheckIn(data.date, today, habit.createdOn)) throw new Error('只能打卡今天，或補簽昨天和前天')
    return view((await db.setCheckIn(user.id, data.id, data.date, data.done))!, time)
  })

export const deleteHabit = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    if (!(await db.remove(user.id, data.id))) throw notFound()
  })
