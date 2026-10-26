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
export type Streak = { current: number; best: number; status: 'done' | 'pending' }

// Each period becomes one unit: met, closed and missed, or still open.
type Unit = { type: 'hit' | 'miss' | 'pending' }

function dailyUnits(from: string, today: string, done: Set<string>): Unit[] {
  const units: Unit[] = []
  for (let d = from; d <= today; d = addDays(d, 1)) {
    units.push({ type: done.has(d) ? 'hit' : d === today ? 'pending' : 'miss' })
  }
  return units
}

const mondayOf = (iso: string) => addDays(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7))

function weeklyUnits(from: string, today: string, done: Set<string>, target: number): Unit[] {
  const units: Unit[] = []
  for (let mon = mondayOf(from); mon <= today; mon = addDays(mon, 7)) {
    const sun = addDays(mon, 6)
    const count = [...done].filter((d) => d >= mon && d <= sun).length
    // The first week only asks for as many days as were left in it.
    const need = mon < from ? Math.min(target, daysBetween(from, sun) + 1) : target
    units.push({ type: count >= need ? 'hit' : sun < today ? 'miss' : 'pending' })
  }
  return units
}

// Each check-in is a hit; every whole X-day window that closed before the next one is a miss.
function intervalUnits(from: string, today: string, done: Set<string>, x: number): Unit[] {
  const units: Unit[] = []
  let prev: string | undefined
  const missesSince = (last: string, until: string) => {
    for (let i = 1; i < Math.ceil(daysBetween(last, until) / x); i++) units.push({ type: 'miss' })
  }
  for (const d of [...done].filter((d) => d >= from).sort()) {
    if (prev) missesSince(prev, d)
    units.push({ type: 'hit' })
    prev = d
  }
  if (prev !== today) {
    if (prev) missesSince(prev, today)
    units.push({ type: 'pending' })
  }
  return units
}

const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000

/** Streak rules from SPEC-habits §4–§6, derived from check-ins alone so nothing is stored. */
export function computeStreak({ createdOn, schedules, checkIns, today }: StreakInput): Streak {
  const done = new Set(checkIns.filter((d) => d >= createdOn && d <= today))
  const s = schedules[0]!
  const units =
    s.kind === 'daily' ? dailyUnits(s.effectiveFrom, today, done)
    : s.kind === 'weekly' ? weeklyUnits(s.effectiveFrom, today, done, s.weeklyTarget)
    : intervalUnits(s.effectiveFrom, today, done, s.intervalDays)
  let current = 0
  let best = 0
  for (const u of units) {
    if (u.type === 'hit') best = Math.max(best, ++current)
    else if (u.type === 'miss') current = 0
  }
  return { current, best, status: units.at(-1)?.type === 'hit' ? 'done' : 'pending' }
}

export function lastNDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))
}
