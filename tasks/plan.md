# 實作計畫：Habit Tracker 核心（新增習慣 → 打卡 → 連續紀錄 → 統計 → 保存）

> 狀態：草稿，待審核 · 2026-10-26
> 依據：[SPEC.md](../SPEC.md)、[SPEC-habits.md](../SPEC-habits.md)，以及 [SPEC-auth.md](../SPEC-auth.md) 中必要的部分。
> 任務清單同步在 [todo.md](todo.md)，給 `/build` 使用。

## 範圍

本計畫只做五件核心功能：新增習慣、打卡、計算連續紀錄、顯示統計、保存資料。

**保存**：存到 Neon（D1）。資料要綁定使用者，所以會先做最小的 Google 登入。

**不在本計畫**：
- magic link 登入、`reminders` 模組：已延後（D10）。
- 刪除帳號：之後另開計畫。（`export` 已在 T17 完成。）

## 架構決策
- **連續紀錄規則先做，而且獨立於其他工作**（Task 2–6）。它是純函式，不碰資料庫，也是邏輯最重、最容易出錯的部分，越早做越早發現問題。可以和 Task 7–8 並行。
- **最早驗證最高風險的整合**：Neon + Drizzle + better-auth 在 Nitro 上能否部署到 Vercel，由 Task 8 驗證。這一步不通，後面全部要改。
- **垂直切片**：Task 9 起每個任務都從資料庫、server function 一路做到 UI，做完就能實際操作。
- **取代現有程式而不是並存**：`src/server/db.ts` 的記憶體 Map、`streak.ts` 的 UTC `day()`，都在對應的任務中換掉。現有的路由檔沿用並修改。

## 依賴圖
```
T1 測試指令修正
 ├─ T2 localDay ─┬─ T3 daily streak ─ T4 weekly ─ T5 interval ─ T6 凍結卡＋頻率版本
 │               │                                                 │
 └─ T7 Drizzle+Neon ─ T8 Google 登入（部署驗證）                     │
                         └─ T9 新增習慣 ─ T10 打卡 ─┬─ T11 三種頻率 ◄┘
                                                    ├─ T12 詳情頁＋補簽
                                                    ├─ T13 編輯與刪除
                                                    ├─ T14 統計
                                                    └─ T15 時間設定
                                                         T16 回饋動畫（依賴 T10、T11）
```

## 任務

### Phase 1：基礎

#### Task 1：修正測試指令（XS）
**說明**：`package.json` 的 test glob 沒加引號，被 shell 展開後，子目錄出現測試檔時，`src/` 根目錄的測試會被靜默略過。另外新增 `test:db` 指令。
**驗收**
- [ ] 在 `src/server/` 放一個暫時的測試檔，`pnpm test` 仍會跑到 `src/streak.test.ts`（驗證完刪除暫存檔）。
- [ ] `pnpm test:db` 只跑 `src/**/*.db-test.ts`。
**驗證**：`pnpm test`
**依賴**：無
**檔案**：`package.json`

#### Task 2：`localDay` 與習慣日（S）
**說明**：在 `src/streak.ts` 新增 `localDay(now, { timeZone, dayStartMinutes })`，刪除用 UTC 的 `day()`，並更新它的呼叫端。在 Task 15 之前，伺服器和客戶端都先用固定的 `DEFAULT_TIME`（`Asia/Taipei`）：SSR 拿不到瀏覽器時區，兩邊必須用同一個時區，算出的「今天」才會一致。
**驗收**
- [ ] 分界點 240 分鐘（4:00）時，台北凌晨 01:00 算前一天。
- [ ] `Asia/Taipei` 和 `America/Los_Angeles` 換日正確；美國夏令時間切換當天正確。
- [ ] 專案中不再有任何 `day(` 的呼叫。
**驗證**：`pnpm test && pnpm typecheck`
**依賴**：T1
**檔案**：`src/streak.ts`、`src/streak.test.ts`、`src/habits.ts`、`src/routes/index.tsx`、`src/routes/insights.tsx`

