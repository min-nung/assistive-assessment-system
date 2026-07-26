# Google Cloud 設定指南

為雲端備份功能取得 OAuth Client ID。全程免費，約 15 分鐘。

> **費用說明**：Google Drive API 不計費。其額度為配額制——超過上限只會被限流（HTTP 429），不會產生費用。若過程中被要求綁定帳單帳戶，可以略過；未綁定帳單的專案仍可正常使用 Drive API。

---

## 1. 建立專案

1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)
2. 點畫面頂端的專案下拉選單 → **新增專案**
3. 專案名稱填 `assistive-assessment`（僅供你辨識，可自訂）
4. **建立**，然後確認頂端已切換到這個新專案

## 2. 啟用 Drive API

1. 左側選單 → **API 和服務** → **程式庫**
2. 搜尋 `Google Drive API`
3. 點進去 → **啟用**

## 3. 設定 OAuth 同意畫面

這是使用者按下「連結 Google Drive」時看到的授權畫面。

1. 左側選單 → **API 和服務** → **OAuth 同意畫面**
2. User Type 選 **外部（External）** → **建立**
3. 填寫必填欄位：
   - **應用程式名稱**：`輔具評估系統`（使用者會看到這個名稱，請填清楚）
   - **使用者支援電子郵件**：你的信箱
   - **開發人員聯絡資訊**：你的信箱
4. **儲存並繼續**

### 3-1. 範圍（Scopes）

1. 點 **新增或移除範圍**
2. 在篩選框輸入 `drive.file`
3. 勾選 `.../auth/drive.file`
   - 說明應為「查看及管理您使用這個應用程式開啟或建立的 Google 雲端硬碟檔案」
   - **不要**勾選 `.../auth/drive`（完整存取權），本系統不需要，且會觸發嚴格審查
4. **更新** → **儲存並繼續**

### 3-2. 測試使用者

發布狀態為「測試中」時，只有這份清單上的帳號能登入。

1. **新增使用者** → 填入你自己的 Google 帳號
2. 有其他同事要用，一併加入（上限 100 人）
3. **儲存並繼續**

## 4. 建立 OAuth Client ID

1. 左側選單 → **API 和服務** → **憑證**
2. **建立憑證** → **OAuth 用戶端 ID**
3. 應用程式類型選 **網頁應用程式（Web application）**
   - 必須是這個類型。選「電腦版應用程式」會拿到需要 Client Secret 的憑證，不適用於純前端。
4. 名稱填 `assistive-assessment-web`
5. **已授權的 JavaScript 來源** — 點「新增 URI」，逐一加入：

   ```text
   https://min-nung.github.io
   http://localhost:5500
   ```

   - 第一個是正式部署位置
   - 第二個供本機開發使用（若 Live Server 使用其他埠號，請一併加入）
   - 只填來源（協定 + 網域 + 埠號），**不含路徑**

6. **已授權的重新導向 URI**：留空。本系統使用 Google Identity Services 的 token model，不需要重新導向。
7. **建立**

## 5. 取得 Client ID

建立完成後會顯示 Client ID，格式如下：

```text
123456789012-abcdefghijklmnop.apps.googleusercontent.com
```

複製起來，實作時會寫進前端設定。

> **Client ID 可以公開，Client Secret 不可以。**
>
> Client ID 出現在公開的前端程式碼中是正常且安全的——Google 的設計即是如此。真正的防線是步驟 4 設定的「已授權的 JavaScript 來源」：即使他人取得此 Client ID，也只能從 `min-nung.github.io` 使用。
>
> 同一畫面上的 **Client Secret 絕對不可寫入前端程式碼或提交進版本庫**。純前端的 OAuth 流程不需要它。

---

## 之後才需要處理的事

**超過 100 個使用者時**，才需要將發布狀態從「測試中」改為「正式版」並送出驗證。

`drive.file` 屬於非敏感範圍，驗證流程相對單純，且不需要付費的第三方安全評估。自用或少數同事使用時，維持「測試中」即可，無須驗證。

**測試中狀態的 token 有效期較短**（約 7 天後需重新授權）。自用情境下可以接受；若造成困擾，即可考慮送出驗證。
