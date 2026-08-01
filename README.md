# 輔具評估與補助試算系統

這是由單檔版重構而成的靜態網頁應用程式，提供個案資料管理、評估表單、爬梯資格判定、補助試算與備份／還原功能。

## 線上版本

<https://min-nung.github.io/assistive-assessment-system/>

## 專案結構

```text
.
├── index.html                    # 應用程式入口（原生 ES module）
├── sw.js                         # Service Worker：離線快取
├── package.json                  # 僅用於執行測試，無相依套件
├── tests/                        # node:test 測試
└── assets/
    ├── css/app.css               # 樣式
    └── js/
        ├── core/                 # 狀態、DOM 工具、個案 CRUD
        ├── backup/               # 備份格式驗證與匯入／匯出
        ├── cloud/                # 雲端備份決策（純函式）
        ├── calculations/         # 爬梯資格與補助金額計算
        ├── forms/                # 各評估表單
        ├── views/                # 個案列表畫面
        ├── navigation.js         # 畫面導覽
        ├── events.js             # DOM 事件處理
        └── boot.js               # 程式啟動點
```

## 執行方式

請透過靜態 HTTP 伺服器開啟，避免直接用 `file://` 開啟而遭瀏覽器限制 ES module 或 Service Worker。

### VS Code Live Server

1. 安裝 VS Code 的 **Live Server** 擴充套件。
2. 在本專案開啟 `index.html`。
3. 點右下角 **Go Live**，或右鍵選擇 **Open with Live Server**。

### 其他靜態伺服器

```bash
npx --yes serve . -l 5500
```

接著開啟 `http://localhost:5500/`，不需附加檔名。

### 只用來閱覽的裝置

在網址後加上 `?readonly=1`（例如 `https://min-nung.github.io/assistive-assessment-system/?readonly=1`）即可將該裝置設為**唯讀檢視裝置**：只讀取雲端資料，永不上傳，因此不會覆蓋其他裝置備份的內容。設定會記在該裝置上，之後開啟不帶參數的網址仍維持唯讀；`?readonly=0` 或在「設定 → 雲端備份」中取消勾選即可解除。詳見 [ADR 0003](./docs/adr/0003-view-only-devices.md)。

## 測試

```bash
npm test
```

決策模組的測試使用 Node 內建的 `node:test`，本專案沒有相依套件，不需要 `npm install`。

## 設計重點

- 以單一 `boot.js` 作為原生 ES module 入口，模組相依關係由 `import`／`export` 管理。
- 將資料狀態、備份 schema、各評估表單、爬梯判定及補助試算分離，降低修改時互相影響的風險。
- 匯入備份前會驗證格式、資料型別與大小，避免不完整或不安全的資料直接覆寫本機資料。
- 資料保存在瀏覽器 `localStorage`；匯出備份可保留與轉移個案資料。
- Service Worker 會快取應用程式資源，支援基本離線使用。

## 資料範圍

本專案不包含補助金額對照表、Excel 或其他原始資料檔。補助規則與資料來源應依實際使用單位的最新規範另行維護與確認。
