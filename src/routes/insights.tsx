// SSR mode: 'data-only'. Data is fetched on the server during the first request (no
// client waterfall), but the heatmap labels days in the viewer's locale/timezone, which the
// server can't know — rendering it there would cause hydration mismatches.
import { createFileRoute } from '@tanstack/react-router'
import { listHabits } from '../habits'
import { DEFAULT_TIME, frozenDates, lastNDays, localDay } from '../streak'

export const Route = createFileRoute('/insights')({
  ssr: 'data-only',
  loader: () => listHabits({ data: { filter: 'all' } }),
  pendingComponent: () => <p className="meta" aria-busy="true">讀取中…</p>,
  component: Insights,
})

function Insights() {
  const habits = Route.useLoaderData()
  const days = lastNDays(localDay(new Date(), DEFAULT_TIME), 30)
  const fmt = new Intl.DateTimeFormat('zh-Hant', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' })
  return (
    <div className="sheet">
      <section className="receipt" aria-labelledby="insights-title">
        <header className="masthead">
          <span className="eyebrow">Statement</span>
          <h1 id="insights-title">30 天紀錄</h1>
          <span className="meta">{days[0]!.replaceAll('-', '.')} — {days.at(-1)!.replaceAll('-', '.')}</span>
        </header>
        <hr className="rule" />
        {habits.length === 0 && <p className="empty">還沒有習慣。</p>}
        {habits.map((h) => {
          const frozen = frozenDates(h.frozen)
          return (
          <section key={h.id} className="history">
            <div className="line">
              <h2>{h.name}</h2>
              <span className="leader" aria-hidden="true" />
              <span className="value">{days.filter((d) => h.checkIns.includes(d)).length} / 30</span>
            </div>
            <div className="grid" role="list" aria-label={`${h.name} 的紀錄`}>
              {days.map((d) => {
                const status = h.checkIns.includes(d) ? 'done' : frozen.has(d) ? 'frozen' : undefined
                const label = `${fmt.format(new Date(d + 'T00:00:00Z'))}：${status === 'done' ? '已完成' : status === 'frozen' ? '凍結保住' : '未完成'}`
                return <div key={d} role="listitem" className="cell" data-status={status} title={label} aria-label={label} />
              })}
            </div>
          </section>
          )
        })}
        <p className="legend meta" aria-hidden="true">
          <span><i data-status="done" />完成</span>
          <span><i data-status="frozen" />凍結</span>
          <span><i />未完成</span>
        </p>
      </section>
    </div>
  )
}
