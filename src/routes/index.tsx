// SSR mode: full (default). The habit list is the page's main content, so it is
// server-rendered for first paint. All habits load once; the tabs and totals are derived from
// them, so switching tabs never refetches or flashes placeholders.
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { Drawer } from '@base-ui/react/drawer'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { HabitForm } from '../habit-form'
import { getTime, listHabits, setCheckIn } from '../habits'
import { MILESTONES } from '../streak'

const filters = ['all', 'todo', 'done'] as const
const unit = { daily: '天', weekly: '週', interval: '次' } as const

type Row = Awaited<ReturnType<typeof listHabits>>[number]

function progressText(p: Row['progress']) {
  if (p.kind === 'weekly') return `本週 ${p.done}/${p.target}`
  if (p.kind === 'interval') return p.daysLeft === null ? '尚未開始' : p.daysLeft > 0 ? `剩 ${p.daysLeft} 天` : p.daysLeft === 0 ? '今天到期' : '已逾期'
  return '每天'
}

const filterLabel = { all: '全部', todo: '待完成', done: '已完成' } as const
const frozenNote = { daily: '昨天由凍結卡保住', weekly: '上週由凍結卡保住', interval: '上一段由凍結卡保住' } as const
const weekday = new Intl.DateTimeFormat('zh-Hant', { weekday: 'short', timeZone: 'UTC' })
const printDate = (iso: string) => `${iso.replaceAll('-', '.')} ${weekday.format(new Date(iso + 'T00:00:00Z'))}`

export const Route = createFileRoute('/')({
  validateSearch: z.object({ filter: z.enum(filters).default('all').catch('all') }),
  loader: async () => {
    const [habits, time] = await Promise.all([listHabits({ data: { filter: 'all' } }), getTime()])
    return { habits, today: time.today }
  },
  component: Today,
})

