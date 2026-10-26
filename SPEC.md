# Spec：Habit Tracker（總覽與能力地圖）

> 狀態：草稿，待審核 · 2026-10-26
> 本檔是**索引**，也記錄所有模組共用的規則。各模組的細節寫在對應的 `SPEC-<module>.md`。

## 能力地圖

| 模組 id | 負責範圍 | 依賴 | 規格 |
|---|---|---|---|
| `auth` | Google 登入、session、登入保護、刪除帳號（magic link 延後） | — | [SPEC-auth.md](SPEC-auth.md) |
| `habits` | 習慣與頻率、打卡和補簽、連續紀錄和凍結卡、時區和「今天」、今日頁、詳情頁、洞察頁 | `auth` | [SPEC-habits.md](SPEC-habits.md) |
| `export` | 匯出使用者全部資料（JSON） | `auth`、`habits` | [SPEC-export.md](SPEC-export.md) |
| `reminders` | **延後**：PWA、Web Push 訂閱、每日提醒排程 | `auth`、`habits` | [SPEC-reminders.md](SPEC-reminders.md) |

**實作順序**：`auth` → `habits` → `export`。`reminders` 延後（D10）。

模組 id 一旦定下就不改名。模組之間的介面，由提供方的規格定義：
- `auth` 提供 `requireUser()`。
- `habits` 提供 `localDay()`、`getTimeSettings(userId)`，以及「某使用者今天是否還有未完成的習慣」。

## 目標

給一般使用者的**習慣記錄工具**。主打原子習慣第四階段「令人滿足」：記錄要快、回饋要爽（動畫多、切換流暢）。

研究依據（2026-10-26 查證過）：
- 追蹤進度本身就能提高達成率，實際記錄下來時效果更大（Harkin et al., 2016，d=0.40）。
- 偶爾漏一次不影響習慣養成（Lally et al., 2010）。
- 預留緊急跳過額度能提高堅持度（Sharif & Shu）。
- 漏掉後回來給獎勵，比懲罰中斷有效（Milkman et al., 2021）。

這四點支持本產品的三個設計：凍結卡、補簽，以及記錄型定位。

## 技術棧

| 層 | 選擇 | 狀態 |
|---|---|---|
| 框架 | TanStack Start `^1.169`、TanStack Router `^1.170`、React 19、zod 4 | 已在用 |
| 執行與部署 | Nitro，部署到 **Vercel Hobby（免費）**；Node 24 | 已在用（部署是新的） |
| 資料庫 | **Neon** Postgres + **Drizzle ORM**（`drizzle-orm`、`drizzle-kit`） | 新增 |
| 認證 | **better-auth**：Google OAuth，用 Drizzle adapter（`provider: "pg"`） | 新增 |
| 寄信、推播 | Resend、`web-push` | 延後，隨 magic link 和 `reminders` 一起做 |
| 動畫 | CSS 加 View Transitions API，不加動畫套件 | — |
| 測試 | `node:test` | 已在用 |

## 指令

```
Dev:          pnpm dev
Build:        pnpm build
Typecheck:    pnpm typecheck
Test:         pnpm test                 # 單元測試，不連資料庫
Test (DB):    pnpm test:db              # 整合測試，連 Neon 測試分支（DATABASE_URL_TEST）
Migrate:      pnpm drizzle-kit generate && pnpm drizzle-kit migrate
Auth schema:  npx auth@latest generate --adapter drizzle   # 產生 better-auth 需要的資料表 schema
```

