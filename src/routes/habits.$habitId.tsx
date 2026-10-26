// SSR mode: full. A shareable, linkable page whose content is fully known on the server.
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { deleteHabit, getHabit } from '../habits'

const unit = { daily: '天', weekly: '週', interval: '次' } as const

export const Route = createFileRoute('/habits/$habitId')({
  loader: ({ params }) => getHabit({ data: { id: params.habitId } }),
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.name ?? '習慣'} · Habit Tracker` }] }),
  notFoundComponent: () => (
    <div className="sheet">
      <section className="receipt">
        <p className="empty">找不到這個習慣。</p>
        <Link className="btn ghost" to="/" search={{ filter: 'all' }}>回到今日</Link>
      </section>
    </div>
  ),
  component: HabitPage,
})

function HabitPage() {
  const habit = Route.useLoaderData()
  const navigate = useNavigate()
  const row = (label: string, value: string | number) => (
    <div className="line"><span>{label}</span><span className="leader" /><span className="value">{value}</span></div>
  )
  return (
    <div className="sheet">
      <section className="receipt stack" aria-labelledby="habit-title">
        <header className="masthead">
          <span className="eyebrow">Item Detail</span>
          <h1 id="habit-title">{habit.name}</h1>
          <span className="meta">自 {habit.createdOn.replaceAll('-', '.')}</span>
        </header>
        <div className="totals">
          {row('目前連續', `${habit.streak} ${unit[habit.progress.kind]}`)}
          {row('打卡天數', habit.checkIns.length)}
          {row('本月凍結剩餘', habit.freezesLeft)}
          {habit.stackCue && row('習慣疊加', habit.stackCue)}
        </div>
        <button
          className="btn ghost"
          onClick={async () => {
            // shortcut: native confirm until T13 brings the styled confirmation dialog.
            if (!confirm(`刪除「${habit.name}」？打卡紀錄會一起刪除。`)) return
            await deleteHabit({ data: { id: habit.id } })
            navigate({ to: '/', search: { filter: 'all' } })
          }}
        >
          刪除習慣
        </button>
      </section>
    </div>
  )
}
