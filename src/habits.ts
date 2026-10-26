// Server functions: safe to import anywhere. The compiler replaces handler bodies with RPC
// stubs in the client bundle, so `db` (server-only) never ships to the browser.
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { requireUser } from './server/auth'
import { type Habit, db } from './server/db'
import { habitInput } from './habit-input'
import { DEFAULT_TIME, canCheckIn, computeStreak, localDay, progress } from './streak'

const isoDay = z.iso.date()
// Any string from the client: a malformed id is just a missing habit (404), not a 500.
const id = z.string().max(64)

const view = (h: Habit) => {
  const today = localDay(new Date(), DEFAULT_TIME)
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
    progress: progress(h.schedules.at(-1)!, h.checkIns, today),
  }
}

export const listHabits = createServerFn({ method: 'GET' })
  .validator(z.object({ filter: z.enum(['all', 'todo', 'done']) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const all = (await db.list(user.id)).map(view)
    return data.filter === 'all' ? all : all.filter((h) => h.doneToday === (data.filter === 'done'))
  })

export const getHabit = createServerFn({ method: 'GET' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const h = await db.get(user.id, data.id)
    if (!h) throw notFound()
    return view(h)
  })

export const getStats = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  // Stand-in for a slow aggregate query, so the streamed section is visibly deferred.
  await new Promise((r) => setTimeout(r, 800))
  const all = (await db.list(user.id)).map(view)
  return {
    total: all.length,
    doneToday: all.filter((h) => h.doneToday).length,
    bestStreak: Math.max(0, ...all.map((h) => h.streak)),
  }
})

export const createHabit = createServerFn({ method: 'POST' })
  .validator(habitInput)
  .handler(async ({ data }) => {
    const user = await requireUser()
    return view(await db.create(user.id, { ...data, createdOn: localDay(new Date(), DEFAULT_TIME) }))
  })

export const updateHabit = createServerFn({ method: 'POST' })
  .validator(habitInput.extend({ id }))
  .handler(async ({ data: { id, ...input } }) => {
    const user = await requireUser()
    const h = await db.update(user.id, id, input, localDay(new Date(), DEFAULT_TIME))
    if (!h) throw notFound()
    return view(h)
  })

export const setCheckIn = createServerFn({ method: 'POST' })
  .validator(z.object({ id, date: isoDay, done: z.boolean() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const habit = await db.get(user.id, data.id)
    if (!habit) throw notFound()
    // The client sends the date, so the server decides whether that day is still open.
    if (!canCheckIn(data.date, localDay(new Date(), DEFAULT_TIME), habit.createdOn)) throw new Error('只能打卡今天，或補簽昨天和前天')
    return view((await db.setCheckIn(user.id, data.id, data.date, data.done))!)
  })

export const deleteHabit = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    if (!(await db.remove(user.id, data.id))) throw notFound()
  })
