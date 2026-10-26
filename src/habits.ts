// Server functions: safe to import anywhere. The compiler replaces handler bodies with RPC
// stubs in the client bundle, so `db` (server-only) never ships to the browser.
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from './server/db'
import { DEFAULT_TIME, computeStreak, localDay } from './streak'

const isoDay = z.iso.date()
const id = z.uuid()

const view = (h: NonNullable<ReturnType<typeof db.get>>) => {
  const today = localDay(new Date(), DEFAULT_TIME)
  const createdOn = localDay(new Date(h.createdAt), DEFAULT_TIME)
  // shortcut: every in-memory habit is daily; T9 reads the real schedule rows from Neon.
  const s = computeStreak({ createdOn, schedules: [{ effectiveFrom: createdOn, kind: 'daily' }], checkIns: h.done, today })
  return { ...h, doneToday: s.status === 'done', streak: s.current }
}

export const listHabits = createServerFn({ method: 'GET' })
  .validator(z.object({ filter: z.enum(['all', 'todo', 'done']) }))
  .handler(({ data }) => {
    const all = db.list().map(view)
    return data.filter === 'all' ? all : all.filter((h) => h.doneToday === (data.filter === 'done'))
  })

export const getHabit = createServerFn({ method: 'GET' })
  // Any string from the URL: a malformed id is just a missing habit (404), not a 500.
  .validator(z.object({ id: z.string().max(64) }))
  .handler(({ data }) => {
    const h = db.get(data.id)
    if (!h) throw notFound()
    return view(h)
  })

export const getStats = createServerFn({ method: 'GET' }).handler(async () => {
  // Stand-in for a slow aggregate query, so the streamed section is visibly deferred.
  await new Promise((r) => setTimeout(r, 800))
  const all = db.list().map(view)
  return {
    total: all.length,
    doneToday: all.filter((h) => h.doneToday).length,
    bestStreak: Math.max(0, ...all.map((h) => h.streak)),
  }
})

export const createHabit = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1).max(80) }))
  .handler(({ data }) => db.create(data.name))

export const toggleHabit = createServerFn({ method: 'POST' })
  .validator(z.object({ id, date: isoDay }))
  .handler(({ data }) => {
    const h = db.toggle(data.id, data.date)
    if (!h) throw notFound()
    return view(h)
  })

export const deleteHabit = createServerFn({ method: 'POST' })
  .validator(z.object({ id }))
  .handler(({ data }) => {
    db.remove(data.id)
  })
