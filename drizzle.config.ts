import { defineConfig } from 'drizzle-kit'

// Migrate the test branch with: DATABASE_URL=$DATABASE_URL_TEST pnpm db:migrate
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