- **要修**：`package.json` 的 test glob 要加引號（`'src/**/*.test.ts'`）。否則 shell 會先展開這個 glob，子目錄出現第一個測試檔後，`src/` 根目錄的測試就會被靜默略過。
- 環境變數：`DATABASE_URL`、`DATABASE_URL_TEST`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`。

## 專案結構

```
src/
  streak.ts / streak.test.ts   → habits：純函式（localDay、週期、連續紀錄、凍結卡）
  habits.ts                    → habits：server functions
  export.ts                    → export：server function
  reminders.ts                 → reminders：訂閱與設定的 server functions
  server/schema.ts             → Drizzle schema（better-auth 產生的部分加上各模組的資料表）
  server/db.ts                 → Drizzle + Neon 連線，取代目前的記憶體 Map
  server/auth.ts               → auth：better-auth 設定、requireUser()
  server/push.ts               → reminders：發送推播
  routes/                      → 頁面（各模組規格列出自己的路由）
  routes/api/auth/$.ts         → better-auth handler
  routes/api/cron/reminders.ts → 提醒排程端點
drizzle/                       → drizzle-kit 產生的 migration
public/                        → manifest.webmanifest、sw.js、icons
```

## 視覺風格（D11）

剛從熱感印表機印出來的收據。

| 項目 | 規則 |
|---|---|
| 顏色 | **只有純白 `#FFFFFF` 和純黑 `#000000`**，不用米白，也不用暖色或冷色的灰。螢幕本身的色溫會決定白色看起來的樣子 |
| 深色模式 | **不做**。`color-scheme: light`，不寫 `prefers-color-scheme` |
| 字體 | 英文和數字用 **Geist Mono**，中文用 **Noto Sans TC**。字體堆疊：`'Geist Mono Variable', 'Noto Sans TC Variable', monospace`。載入方式見下方 |
| 印章 | 純黑，略微歪斜 |
| 卡片 | 上下緣是鋸齒狀的撕紙邊（CSS `mask`），不用陰影 |
| 分隔線 | 虛線（`- - - -`），不用實線 |
| 品項列 | 名稱和連續數之間用點線連接：`閱讀 20 頁 ········ 🔥 12 天` |
| 打卡動畫 | 該行像「印出來」一樣由上往下浮現，加上蓋章；里程碑時整張收據往下吐出一截 |
| 元件 | `@base-ui/react` 當基底，不帶樣式，全部用純 CSS 加 CSS 變數來寫（D12） |

**字體載入**（D13，依 TanStack Start 文件，2026-10-26 用 Context7 查證）
- TanStack Start **沒有內建字體服務**（沒有 `next/font` 那種東西）。官方建議三種做法：自行託管字型檔、用 Fontsource，或其他方式；並要求保留字重和子集、設定合適的 `font-display`、檢查版面位移。官方範例用的是 Fontsource。
- 本專案用 **Fontsource 的 variable 版本**，自行託管，不打 Google Fonts：`@fontsource-variable/geist-mono`、`@fontsource-variable/noto-sans-tc`。
- 照官方範例，在 `__root.tsx` 用 `?url` 匯入 CSS，放進 root route 的 `head().links`：
  ```tsx
  import geistMono from '@fontsource-variable/geist-mono?url'
  import notoSansTc from '@fontsource-variable/noto-sans-tc?url'
  head: () => ({ links: [{ rel: 'stylesheet', href: geistMono }, { rel: 'stylesheet', href: notoSansTc }] })
  ```
- Fontsource 的 `@font-face` 預設是 `font-display: swap`。Noto Sans TC 按 `unicode-range` 切成很多小檔，瀏覽器只下載頁面用到的字所在的檔案，不會一次載入整套中文字型。
- 驗收：用 Lighthouse 量測，CLS < 0.1；Network 面板中沒有任何對 `fonts.googleapis.com` 的請求。

## 程式風格

沿用現有寫法：server function 一律加 zod validator，`db` 只能在 server 端使用，商業規則寫成純函式。新增的規則是：查詢一定要帶 `user_id`。

```ts
export const toggleCheckIn = createServerFn({ method: 'POST' })
  .validator(z.object({ habitId: z.uuid(), date: z.iso.date() }))
  .handler(async ({ data }) => {
    const user = await requireUser()                          // 未登入就 throw redirect
    const today = localDay(new Date(), await getTimeSettings(user.id))
    if (!canCheckIn(data.date, today)) throw new Error('只能補簽昨天和前天')
    const h = await toggle(user.id, data.habitId, data.date)  // where user_id = …
    if (!h) throw notFound()
    return view(h, today)
  })
```

