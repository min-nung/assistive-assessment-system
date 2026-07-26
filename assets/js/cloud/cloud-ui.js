import { state } from '../core/state.js';
import { CLOUD_CONFIG } from './cloud-config.js';
import { describeLinkState, LINK_STATES } from './auth-state.js';
import {
  requestAccess, renewAccessSilently, revokeAccess, fetchLinkedEmail,
  hasValidToken, forgetToken, DriveAuthError
} from './drive-client.js';
import { startCloudBackup, resolveConflict, describeConflict, currentUploadStatus, UPLOAD_STATES } from './cloud-backup.js';
import { previewCloudSnapshot, applyCloudSnapshot } from './restore.js';
import { fetchSnapshot } from './drive-client.js';
import { formatBackupDate } from '../backup/backup.js';
import { showToast } from '../ui.js';

/* Cloud backup panel.
 *
 * Wires the pure link-state description to the DOM and to localStorage. The
 * judgement about what the user is told lives in auth-state.js; the Google
 * calls live in drive-client.js. This module only connects them.
 *
 * This ticket covers authorization only — no snapshot is uploaded yet.
 */
function readLinkedEmail() {
  try {
    return localStorage.getItem(CLOUD_CONFIG.linkedEmailKey);
  } catch {
    // A browser with storage disabled must not break the assessment features.
    return null;
  }
}

function writeLinkedEmail(email) {
  try {
    if (email) localStorage.setItem(CLOUD_CONFIG.linkedEmailKey, email);
    else localStorage.removeItem(CLOUD_CONFIG.linkedEmailKey);
  } catch (error) {
    console.warn('無法保存雲端連結狀態', error);
  }
}

function currentLinkState() {
  return describeLinkState({
    linkedEmail: readLinkedEmail(),
    hasValidToken: hasValidToken(),
    isOnline: navigator.onLine
  });
}

