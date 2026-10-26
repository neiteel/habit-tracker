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

/** Consecutive done days ending today, or ending yesterday if today isn't done yet. */
export function currentStreak(done: Iterable<string>, today: string): number {
  const set = new Set(done)
  let cursor = set.has(today) ? today : addDays(today, -1)
  let n = 0
  while (set.has(cursor)) {
    n++
    cursor = addDays(cursor, -1)
  }
  return n
}

export function lastNDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))
}