- 程式中的日期一律傳 `'YYYY-MM-DD'` 字串。
- 時間點一律用 `timestamptz`。
- 註解只寫「為什麼」；已知限制用 `// shortcut: <限制>，<何時升級>`。

## 共通測試策略

| 層級 | 工具 | 位置 | 何時跑 |
|---|---|---|---|
| 單元（純函式、zod schema） | `node:test` | `src/*.test.ts` | 每次提交前跑 `pnpm test` |
| 整合（真的資料庫） | `node:test` + Neon **測試分支** | `src/server/*.db-test.ts` | 動到 `server/` 時跑 `pnpm test:db` |
| 手動真機 | 檢查清單 | PR 描述 | 動到 UI、PWA 或推播時 |

整合測試開始前會清空該分支的資料，**絕不能**指向正式分支。用 `DATABASE_URL_TEST` 和 `DATABASE_URL` 分開設定；兩者相同時，測試直接中止。

## 邊界

- **一定要做**：查詢都帶 `user_id`；server function 一律用 zod 驗證；改規則前先寫測試；schema 變更都產生 migration；每次提交前跑 `pnpm typecheck && pnpm test`。
- **先問再做**：新增這份規格沒列出的套件；改 schema；更改凍結卡數量或補簽範圍；升級 Vercel 方案或改用其他排程方式。
- **絕對不做**：提交 `.env` 或金鑰；在 client 匯入 `src/server/**`（已有 importProtection 擋）；把連續紀錄存進資料庫做快取；刪掉或跳過失敗的測試；讓測試連到正式資料庫。

## 全產品不做（Non-goals）

- 智慧或情境式提示（位置觸發、AI 建議）。
- 原生 App。
- 離線使用；也不在 localStorage 存放習慣資料。
- 社群、好友、排行榜、分享。
- 習慣分類、圖示、顏色、自訂排序。
- 「指定星期幾」頻率；一天打卡多次或計量型習慣。
- 可購買或可累積的凍結卡、遊戲化貨幣。
- 匯入資料、CSV 匯出。
- 自動化 E2E 測試；多語系（介面只做繁體中文）。

## 決策紀錄

| # | 決策 | 日期 |
|---|---|---|
| D1 | 用 Drizzle 存取 Neon | 2026-10-26 |
| D2 | 推播用 `web-push` 套件 | 2026-10-26 |
| D3 | Email 登入用 magic link，寄信用 Resend（沒有密碼，不需要重設密碼流程） | 2026-10-26 |
| D4 | 補簽範圍：昨天和前天 | 2026-10-26 |
| D5 | 修改頻率的處理方式：見 SPEC-habits §6（參考 Habitica 和 Loop 的做法） | 2026-10-26 |
| D6 | 整合測試用 Neon 測試分支 | 2026-10-26 |
| D7 | 部署到 Vercel；排程方式見 SPEC-reminders §4 | 2026-10-26 |
| D8 | 一週從週一開始（ISO 週） | 2026-10-26 |
| D9 | 拆成四個模組規格 | 2026-10-26 |
| D11 | 視覺風格：純白、純黑、撕紙鋸齒、Geist Mono 加 Noto Sans TC，不做深色模式 | 2026-10-26 |
| D12 | UI 元件用 `@base-ui/react` 加純 CSS，不加 Tailwind | 2026-10-26 |
| D13 | 字體用 Fontsource 自行託管，`?url` 放進 root 的 head links；印章用純黑 | 2026-10-26 |
| D10 | 延後 magic link 和 `reminders`：這是測試工作流程用的專案，不為排程付 Vercel Pro，也不設定寄件網域。D3 和 D7 的排程部分暫停 | 2026-10-26 |
