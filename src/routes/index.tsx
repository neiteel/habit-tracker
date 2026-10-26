// SSR mode: full (default). The habit list is the page's main content, so it is
// server-rendered for first paint; slow stats are streamed in after the shell.
import { Await, Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import { z } from 'zod'
import { createHabit, getStats, listHabits, toggleHabit } from '../habits'
import { DEFAULT_TIME, localDay } from '../streak'

const filters = ['all', 'todo', 'done'] as const

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
  const [name, setName] = useState('')

  const toggle = async (id: string) => {
    await toggleHabit({ data: { id, date: localDay(new Date(), DEFAULT_TIME) } })
    router.invalidate()
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

      <ul>
        {habits.map((h) => (
          <li key={h.id}>
            <input type="checkbox" id={h.id} checked={h.doneToday} onChange={() => toggle(h.id)} />
            <label htmlFor={h.id}>{h.name}</label>
            <span>🔥 {h.streak}</span>
            <Link to="/habits/$habitId" params={{ habitId: h.id }}>details</Link>
          </li>
        ))}
        {habits.length === 0 && <li>Nothing here.</li>}
      </ul>

      <form
        onSubmit={async (e) => {
          e.preventDefault()
          await createHabit({ data: { name } })
          setName('')
          router.invalidate()
        }}
      >
        <label>
          New habit <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </label>{' '}
        <button>Add</button>
      </form>
    </>
  )
}
