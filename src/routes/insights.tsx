// SSR mode: 'data-only'. Data is fetched on the server during the first request (no
// client waterfall), but the heatmap labels days in the viewer's locale/timezone, which the
// server can't know — rendering it there would cause hydration mismatches.
import { createFileRoute } from '@tanstack/react-router'
import { listHabits } from '../habits'
import { DEFAULT_TIME, lastNDays, localDay } from '../streak'

export const Route = createFileRoute('/insights')({
  ssr: 'data-only',
  loader: () => listHabits({ data: { filter: 'all' } }),
  pendingComponent: () => <p aria-busy="true">Loading insights…</p>,
  component: Insights,
})

function Insights() {
  const habits = Route.useLoaderData()
  const days = lastNDays(localDay(new Date(), DEFAULT_TIME), 30)
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  return (
    <>
      <h1>Last 30 days</h1>
      {habits.map((h) => (
        <section key={h.id}>
          <h2>{h.name}</h2>
          <div className="grid" role="list" aria-label={`${h.name} history`}>
            {days.map((d) => {
              const done = h.checkIns.includes(d)
              const label = `${fmt.format(new Date(d + 'T00:00:00Z'))}: ${done ? 'done' : 'not done'}`
              return <div key={d} role="listitem" className="cell" data-done={done} title={label} aria-label={label} />
            })}
          </div>
        </section>
      ))}
    </>
  )
}
