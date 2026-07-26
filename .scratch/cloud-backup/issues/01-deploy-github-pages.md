# 01 — 部署到 GitHub Pages，取得固定網域

**What to build:** 治療師能從一個固定的公開網址開啟系統，並正常使用所有現有功能——個案管理、各評估模組、爬梯判定、補助試算、手動 JSON 備份、離線使用。網址不含檔名，直接開啟根路徑即可進入應用程式。

這張票不新增任何功能，但它是所有雲端備份工作的前置條件：Google OAuth 要求事先註冊「已授權的 JavaScript 來源」，而目前系統只在本機以 Live Server 執行，沒有可註冊的固定網域。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] GitHub Pages 已啟用，系統可從 `https://min-nung.github.io/assistive-assessment-system/` 開啟
- [ ] 應用程式入口為 `index.html`，開啟根路徑即可進入，網址不需附加檔名
- [ ] 既有的所有評估功能在部署後運作正常，與本機執行時一致
- [ ] Service Worker 在部署環境下正確註冊，離線後重新開啟仍可使用
- [ ] Service Worker 快取的資源清單與實際檔名一致，改名後無失效項目
- [ ] 本機開發方式仍然可用，README 說明同步更新
