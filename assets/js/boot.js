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

// restoreCloudLink() is a synchronous render of whatever the honest state
// looks like from what is already on disk — it deliberately does not call
// GIS. Doing so unconditionally at every launch used to mean every single
// app open could trigger GIS's silent-renewal popup, and iOS Safari treats
// any popup not triggered by a user gesture as one it must ask permission
// for — so a therapist saw an "allow pop-ups?" prompt on every launch,
// whether or not the token even needed renewing. Real verification now
// happens lazily, the first time a user gesture needs a token for real:
// opening settings, the cloud dialog, or an interactive link. See
// ensureCloudLinkVerified()'s own comment in cloud-ui.js.
restoreCloudLink();
initCloudBackup().catch(error => console.warn('雲端備份啟動時檢查衝突失敗', error));

// The manual-export reminder is decided against whatever cloud state is known
// right now, which is "not verified yet" on most launches — a therapist who
// has not opened settings this session sees isCloudBackupHealthy() report
// false and gets the same 7-day reminder they always would have. That is the
// conservative, honest default this project has consistently chosen over
// guessing cloud backup is fine: better an occasional reminder cloud backup
// would have suppressed than a suppressed reminder cloud backup was not
// actually earning.
setTimeout(() => {
  remindBackupIfNeeded(isCloudBackupHealthy());
  remindCloudBackupIfStale();
}, 700);

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
