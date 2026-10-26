# Spec：habits

> 模組 id：`habits` · 依賴：`auth` · 共用規則見 [SPEC.md](SPEC.md)

## 1. 目標
使用者可以自訂習慣，點一下就打卡，然後看到夠爽的回饋和連續紀錄。漏掉時有凍結卡和補簽當緩衝。

## 2. 資料模型（Drizzle schema，以 SQL 表示）

```sql
create table time_settings (
  user_id            text primary key references "user"(id) on delete cascade,
  time_zone          text not null,      -- IANA，例如 'Asia/Taipei'，由裝置偵測
  day_start_minutes  int  not null default 0 check (day_start_minutes between 0 and 360),
  updated_at         timestamptz not null default now()
);

create table habit (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references "user"(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  stack_cue   text check (char_length(stack_cue) <= 120),   -- 習慣疊加句
  created_on  date not null,                                -- 建立時使用者的本地日期
  created_at  timestamptz not null default now()
);
create index on habit (user_id);

create type frequency_kind as enum ('daily', 'weekly', 'interval');

-- 頻率的版本紀錄：每次修改頻率就新增一列（原因見 §6）
create table habit_schedule (
  habit_id        uuid not null references habit(id) on delete cascade,
  effective_from  date not null,          -- 從這個本地日期（含）開始生效
  kind            frequency_kind not null,
  weekly_target   int check (weekly_target between 1 and 7),
  interval_days   int check (interval_days between 2 and 30),
  primary key (habit_id, effective_from), -- 同一天改兩次就覆蓋
  check ((kind = 'weekly')   = (weekly_target is not null)),
  check ((kind = 'interval') = (interval_days is not null))
);

create table check_in (
  habit_id    uuid not null references habit(id) on delete cascade,
  on_date     date not null,               -- 本地的「習慣日」
  created_at  timestamptz not null default now(),
  primary key (habit_id, on_date)          -- 一天最多一次；再點一次 = 取消
);
```

- **連續紀錄和凍結卡的使用紀錄都不存**，每次由 `check_in` 加 `habit_schedule` 用純函式算出來。補簽或取消後會自動重算，凍結卡也會自動退回。
- localStorage 只存每個習慣「已看過的凍結期」（`habit-tracker:seen-frozen:<habitId>`），用來決定要不要播動畫。讀寫都包 try/catch，資料遺失時最多重播一次動畫。

## 3. 「今天」
- `localDay(now, { timeZone, dayStartMinutes })`：把 `now` 減去分界點的分鐘數，再用 `Intl.DateTimeFormat` 取得該時區的日曆日期。伺服器和客戶端都用這個函式。
- 現有的 `day()` 用的是 UTC，**要換掉**。`lastNDays` 保留。
- 客戶端偵測到的時區（`Intl.DateTimeFormat().resolvedOptions().timeZone`）和 `time_settings.time_zone` 不同時，自動更新後端，並以 toast 告知使用者。

## 4. 週期與達標
| 頻率 | 週期 | 達標條件 | 連續單位 |
|---|---|---|---|
| `daily` | 一天 | 當天有打卡 | 天 |
| `weekly` | ISO 週（週一到週日） | 該週打卡數 ≥ `weekly_target` | 週 |
| `interval` | 從上次打卡起 X 天的窗口 | 在 `上次打卡 + X` 天內（含當天）再打卡 | 次 |

1. **進行中的週期不會斷**：今天、本週、目前的窗口都是 `pending`。
2. 只有**已結束且未達標**的週期才算漏掉。
3. `created_on` 之前的週期不計。`weekly` 的建立週，門檻是 `min(N, 建立日到週日的天數)`。
4. 被凍結的週期不增加連續數，只是不讓它斷掉。

## 5. 凍結卡與補簽
- **每個習慣每個日曆月 2 張**，不累積，依使用者時區的月份重置。
- 一張卡抵一個漏掉的週期：`daily` 一天，`weekly` 一週，`interval` 一個 X 天窗口。
- 歸屬月份：`daily` 看那一天，`weekly` 看那週的週一，`interval` 看窗口的截止日。
- **只在能補滿整段空缺時才用卡**：空缺比剩餘卡數多時，紀錄直接斷，一張卡都不扣。
- 依時間順序由舊到新消耗。
- **還沒有連續紀錄（current = 0）時不用卡**：避免新習慣還沒開始做，卡就被自動扣光。
- 換類型時留下的空缺不用卡；換類型之前已經正常使用的卡照樣算數。
- `interval` 的算法：相鄰兩次打卡相隔 `g` 天（最後一段算到今天），需要 `k = max(0, ceil((g − X) / X))` 張卡。
- **補簽**：只能補 `today − 2` 到 `today − 1`，而且不能早於 `created_on`，由伺服器驗證。補簽和取消都會觸發重算。

## 6. 修改頻率（D5）

**其他產品的做法**（2026-10-26 查證，公開資料很少）：
- **Habitica**：連續數存成一個計數器，不保留歷史。改頻率後連續數**照樣保留**，新頻率只影響之後的天數。
- **Loop Habit Tracker**：分數由完整歷史算出。規則改變時（例如它的開源分支改了週起始日），過去的分數和連續紀錄**會跟著重算**。

