// SSR mode: full. A shareable, linkable page whose content is fully known on the server.
import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useState } from 'react'
import { z } from 'zod'
import { HabitForm } from '../habit-form'
import { deleteHabit, getHabit, setCheckIn } from '../habits'
import { canCheckIn, dayStatus, frozenDates, monthGrid } from '../streak'

const unit = { daily: '天', weekly: '週', interval: '次' } as const
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const statusLabel = { done: '已完成', frozen: '凍結保住', missed: '漏掉', open: '未打卡', future: '', before: '' } as const

const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 7)
}

export const Route = createFileRoute('/habits/$habitId')({
  validateSearch: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional().catch(undefined) }),
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
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  const thisMonth = habit.today.slice(0, 7)
  const firstMonth = habit.createdOn.slice(0, 7)
  const requested = Route.useSearch().month ?? thisMonth
  const month = requested > thisMonth ? thisMonth : requested < firstMonth ? firstMonth : requested

  const ctx = {
    today: habit.today,
    createdOn: habit.createdOn,
    done: new Set(habit.checkIns),
    frozen: frozenDates(habit.frozen),
    daily: habit.progress.kind === 'daily',
  }
  const backfilled = new Set(habit.backfilled)

  const backfill = async (date: string, done: boolean) => {
    setBusy(date)
    setError('')
    try {
      await setCheckIn({ data: { id: habit.id, date, done } })
      await router.invalidate()
    } catch {
      setError('沒有記錄成功，請再試一次。')
    } finally {
      setBusy(null)
    }
  }

  const row = (label: string, value: string | number) => (
    <div className="line"><span>{label}</span><span className="leader" /><span className="value">{value}</span></div>
  )

  return (
    <>
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

        <hr className="rule" />

        <div className="cal-head">
          <Link to="." search={{ month: shiftMonth(month, -1) }} disabled={month <= firstMonth} aria-label="上個月">←</Link>
          <h2>{month.replace('-', ' 年 ')} 月</h2>
          <Link to="." search={{ month: shiftMonth(month, 1) }} disabled={month >= thisMonth} aria-label="下個月">→</Link>
        </div>
        <div className="cal" role="grid" aria-label={`${month} 打卡月曆`}>
          {weekdays.map((w) => <span key={w} className="cal-wd label" role="columnheader">{w}</span>)}
          {monthGrid(month).map((d, i) => {
            if (!d) return <span key={`pad-${i}`} />
            const status = dayStatus(d, ctx)
            const label = `${Number(d.slice(8))} 日${statusLabel[status] ? `，${statusLabel[status]}` : ''}${backfilled.has(d) ? '（補簽）' : ''}`
            const common = {
              className: 'day',
              'data-status': status,
              'data-backfilled': backfilled.has(d) || undefined,
              'data-today': d === habit.today || undefined,
            }
            // Only today and the two days before can still change (D4).
            return canCheckIn(d, habit.today, habit.createdOn) ? (
              <button
                key={d}
                {...common}
                aria-label={`${label}，點一下${status === 'done' ? '取消' : d === habit.today ? '打卡' : '補簽'}`}
                aria-pressed={status === 'done'}
                aria-busy={busy === d}
                disabled={busy !== null}
                onClick={() => backfill(d, status !== 'done')}
              >
                {Number(d.slice(8))}
              </button>
            ) : (
              <span key={d} {...common} role="gridcell" aria-label={label}>{Number(d.slice(8))}</span>
            )
          })}
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        <p className="legend meta" aria-hidden="true">
          <span><i data-status="done" />完成</span>
          <span><i data-status="done" data-backfilled />補簽</span>
          <span><i data-status="frozen" />凍結</span>
          {ctx.daily && <span><i data-status="missed" />漏掉</span>}
        </p>
        <p className="meta footnote">今天、昨天和前天可以點選打卡或補簽</p>

        <div className="actions">
          <button className="btn ghost" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? '取消編輯' : '編輯'}
          </button>
          <AlertDialog.Root>
            <AlertDialog.Trigger className="btn ghost">刪除</AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Backdrop className="backdrop" />
              <AlertDialog.Viewport className="dialog-viewport">
                <AlertDialog.Popup className="dialog sheet">
                  <div className="receipt stack">
                    <AlertDialog.Title render={<h2 />}>刪除「{habit.name}」？</AlertDialog.Title>
                    <AlertDialog.Description className="meta">{habit.checkIns.length} 筆打卡紀錄會一起刪除，無法復原。</AlertDialog.Description>
                    <div className="actions">
                      <AlertDialog.Close className="btn ghost">保留</AlertDialog.Close>
                      <button
                        className="btn"
                        onClick={async () => {
                          await deleteHabit({ data: { id: habit.id } })
                          navigate({ to: '/', search: { filter: 'all' } })
                        }}
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                </AlertDialog.Popup>
              </AlertDialog.Viewport>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </div>
      </section>
    </div>
    {editing && (
      <HabitForm
        habit={{ ...habit, schedule: habit.schedules.at(-1)!, unit: unit[habit.progress.kind] }}
        onSaved={async () => {
          await router.invalidate()
          setEditing(false)
        }}
      />
    )}
    </>
  )
}
