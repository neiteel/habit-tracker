// Server functions: safe to import anywhere. The compiler replaces handler bodies with RPC
// stubs in the client bundle, so `db` (server-only) never ships to the browser.
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { requireUser } from './server/auth'
import { type Habit, db } from './server/db'
import { DEFAULT_TIME, computeStreak, localDay } from './streak'

const isoDay = z.iso.date()
// Any string from the client: a malformed id is just a missing habit (404), not a 500.
const id = z.string().max(64)

const view = (h: Habit) => {
  const s = computeStreak({ ...h, today: localDay(new Date(), DEFAULT_TIME) })
  return { ...h, doneToday: s.status === 'done', streak: s.current }
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
  .validator(z.object({ name: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return view(await db.create(user.id, { name: data.name, createdOn: localDay(new Date(), DEFAULT_TIME) }))
  })

export const toggleHabit = createServerFn({ method: 'POST' })
  .validator(z.object({ id, date: isoDay }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const h = await db.toggle(user.id, data.id, data.date)
    if (!h) throw notFound()
    return view(h)
  })

export const deleteHabit = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    if (!(await db.remove(user.id, data.id))) throw notFound()
  })
