/* Cloud backup decision.
 *
 * Answers one question: given the current situation, what should happen next?
 *
 * Pure function — no network, no DOM, no localStorage, and it never reads the
 * current time; callers pass every timestamp in. Every judgement that could
 * silently lose case data is concentrated here, which is why this is the only
 * module of the cloud backup feature with automated test coverage.
 */

/** How long to stay quiet after the last change. Callers restart the clock on each new change. */
const SYNC_DEBOUNCE_MS = 5000;

/** The possible decisions: what should happen next. */
const SYNC_ACTIONS = Object.freeze({
  idle: 'idle',
  upload: 'upload',
  wait: 'wait',
  conflict: 'conflict',
  needsAuth: 'needs-auth',
  offline: 'offline',
  readOnly: 'read-only'
});

/** Why the question is being asked right now. */
const SYNC_TRIGGERS = Object.freeze({
  interval: 'interval',
  pageHidden: 'page-hidden',
  appStart: 'app-start'
});

function decision(action, reason, extra = {}) {
  return Object.freeze({ action, reason, ...extra });
}

/* Timestamps are untrusted input. Absent and unreadable must stay distinct:
 * absent is a normal state (nothing has ever been uploaded), while unreadable
 * means the record is corrupt — we cannot tell which side is newer, so
 * uploading would risk overwriting a newer snapshot. */
const UNREADABLE_TIME = Symbol('unreadable timestamp');

function toTime(timestamp) {
  if (timestamp === null || timestamp === undefined || timestamp === '') return null;
  const time = new Date(timestamp).getTime();
  return Number.isNaN(time) ? UNREADABLE_TIME : time;
}

function isUnreadable(...times) {
  return times.includes(UNREADABLE_TIME);
}

/** Is the cloud newer than our last successful upload? If so, another device wrote to it. */
function isCloudNewer(cloudTime, uploadedTime) {
  if (cloudTime === null) return false;
  if (uploadedTime === null) return true;
  return cloudTime > uploadedTime;
}

/** Does the local device hold changes that have not been uploaded yet? */
function hasPendingChanges(changedTime, uploadedTime, hasLocalCases) {
  if (changedTime === null) return uploadedTime === null && Boolean(hasLocalCases);
  if (uploadedTime === null) return true;
  return changedTime > uploadedTime;
}

/**
 * Decide what cloud backup should do next, given the current situation.
 *
 * @param {object} situation Plain data describing the current state
 * @param {boolean} situation.isLinked Whether a Google account is linked
 * @param {boolean} situation.isOnline Whether the device is online
 * @param {string|null} situation.localChangedAt When local data last changed
 * @param {string|null} situation.lastUploadedAt When we last uploaded successfully
 * @param {string|null} situation.cloudSnapshotAt Cloud snapshot time; null when absent
 * @param {number} situation.msSinceLastChange Milliseconds since the last change
 * @param {boolean} situation.hasUnresolvedConflict Whether a conflict awaits the user
 * @param {boolean} situation.hasLocalCases Whether any local case data exists
 * @param {boolean} [situation.isReadOnly] Whether this device is view-only.
 *   Defaults to false so every existing caller keeps its current behavior.
 * @param {string} situation.trigger Why we are asking; see SYNC_TRIGGERS
 * @returns {{action: string, reason: string, retryInMs?: number}} A frozen decision
 */
function decideSync(situation = {}) {
  const {
    isLinked = false,
    isOnline = false,
    localChangedAt = null,
    lastUploadedAt = null,
    cloudSnapshotAt = null,
    msSinceLastChange = 0,
    hasUnresolvedConflict = false,
    hasLocalCases = false,
    isReadOnly = false,
    trigger = SYNC_TRIGGERS.interval
  } = situation;

  // Nothing else is actionable while unlinked, and no other state should mask it.
  if (!isLinked) {
    return decision(SYNC_ACTIONS.needsAuth, '尚未連結 Google 帳號，資料只保存在本機');
  }

  // A view-only device outranks every remaining state, including conflict: a
  // conflict only exists as a question because this device might overwrite the
  // cloud, and this one never will. Placed above everything that could reach
  // the upload branches so "read-only means never upload" is a property of the
  // decision itself rather than something each caller has to remember.
  if (isReadOnly) {
    return decision(SYNC_ACTIONS.readOnly, '此裝置為唯讀檢視，只讀取雲端資料，不會上傳覆蓋');
  }

  // An unresolved conflict outranks being offline so the state stays visible
  // rather than being masked by connectivity. Never upload before the user has
  // chosen, or their hesitation would cost them data.
  if (hasUnresolvedConflict) {
    return decision(SYNC_ACTIONS.conflict, '尚有未解決的衝突，暫停自動上傳');
  }

  if (!isOnline) {
    return decision(SYNC_ACTIONS.offline, '離線，待恢復連線後上傳');
  }

  const changedTime = toTime(localChangedAt);
  const uploadedTime = toTime(lastUploadedAt);
  const cloudTime = toTime(cloudSnapshotAt);

  // Corrupt timestamps make recency unknowable, so let the user decide.
  if (isUnreadable(changedTime, uploadedTime, cloudTime)) {
    return decision(SYNC_ACTIONS.conflict, '備份時間紀錄無法判讀，請確認要保留哪一份');
  }

  // Conflict detection precedes debounce: if the cloud is newer, ask immediately.
  if (isCloudNewer(cloudTime, uploadedTime)) {
    return decision(SYNC_ACTIONS.conflict, '雲端快照比本機更新，請選擇要保留哪一份');
  }

  if (!hasPendingChanges(changedTime, uploadedTime, hasLocalCases)) {
    return decision(SYNC_ACTIONS.idle, '本機資料與雲端一致');
  }

  // Leaving the page skips debounce, covering the "edit then close instantly" gap.
  if (trigger === SYNC_TRIGGERS.pageHidden) {
    return decision(SYNC_ACTIONS.upload, '使用者離開頁面，立即送出未上傳的變動');
  }

  // Changes found at startup came from a previous session; nobody is mid-keystroke.
  if (trigger === SYNC_TRIGGERS.appStart) {
    return decision(SYNC_ACTIONS.upload, '啟動時發現上次未上傳的變動');
  }

  // Every other trigger, including unrecognised ones, goes through debounce.
  // When in doubt, wait rather than upload.
  const waited = Number.isFinite(msSinceLastChange) ? Math.max(msSinceLastChange, 0) : 0;
  if (waited < SYNC_DEBOUNCE_MS) {
    return decision(SYNC_ACTIONS.wait, '使用者仍在操作，稍後再上傳', {
      retryInMs: SYNC_DEBOUNCE_MS - waited
    });
  }

  return decision(SYNC_ACTIONS.upload, '本機有尚未上傳的變動');
}

export { decideSync, SYNC_ACTIONS, SYNC_TRIGGERS, SYNC_DEBOUNCE_MS };
