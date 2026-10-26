import '@tanstack/react-start/server-only'

export type Habit = { id: string; name: string; createdAt: string; done: string[] }

// shortcut: in-memory, per-process store — resets on restart and isn't shared across
// serverless instances; swap for a real database before deploying beyond one Node process.
const habits = new Map<string, Habit>()

for (const name of ['Read 20 pages', 'Walk 8k steps', 'No phone after 10pm']) {
  const id = crypto.randomUUID()
  habits.set(id, { id, name, createdAt: new Date().toISOString(), done: [] })
}

export const db = {
  list: () => [...habits.values()],
  get: (id: string) => habits.get(id),
  create(name: string) {
    const h: Habit = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), done: [] }
    habits.set(h.id, h)
    return h
  },
  toggle(id: string, date: string) {
    const h = habits.get(id)
    if (!h) return undefined
    h.done = h.done.includes(date) ? h.done.filter((d) => d !== date) : [...h.done, date].sort()
    return h
  },
  remove: (id: string) => habits.delete(id),
}