#### Task 3：`computeStreak` 的 daily 規則（S）
**說明**：依 SPEC-habits §7 的介面實作 `computeStreak`，先只支援 `daily`、不含凍結卡。`currentStreak` 改為呼叫它，或直接刪除。
**驗收**
- [ ] 現有 4 個測試改寫後仍然通過。
- [ ] 今天未完成時是 `pending` 而不是斷掉；`best` 正確；`created_on` 之前的日子不計。
**驗證**：`pnpm test`
**依賴**：T2
**檔案**：`src/streak.ts`、`src/streak.test.ts`

#### Task 4：weekly 規則（S）
**驗收**
- [ ] 週中未達標時是 `pending`；上週未達標就斷。
- [ ] 建立週的門檻是 `min(N, 剩餘天數)`。
- [ ] 2026-W53 → 2027-W01 跨年正確。
**驗證**：`pnpm test`
**依賴**：T3
**檔案**：`src/streak.ts`、`src/streak.test.ts`

#### Task 5：interval 規則（S）
**驗收**
- [ ] 第 X 天打卡算延續，第 X+1 天才算斷。
- [ ] 每次準時打卡讓連續數 +1；第一次打卡之前連續數是 0。
**驗證**：`pnpm test`
**依賴**：T4
**檔案**：`src/streak.ts`、`src/streak.test.ts`

#### Task 6：凍結卡與頻率版本（M）
**說明**：加入 SPEC-habits §5 的凍結卡規則（每個習慣每月 2 張、能補滿整段空缺才用、由舊到新消耗），以及 §6 的多段 `schedules`。
**驗收**
- [ ] 漏 1 天用 1 張卡；漏 3 天但只剩 2 張時直接斷且不扣卡；跨月時額度重置；`frozen` 和 `freezesLeft` 正確。
- [ ] 同類型改參數後延續；換類型後從 0 開始且不扣卡；`best` 只看目前類型。
- [ ] `streak.ts` 分支覆蓋率 100%（`node --test --experimental-test-coverage`）。
**驗證**：`pnpm test`
**依賴**：T5
**檔案**：`src/streak.ts`、`src/streak.test.ts`

#### Task 7：Drizzle + Neon 與 schema（M）
**說明**：先問再裝 `drizzle-orm`、`drizzle-kit`、`@neondatabase/serverless`、`better-auth`。用 `npx auth@latest generate --adapter drizzle` 產生 auth 的資料表，再加上 SPEC-habits §2 的四張表，產生並套用 migration。測試時若 `DATABASE_URL_TEST` 等於 `DATABASE_URL` 就中止。
**驗收**
- [ ] 正式分支和測試分支都套用了 migration。
- [ ] DB 測試能驗證：`(habit_id, on_date)` 唯一；不合法的頻率組合被 check constraint 擋下；刪除 user 時資料會 cascade 刪除。
- [ ] 兩個網址相同時，`pnpm test:db` 直接失敗並提示。
**驗證**：`pnpm test:db && pnpm typecheck`
**依賴**：T1
**檔案**：`package.json`、`drizzle.config.ts`、`src/server/schema.ts`、`src/server/db.ts`、`src/server/db.db-test.ts`

#### Task 8：Google 登入與部署驗證（M）⚠️ 高風險
**說明**：設定 better-auth（Drizzle adapter 加 Google），建立 `src/routes/api/auth/$.ts` 和 `/login` 頁（只有 Google 按鈕），用 root 的 `beforeLoad` 保護路由，提供 `requireUser()`。這是第一個畫面，所以順便在 `__root.tsx` 建立視覺基礎：黑白 CSS 變數、字體（依 D13 用 Fontsource 的 `?url` 載入）、撕紙卡片的 class；先問再裝 `@base-ui/react` 和兩個 Fontsource 套件。另外加一條驗收：Lighthouse CLS < 0.1，而且沒有任何請求打到 `fonts.googleapis.com`。**部署一次到 Vercel preview。**
**驗收**
- [ ] 本機和 Vercel preview 都能用 Google 登入和登出。
- [ ] 未登入時造訪 `/` 會導到 `/login`。
- [ ] 不帶 session 呼叫 server function 會被拒絕。
**驗證**：`pnpm build`；手動在 preview 網址上測試登入
**依賴**：T7
**檔案**：`src/server/auth.ts`、`src/routes/api/auth/$.ts`、`src/routes/login.tsx`、`src/routes/__root.tsx`

