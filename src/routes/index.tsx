// SSR mode: full (default). The habit list is the page's main content, so it is
// server-rendered for first paint; slow stats are streamed in after the shell.
import { Await, Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { Suspense, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { HabitForm } from '../habit-form'
import { getStats, listHabits, setCheckIn } from '../habits'

const filters = ['all', 'todo', 'done'] as const
const unit = { daily: '天', weekly: '週', interval: '次' } as const

type Row = Awaited<ReturnType<typeof listHabits>>[number]

function Progress({ p }: { p: Row['progress'] }) {
  if (p.kind === 'weekly') return <span>本週 {p.done}/{p.target}</span>
  if (p.kind === 'interval') return <span>{p.daysLeft === null ? '還沒開始' : p.daysLeft > 0 ? `剩 ${p.daysLeft} 天` : p.daysLeft === 0 ? '今天到期' : '已過期'}</span>
  return null
}

export const Route = createFileRoute('/')({
  validateSearch: z.object({ filter: z.enum(filters).default('all').catch('all') }),
  loaderDeps: ({ search }) => ({ filter: search.filter }),
  loader: async ({ deps }) => ({
    habits: await listHabits({ data: deps }),
    stats: getStats(), // not awaited: streamed to the client and resolved under <Suspense>
  }),
  component: Today,
})

function Today() {
  const { habits, stats } = Route.useLoaderData()
  const { filter } = Route.useSearch()
  const router = useRouter()
  // Ticks show instantly and stay until loader data agrees; clearing them when invalidate()
  // resolves flashed the old state back for a few hundred ms.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const checked = (h: Row) => optimistic[h.id] ?? h.checkedInToday

  useEffect(() => {
    setOptimistic((o) => {
      const pending = Object.entries(o).filter(([id, v]) => habits.find((h) => h.id === id)?.checkedInToday !== v)
      return pending.length === Object.keys(o).length ? o : Object.fromEntries(pending)
    })
  }, [habits])

  // One request at a time per habit, so the server ends on the user's last tap.
  const queue = useRef(new Map<string, Promise<unknown>>())

  const toggle = async (h: Row) => {
    setError('')
    const done = !checked(h)
    setOptimistic((o) => ({ ...o, [h.id]: done }))
    const send = (queue.current.get(h.id) ?? Promise.resolve()).catch(() => {}).then(() => setCheckIn({ data: { id: h.id, date: h.today, done } }))
    queue.current.set(h.id, send)
    try {
      await send
      await router.invalidate()
    } catch {
      setOptimistic(({ [h.id]: _, ...rest }) => rest) // roll back to what the server has
      setError(`「${h.name}」沒有記錄成功，請再試一次。`)
    }
  }

  return (
    <>
      <h1>Today</h1>
      <Suspense fallback={<p aria-busy="true">Crunching stats…</p>}>
        <Await promise={stats}>
          {(s) => <p>{s.doneToday}/{s.total} done today · best streak {s.bestStreak}</p>}
        </Await>
      </Suspense>

      <p>
        {filters.map((f) => (
          <Link key={f} to="/" search={{ filter: f }} style={{ marginRight: '.75rem' }}
            activeProps={{ style: { fontWeight: 700, marginRight: '.75rem' } }}>
            {f}
          </Link>
        ))}
      </p>

      {error && <p role="alert">{error}</p>}
      <ul>
        {habits.map((h) => (
          <li key={h.id}>
            <input type="checkbox" id={h.id} checked={checked(h)} onChange={() => toggle(h)} />
            <label htmlFor={h.id}>
              {h.name}
              {h.stackCue && <small className="cue">{h.stackCue}</small>}
            </label>
            <Progress p={h.progress} />
            <span>🔥 {h.streak} {unit[h.progress.kind]}</span>
            <span aria-label={`剩 ${h.freezesLeft} 張凍結卡`}>❄️×{h.freezesLeft}</span>
            <Link to="/habits/$habitId" params={{ habitId: h.id }}>details</Link>
          </li>
        ))}
        {habits.length === 0 && <li>{filter === 'all' ? '還沒有習慣，在下面新增第一個吧。' : '這裡沒有習慣。'}</li>}
      </ul>

      <HabitForm onSaved={() => router.invalidate()} />
    </>
  )
}
