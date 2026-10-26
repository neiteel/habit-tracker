# Spec：reminders

> 模組 id：`reminders` · 依賴：`auth`、`habits` · 共用規則見 [SPEC.md](SPEC.md)
> **狀態：延後（D10）**。本規格保留作為之後的參考，目前不排入任何計畫。

## 1. 目標
可選的每日提醒：使用者自己設定時間（預設關閉），到了當地時間就收到一則推播。網頁要先安裝成 PWA 才能收推播。

## 2. 資料模型
```sql
create table reminder_setting (
  user_id   text primary key references "user"(id) on delete cascade,
  enabled   boolean not null default false,
  time      time,                          -- 本地時間，不帶時區，例如 20:00
  last_sent_on date                        -- 當地日期，防止同一天重複發送
);

create table push_subscription (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references "user"(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
```
時區不另外存，直接讀 `habits` 模組的 `time_settings.time_zone`。

## 3. PWA
- `public/manifest.webmanifest` 加上 icons，在 `__root.tsx` 用 `<link rel="manifest">` 引入。
- `public/sw.js` 只處理 `push`（顯示通知）和 `notificationclick`（開啟 `/`），**不做離線快取**。
- 在 iOS 上，必須先「加到主畫面」才能收推播。偵測到 iOS 且尚未安裝時，設定頁不顯示開關，改顯示安裝教學。

## 4. 排程（D7）

**「排程」是什麼**：推播必須由伺服器主動發出，但伺服器平常只在有人連線時才執行。所以需要一個「鬧鐘」，每隔固定時間呼叫一次 `/api/cron/reminders`。這支程式會找出「現在剛好到提醒時間」的使用者，然後發推播給他們。

**Vercel 的限制**（2026-10-26 查 Vercel 文件）：

| 方式 | Hobby（免費） | Pro |
|---|---|---|
| **Cron Jobs**（`vercel.json` 的 `crons`，穩定功能） | **一天只能跑一次**，而且時間可能誤差到 59 分鐘。沒辦法用來發「使用者自訂時間」的提醒 | 最快每分鐘一次，誤差在一分鐘內 |
| **Schedules**（`schedules`，目前是 beta） | 最快每 15 分鐘一次，固定有 15 分鐘的 jitter | 最快每分鐘一次，jitter 可設 1 到 15 分鐘 |

**建議**：
- 用 Pro 的話：Cron Jobs 每 15 分鐘跑一次（`*/15 * * * *`），提醒誤差 ≤ 15 分鐘。
- 留在 Hobby 的話：用 Schedules（beta）每 15 分鐘跑一次，提醒誤差可能到 30 分鐘左右，而且 beta 功能可能會變動。

端點的邏輯（兩種方式都一樣）：
1. 驗證 `CRON_SECRET`。用 Cron Jobs 時，端點是公開網址，一定要驗證。
2. 找出 `enabled = true` 的設定，用各自的 `time_zone` 算出當地現在的時間。條件：`time` 落在「上次執行到現在」這段區間內，而且 `last_sent_on` 不等於當地今天。
3. 用 `hasUnfinishedToday(userId, today)` 檢查；為 false 時跳過，因為今天的習慣已經全部完成。
4. 用 `web-push` 發送給該使用者的所有訂閱。回應是 404 或 410 時，刪除該訂閱。
5. 更新 `last_sent_on = today`。即使排程重複觸發，同一天也不會發兩次。

## 5. 畫面（`/settings` 的「提醒」區塊）
| 狀態 | 顯示 |
|---|---|
| 不支援推播 | 「此瀏覽器不支援通知」 |
| iOS 未安裝 | 加到主畫面的步驟教學 |
| 關閉（預設） | 開關 |
| 正在要求權限 | 開關顯示載入中；**只有在使用者點開關時**才要求通知權限 |
| 權限被拒 | 說明如何到系統設定重新開啟 |
| 開啟 | 時間選擇器（預設 20:00）、「傳送測試通知」按鈕 |

## 6. 測試
- 單元測試：「這個使用者這一輪該不該發」寫成純函式 `isDue(time, timeZone, lastRunAt, now, lastSentOn)`，測試跨午夜、夏令時間、重複觸發這幾種情況。
- 整合測試：沒有 `CRON_SECRET` 時回 401；收到 410 後刪除訂閱；同一天不會發第二次。
- 手動：已安裝 PWA 的 iPhone 和 Android 都能收到推播；點通知會開啟今日頁。

## 7. 成功標準
- [ ] 已安裝 PWA 的 iPhone 和 Android，都會在設定的當地時間收到提醒，誤差符合 §4 所選方案。
- [ ] 今天的習慣全部完成時不發送；同一天最多發一次。
- [ ] 失效的訂閱會被自動清除。

## 8. 待決問題
1. **Vercel 方案**：Pro（穩定，誤差 ≤ 15 分鐘，每月要付費）還是 Hobby + Schedules beta（免費，誤差約 30 分鐘，功能可能變動）？
2. **推播文案**：固定一句（例如「今天的習慣還沒完成 🔥」），還是帶入未完成的習慣名稱？

## 9. 不做
一天多次提醒、每個習慣各自的提醒、Email 提醒、智慧推播時間。
