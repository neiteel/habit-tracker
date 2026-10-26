// Dates are the user's local "habit days" as 'YYYY-MM-DD' strings; date math below runs in UTC
// only because a calendar date has no time zone.
export type TimeSettings = { timeZone: string; dayStartMinutes: number }

// shortcut: one fixed zone for server and client alike, so SSR and the browser agree on "today";
// replace with the user's time_settings row in T15.
export const DEFAULT_TIME: TimeSettings = { timeZone: 'Asia/Taipei', dayStartMinutes: 0 }

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The habit day `now` falls on: before `dayStartMinutes` past local midnight still counts as yesterday. */
export function localDay(now: Date, { timeZone, dayStartMinutes }: TimeSettings): string {
  // Read the local wall clock rather than shifting the instant, which is off by an hour across DST.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  )
  const date = `${parts.year}-${parts.month}-${parts.day}`
  return Number(parts.hour) * 60 + Number(parts.minute) < dayStartMinutes ? addDays(date, -1) : date
}

export type Schedule = { effectiveFrom: string } & (
  | { kind: 'daily' }
  | { kind: 'weekly'; weeklyTarget: number }
  | { kind: 'interval'; intervalDays: number }
)

export type StreakInput = { createdOn: string; schedules: Schedule[]; checkIns: string[]; today: string }
export type Streak = {
  current: number
  best: number
  status: 'done' | 'pending'
  /** Keys of the periods a freeze covered: 'YYYY-MM-DD' (daily), 'YYYY-Www' (weekly), or a window's deadline (interval). */
  frozen: string[]
  freezesLeft: number
}

export const FREEZES_PER_MONTH = 2

// Each period becomes one unit: met, closed and missed, or still open.
type Unit = { type: 'hit' | 'pending' } | { type: 'miss'; key: string; month: string }

const miss = (key: string, monthOf: string): Unit => ({ type: 'miss', key, month: monthOf.slice(0, 7) })
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000
const mondayOf = (iso: string) => addDays(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7))
const isoWeek = (mon: string) => {
  const thu = addDays(mon, 3) // the Thursday decides which year a week belongs to
  const week = Math.floor(daysBetween(thu.slice(0, 4) + '-01-01', thu) / 7) + 1
  return `${thu.slice(0, 4)}-W${String(week).padStart(2, '0')}`
}

// `until` is the next schedule's start (exclusive); without it a segment runs through today.
function dailyUnits(from: string, until: string | undefined, today: string, done: Set<string>): Unit[] {
  const units: Unit[] = []
  for (let d = from; d <= today && (!until || d < until); d = addDays(d, 1)) {
    units.push(done.has(d) ? { type: 'hit' } : d === today ? { type: 'pending' } : miss(d, d))
  }
  return units
}

function weeklyUnits(from: string, until: string | undefined, today: string, done: Set<string>, target: number, prorate: boolean): Unit[] {
  const units: Unit[] = []
  // A changed target takes over the whole week it changed in, so the old segment stops before it.
  for (let mon = mondayOf(from); mon <= today && (!until || mon < mondayOf(until)); mon = addDays(mon, 7)) {
    const sun = addDays(mon, 6)
    const count = [...done].filter((d) => d >= mon && d <= sun).length
    // A habit created (or switched to weekly) mid-week only owes the days that were left.
    const need = prorate && mon < from ? Math.min(target, daysBetween(from, sun) + 1) : target
    units.push(count >= need ? { type: 'hit' } : sun < today ? miss(isoWeek(mon), mon) : { type: 'pending' })
  }
  return units
}

// Each check-in is a hit; every whole X-day window that closed before the next one is a miss.
function intervalUnits(from: string, until: string | undefined, today: string, done: Set<string>, x: number, anchor?: string): Unit[] {
  const units: Unit[] = []
  let prev = anchor
  const missesSince = (last: string, upTo: string) => {
    for (let i = 1; i < Math.ceil(daysBetween(last, upTo) / x); i++) {
      const deadline = addDays(last, i * x)
      units.push(miss(deadline, deadline))
    }
  }
  for (const d of [...done].filter((d) => d >= from && (!until || d < until)).sort()) {
    if (prev) missesSince(prev, d)
    units.push({ type: 'hit' })
    prev = d
  }
  if (!until && prev !== today) {
    if (prev) missesSince(prev, today)
    units.push({ type: 'pending' })
  }
  return units
}

function unitsFor(s: Schedule, prev: Schedule | undefined, until: string | undefined, today: string, done: Set<string>): Unit[] {
  if (s.kind === 'daily') return dailyUnits(s.effectiveFrom, until, today, done)
  if (s.kind === 'weekly') return weeklyUnits(s.effectiveFrom, until, today, done, s.weeklyTarget, prev?.kind !== 'weekly')
  // Same-kind change: the chain carries on from the last check-in under the old interval.
  const anchor = prev?.kind === 'interval' ? [...done].filter((d) => d < s.effectiveFrom).sort().at(-1) : undefined
  return intervalUnits(s.effectiveFrom, until, today, done, s.intervalDays, anchor)
}

/** Streak rules from SPEC-habits §4–§6, derived from check-ins alone so nothing is stored. */
export function computeStreak({ createdOn, schedules, checkIns, today }: StreakInput): Streak {
  const done = new Set(checkIns.filter((d) => d >= createdOn && d <= today))
  const segments = schedules.filter((s) => s.effectiveFrom <= today).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  const used = new Map<string, number>() // month → freezes spent
  const best = new Map<Schedule['kind'], number>()
  const frozen: string[] = []
  let current = 0
  let status: Streak['status'] = 'pending'
  let gap: Extract<Unit, { type: 'miss' }>[] = []

  // A run of misses is frozen only if every month involved can cover its share, and only when
  // there is a streak to protect; otherwise the streak breaks and no freeze is spent.
  const settle = () => {
    if (!gap.length) return
    const need = new Map<string, number>()
    for (const u of gap) need.set(u.month, (need.get(u.month) ?? 0) + 1)
    if (current > 0 && [...need].every(([m, n]) => (used.get(m) ?? 0) + n <= FREEZES_PER_MONTH)) {
      for (const [m, n] of need) used.set(m, (used.get(m) ?? 0) + n)
      frozen.push(...gap.map((u) => u.key))
    } else current = 0
    gap = []
  }

  segments.forEach((s, i) => {
    const prev = segments[i - 1]
    // Units differ between kinds, so a switch ends the run; the gap it leaves costs nothing.
    if (prev && prev.kind !== s.kind) [current, gap] = [0, []]
    for (const u of unitsFor(s, prev, segments[i + 1]?.effectiveFrom, today, done)) {
      if (u.type === 'miss') {
        gap.push(u)
        continue
      }
      settle()
      if (u.type === 'hit') best.set(s.kind, Math.max(best.get(s.kind) ?? 0, ++current))
      status = u.type === 'hit' ? 'done' : 'pending'
    }
  })
  settle()

  return {
    current,
    best: best.get(segments.at(-1)!.kind) ?? 0,
    status,
    frozen,
    freezesLeft: FREEZES_PER_MONTH - (used.get(today.slice(0, 7)) ?? 0),
  }
}

export function lastNDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))
}
