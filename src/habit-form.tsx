import { useState } from 'react'
import { createHabit } from './habits'
import { habitInput } from './habit-input'

type Kind = 'daily' | 'weekly' | 'interval'

export function HabitForm({ onSaved }: { onSaved: () => void }) {
  const [kind, setKind] = useState<Kind>('daily')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  return (
    <form
      className="receipt"
      onSubmit={async (e) => {
        e.preventDefault()
        const form = e.currentTarget // React clears currentTarget once the handler awaits
        const f = new FormData(form)
        const n = Number(f.get('n'))
        const schedule = kind === 'daily' ? { kind } : kind === 'weekly' ? { kind, weeklyTarget: n } : { kind, intervalDays: n }
        const parsed = habitInput.safeParse({ name: f.get('name'), stackCue: f.get('stackCue') ?? undefined, schedule })
        if (!parsed.success) return setError('請檢查欄位：名稱 1–80 字、每週 1–7 次、間隔 2–30 天。')
        setError('')
        setPending(true)
        try {
          await createHabit({ data: parsed.data })
          form.reset()
          setKind('daily')
          onSaved()
        } catch {
          setError('新增失敗，請再試一次。')
        } finally {
          setPending(false)
        }
      }}
    >
      <h2>新增習慣</h2>
      <label>
        名稱 <input name="name" required maxLength={80} />
      </label>
      <label>
        頻率{' '}
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="daily">每天</option>
          <option value="weekly">每週 N 次</option>
          <option value="interval">每隔 X 天</option>
        </select>
      </label>
      {kind === 'weekly' && (
        <label>
          每週 <input key="weekly" name="n" type="number" required min={1} max={7} defaultValue={3} /> 次
        </label>
      )}
      {kind === 'interval' && (
        <label>
          每隔 <input key="interval" name="n" type="number" required min={2} max={30} defaultValue={3} /> 天
        </label>
      )}
      <label>
        習慣疊加（可留空） <input name="stackCue" maxLength={120} placeholder="例如：刷完牙後" />
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>{pending ? '新增中…' : '新增'}</button>
    </form>
  )
}
