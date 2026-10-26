import { z } from 'zod'

// Mirrors the habit / habit_schedule check constraints in src/server/schema.ts.
export const scheduleInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }),
  z.object({ kind: z.literal('weekly'), weeklyTarget: z.number().int().min(1).max(7) }),
  z.object({ kind: z.literal('interval'), intervalDays: z.number().int().min(2).max(30) }),
])

export const habitInput = z.object({
  name: z.string().trim().min(1).max(80),
  stackCue: z.string().trim().max(120).transform((s) => s || undefined).optional(),
  schedule: scheduleInput,
})

export type HabitInput = z.infer<typeof habitInput>

// Anything Intl can't resolve is not a time zone (also rules out injection-shaped strings).
export const timeZoneInput = z.string().min(1).max(64).refine((timeZone) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  } catch {
    return false
  }
}, '不是有效的時區')

/** Minutes after midnight that still count as yesterday; whole hours, 00:00–06:00 (time_settings check). */
export const dayStartInput = z.number().int().min(0).max(360).multipleOf(60)
