import '@tanstack/react-start/server-only'
import { redirect } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { orm } from './orm.ts'
import * as schema from './schema.ts'

export const auth = betterAuth({
  database: drizzleAdapter(orm, { provider: 'pg', schema }),
  socialProviders: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
  },
  plugins: [tanstackStartCookies()], // must stay last
})

export const currentUser = async () => (await auth.api.getSession({ headers: getRequestHeaders() }))?.user ?? null

/** For server functions: the signed-in user, or a redirect to /login. */
export async function requireUser() {
  const user = await currentUser()
  if (!user) throw redirect({ to: '/login' })
  return user
}
