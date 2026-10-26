# Spec：export

> 模組 id：`export` · 依賴：`auth`、`habits` · 共用規則見 [SPEC.md](SPEC.md)

## 目標
使用者可以一鍵下載自己的全部資料，資料是可以帶走的。

## 設計
- server function `exportData()`：先 `requireUser()`，再查出該使用者的 `time_settings`、`habit`、`habit_schedule`、`check_in` 和 `reminder_setting`。
- 回傳 JSON；客戶端用 `Blob` 加 `<a download>` 存成 `habit-tracker-YYYY-MM-DD.json`。
- 格式：
```json
{
  "version": 1,
  "exportedAt": "2026-10-26T08:00:00Z",
  "user": { "email": "…", "createdAt": "…" },
  "timeSettings": { "timeZone": "Asia/Taipei", "dayStartMinutes": 0 },
  "reminder": { "enabled": false, "time": null },
  "habits": [
    { "id": "…", "name": "…", "stackCue": null, "createdOn": "2026-10-01",
      "schedules": [{ "effectiveFrom": "2026-10-01", "kind": "daily" }],
      "checkIns": ["2026-10-01", "2026-10-02"] }
  ]
}
```
- **不匯出**：session、OAuth token、推播訂閱的金鑰。連續紀錄也不匯出，因為可以從 `checkIns` 算回來。

## 畫面
在 `/settings` 的「資料」區塊放一個「匯出 JSON」按鈕。狀態有三種：預設、匯出中（按鈕停用）、失敗（toast）。

## 測試
- 整合測試：匯出結果只包含該使用者的資料；欄位完整；不含任何 token 或金鑰欄位。

## 成功標準
- [ ] 匯出的 JSON 包含該使用者全部的 habit、schedule、check-in 和設定，而且不含其他使用者的資料或任何密鑰。

## 不做
匯入、CSV、排程自動備份、寄送到信箱。