function formatUploadTime(timestamp) {
  if (!timestamp) return null;
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return null;
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return '雲端：剛剛';
  if (minutes < 60) return `雲端：${minutes} 分鐘前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `雲端：${hours} 小時前`;
  return `雲端：${new Date(time).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  })}`;
}

/**
 * What the upload status line shows. Failure must read as failure — the
 * ticket's own words are "顯示失敗狀態而非假裝成功" — so a stuck retry loop
 * is never allowed to render as anything but 失敗中.
 */
function describeUploadStatus(status) {
  const uploadedAt = formatUploadTime(status.lastUploadedAt);
  switch (status.state) {
    case UPLOAD_STATES.uploading:
      return '正在上傳…';
    case UPLOAD_STATES.waiting:
      return uploadedAt ? `${uploadedAt}（待上傳新變動）` : '待上傳';
    case UPLOAD_STATES.offline:
      return '離線，待恢復連線後上傳';
    case UPLOAD_STATES.conflict:
      return '偵測到雲端有較新的資料，請選擇要保留哪一份';
    case UPLOAD_STATES.needsAuth:
      return '授權已過期，備份已停止';
    case UPLOAD_STATES.failed:
      return uploadedAt ? `上傳失敗，${uploadedAt}` : '上傳失敗，正在重試';
    case UPLOAD_STATES.uploaded:
    case UPLOAD_STATES.idle:
    default:
      return uploadedAt;
  }
}

function renderCloudPanel() {
  const status = document.getElementById('cloudStatus');
  const detail = document.getElementById('cloudDetail');
  const account = document.getElementById('cloudAccount');
  const uploadStatusEl = document.getElementById('cloudUploadStatus');
  const linkBtn = document.getElementById('linkCloudBtn');
  const unlinkBtn = document.getElementById('unlinkCloudBtn');
  if (!status || !detail || !linkBtn || !unlinkBtn) return;

  const state = currentLinkState();
  status.textContent = state.label;
  status.dataset.state = state.status;
  detail.textContent = state.detail;
  if (account) {
    account.textContent = state.email || '';
    account.hidden = !state.email;
  }
  if (uploadStatusEl) {
    // Only shown once linked — an unlinked or expired state already says
    // everything that matters, and an upload line would just repeat it.
    const showUpload = state.status === LINK_STATES.linked || state.status === LINK_STATES.linkedOffline;
    const upload = showUpload ? currentUploadStatus() : null;
    const text = upload ? describeUploadStatus(upload) : null;
    uploadStatusEl.textContent = text || '';
    uploadStatusEl.hidden = !text;
    // Clickable specifically in the conflict state, so "有待處理的衝突" is not
    // just a label — it is the way back into the dialog that resolves it.
    const isConflict = upload?.state === UPLOAD_STATES.conflict;
    uploadStatusEl.classList.toggle('cloud-upload-status-actionable', isConflict);
    uploadStatusEl.setAttribute('role', isConflict ? 'button' : '');
    uploadStatusEl.tabIndex = isConflict ? 0 : -1;
    if (upload?.state === UPLOAD_STATES.failed) uploadStatusEl.dataset.tone = 'failed';
    else if (isConflict) uploadStatusEl.dataset.tone = 'conflict';
    else delete uploadStatusEl.dataset.tone;
  }
  linkBtn.hidden = !state.canLink;
  linkBtn.textContent = state.status === LINK_STATES.needsRelink ? '重新連結' : '連結 Google 帳號';
  unlinkBtn.hidden = !state.canUnlink;
}

function openCloudDialog() {
  renderCloudPanel();
  const dialog = document.getElementById('cloudDialog');
  if (dialog?.showModal) dialog.showModal();
}

/* Holds the snapshot between "here is what the cloud has" and "apply it",
 * so confirming the restore dialog does not need to fetch a second time. */
let pendingRestore = null;

/**
 * Offers a restore only right after an interactive link — not on every
 * silent renewal at app start, which would re-prompt on every boot until the
 * user acts. Skipped when local already has cases: an existing case list is
 * real work, and pointing that user at a restore invites them to overwrite it.
 */
async function offerCloudRestoreIfNew() {
  if (Object.keys(state.cases).length > 0) return;
  let preview;
  try {
    preview = await previewCloudSnapshot();
  } catch (error) {
    console.warn('檢查雲端快照失敗', error);
    return;
  }
  if (!preview) return;
  pendingRestore = preview.payload;
  const detail = document.getElementById('restoreDetail');
  const warning = document.getElementById('restoreWarning');
  const dialog = document.getElementById('restoreDialog');
  if (!detail || !dialog?.showModal) return;
  detail.textContent = `雲端備份時間：${formatBackupDate(preview.snapshotAt)}，共 ${preview.caseCount} 筆個案`;
  if (warning) {
    // The safety export is only real when there is something to export — do
    // not promise a download that applyCloudSnapshot() will silently skip.
    // The "will be replaced" line only applies once local data actually
    // exists here (a future conflict-resolution path can also open this
    // dialog with local cases present); the empty case still needs a plain
    // statement so the user knows this is safe either way.
    const hasLocalCases = Object.keys(state.cases).length > 0;
    warning.textContent = hasLocalCases
      ? '確認還原將以雲端資料取代本機現有資料，還原前會自動匯出目前的資料作為保險。'
      : '目前沒有本機資料會被取代。';
  }
  dialog.showModal();
}

function confirmCloudRestore() {
  const payload = pendingRestore;
  pendingRestore = null;
  document.getElementById('restoreDialog')?.close();
  if (!payload) return;
  const result = applyCloudSnapshot(payload);
  if (!result.ok) {
    // A bad snapshot must not look like it went through, and must not touch
    // local data — applyCloudSnapshot() already guarantees the latter.
    alert(`無法還原雲端備份：${result.message}`);
  }
}

function skipCloudRestore() {
  pendingRestore = null;
  document.getElementById('restoreDialog')?.close();
}

function describeSnapshotSide(changedAt, caseCount) {
  return changedAt
    ? `${formatBackupDate(changedAt)}，共 ${caseCount} 筆個案`
    : `時間不明，共 ${caseCount} 筆個案`;
}

/**
 * Opens the conflict dialog with both sides' time and case count, per the
 * ticket's own requirement to show them side by side rather than asking the
 * user to choose blind. Safe to call repeatedly — clicking the status line
 * again while the dialog is open just re-renders it with fresh cloud data.
 */
async function openConflictDialog() {
  const dialog = document.getElementById('conflictDialog');
  const localEl = document.getElementById('conflictLocalDetail');
  const cloudEl = document.getElementById('conflictCloudDetail');
  if (!dialog?.showModal || !localEl || !cloudEl) return;
  const conflict = await describeConflict().catch(error => {
    console.warn('無法取得衝突詳情', error);
    return null;
  });
  if (!conflict) return;
  localEl.textContent = describeSnapshotSide(conflict.localChangedAt, conflict.localCaseCount);
  cloudEl.textContent = describeSnapshotSide(conflict.cloudSnapshotAt, conflict.cloudCaseCount);
  dialog.showModal();
}

/** Keep local data, overwriting the cloud snapshot on the next upload. */
function keepLocalData() {
  resolveConflict(true);
  document.getElementById('conflictDialog')?.close();
  renderCloudPanel();
  showToast('已選擇保留本機資料，稍後會自動上傳覆蓋雲端');
}

/**
 * Adopt the cloud snapshot. Reuses restore.js's fetch-validate-migrate-apply
 * path — including its own pre-apply safety export — so a conflict resolution
 * is held to the exact same untrusted-input discipline as a fresh restore,
 * not a shortcut around it.
 *
 * Fetches again rather than reusing what openConflictDialog() already showed:
 * this overwrites local data and cannot be undone, and the user may have sat
 * on the dialog for a while before deciding, so applying a snapshot that is
 * current at the moment of the decision is worth a second round trip.
 */
async function useCloudData() {
  const useCloudBtn = document.getElementById('useCloudBtn');
  if (useCloudBtn) useCloudBtn.disabled = true;
  try {
    const payload = await fetchSnapshot();
    if (!payload) {
      alert('無法取得雲端快照，請稍後再試。');
      return;
    }
    const result = applyCloudSnapshot(payload);
    if (!result.ok) {
      alert(`無法採用雲端資料：${result.message}`);
      return;
    }
    // Only clear the conflict once the cloud copy has actually replaced local
    // data — a failed fetch or a bad snapshot must leave the conflict in
    // place, or the next change would upload over data the user never saw.
    resolveConflict(false);
    document.getElementById('conflictDialog')?.close();
    renderCloudPanel();
  } catch (error) {
    console.warn('採用雲端資料失敗', error);
    alert('無法取得雲端快照，請稍後再試。');
  } finally {
    if (useCloudBtn) useCloudBtn.disabled = false;
  }
}

/** "先不要決定" — the dialog closes, the app stays fully usable, and the
 * conflict remains unresolved so auto-upload stays paused until the user
 * comes back to choose. */
function deferConflict() {
  document.getElementById('conflictDialog')?.close();
}

// linkBtn.disabled alone is not a real lock — offerCloudRestoreIfNew() is not
// awaited below, so the button re-enables before its fetch resolves. Without
// this guard a fast double-click could start a second link attempt whose
// restore preview resolves out of order and overwrites pendingRestore with a
// stale snapshot the user never saw described.
let linkInFlight = false;

async function linkCloudAccount() {
  if (linkInFlight) return;
  linkInFlight = true;
  const linkBtn = document.getElementById('linkCloudBtn');
  if (linkBtn) linkBtn.disabled = true;
  try {
    await requestAccess();
    const email = await fetchLinkedEmail();
    writeLinkedEmail(email);
    renderCloudPanel();
    showToast(email ? `已連結 ${email}` : '已連結 Google 帳號');
    await offerCloudRestoreIfNew().catch(error => console.warn('雲端還原提示失敗', error));
  } catch (error) {
    // Failing to link must leave no impression that backup is active.
    forgetToken();
    renderCloudPanel();
    const message = error instanceof DriveAuthError ? error.message : '連結失敗，請再試一次';
    showToast(message);
    console.warn('連結 Google 帳號失敗', error);
  } finally {
    linkInFlight = false;
    if (linkBtn) linkBtn.disabled = false;
  }
}

function unlinkCloudAccount() {
  if (!confirm('確定要解除 Google 帳號連結嗎？\n\n雲端上已備份的快照不會被刪除，但之後的變動將不再自動備份。')) return;
  const revokedWithGoogle = revokeAccess();
  writeLinkedEmail(null);
  renderCloudPanel();
  // The local link is gone either way. Say so plainly when the grant may still
  // exist on Google's side, rather than implying a cleanup that did not happen.
  showToast(revokedWithGoogle
    ? '已解除 Google 帳號連結'
    : '已解除本機連結，如需撤銷授權請至 Google 帳號設定');
}

/**
 * Silent renewal at app start. Never prompts and never blocks: an expired
 * authorization must not interrupt an assessment, so a failure here only
 * changes the status text the user sees when they next open the panel.
 */
async function restoreCloudLink() {
  if (!readLinkedEmail()) return;
  if (!navigator.onLine) { renderCloudPanel(); return; }
  if (hasValidToken()) { renderCloudPanel(); return; }
  try {
    await renewAccessSilently();
  } catch (error) {
    // Drop any token rather than relying on it already being absent, so the
    // panel cannot claim protection the renewal just failed to obtain.
    forgetToken();
    console.warn('雲端備份靜默續期失敗，狀態將顯示為需要重新連結', error);
  }
  renderCloudPanel();
}

/**
 * Wires the upload coordinator to the panel so its state changes are visible
 * without the user having to reopen the dialog. Cheap to call repeatedly:
 * rendering only touches the DOM when the dialog's elements exist.
 */
function initCloudBackup() {
  startCloudBackup(renderCloudPanel);
}

export {
  renderCloudPanel, openCloudDialog, linkCloudAccount,
  unlinkCloudAccount, restoreCloudLink, currentLinkState, initCloudBackup,
  confirmCloudRestore, skipCloudRestore,
  openConflictDialog, keepLocalData, useCloudData, deferConflict
};
