import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { exportData, getTime, saveDayStart } from '../habits'
import { toasts } from '../toast'

const hours = [0, 1, 2, 3, 4, 5, 6]

export const Route = createFileRoute('/settings')({
  loader: () => getTime(),
  component: Settings,
})

function Settings() {
  const { user } = Route.useRouteContext()
  const time = Route.useLoaderData()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [exporting, setExporting] = useState(false)
  const line = (label: string, value: string) => (
    <div className="line"><span>{label}</span><span className="leader" /><span className="value">{value}</span></div>
  )

  return (
    <div className="sheet">
      <section className="receipt stack" aria-labelledby="settings-title">
        <header className="masthead">
          <span className="eyebrow">Account</span>
          <h1 id="settings-title">設定</h1>
        </header>
        <div className="totals">
          {line('名稱', user?.name ?? '')}
          {line('帳號', user?.email ?? '')}
        </div>
        <hr className="rule" />
        <div className="totals">
          {line('時區', time.timeZone)}
          {line('今天', time.today.replaceAll('-', '.'))}
        </div>
        <label className="field">
          <span className="label">一天從幾點開始</span>
          <select
            value={time.dayStartMinutes}
            disabled={pending}
            onChange={async (e) => {
              const dayStartMinutes = Number(e.target.value)
              setPending(true)
              try {
                await saveDayStart({ data: { dayStartMinutes } })
                await router.invalidate()
                toasts.add({ title: '已儲存', description: `${String(dayStartMinutes / 60).padStart(2, '0')}:00 以前的打卡算前一天。` })
              } catch {
                toasts.add({ title: '沒有儲存成功', description: '請再試一次。' })
              } finally {
                setPending(false)
              }
            }}
          >
            {hours.map((h) => (
              <option key={h} value={h * 60}>{h === 0 ? '00:00（午夜）' : `0${h}:00`}</option>
            ))}
          </select>
        </label>
        <p className="meta">時區跟著這台裝置自動更新。熬夜的話，把一天的開始往後調，凌晨的打卡就會算在前一天。</p>
        <hr className="rule" />
        <span className="label">資料</span>
        <button
          type="button"
          className="btn ghost"
          disabled={exporting}
          onClick={async () => {
            setExporting(true)
            try {
              const blob = new Blob([JSON.stringify(await exportData(), null, 2)], { type: 'application/json' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `habit-tracker-${time.today}.json`
              a.click()
              // Revoke after the click has handed the URL to the download, not before.
              setTimeout(() => URL.revokeObjectURL(a.href))
            } catch {
              toasts.add({ title: '匯出失敗', description: '請再試一次。' })
            } finally {
              setExporting(false)
            }
          }}
        >
          {exporting ? '匯出中…' : '匯出 JSON'}
        </button>
        <p className="meta">下載你全部的習慣、打卡紀錄和設定。</p>
      </section>
    </div>
  )
}
