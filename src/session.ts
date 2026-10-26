// Server function, safe to import anywhere (see habits.ts); the client half is auth-client.ts.
import { createServerFn } from '@tanstack/react-start'
import { currentUser } from './server/auth'

export const getSessionUser = createServerFn({ method: 'GET' }).handler(currentUser)