function Today() {
  const { habits: all, today } = Route.useLoaderData()
  const { filter } = Route.useSearch()
  const habits = filter === 'all' ? all : all.filter((h) => h.doneToday === (filter === 'done'))
  const router = useRouter()
  // Ticks show instantly and stay until loader data agrees; clearing them when invalidate()
  // resolves flashed the old state back for a few hundred ms.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const checked = (h: Row) => optimistic[h.id] ?? h.checkedInToday

  // Streaks as last committed to screen. A change rolls the number in, and crossing a milestone in
  // this session stamps it; nothing animates on a plain page load. `rolled`/`rose`/`slam` keep the
  // classes on through the re-renders that follow, then clear when the motion ends, so a row that
  // remounts on a tab switch shows its final state instead of playing again.
  const shown = useRef<Record<string, number>>({})
  const [rolled, setRolled] = useState<Record<string, number>>({})
  const [rose, setRose] = useState<Record<string, number>>({}) // streak a habit just rose to, for the "+1"
  const [milestone, setMilestone] = useState<Record<string, number>>({})
  const [slam, setSlam] = useState<Record<string, boolean>>({})
  const drop = (id: string) => <T,>({ [id]: _, ...rest }: Record<string, T>) => rest
  const settled = (id: string) => {
    setRolled(drop(id))
    setRose(drop(id))
  }
  const rolls = (h: Row) => rolled[h.id] === h.streak || (shown.current[h.id] !== undefined && shown.current[h.id] !== h.streak)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    setOptimistic((o) => {
      const pending = Object.entries(o).filter(([id, v]) => all.find((h) => h.id === id)?.checkedInToday !== v)
      return pending.length === Object.keys(o).length ? o : Object.fromEntries(pending)
    })
    const prev = shown.current
    const changed = all.filter((h) => prev[h.id] !== undefined && prev[h.id] !== h.streak)
    if (changed.length) setRolled((r) => ({ ...r, ...Object.fromEntries(changed.map((h) => [h.id, h.streak])) }))
    const up = changed.filter((h) => h.streak > prev[h.id]!)
    if (up.length) setRose((r) => ({ ...r, ...Object.fromEntries(up.map((h) => [h.id, h.streak])) }))
    const reached = changed.filter((h) => h.streak > prev[h.id]! && MILESTONES.includes(h.streak))
    if (reached.length) {
      navigator.vibrate?.([30, 60, 90])
      setMilestone((m) => ({ ...m, ...Object.fromEntries(reached.map((h) => [h.id, h.streak])) }))
      setSlam((s) => ({ ...s, ...Object.fromEntries(reached.map((h) => [h.id, true])) }))
    }
    shown.current = Object.fromEntries(all.map((h) => [h.id, h.streak]))
  }, [all])

  // One request at a time per habit, so the server ends on the user's last tap.
  const queue = useRef(new Map<string, Promise<unknown>>())

  const toggle = async (h: Row) => {
    setError('')
    navigator.vibrate?.(10) // Android only; same frame as the tick (iOS has no Vibration API)
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
                  <span className="value">
                    <span
                      key={h.streak}
                      className={rolls(h) ? (rose[h.id] === h.streak ? 'roll up' : 'roll') : undefined}
                      // A rise waits for its "+1" (an animation) to finish; a drop only has the roll.
                      onTransitionEnd={() => rose[h.id] !== h.streak && settled(h.id)}
                      onAnimationEnd={() => settled(h.id)}
                    >
                      {h.streak}
                    </span>{' '}
                    {unit[h.progress.kind]}
                  </span>
                </label>
                <div className="sub label">
                  <span>{progressText(h.progress)}</span>
                  {h.stackCue && <span>· {h.stackCue}</span>}
                  <span aria-label={`剩 ${h.freezesLeft} 張凍結卡`}>凍結 ×{h.freezesLeft}</span>
                  <Link to="/habits/$habitId" params={{ habitId: h.id }} aria-label={`${h.name} 明細`}>明細 →</Link>
                </div>
                {h.justFrozen && <p className="note print label">{frozenNote[h.progress.kind]}</p>}
                {milestone[h.id] && h.streak >= milestone[h.id] && (
                  <p
                    className={slam[h.id] ? 'milestone slam' : 'milestone'}
                    role="status"
                    onAnimationEnd={(e) => e.pseudoElement && setSlam(drop(h.id))} // the ring ends last
                  >★ 連續 {milestone[h.id]} {unit[h.progress.kind]} 達成</p>
                )}
              </li>
            ))}
            {habits.length === 0 && <li className="empty">{filter === 'all' ? '還沒有習慣。按下方「新增習慣」開始。' : '這裡沒有習慣。'}</li>}
          </ul>

          <hr className="rule" />

          <Totals habits={all} />

          <div className="barcode" aria-hidden="true" />
          <p className="footnote meta">每一個勾，都是給明天的自己</p>
        </section>
      </div>

      <Drawer.Root open={adding} onOpenChange={setAdding}>
        <Drawer.Trigger className="btn ghost">＋ 新增習慣</Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Backdrop className="drawer-backdrop" />
          <Drawer.Viewport className="drawer-viewport">
            <Drawer.Popup className="drawer">
              <Drawer.Content>
                <Drawer.Title className="sr-only">新增習慣</Drawer.Title>
                <span className="grabber" aria-hidden="true" />
                <HabitForm
                  onSaved={async () => {
                    await router.invalidate()
                    setAdding(false)
                  }}
                />
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}

function Totals({ habits }: { habits: Row[] }) {
  return (
    <div className="totals">
      <div className="line"><span>習慣</span><span className="leader" /><span className="value">{habits.length}</span></div>
      <div className="line"><span>最長連續</span><span className="leader" /><span className="value">{Math.max(0, ...habits.map((h) => h.streak))}</span></div>
      <div className="line"><span>本月凍結卡剩餘</span><span className="leader" /><span className="value">{habits.reduce((n, h) => n + h.freezesLeft, 0)}</span></div>
      <hr className="rule double" />
      <div className="line grand"><span>今日完成</span><span className="leader" /><span className="value">{habits.filter((h) => h.doneToday).length} / {habits.length}</span></div>
    </div>
  )
}
