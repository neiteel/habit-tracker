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