**本專案的做法：新頻率只往後生效，過去的週期照當時的規則判定。** 歷史會保留，像 Loop；改頻率不會讓過去突然斷掉，像 Habitica。
- 修改頻率會新增一列 `habit_schedule`，`effective_from = today`。
- **同類型只改參數**（例如每週 3 次改成每週 4 次、X=3 改成 X=5）：連續紀錄**延續**，從今天所在的週期開始套用新參數。
- **換類型**（例如每天改成每週 N 次）：單位不同，沒辦法延續。舊的連續紀錄在改的前一天結束，**不扣凍結卡**，新類型從 0 開始。打卡歷史照常顯示。
- `best` 只取**目前類型**各段裡最長的一段，避免把不同單位拿來比較。
- 編輯表單在換類型時要先警告：「目前 12 天的連續紀錄會結束，歷史會保留。」

## 7. 純函式介面（`src/streak.ts`）
```ts
type Schedule = { effectiveFrom: string } &
  ({ kind: 'daily' } | { kind: 'weekly'; weeklyTarget: number } | { kind: 'interval'; intervalDays: number })

computeStreak(input: {
  createdOn: string; schedules: Schedule[]; checkIns: string[]; today: string
}): { current: number; best: number; status: 'done' | 'pending'; frozen: string[]; freezesLeft: number }
```
`frozen` 的元素是週期代號：`'2026-10-24'`、`'2026-W43'`，或 `interval` 窗口的截止日。

## 8. 畫面與狀態

所有畫面都手機優先（360px 起）。開啟 `prefers-reduced-motion` 時，動畫只剩淡入淡出。

| 路由 | 內容 | SSR | 狀態 |
|---|---|---|---|
| `/`（今日） | 今天相關的習慣，點一下打卡；新增按鈕開啟 sheet | full | 載入骨架、**空清單**（引導新增第一個）、部分完成、**全部完成**（慶祝動畫）、失敗（回滾並顯示 toast） |
| 新增或編輯 sheet | 名稱、頻率、N 或 X、習慣疊加句 | — | 欄位錯誤、儲存中、換類型時的警告 |
| `/habits/$habitId` | 月曆熱力圖（完成、凍結、漏掉、補簽，各有圖例）、目前和最長紀錄、補簽、編輯、刪除 | full | 404、刪除確認 |
| `/insights` | 沿用現有的 30 天格子，改用 `localDay`，並標出凍結格 | data-only | 載入中、沒有習慣 |
| `/settings` | 時區（顯示偵測結果）、一天的分界點；`reminders` 和 `export` 的區塊；登出；刪除帳號 | false | 儲存中 |

**今日頁每一列的內容**
- `daily`：勾選圓圈，旁邊「🔥 12 天」。
- `weekly`：進度環「2/3」，旁邊「🔥 5 週」。
- `interval`：「剩 2 天」或「今天到期」，旁邊「🔥 8 次」。
- 有習慣疊加句時，以小字顯示在名稱下方。
- 剩餘凍結卡以「❄️×2」徽章顯示。

**回饋（可驗收的標準）**
- 點擊後 **100ms 內**有視覺反應：樂觀更新，失敗時回滾。
- 打卡動畫 ≤ 600ms：勾選彈跳，加上連續數往上翻。
- 連續數達到 7、30、100 時，播放較大的慶祝動畫。
- 凍結卡被使用後，下次看到該習慣時播放一次「❄️ 保住了」。
- 路由切換用 View Transitions；不支援的瀏覽器直接切換。
- Android 上用 `navigator.vibrate(10)`；iOS 不支援，略過。

**對其他模組提供**
- `getTimeSettings(userId)`
- `localDay()`
- `hasUnfinishedToday(userId, today): Promise<boolean>`（給 `reminders` 用）
- `/settings` 頁的區塊位置

## 9. 測試（`src/streak.test.ts`，分支覆蓋率要 100%）
- `daily`：今天還沒做不會斷；漏 1 天用 1 張卡；漏 3 天但只剩 2 張時直接斷且不扣卡；跨月時卡額度重置；跨年。
- `weekly`：週中未達標時是 pending；上週未達標用卡；建立週按比例算門檻；2026-W53 → 2027-W01。
- `interval`：第 X 天打卡算延續；第 X+1 天用卡；空缺需要的卡超過額度時斷。
- 修改頻率：同類型改參數後延續；換類型後從 0 開始且不扣卡；`best` 只看目前類型。
- `localDay`：分界點 4:00 時，凌晨 1 點算前一天；台北和洛杉磯的換日；美國夏令時間切換當天。
- 補簽或取消打卡後，`frozen` 正確退回。
- 整合測試（`pnpm test:db`）：使用者 A 讀不到也改不了 B 的習慣；`(habit_id, on_date)` 唯一；check constraint 擋掉不合法的頻率組合；伺服器拒絕超出補簽範圍的日期。

## 10. 成功標準
- [ ] 三種頻率都能新增、編輯、刪除；換類型時有警告，行為符合 §6。
- [ ] 今日頁點擊後 100ms 內有反應，網路失敗時回滾並提示。
- [ ] §9 的單元測試全過，`streak.ts` 分支覆蓋率 100%。
- [ ] 分界點設為 4:00 時，凌晨 1 點的打卡算前一天；在台北和洛杉磯時區下，「今天」都正確。
- [ ] 凍結卡使用後只播一次「保住了」動畫。
- [ ] 伺服器拒絕早於前天的補簽。

## 11. 待決問題
（目前沒有。D4、D5、D8 已定案，記在 SPEC.md 的決策紀錄。）

## 12. 不做
封存習慣（只能刪除）、手動調整連續數、自訂月曆起始日、習慣的備註或日記。
