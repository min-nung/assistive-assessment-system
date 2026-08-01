import { state, onStateChanged } from '../core/state.js';
import { CLOUD_CONFIG } from './cloud-config.js';
import { describeLinkState, LINK_STATES } from './auth-state.js';
import {
  requestAccess, renewAccessSilently, revokeAccess, fetchLinkedEmail,
  hasValidToken, hasFreshToken, forgetToken, DriveAuthError
} from './drive-client.js';
import {
  startCloudBackup, checkForConflictNow, resolveConflict, describeConflict, currentUploadStatus,
  syncSettingsChanged, UPLOAD_STATES
} from './cloud-backup.js';
import { previewCloudSnapshot, applyCloudSnapshot } from './restore.js';
import { fetchSnapshot } from './drive-client.js';
import {
  isReadOnlyDevice, setReadOnlyDevice, recordPull, hasUnsavedViewEdits
} from './read-only.js';
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

/* Whether this session has actually asked GIS about the token yet.
 *
 * GIS's silent-renewal call opens a hidden popup even with prompt:'none', and
 * iOS Safari treats any popup not triggered by a user gesture as one it must
 * ask the user about — so calling it unconditionally at app start meant every
 * single launch interrupted the user with "do you want to allow pop-ups?",
 * whether or not the token actually needed renewing. Deferring the check
 * until a real action needs a token (an upload, opening the cloud dialog)
 * means the popup only ever fires as a consequence of something the user
 * just did, which iOS does not flag.
 *
 * In-memory only — a fresh page load has not verified anything yet either,
 * so it correctly starts false again on every reload. */
let sessionVerified = false;

/* Renew this long before the token actually expires.
 *
 * Google's access tokens last an hour and an assessment session easily
 * outlives one. Waiting for real expiry would mean every long session has a
 * window where uploads fail with no token and nothing to fix it — the same
 * dead end this whole renewal path exists to close, just an hour later. A
 * generous margin means renewal always happens during ordinary tapping,
 * minutes before anything actually needs the token. */
const TOKEN_RENEWAL_MARGIN_MS = 10 * 60 * 1000;

/* Set when a silent renewal has actually failed, which in practice means the
 * grant itself is gone (Google's test-mode authorizations expire after about a
 * week) rather than anything a retry could fix. Without this, the gesture
 * watcher below would fire a fresh GIS call on every single tap — turning one
 * expired grant into a stream of popup attempts. Cleared only by something
 * that genuinely changes the situation: an interactive re-link, an unlink, or
 * coming back online after the failure happened on a flaky connection. */
let silentRenewalFailed = false;

/**
 * Whether a silent renewal is worth attempting right now. Kept deliberately
 * cheap: the gesture watcher calls this on every pointerdown, and the common
 * answer — "no, the token is fine" — must cost nothing worth measuring.
 *
 * @returns {boolean}
 */
function needsTokenRenewal() {
  if (silentRenewalFailed) return false;
  if (!readLinkedEmail()) return false;
  if (!navigator.onLine) return false;
  return !hasFreshToken(TOKEN_RENEWAL_MARGIN_MS);
}

