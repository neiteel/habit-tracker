// SSR mode: full (default). The habit list is the page's main content, so it is
// server-rendered for first paint; the totals are streamed in after the shell.
import { Await, Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { Suspense, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { HabitForm } from '../habit-form'
import { getStats, listHabits, setCheckIn } from '../habits'
import { DEFAULT_TIME, localDay } from '../streak'

const filters = ['all', 'todo', 'done'] as const
const unit = { daily: '天', weekly: '週', interval: '次' } as const

type Row = Awaited<ReturnType<typeof listHabits>>[number]

function progressText(p: Row['progress']) {
  if (p.kind === 'weekly') return `本週 ${p.done}/${p.target}`
  if (p.kind === 'interval') return p.daysLeft === null ? '尚未開始' : p.daysLeft > 0 ? `剩 ${p.daysLeft} 天` : p.daysLeft === 0 ? '今天到期' : '已逾期'
  return '每天'
}

const filterLabel = { all: '全部', todo: '待完成', done: '已完成' } as const
const weekday = new Intl.DateTimeFormat('zh-Hant', { weekday: 'short', timeZone: 'UTC' })
const printDate = (iso: string) => `${iso.replaceAll('-', '.')} ${weekday.format(new Date(iso + 'T00:00:00Z'))}`

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

  const today = habits[0]?.today ?? localDay(new Date(), DEFAULT_TIME)

  return (
    <>
      <div className="sheet">
        <section className="receipt" aria-labelledby="today-title">
          <header className="masthead">
            <span className="eyebrow">Daily Record</span>
            <h1 id="today-title" className="brand">Habit Tracker</h1>
            <span className="meta">{printDate(today)}</span>
          </header>

          <nav className="tabs" aria-label="篩選">
            {filters.map((f) => (
              <Link key={f} to="/" search={{ filter: f }} activeOptions={{ includeSearch: true }}>
                {filterLabel[f]}
              </Link>
            ))}
          </nav>

          <hr className="rule" />

          {error && <p className="alert" role="alert">{error}</p>}
          <ul className="items">
            {habits.map((h) => (
              <li key={h.id} className="item">
                <input type="checkbox" className="tick" id={h.id} checked={checked(h)} onChange={() => toggle(h)} />
                <label htmlFor={h.id} className="line">
                  <span className="name">{h.name}</span>
                  <span className="leader" aria-hidden="true" />
                  <span className="value">{h.streak} {unit[h.progress.kind]}</span>
                </label>
                <div className="sub label">
                  <span>{progressText(h.progress)}</span>
                  {h.stackCue && <span>· {h.stackCue}</span>}
                  <span aria-label={`剩 ${h.freezesLeft} 張凍結卡`}>凍結 ×{h.freezesLeft}</span>
                  <Link to="/habits/$habitId" params={{ habitId: h.id }} aria-label={`${h.name} 明細`}>明細 →</Link>
                </div>
              </li>
            ))}
            {habits.length === 0 && <li className="empty">{filter === 'all' ? '還沒有習慣。從下面新增第一個吧。' : '這裡沒有習慣。'}</li>}
          </ul>

          <hr className="rule" />

          <Suspense fallback={<Totals />}>
            <Await promise={stats}>{(s) => <Totals s={s} />}</Await>
          </Suspense>

          <div className="barcode" aria-hidden="true" />
          <p className="footnote meta">每一個勾，都是給明天的自己</p>
        </section>
      </div>

      <HabitForm onSaved={() => router.invalidate()} />
    </>
  )
}

function Totals({ s }: { s?: Awaited<ReturnType<typeof getStats>> }) {
  const v = (n?: number) => (n === undefined ? '—' : n)
  return (
    <div className="totals" aria-busy={!s}>
      <div className="line"><span>習慣</span><span className="leader" /><span className="value">{v(s?.total)}</span></div>
      <div className="line"><span>最長連續</span><span className="leader" /><span className="value">{v(s?.bestStreak)}</span></div>
      <div className="line"><span>本月凍結卡剩餘</span><span className="leader" /><span className="value">{v(s?.freezesLeft)}</span></div>
      <hr className="rule double" />
      <div className="line grand"><span>今日完成</span><span className="leader" /><span className="value">{s ? `${s.doneToday} / ${s.total}` : '—'}</span></div>
    </div>
  )
}
