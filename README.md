**English** | [繁體中文](README.zh-TW.md)

# Habit Tracker

A habit log where checking in is fast and the feedback feels good. The UI looks like a freshly printed thermal receipt.

## Features

- **Google sign-in** (better-auth); every query is scoped to the signed-in user.
- **Three frequencies**: daily, weekly (N times per ISO week), and every N days.
- **Streaks** computed on the fly from check-ins, never cached.
- **Freezes**: 2 per habit per month; a freeze covers a whole missed gap.
- **Backfill**: check in for yesterday or the day before.
- **Per-user time zone and day start**, synced from the device.
- **Habit detail**: month calendar with done / backfilled / frozen / missed marks.
- **Insights**: stats and a 30-day record.
- **Export**: download all your data as JSON from Settings.

Deferred: magic-link sign-in, reminders (PWA + Web Push).

## Tech stack

TanStack Start + Router, React 19, zod 4 · Neon Postgres + Drizzle ORM · better-auth · `@base-ui/react` with plain CSS · Nitro, targeting Vercel Hobby · `node:test`.

## Getting started

Requires Node 24 and pnpm.

```sh
pnpm install
cp .env.example .env   # or create .env with the variables below
pnpm db:migrate
pnpm dev
```

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string (main branch) |
| `DATABASE_URL_TEST` | Neon **test branch** for DB tests; must differ from `DATABASE_URL` |
| `BETTER_AUTH_SECRET` | Random secret for sessions |
| `BETTER_AUTH_URL` | App base URL, e.g. `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials; redirect URI is `<BETTER_AUTH_URL>/api/auth/callback/google` |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` / `pnpm start` | Production build / run it |
| `pnpm typecheck` | Type-check |
| `pnpm test` | Unit tests (no database) |
| `pnpm test:db` | Integration tests against the Neon test branch (wipes its data) |
| `pnpm db:generate` | Generate a migration from the schema |
| `pnpm db:migrate` / `pnpm db:migrate:test` | Apply migrations to the main / test branch |

## Project layout

```
src/
  streak.ts          pure rules: local day, periods, streaks, freezes
  habits.ts          server functions for habits
  habit-input.ts     zod schemas for habit input
  routes/            pages (Today, habit detail, insights, settings, login) and the auth API
  server/schema.ts   Drizzle schema
  server/db.ts       Neon + Drizzle connection
  server/auth.ts     better-auth config, requireUser()
drizzle/             generated migrations
SPEC*.md, tasks/     specs (Traditional Chinese) and the build plan
```

## License

Private project; no license granted.
