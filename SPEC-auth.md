# Spec：auth

> 模組 id：`auth` · 依賴：無 · 共用規則見 [SPEC.md](SPEC.md)
> **D10：magic link 延後**，目前只做 Google 登入。下文關於 magic link 和 Resend 的部分，等恢復時才實作。

## 目標
讓一般使用者用最少步驟登入：可以用 Google，或輸入 email 收 magic link，不需要密碼。登入後所有資料都綁定這個使用者。也可以刪除自己的帳號。

## 設計
- better-auth 用 Drizzle adapter（`provider: "pg"`）。Google 用 `socialProviders.google`，email 登入用 `magicLink` plugin。
- `sendMagicLink({ email, url })` 用 Resend 寄出，寄件人是 `EMAIL_FROM`。信件內容只放一個按鈕和一行說明。
- handler 掛在 `src/routes/api/auth/$.ts`，GET 和 POST 都交給 `auth.handler(request)`。
- better-auth 的四張表（`user`、`session`、`account`、`verification`）用 `npx auth@latest generate --adapter drizzle` 產生到 `src/server/schema.ts`，**不手寫**。
- **對其他模組提供** `requireUser(): Promise<User>`，只在 server 端使用。沒有 session 就 `throw redirect({ to: '/login' })`。
- **路由保護**：除了 `/login` 和 `/api/*`，所有路由都在 root 的 `beforeLoad` 檢查 session。
- **刪除帳號**：使用 better-auth 的刪除使用者功能。其他模組的資料表都設 `on delete cascade` 指向 `user.id`，所以會一起刪掉。

## 畫面：`/login`
| 狀態 | 顯示 |
|---|---|
| 預設 | 「用 Google 繼續」按鈕、email 輸入框和「寄登入連結」按鈕 |
| 寄出中 | 按鈕顯示載入狀態並停用 |
| 已寄出 | 「到 {email} 收信」，60 秒後才能重寄 |
| 連結失效或過期 | 「連結已失效，再寄一次」 |
| 已登入 | 導回 `/` |

刪除帳號的入口在 `/settings`（由 `habits` 模組提供頁面）。要再次輸入 email 確認後才會刪除。

## 測試
- 整合測試（`pnpm test:db`）：刪除使用者後，`habit`、`check_in`、`push_subscription`、各設定表都沒有殘留這個使用者的資料。
- 手動：Google 登入；magic link 從收信到登入；未登入時造訪 `/habits/x` 會導到 `/login`。

## 成功標準
- [ ] Google 和 magic link 都能登入，登出後 session 失效。
- [ ] 未登入時造訪任何受保護的路由，都會導向 `/login`。
- [ ] 刪除帳號後，資料庫裡沒有這個使用者的任何資料。

## 待決問題
1. **Resend 寄件網域**：Resend 必須先驗證寄件網域才能寄給任意收件人。要用哪個網域？目前有網域嗎？
2. **magic link 有效期**：用 better-auth 的預設值就好，還是你有特定需求？

## 不做
密碼登入、2FA、Apple 登入、多帳號連結的 UI、管理後台。