### Checkpoint A：基礎（T1–T8）
- [ ] `pnpm typecheck && pnpm test && pnpm test:db` 全部通過。
- [ ] Vercel preview 可以登入。
- [ ] **跟你一起確認後才進入 Phase 2。**

### Phase 2：核心切片

#### Task 9：新增習慣，並保存到 Neon（M）
**說明**：`createHabit` 和 `listHabits` 改用 Drizzle，所有查詢都帶 `user_id`。同時寫入 `habit` 和第一列 `habit_schedule`（先固定 daily）。今日頁從資料庫讀取習慣。刪除記憶體 Map 和種子資料。
**驗收**
- [ ] 新增的習慣重新整理、重啟 server 後都還在。
- [ ] 使用者 A 看不到 B 的習慣（DB 測試）。
- [ ] 空清單時，今日頁顯示新增引導。
**驗證**：`pnpm test:db && pnpm typecheck`；手動新增後重新整理
**依賴**：T8
**檔案**：`src/habits.ts`、`src/server/db.ts`、`src/routes/index.tsx`、`src/server/db.db-test.ts`

#### Task 10：打卡，並顯示連續紀錄（M）
**說明**：`toggleCheckIn` 寫入或刪除 `check_in`，「今天」由 `localDay` 計算。今日頁做樂觀更新，失敗時回滾並顯示 toast。每個習慣顯示 `computeStreak` 的結果。
**驗收**
- [ ] 打卡和取消都會保存；重新整理後連續數不變。
- [ ] 把網路模擬成離線時，打卡會回滾並顯示錯誤。
- [ ] 伺服器拒絕「今天」和「補簽範圍」以外的日期（這裡先只開放今天）。
**驗證**：`pnpm test:db`；手動操作
**依賴**：T9、T3
**檔案**：`src/habits.ts`、`src/server/db.ts`、`src/routes/index.tsx`

#### Task 11：三種頻率（M）
**說明**：新增 sheet 可選頻率和 N 或 X（zod 驗證和 DB check constraint 一致）。今日頁依類型顯示勾選圓圈、進度環或剩餘天數，以及凍結卡徽章。
**驗收**
- [ ] 三種頻率都能建立，不合法的組合在表單就被擋下。
- [ ] 今日頁三種列的顯示符合 SPEC-habits §8。
**驗證**：`pnpm test && pnpm typecheck`；手動建立三種習慣
**依賴**：T10、T6
**檔案**：`src/habits.ts`、`src/routes/index.tsx`、`src/habit-form.tsx`

### Checkpoint B：核心流程（T9–T11）
- [ ] 登入 → 新增三種習慣 → 打卡 → 連續數正確，而且重新整理後保留。
- [ ] 跟你確認。

### Phase 3：完整功能

#### Task 12：詳情頁的熱力圖與補簽（M）
**驗收**
- [ ] 月曆標出完成、凍結、漏掉、補簽，並附圖例。
- [ ] 可以補簽昨天和前天，更早的日期 UI 不能點、伺服器也會拒絕。
- [ ] 補簽後凍結卡正確退回。
**驗證**：`pnpm test:db`；手動操作
**依賴**：T11
**檔案**：`src/routes/habits.$habitId.tsx`、`src/habits.ts`、`src/server/db.ts`

#### Task 13：編輯與刪除習慣（S）
**驗收**
- [ ] 改名稱或習慣疊加句後立即生效。
- [ ] 改頻率會新增一列 schedule；換類型時先跳出警告；行為符合 SPEC-habits §6。
- [ ] 刪除前要確認；刪除後打卡紀錄 cascade 刪除。
**驗證**：`pnpm test:db`；手動操作
**依賴**：T11
**檔案**：`src/habits.ts`、`src/habit-form.tsx`、`src/routes/habits.$habitId.tsx`