function currentLinkState() {
  return describeLinkState({
    linkedEmail: readLinkedEmail(),
    hasValidToken: hasValidToken(),
    isOnline: navigator.onLine,
    isVerified: sessionVerified
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
  // Answered before the upload state machine is consulted at all: on a
  // view-only device this is a fact about the device, true from the moment the
  // page loads — long before anything has had a reason to run a sync decision
  // and leave a state behind for this function to read.
  if (isReadOnlyDevice()) return '唯讀檢視：只讀取雲端資料，不會上傳覆蓋';
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
  // Ranked above view-only on purpose: a view-only device still needs a valid
  // authorization to read anything at all, so an expired one is a problem the
  // user must act on, not something a description of this device's role may
  // paper over.
  if (link.status === LINK_STATES.needsRelink) {
    return { label: '雲端備份：需要重新連結', tone: 'failed' };
  }
  // Checked before every remaining state: the upload states below describe a
  // job this device is not doing, and claiming either protection or failure
  // would both be wrong. What the user needs to see is which role it plays.
  if (isReadOnlyDevice()) {
    return { label: '雲端備份：唯讀檢視（不會上傳）', badge: '唯讀檢視', tone: 'readonly' };
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
  const summary = summarizeCloudStatus();
  if (line) {
    line.textContent = `${summary.label}  ›`;
    line.dataset.tone = summary.tone;
  }
  renderCloudStatusBadge(summary);
}

/**
 * Header badge so link status is visible from every screen, not just inside
 * the manual-backup dialog. Hidden entirely when unlinked — a therapist who
 * never opted in should not see a permanent reminder of a feature they chose
 * not to use, matching daysSinceLastCloudUpload()'s same reasoning.
 */
function renderCloudStatusBadge(summary) {
  const badge = document.getElementById('cloudStatusBadge');
  if (!badge) return;
  if (readLinkedEmail() === null) {
    badge.style.display = 'none';
    return;
  }
  badge.style.display = '';
  // A header badge has room for a few characters, not a sentence — a summary
  // that needs a longer explanation supplies its own short form.
  badge.textContent = summary.badge || summary.label.replace('雲端備份：', '');
  badge.dataset.tone = summary.tone;
}

/**
 * Whether cloud backup can currently be trusted to be doing its job. This is
 * deliberately narrower than "linked" — a link with an expired token or a
 * pending conflict is not backing anything up right now, and telling the
 * therapist otherwise is exactly the silent-failure mode this ticket exists
 * to prevent. Used to decide whether the 7-day manual reminder still applies.
 */
function isCloudBackupHealthy() {
  // A view-only device backs nothing up, so the honest answer is no. Callers
  // that want to know whether to nag the user should ask
  // shouldSkipManualBackupReminder() instead — a viewer holds no original data
  // worth reminding anyone about.
  if (isReadOnlyDevice()) return false;
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
 * Whether the 7-day manual-export reminder should stay quiet. Two reasons
 * qualify: cloud backup is already doing the job, or this device is view-only
 * and holds no original work — everything it shows came from the cloud and
 * still lives there, so there is nothing here that a JSON export would save.
 *
 * @returns {boolean}
 */
function shouldSkipManualBackupReminder() {
  return isReadOnlyDevice() || isCloudBackupHealthy();
}

/**
 * Days since the last successful cloud upload, or null if cloud backup was
 * never linked at all — a user who never opted in gets the plain manual
 * reminder, not a cloud-specific one about a feature they never turned on.
 */
function daysSinceLastCloudUpload() {
  // A view-only device never uploads by design, so "it has been a while since
  // the last upload" is not a warning sign here — it is the whole point.
  if (isReadOnlyDevice()) return null;
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

/**
 * The view-only switch and its one action, "load the latest from the cloud".
 *
 * The load button appears only on a view-only device: on a normal device the
 * same thing already happens automatically in the other direction, and putting
 * a second overwrite-local-data button next to it would invite exactly the
 * accident this app spends so much care avoiding.
 *
 * @param {string} linkStatus One of LINK_STATES
 */
function renderReadOnlyControls(linkStatus) {
  const toggle = document.getElementById('readOnlyToggle');
  const pullBtn = document.getElementById('pullCloudBtn');
  const readOnly = isReadOnlyDevice();
  if (toggle) toggle.checked = readOnly;
  if (pullBtn) {
    pullBtn.hidden = !readOnly || linkStatus === LINK_STATES.unlinked;
    pullBtn.disabled = pullInFlight;
    pullBtn.textContent = pullInFlight ? '載入中…' : '從雲端載入最新資料';
  }
}

/**
 * Turn this device into a view-only device, or back into a normal one.
 *
 * Both directions are confirmed, for opposite reasons. Turning it on stops
 * this device's backups, and someone who did the day's assessments here must
 * not discover that silently. Turning it off is the more dangerous direction:
 * a device that has been reading a snapshot for weeks may hold a stale copy,
 * and from that moment on it is allowed to write again.
 *
 * @param {boolean} on
 */
function setReadOnlyMode(on) {
  const toggle = document.getElementById('readOnlyToggle');
  const wasOn = isReadOnlyDevice();
  if (on === wasOn) return;
  const message = on
    ? '要把這台裝置設為唯讀檢視嗎？\n\n這台裝置之後只會讀取雲端資料，不會再上傳，也不會覆蓋其他裝置備份的內容。'
    : '要解除唯讀檢視嗎？\n\n這台裝置之後會恢復自動備份。若這裡的資料比雲端舊，系統會先詢問你要保留哪一份，不會自動覆蓋。';
  if (!confirm(message)) {
    // The checkbox already flipped itself on click; put it back.
    if (toggle) toggle.checked = wasOn;
    return;
  }
  setReadOnlyDevice(on);
  // Not awaited: turning the switch on takes effect immediately and
  // synchronously (see syncSettingsChanged()); only the turning-off direction
  // has a cloud check to finish, and renderCloudPanel() runs again when it does.
  syncSettingsChanged()
    .then(renderCloudPanel)
    .catch(error => console.warn('切換唯讀檢視後重新檢查雲端失敗', error));
  renderCloudPanel();
  showToast(on ? '已設為唯讀檢視，這台裝置不會再上傳' : '已解除唯讀檢視，這台裝置會恢復自動備份');
}

/* One pull at a time. Two overlapping fetches could resolve out of order and
 * hand confirmCloudRestore() a snapshot the user never saw described — the
 * same failure linkInFlight guards against on the link path. */
let pullInFlight = false;

/**
 * Fetch the current cloud snapshot and offer to load it for viewing. This is
 * the whole point of a view-only device: press it to see what the other device
 * has recorded since last time.
 *
 * Still routed through the confirmation dialog rather than applied straight
 * away, because it does overwrite what is on this device — the user is told
 * the snapshot's time and case count before anything changes.
 */
async function pullCloudSnapshot() {
  if (pullInFlight) return;
  pullInFlight = true;
  renderReadOnlyControls(currentLinkState().status);
  try {
    await ensureCloudLinkVerified();
    const preview = await previewCloudSnapshot();
    if (!preview) {
      showToast('雲端還沒有任何快照，請先在另一台裝置備份一次');
      return;
    }
    openRestoreDialog(preview, { isPull: true });
  } catch (error) {
    console.warn('從雲端載入快照失敗', error);
    showToast(error instanceof DriveAuthError
      ? '授權已失效，請重新連結 Google 帳號'
      : '無法取得雲端資料，請確認網路後再試一次');
  } finally {
    pullInFlight = false;
    renderCloudPanel();
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
  // auth-state.js describes what a linked device does, and what it says —
  // "資料變動後會自動備份" — is a promise a view-only device will never keep.
  // Overridden here rather than there so the pure module keeps describing
  // authorization only, with no knowledge of what role the device plays.
  const readOnlyLinked = isReadOnlyDevice() && state.status === LINK_STATES.linked;
  status.textContent = readOnlyLinked ? '已連結（唯讀檢視）' : state.label;
  status.dataset.state = readOnlyLinked ? 'read-only' : state.status;
  detail.textContent = readOnlyLinked
    ? '這台裝置只讀取雲端資料，不會自動備份，也不會覆蓋其他裝置備份的內容'
    : state.detail;
  if (account) {
    account.textContent = state.email || '';
    account.hidden = !state.email;
  }
  if (uploadStatusEl) {
    // Only shown once linked — an unlinked or expired state already says
    // everything that matters, and an upload line would just repeat it. A
    // view-only device says its piece as soon as it is linked at all: the
    // statement does not depend on a verification that may not have run yet.
    const showUpload = state.status === LINK_STATES.linked
      || state.status === LINK_STATES.linkedOffline
      || (isReadOnlyDevice() && state.status === LINK_STATES.linkedUnverified);
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
  renderReadOnlyControls(state.status);
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
  // Opening this dialog is a direct result of the user's own click, so this
  // is a safe place for GIS's silent-renewal popup to fire if it needs to —
  // iOS does not flag popups that follow a user gesture. Not awaited: the
  // dialog is already open and showing an honest unverified/offline state;
  // renderCloudPanel() inside ensureCloudLinkVerified() updates it in place
  // once the real answer comes back.
  ensureCloudLinkVerified().catch(error => console.warn('雲端備份驗證失敗', error));
}

/* Holds the snapshot between "here is what the cloud has" and "apply it",
 * so confirming the restore dialog does not need to fetch a second time. */
let pendingRestore = null;
/* Whether the pending dialog is a view-only device refreshing its copy rather
 * than a one-off restore. The two differ in what they overwrite and therefore
 * in what is worth insuring against — see describeRestoreWarning(). */
let pendingRestoreIsPull = false;

/**
 * Whether local data holds edits made on this view-only device that no upload
 * will ever carry anywhere. Those are the only local changes a view-only pull
 * can actually destroy: everything else on this device came from the cloud and
 * is still sitting in the cloud.
 */
function viewEditsAtRisk() {
  return hasUnsavedViewEdits(readTimestamp(CLOUD_CONFIG.lastChangedAtKey));
}

function describeRestoreWarning(isPull) {
  const hasLocalCases = Object.keys(state.cases).length > 0;
  // The safety export is only real when there is something to export — do not
  // promise a download that applyCloudSnapshot() will skip.
  if (!hasLocalCases) return '目前沒有本機資料會被取代。';
  if (!isPull) {
    return '確認還原將以雲端資料取代本機現有資料，還原前會自動匯出目前的資料作為保險。';
  }
  return viewEditsAtRisk()
    ? '這台裝置是唯讀檢視，你在這裡改過的內容從未上傳，載入後會被雲端資料取代，因此會先自動匯出一份保險。'
    : '載入後會換成雲端最新的那一份。這台裝置不會上傳，雲端與其他裝置的資料都不受影響。';
}

/**
 * Show what the cloud has and ask before replacing local data with it. Shared
 * by both paths that overwrite local data from a snapshot — the one-off
 * restore after linking, and a view-only device refreshing what it displays —
 * so neither can quietly grow a different set of warnings than the other.
 *
 * @param {{payload: object, caseCount: number, snapshotAt: string|null}} preview
 * @param {object} [options]
 * @param {boolean} [options.isPull] True for a view-only refresh
 */
function openRestoreDialog(preview, { isPull = false } = {}) {
  const detail = document.getElementById('restoreDetail');
  const warning = document.getElementById('restoreWarning');
  const dialog = document.getElementById('restoreDialog');
  const title = document.getElementById('restoreDialogTitle');
  const confirmBtn = document.getElementById('confirmRestoreBtn');
  if (!detail || !dialog?.showModal) return;
  pendingRestore = preview.payload;
  pendingRestoreIsPull = isPull;
  if (title) title.textContent = isPull ? '載入雲端最新資料' : '從雲端還原';
  if (confirmBtn) confirmBtn.textContent = isPull ? '載入' : '確認還原';
  detail.textContent = `雲端備份時間：${formatBackupDate(preview.snapshotAt)}，共 ${preview.caseCount} 筆個案`;
  if (warning) warning.textContent = describeRestoreWarning(isPull);
  dialog.showModal();
}

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
  // A view-only device linking for the first time is doing exactly what a pull
  // does — this is the snapshot it exists to display — so it gets the pull's
  // wording and bookkeeping rather than a restore's.
  openRestoreDialog(preview, { isPull: isReadOnlyDevice() });
}

function confirmCloudRestore() {
  const payload = pendingRestore;
  const isPull = pendingRestoreIsPull;
  pendingRestore = null;
  pendingRestoreIsPull = false;
  document.getElementById('restoreDialog')?.close();
  if (!payload) return;
  // A view-only refresh skips the safety export unless there is something on
  // this device the cloud does not have. Refreshing a read-only view is meant
  // to be a routine, repeatable action; a JSON file landing in the downloads
  // folder every time would teach the user to ignore the exports that matter.
  const result = applyCloudSnapshot(payload, { safetyExport: !isPull || viewEditsAtRisk() });
  if (!result.ok) {
    // A bad snapshot must not look like it went through, and must not touch
    // local data — applyCloudSnapshot() already guarantees the latter.
    alert(`無法還原雲端備份：${result.message}`);
    return;
  }
  if (isPull) {
    recordPull();
    renderCloudPanel();
  }
}

function skipCloudRestore() {
  pendingRestore = null;
  pendingRestoreIsPull = false;
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
  // Unreachable on a view-only device — nothing sets the conflict state there
  // — but this dialog's whole purpose is to offer "overwrite the cloud" as one
  // of two buttons, so it declines to open rather than depend on that.
  if (isReadOnlyDevice()) return;
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
  document.getElementById('conflictDialog')?.close();
  if (isReadOnlyDevice()) {
    // Same reasoning as openConflictDialog(): this is the one button in the
    // app whose job is to overwrite the cloud, so it says no out loud rather
    // than trusting that it can never be reached.
    renderCloudPanel();
    showToast('這台裝置是唯讀檢視，不會上傳覆蓋雲端');
    return;
  }
  resolveConflict(true);
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
    // An interactive authorization that just succeeded is the strongest
    // verification there is — stronger than the silent renewal
    // ensureCloudLinkVerified() would otherwise wait for. Without this, the
    // panel would show linked-unverified ("正在確認授權狀態…") right after a
    // successful link, which reads as a regression to the user who just
    // watched the consent screen complete.
    sessionVerified = true;
    // A fresh grant is exactly the situation the backoff was waiting for.
    // Without clearing it, the gesture watcher would stay switched off for the
    // rest of the session and the very link the user just completed would not
    // survive the next hour's token expiry.
    silentRenewalFailed = false;
    const email = await fetchLinkedEmail();
    writeLinkedEmail(email);
    renderCloudPanel();
    showToast(email ? `已連結 ${email}` : '已連結 Google 帳號');
    // The app-start conflict gate never ran for this link (there was nothing
    // to verify a token against before now), so run it retroactively — same
    // reasoning as ensureCloudLinkVerified() calling this after its own
    // successful silent renewal.
    checkForConflictNow().catch(error => console.warn('啟動衝突檢查失敗', error));
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
  // A verification confirmed THIS grant, which no longer exists. Without
  // resetting this, re-linking within the same session would let
  // ensureCloudLinkVerified()'s sessionVerified-already-true short circuit
  // skip real verification (harmless, since linkCloudAccount() sets the flag
  // itself on success) and skip retroactively re-running the app-start
  // conflict gate for the new link (not harmless — that gate would then never
  // run for this session at all).
  sessionVerified = false;
  // Same reasoning: the backoff describes a grant that no longer exists.
  silentRenewalFailed = false;
  renderCloudPanel();
  // The local link is gone either way. Say so plainly when the grant may still
  // exist on Google's side, rather than implying a cleanup that did not happen.
  showToast(revokedWithGoogle
    ? '已解除 Google 帳號連結'
    : '已解除本機連結，如需撤銷授權請至 Google 帳號設定');
}

/**
 * App-start entry point. Deliberately does NOT touch GIS — see
 * sessionVerified's own comment for why calling renewAccessSilently()
 * unconditionally at launch was the wrong default. This only renders whatever
 * the honest-but-unverified state looks like from what is already on disk, so
 * the panel has something sensible to show immediately.
 *
 * Real verification happens lazily, the first time something actually needs a
 * token — see ensureCloudLinkVerified().
 */
function restoreCloudLink() {
  renderCloudPanel();
}

/* Shared in-flight promise so concurrent callers (e.g. the coordinator's own
 * upload attempt and a user opening the cloud dialog at the same moment) wait
 * on the same GIS call instead of each firing their own — GIS's hidden popup
 * happening twice in quick succession is exactly the kind of thing that would
 * make iOS suspicious again. */
let verifyInFlight = null;

/**
 * Confirms whether the recorded link is actually still valid, and renews the
 * access token when it is missing or close to expiring. Called whenever
 * something needs a token for real: the gesture watcher below, opening the
 * cloud dialog, a view-only pull, an interactive link. Never prompts and never
 * blocks assessment work — a failure here only changes the status text.
 *
 * The guard is token state, not sessionVerified alone. Verifying once per
 * session was the original shape and it quietly capped cloud backup at a
 * single hour: once the flag was set, nothing ever renewed again, so the
 * moment Google's one-hour token expired every upload failed with no token
 * and no path to getting one.
 *
 * @returns {Promise<void>}
 */
async function ensureCloudLinkVerified() {
  if (sessionVerified && !needsTokenRenewal()) return;
  if (verifyInFlight) return verifyInFlight;
  verifyInFlight = (async () => {
    const linkedEmail = readLinkedEmail();
    // Unlinked needs no verification — describeLinkState() already resolves
    // to "unlinked" on linkedEmail alone, regardless of isVerified.
    if (!linkedEmail) { sessionVerified = true; renderCloudPanel(); return; }
    // Offline is left unverified on purpose: auth-state.js's resolveStatus()
    // checks isOnline before isVerified, so the panel already shows the
    // honest linkedOffline state without needing sessionVerified set. Leaving
    // it false means the next call to this function — once the device is
    // back online, e.g. from events.js's 'online' listener — actually
    // attempts the real renewal instead of short-circuiting on a flag set
    // while offline and never revisited.
    if (!navigator.onLine) return;
    // Renewed on the wider margin, not on hasValidToken(): a token with eight
    // minutes left is still "valid" for the next request and still guarantees
    // a dead end shortly afterwards.
    if (!hasFreshToken(TOKEN_RENEWAL_MARGIN_MS)) {
      try {
        await renewAccessSilently();
        silentRenewalFailed = false;
      } catch (error) {
        // Drop any token rather than relying on it already being absent, so
        // the panel cannot claim protection the renewal just failed to obtain.
        forgetToken();
        silentRenewalFailed = true;
        console.warn('雲端備份靜默續期失敗，狀態將顯示為需要重新連結', error);
        remindRelinkIfExpired();
      }
    }
    sessionVerified = true;
    renderCloudPanel();
    // The app-start conflict gate (spec's first of two gates) was deferred
    // along with verification itself — it needs a real token to compare
    // against the cloud snapshot, which this call may have just obtained for
    // the first time this session. checkForConflictNow() is a no-op if that
    // gate already ran, so calling it unconditionally here is safe.
    checkForConflictNow().catch(error => console.warn('啟動衝突檢查失敗', error));
  })();
  try {
    await verifyInFlight;
  } finally {
    verifyInFlight = null;
  }
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
/**
 * Keeps a usable access token available for automatic backup, without ever
 * asking the user to think about tokens.
 *
 * GIS obtains a token through a popup, even for a silent `prompt:'none'`
 * renewal that shows nothing — and browsers, iOS Safari most strictly, only
 * allow a popup that follows a real user gesture. That is why renewal cannot
 * simply run on a timer or at launch: doing it at launch is what made every
 * single app open ask "allow pop-ups?" on iPhone.
 *
 * So renewal rides along on the taps the therapist is making anyway. Any
 * pointerdown or keydown will do — opening a case, touching a field, a finger
 * landing to scroll. It does not have to be anything to do with backup, and
 * nothing is shown. Because the token is checked on a ten-minute margin, this
 * happens minutes before any upload actually needs it.
 *
 * Deliberately not a one-shot listener: the token expires every hour and the
 * grant expires every week, so "already handled this session" is exactly the
 * assumption that broke automatic backup in the first place. needsTokenRenewal()
 * answers false almost every time, which is what keeps this cheap.
 */
function watchForTokenRenewalGesture() {
  const renewOnGesture = () => {
    if (!needsTokenRenewal()) return;
    ensureCloudLinkVerified().catch(error => console.warn('雲端備份續期失敗', error));
  };
  document.addEventListener('pointerdown', renewOnGesture, { capture: true, passive: true });
  document.addEventListener('keydown', renewOnGesture, { capture: true });
  // A renewal that failed while the connection was flaky deserves another
  // chance once the device is genuinely back online — otherwise a moment of
  // bad reception would look identical to an expired grant and stay stuck
  // until the user re-linked by hand for no reason.
  window.addEventListener('online', () => { silentRenewalFailed = false; });
}

/* Shown at most once per session. Backup being stopped is worth interrupting
 * for once; it is not worth interrupting for repeatedly, and the header badge
 * keeps saying so afterwards for anyone who dismisses it. */
let relinkPromptShown = false;

/**
 * Tells the user, in a dialog rather than a toast, that cloud backup has
 * stopped and only they can restart it.
 *
 * This project's other cloud reminder is deliberately a toast, on the grounds
 * that nothing may interrupt an assessment in progress. This one is different
 * in kind: a stale-backup nudge is "you may want to check", while an expired
 * grant is a decision only the user can make — no amount of waiting fixes it,
 * and every minute until they do is unbacked work. A red badge in the header
 * is too easy to work past for something that silently stops protecting data.
 *
 * Skipped while any other dialog is open: the cloud panel already says
 * 需要重新連結 in that situation, and stacking a second window over what the
 * user is currently reading helps nobody.
 */
function remindRelinkIfExpired() {
  if (relinkPromptShown) return;
  if (document.querySelector('dialog[open]')) return;
  const dialog = document.getElementById('relinkDialog');
  if (!dialog?.showModal) return;
  const detail = document.getElementById('relinkDetail');
  if (detail) {
    detail.textContent = isReadOnlyDevice()
      ? '雲端授權已到期，目前無法載入其他裝置的最新紀錄。重新連結後即可繼續檢視。'
      : '雲端授權已到期，這台裝置的資料目前沒有在備份。重新連結後會立即補傳未上傳的變動。';
  }
  relinkPromptShown = true;
  dialog.showModal();
}

/** Re-link from the expiry dialog. Runs the same interactive link as the panel. */
function confirmRelink() {
  document.getElementById('relinkDialog')?.close();
  linkCloudAccount().catch(error => console.warn('重新連結失敗', error));
}

function dismissRelink() {
  document.getElementById('relinkDialog')?.close();
}

function initCloudBackup() {
  onStateChanged(warnIfEditingViewOnlyDevice);
  watchForTokenRenewalGesture();
  // renderCloudPanel() also refreshes the summary line (see its own
  // comment), so every upload-state change reaches both panels regardless
  // of which one, if either, is currently open.
  return startCloudBackup(renderCloudPanel);
}

/* Warned once per session. The point is to correct a wrong belief the first
 * time it could form, not to argue with someone who has decided to jot
 * something down on the viewing device anyway. */
let viewEditWarned = false;

/**
 * A view-only device still lets the user type — the forms are the same forms,
 * and locking them would make the app feel broken rather than safe. What must
 * not happen is the user believing an edit made here is protected. It is not:
 * it stays on this device and the next cloud load replaces it.
 */
function warnIfEditingViewOnlyDevice() {
  if (viewEditWarned || !isReadOnlyDevice()) return;
  viewEditWarned = true;
  showToast('這台裝置是唯讀檢視，這項修改只會留在本機，不會上傳到雲端');
}

export {
  renderCloudPanel, openCloudDialog, linkCloudAccount,
  unlinkCloudAccount, restoreCloudLink, ensureCloudLinkVerified, currentLinkState, initCloudBackup,
  confirmCloudRestore, skipCloudRestore,
  openConflictDialog, keepLocalData, useCloudData, deferConflict,
  summarizeCloudStatus, isCloudBackupHealthy, daysSinceLastCloudUpload, renderCloudSummary,
  remindCloudBackupIfStale, setReadOnlyMode, pullCloudSnapshot, shouldSkipManualBackupReminder,
  confirmRelink, dismissRelink
};
