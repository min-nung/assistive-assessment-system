import {
  state, BACKUP_DATE_KEY, BACKUP_REMINDER_KEY, BACKUP_REMINDER_DAYS,
  migrateCases, persistCases
} from '../core/state.js';
import { BACKUP_SCHEMA, validateBackupPayload } from './schema.js';
import { renderList } from '../views/case-list.js';
import { showToast } from '../ui.js';

/* Backup import, export, and reminder UI
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
function formatBackupDate(timestamp) {
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) return '尚未備份';
  return new Date(timestamp).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function getBackupStatus() {
  const lastBackupAt = localStorage.getItem(BACKUP_DATE_KEY);
  const age = lastBackupAt ? Date.now() - new Date(lastBackupAt).getTime() : Infinity;
  return { lastBackupAt, due: !lastBackupAt || age >= BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000 };
}

function renderBackupPanel() {
  const panel = document.getElementById('backupPanel');
  const status = document.getElementById('backupStatus');
  const exportBtn = document.getElementById('exportBackupBtn');
  if (!panel || !status || !exportBtn) return;
  const count = Object.keys(state.cases).length;
  const backup = getBackupStatus();
  panel.classList.toggle('due', count > 0 && backup.due);
  exportBtn.disabled = count === 0;
  status.textContent = count === 0
    ? '建立個案後即可匯出備份檔'
    : backup.due
      ? (backup.lastBackupAt ? `上次備份：${formatBackupDate(backup.lastBackupAt)}，建議立即備份` : '尚未備份，建議立即匯出備份檔')
      : `上次備份：${formatBackupDate(backup.lastBackupAt)}`;
}

function exportBackup() {
  const count = Object.keys(state.cases).length;
  if (!count) { showToast('目前沒有可備份的個案資料'); return; }
  const exportedAt = new Date().toISOString();
  const payload = { app: '輔具評估系統', version: 1, exportedAt, cases: state.cases };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const date = exportedAt.slice(0, 10).replace(/-/g, '');
  link.href = URL.createObjectURL(blob);
  link.download = `輔具評估系統備份_${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
  localStorage.setItem(BACKUP_DATE_KEY, exportedAt);
  localStorage.removeItem(BACKUP_REMINDER_KEY);
  renderBackupPanel();
  showToast(`已匯出 ${count} 筆個案備份`);
}

function importBackupFile(file) {
  if (!file) return;
  if (file.size > BACKUP_SCHEMA.maxFileBytes) {
    alert('備份檔超過 10 MB，請確認是否選錯檔案。');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = validateBackupPayload(JSON.parse(reader.result));
      const nextCases = payload.cases;
      migrateCases(nextCases);
      const importedCount = Object.keys(nextCases).length;
      const currentCount = Object.keys(state.cases).length;
      if (!confirm(`確定要還原這份備份嗎？\n\n備份內有 ${importedCount} 筆個案；目前的 ${currentCount} 筆個案會被取代。`)) return;
      if (!persistCases(nextCases)) throw new Error('無法寫入瀏覽器儲存空間');
      state.cases = nextCases;
      state.currentCaseId = null;
      renderList();
      showToast(`已還原 ${importedCount} 筆個案資料`);
    } catch (error) {
      console.warn('匯入備份失敗', error);
      alert(`無法匯入備份：${error.message || '格式不正確'}`);
    }
  };
  reader.onerror = () => alert('讀取備份檔失敗，請再試一次。');
  reader.readAsText(file, 'utf-8');
}

function remindBackupIfNeeded() {
  if (!Object.keys(state.cases).length || !getBackupStatus().due) return;
  const lastReminderAt = localStorage.getItem(BACKUP_REMINDER_KEY);
  const reminderAge = lastReminderAt ? Date.now() - new Date(lastReminderAt).getTime() : Infinity;
  if (reminderAge < BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000) return;
  localStorage.setItem(BACKUP_REMINDER_KEY, new Date().toISOString());
  const dialog = document.getElementById('backupReminderDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else if (confirm('已超過 7 天未匯出備份。要立即匯出 JSON 備份嗎？')) exportBackup();
}

export {
  formatBackupDate, getBackupStatus, renderBackupPanel, exportBackup,
  importBackupFile, remindBackupIfNeeded
};
