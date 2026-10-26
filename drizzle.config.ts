import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

if (existsSync('.env')) process.loadEnvFile()

// Migrate the test branch with: pnpm db:migrate:test
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
