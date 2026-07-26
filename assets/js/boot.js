import { loadState, runBackFn } from './core/state.js';
import { showList } from './navigation.js';
import { remindBackupIfNeeded } from './backup/backup.js';
import {
  restoreCloudLink, initCloudBackup, isCloudBackupHealthy, remindCloudBackupIfStale
} from './cloud/cloud-ui.js';
import './events.js';

/* Application bootstrap and service-worker integration
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   Boot
   ========================================================================== */
loadState();
showList();

// Silent renewal of the cloud link, then start the upload coordinator once
// renewal has had its chance — starting first would let the coordinator's own
// startup conflict check run against a token that has not been renewed yet.
// This whole sequence is fire-and-forget from the rest of boot.js's
// perspective (loadState()/showList() above already ran, so the case list is
// visible before any of this settles) and every step swallows its own
// errors: an expired authorization or a failed conflict check must never
// block or interrupt an assessment in progress, only change status text.
const cloudStartupSettled = restoreCloudLink()
  .catch(error => console.warn('雲端備份續期失敗', error))
  .then(initCloudBackup)
  .catch(error => console.warn('雲端備份啟動時檢查衝突失敗', error));

// The reminder checks wait for the above so "should the 7-day manual reminder
// show" is decided against real cloud state, not a race against an async
// network check that might still be in flight at a fixed timer's mark — but
// only up to a bound. Neither drive-client.js's Drive fetches nor a silent
// GIS renewal beyond its own 2-minute callback timeout carries a network
// timeout of its own, so waiting on them unconditionally would let a stalled
// connection delay or suppress the manual reminder for exactly the therapist
// this ticket is for: someone who linked cloud backup and is now offline or
// on a bad connection. If cloud state has not settled by the time this fires,
// isCloudBackupHealthy() reads whatever the coordinator has determined so
// far, which defaults to "not confirmed healthy" — the conservative answer,
// so an unsettled check shows the reminder rather than silently skipping it.
const CLOUD_STARTUP_TIMEOUT_MS = 5000;
Promise.race([cloudStartupSettled, new Promise(resolve => setTimeout(resolve, CLOUD_STARTUP_TIMEOUT_MS))])
  .finally(() => {
    setTimeout(() => {
      remindBackupIfNeeded(isCloudBackupHealthy());
      remindCloudBackupIfStale();
    }, 700);
  });

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
