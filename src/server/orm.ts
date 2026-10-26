import '@tanstack/react-start/server-only'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema.ts'

// Throws at import without DATABASE_URL, so only modules that need the database import this.
// T9 folds it into db.ts when the in-memory store goes away.
export const orm = drizzle(process.env.DATABASE_URL!, { schema })
