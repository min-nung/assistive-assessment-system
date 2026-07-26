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
function readTimestamp(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    // A browser with storage disabled must not break the assessment features.
    return null;
  }
}

function writeTimestamp(key, value, label = '無法保存雲端備份時間戳') {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch (error) {
    console.warn(label, error);
  }
}

function readLinkedEmail() {
  return readTimestamp(CLOUD_CONFIG.linkedEmailKey);
}

function writeLinkedEmail(email) {
  writeTimestamp(CLOUD_CONFIG.linkedEmailKey, email, '無法保存雲端連結狀態');
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

/**
 * One line for the manual-backup panel, so a therapist checking on their data
 * sees both backup paths in the same place rather than having to separately
 * open the cloud dialog to find out if cloud backup is even working. Reuses
 * currentLinkState()/describeUploadStatus() rather than re-deriving the
 * distinctions — the five states the ticket requires (正常/離線/失敗/需重新
 * 連結/衝突) are exactly the states those two functions already draw.
 */
function summarizeCloudStatus() {
  const link = currentLinkState();
  if (link.status === LINK_STATES.unlinked) {
    return { label: '雲端備份：未連結', tone: 'muted' };
  }
  if (link.status === LINK_STATES.needsRelink) {
    return { label: '雲端備份：需要重新連結', tone: 'failed' };
  }
  if (link.status === LINK_STATES.linkedOffline) {
    return { label: '雲端備份：離線，待恢復連線後上傳', tone: 'muted' };
  }
  const upload = currentUploadStatus();
  if (upload.state === UPLOAD_STATES.conflict) {
    return { label: '雲端備份：有待處理的衝突', tone: 'conflict' };
  }
  if (upload.state === UPLOAD_STATES.failed) {
    return { label: '雲端備份：上傳失敗', tone: 'failed' };
  }
  // A token can be valid at the moment currentLinkState() is read and still
  // fail moments later mid-upload (drive-client.js's driveFetch calls
  // forgetToken() on a 401/403, which currentLinkState() has not yet seen).
  // Without this check that combination would fall through to the "ok"
  // branch below and claim protection that just failed — the exact silent
  // failure this ticket exists to prevent.
  if (upload.state === UPLOAD_STATES.needsAuth) {
    return { label: '雲端備份：授權已過期，備份已停止', tone: 'failed' };
  }
  const uploadedAt = formatUploadTime(upload.lastUploadedAt);
  return { label: uploadedAt ? `雲端備份：${uploadedAt.replace('雲端：', '')}` : '雲端備份：已連結', tone: 'ok' };
}

/**
 * Renders the cloud summary line inside the manual-backup panel. Lives here
 * rather than in backup.js so backup.js stays cloud-agnostic — cloud-ui.js
 * already imports from backup.js for formatBackupDate(), and importing back
 * would make the two modules depend on each other in both directions.
 */
function renderCloudSummary() {
  const line = document.getElementById('cloudSummaryLine');
  if (!line) return;
  const summary = summarizeCloudStatus();
  line.textContent = `${summary.label}  ›`;
  line.dataset.tone = summary.tone;
}

/**
 * Whether cloud backup can currently be trusted to be doing its job. This is
 * deliberately narrower than "linked" — a link with an expired token or a
 * pending conflict is not backing anything up right now, and telling the
 * therapist otherwise is exactly the silent-failure mode this ticket exists
 * to prevent. Used to decide whether the 7-day manual reminder still applies.
 */
function isCloudBackupHealthy() {
  const link = currentLinkState();
  if (link.status !== LINK_STATES.linked) return false;
  const uploadState = currentUploadStatus().state;
  // needsAuth included here for the same reason summarizeCloudStatus() checks
  // it explicitly: a token can be valid at the moment currentLinkState() is
  // read and fail moments later mid-upload.
  return uploadState !== UPLOAD_STATES.conflict
    && uploadState !== UPLOAD_STATES.failed
    && uploadState !== UPLOAD_STATES.needsAuth;
}

/**
 * Days since the last successful cloud upload, or null if cloud backup was
 * never linked at all — a user who never opted in gets the plain manual
 * reminder, not a cloud-specific one about a feature they never turned on.
 */
function daysSinceLastCloudUpload() {
  if (!readLinkedEmail()) return null;
  const lastUploadedAt = currentUploadStatus().lastUploadedAt;
  if (!lastUploadedAt) return Infinity;
  const time = new Date(lastUploadedAt).getTime();
  if (Number.isNaN(time)) return Infinity;
  return (Date.now() - time) / (24 * 60 * 60 * 1000);
}

/**
 * Active nudge for the failure mode this whole ticket exists to prevent: a
 * therapist who trusts cloud backup, stops exporting JSON by hand, and has
 * no way to notice it quietly stopped working weeks ago. Only fires for
 * someone who actually linked — a user who never opted into cloud backup
 * already gets the plain manual reminder from backup.js and needs nothing
 * cloud-specific added on top.
 *
 * A toast, never a modal: this is a "you may want to check" nudge, not a
 * decision the therapist must make before continuing, and nothing here may
 * interrupt an assessment in progress.
 */
function remindCloudBackupIfStale() {
  const days = daysSinceLastCloudUpload();
  if (days === null || days < CLOUD_CONFIG.staleReminderDays) return;
  const lastReminderAt = readTimestamp(CLOUD_CONFIG.staleReminderKey);
  const reminderAge = lastReminderAt ? Date.now() - new Date(lastReminderAt).getTime() : Infinity;
  if (reminderAge < CLOUD_CONFIG.staleReminderDays * 24 * 60 * 60 * 1000) return;
  writeTimestamp(CLOUD_CONFIG.staleReminderKey, new Date().toISOString());
  showToast('雲端備份已超過 7 天沒有成功上傳，建議檢查連結狀態或改用手動匯出');
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
  // Every caller of renderCloudPanel() (link, unlink, restore, conflict
  // resolution, silent renewal) should also keep the manual-backup panel's
  // summary line current, so status updates never depend on remembering to
  // call two functions at each site.
  renderCloudSummary();
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
/**
 * @returns {Promise<void>} See startCloudBackup()'s own return — resolves
 *   once the startup conflict check has settled, for callers that need to
 *   know whether cloud backup looks healthy right now rather than racing it.
 */
function initCloudBackup() {
  // renderCloudPanel() also refreshes the summary line (see its own
  // comment), so every upload-state change reaches both panels regardless
  // of which one, if either, is currently open.
  return startCloudBackup(renderCloudPanel);
}

export {
  renderCloudPanel, openCloudDialog, linkCloudAccount,
  unlinkCloudAccount, restoreCloudLink, currentLinkState, initCloudBackup,
  confirmCloudRestore, skipCloudRestore,
  openConflictDialog, keepLocalData, useCloudData, deferConflict,
  summarizeCloudStatus, isCloudBackupHealthy, daysSinceLastCloudUpload, renderCloudSummary,
  remindCloudBackupIfStale
};