#### Task 14：顯示統計（S）
**說明**：重寫 `getStats`：今日完成數除以應完成數、最長連續、本月剩餘凍結卡數。拿掉 800ms 的假延遲，但保留 streaming 寫法。`/insights` 改用 `localDay`，並標出凍結格。
**驗收**
- [ ] 今日頁的統計和清單一致。
- [ ] `/insights` 只顯示自己的習慣，凍結格有明顯標示。
**驗證**：`pnpm typecheck`；手動對照
**依賴**：T11
**檔案**：`src/habits.ts`、`src/routes/index.tsx`、`src/routes/insights.tsx`

#### Task 15：時間設定（S）
**說明**：第一次登入時，用裝置時區建立 `time_settings`；之後偵測到時區改變就更新並顯示 toast。`/settings` 可以設定一天的分界點。拿掉現有 localStorage 的「reminder note」欄位，並刪除 `DEFAULT_TIME`。
**驗收**
- [ ] 分界點改成 4:00 後，凌晨 1 點的打卡算前一天。
- [ ] 把瀏覽器時區改成洛杉磯後，後端資料會更新，「今天」也正確。
**驗證**：`pnpm test:db`；手動用 DevTools 的 sensors 模擬時區
**依賴**：T10
**檔案**：`src/habits.ts`、`src/routes/settings.tsx`、`src/routes/__root.tsx`

#### Task 16：回饋動畫（M）
**驗收**
- [ ] 點擊後 100ms 內有反應（用 DevTools Performance 量測）；打卡動畫 ≤ 600ms；7、30、100 天時有里程碑動畫。
- [ ] 凍結卡被使用後只播一次「❄️ 保住了」（localStorage 讀寫都包 try/catch）。
- [ ] 路由切換用 View Transitions；開啟 `prefers-reduced-motion` 時只剩淡入淡出。
**驗證**：手動在手機尺寸和 reduced-motion 下測試
**依賴**：T10、T11
**檔案**：`src/routes/__root.tsx`、`src/routes/index.tsx`、`src/routes/habits.$habitId.tsx`

#### Task 17：匯出 JSON（S）
**說明**：照 [SPEC-export.md](../SPEC-export.md) 實作。`reminder` 欄位等 reminders 上線再加。
**驗收**
- [x] 匯出只含該使用者的 habit、schedule、check-in 和時間設定，不含其他使用者的資料或任何 token。
- [ ] `/settings` 按「匯出 JSON」會下載 `habit-tracker-YYYY-MM-DD.json`；失敗時顯示 toast。
**驗證**：`pnpm test:db`；手動在 `/settings` 按一次
**依賴**：T15
**檔案**：`src/server/db.ts`、`src/habits.ts`、`src/routes/settings.tsx`

### Checkpoint C：完成
- [ ] `pnpm typecheck && pnpm test && pnpm test:db` 全部通過，`pnpm build` 成功。
- [ ] SPEC-habits §10 的成功標準全部達成。
- [ ] Vercel preview 上整個流程手動走過一遍。
- [ ] 跟你一起審核。

## 可並行
- T2–T6（純函式）和 T7–T8（基礎建設）可以同時進行。
- T12、T13、T14、T15 都只依賴 T11 或 T10，彼此改的檔案有重疊（`src/habits.ts`），要**依序合併**。

## 風險
| 風險 | 影響 | 緩解 |
|---|---|---|
| better-auth 或 Neon 在 Nitro + Vercel 上不相容 | 高 | T8 先部署一次 preview 驗證；不通就停下來討論 |
| 時區或夏令時間的邊界錯誤 | 高 | T2 用真實時區的測試案例，全部用 `Intl` 計算，不手算 offset |
| 凍結卡規則太複雜而出錯 | 中 | 做成純函式，分支覆蓋率 100% |
| 整合測試誤連正式資料庫 | 高 | 兩個網址相同時直接中止（T7） |
| 新增四個套件 | 低 | T7 安裝前先跟你確認版本 |

## 待決問題
（目前沒有。外觀相關的 D11–D13 都已定案。）
