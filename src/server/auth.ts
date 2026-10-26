import '@tanstack/react-start/server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { orm } from './orm.ts'
import * as schema from './schema.ts'

export const auth = betterAuth({
  database: drizzleAdapter(orm, { provider: 'pg', schema }),
  socialProviders: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
  },
})
