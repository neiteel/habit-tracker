[English](README.md) | **繁體中文**

# Habit Tracker

習慣記錄工具：打卡要快，回饋要爽。介面風格是剛從熱感印表機印出來的收據。

## 功能

- **Google 登入**（better-auth）；所有查詢都限定在目前登入的使用者。
- **三種頻率**：每天、每週 N 次（ISO 週）、每 N 天一次。
- **連續紀錄**：每次由打卡紀錄即時計算，不存快取。
- **凍結卡**：每個習慣每月 2 張，一張蓋掉一整段中斷。
- **補簽**：可以補昨天和前天。
- **每位使用者自己的時區和一天的起始時間**，會跟裝置同步。
- **習慣詳情**：月曆標出完成、補簽、凍結、漏掉。
- **洞察頁**：統計數字和最近 30 天的紀錄。
- **匯出**：在設定頁把全部資料下載成 JSON。

延後：magic link 登入、提醒（PWA + Web Push）。

## 技術棧

TanStack Start + Router、React 19、zod 4 · Neon Postgres + Drizzle ORM · better-auth · `@base-ui/react` 加純 CSS · Nitro，部署目標 Vercel Hobby · `node:test`。

## 開始使用

需要 Node 24 和 pnpm。

```sh
pnpm install
cp .env.example .env   # 或自行建立 .env，填入下方變數
pnpm db:migrate
pnpm dev
```

### 環境變數

| 變數 | 用途 |
|---|---|
| `DATABASE_URL` | Neon 連線字串（正式分支） |
| `DATABASE_URL_TEST` | 資料庫測試用的 Neon **測試分支**；必須和 `DATABASE_URL` 不同 |
| `BETTER_AUTH_SECRET` | session 用的隨機金鑰 |
| `BETTER_AUTH_URL` | App 網址，例如 `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 憑證；redirect URI 是 `<BETTER_AUTH_URL>/api/auth/callback/google` |

## 指令

| 指令 | 作用 |
|---|---|
| `pnpm dev` | 啟動開發伺服器 |
| `pnpm build` / `pnpm start` | 建置正式版／執行正式版 |
| `pnpm typecheck` | 型別檢查 |
| `pnpm test` | 單元測試（不連資料庫） |
| `pnpm test:db` | 連 Neon 測試分支跑整合測試（會清空該分支資料） |
| `pnpm db:generate` | 依 schema 產生 migration |
| `pnpm db:migrate` / `pnpm db:migrate:test` | 套用 migration 到正式／測試分支 |

## 專案結構

```
src/
  streak.ts          純函式規則：本地日期、週期、連續紀錄、凍結卡
  habits.ts          習慣的 server functions
  habit-input.ts     習慣輸入的 zod schema
  routes/            頁面（今日、習慣詳情、洞察、設定、登入）和 auth API
  server/schema.ts   Drizzle schema
  server/db.ts       Neon + Drizzle 連線
  server/auth.ts     better-auth 設定、requireUser()
drizzle/             自動產生的 migration
SPEC*.md、tasks/     規格文件和實作計畫
```

## 授權

本專案採用 [MIT 授權](LICENSE)。
