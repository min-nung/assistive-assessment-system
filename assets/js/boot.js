import { loadState, runBackFn } from './core/state.js';
import { showList } from './navigation.js';
import { remindBackupIfNeeded } from './backup/backup.js';
import { restoreCloudLink } from './cloud/cloud-ui.js';
import './events.js';

/* Application bootstrap and service-worker integration
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   Boot
   ========================================================================== */
loadState();
showList();
setTimeout(remindBackupIfNeeded, 700);

// Silent renewal of the cloud link. Deliberately not awaited and deliberately
// swallowing errors: an expired authorization must never block or interrupt an
// assessment in progress, so a failure only changes the status text.
restoreCloudLink().catch(error => console.warn('雲端備份續期失敗', error));

// 每次開啟時檢查 Service Worker 更新；連線時會優先使用網站最新版。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(error => console.warn('離線快取設定失敗：', error));
  });
}

// FAB 返回按鈕：同步 backBtn 顯示狀態
(function() {
  const fab = document.getElementById('fabBack');
  const btn = document.getElementById('backBtn');
  new MutationObserver(function() {
    const show = btn.style.display !== 'none';
    fab.style.display = show ? 'flex' : 'none';
  }).observe(btn, { attributes: true, attributeFilter: ['style'] });
  fab.addEventListener('click', runBackFn);
})();
