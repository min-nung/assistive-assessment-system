import { CLOUD_CONFIG } from './cloud-config.js';
import { decideSync, SYNC_ACTIONS, SYNC_TRIGGERS, SYNC_DEBOUNCE_MS } from './sync-decision.js';
import {
  hasValidToken, fetchSnapshotModifiedTime, fetchSnapshot, uploadSnapshot, DriveAuthError
} from './drive-client.js';
import { state, onStateChanged } from '../core/state.js';

/* Cloud backup coordinator.
 *
 * Ties the pure decision (sync-decision.js) to the thin execution layer
 * (drive-client.js): listens for local changes, tracks the debounce timer,
 * watches visibilitychange/online/offline, asks decideSync what to do, and
 * carries it out. Holds no judgement of its own about when to upload — that
 * question belongs entirely to sync-decision.js.
 */
const UPLOAD_STATES = Object.freeze({
  idle: 'idle',
  waiting: 'waiting',
  uploading: 'uploading',
  uploaded: 'uploaded',
  offline: 'offline',
  conflict: 'conflict',
  needsAuth: 'needs-auth',
  failed: 'failed'
});

const MAX_RETRIES = 5;
const RETRY_BASE_MS = 2000;

/* In-memory only. A page reload always re-derives this from scratch — the
 * decision inputs (isLinked, hasUnresolvedConflict, retry count) are all
 * either persisted separately or safe to reset to their starting values. */
let uploadState = UPLOAD_STATES.idle;
let lastError = null;
let cloudSnapshotAt = null;
let hasUnresolvedConflict = false;
let debounceTimer = null;
let retryTimer = null;
let retryCount = 0;
let uploadInFlight = null;
let onUploadStateChanged = () => {};

function setUploadState(next, error = null) {
  uploadState = next;
  lastError = error;
  onUploadStateChanged();
}

function readTimestamp(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeTimestamp(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch (error) {
    console.warn('無法保存雲端備份時間戳', error);
  }
}

function readLinkedEmail() {
  return readTimestamp(CLOUD_CONFIG.linkedEmailKey);
}

/**
 * The situation decideSync needs, assembled from local state. cloudSnapshotAt
 * only reflects what the last Drive check found — refreshed right before an
 * upload attempt and at startup, not on every keystroke, so debounce ticks do
 * not each cost a network round trip.
 */
function currentSituation(trigger) {
  const changedAt = readTimestamp(CLOUD_CONFIG.lastChangedAtKey);
  const changedTime = changedAt ? new Date(changedAt).getTime() : null;
  return {
    isLinked: Boolean(readLinkedEmail()),
    isOnline: navigator.onLine,
    localChangedAt: changedAt,
    lastUploadedAt: readTimestamp(CLOUD_CONFIG.lastUploadedAtKey),
    cloudSnapshotAt,
    msSinceLastChange: changedTime === null ? 0 : Date.now() - changedTime,
    hasUnresolvedConflict,
    hasLocalCases: Object.keys(state.cases).length > 0,
    trigger
  };
}

function clearDebounce() {
  clearTimeout(debounceTimer);
  debounceTimer = null;
}

function clearRetry() {
  clearTimeout(retryTimer);
  retryTimer = null;
}

function snapshotPayload() {
  return {
    app: '輔具評估系統',
    version: 1,
    exportedAt: new Date().toISOString(),
    cases: state.cases
  };
}

/**
 * Run one upload attempt, refreshing the conflict check first per the spec's
 * two-gate rule (checked at app start and again before every upload).
 *
 * @param {string} trigger Why this attempt was scheduled. Passed through to
 *   decideSync so a page-hidden flush is re-evaluated as page-hidden, not
 *   silently downgraded to a debounce-gated interval check.
 * @param {object} [options]
 * @param {boolean} [options.forceUpload] Skip decideSync's own conflict/wait
 *   gate. Used only by resolveConflict(true): the user has already been asked
 *   and chose to overwrite the cloud, so re-detecting the same mismatch here
 *   would undo their decision instead of carrying it out.
 */
async function attemptUpload(trigger = SYNC_TRIGGERS.interval, { forceUpload = false } = {}) {
  setUploadState(UPLOAD_STATES.uploading);
  try {
    cloudSnapshotAt = await fetchSnapshotModifiedTime();

    if (!forceUpload) {
      const decision = decideSync(currentSituation(trigger));
      if (decision.action !== SYNC_ACTIONS.upload) {
        // Another check (conflict, needs-auth, offline, idle) beat us to it
        // since the attempt was scheduled; nothing to do.
        setUploadState(mapDecisionState(decision.action));
        return;
      }
    }

    const file = await uploadSnapshot(snapshotPayload());
    cloudSnapshotAt = file.modifiedTime;
    const uploadedAt = new Date().toISOString();
    writeTimestamp(CLOUD_CONFIG.lastUploadedAtKey, uploadedAt);
    retryCount = 0;
    setUploadState(UPLOAD_STATES.uploaded);
  } catch (error) {
    handleUploadFailure(error);
  }
}

/**
 * Transient failures retry with capped exponential backoff; once the cap is
 * hit the state goes to a plain, honest "failed" — never silently succeeded,
 * and never retried forever. An auth failure does not consume a retry: it
 * needs the user to relink, not a delay.
 */
function handleUploadFailure(error) {
  if (error instanceof DriveAuthError) {
    setUploadState(UPLOAD_STATES.needsAuth, error);
    return;
  }
  retryCount += 1;
  if (retryCount > MAX_RETRIES) {
    setUploadState(UPLOAD_STATES.failed, error);
    console.warn('雲端備份上傳持續失敗，已達重試上限', error);
    return;
  }
  const delay = RETRY_BASE_MS * 2 ** (retryCount - 1);
  setUploadState(UPLOAD_STATES.failed, error);
  clearRetry();
  retryTimer = setTimeout(() => { scheduleAttempt(); }, delay);
}

function scheduleAttempt(trigger = SYNC_TRIGGERS.interval, options) {
  if (uploadInFlight) return;
  uploadInFlight = attemptUpload(trigger, options).finally(() => { uploadInFlight = null; });
}

/** Debounced entry point, called whenever local data changes. */
function onLocalChange() {
  writeTimestamp(CLOUD_CONFIG.lastChangedAtKey, new Date().toISOString());
  clearDebounce();
  clearRetry();
  retryCount = 0;

  const decision = decideSync(currentSituation(SYNC_TRIGGERS.interval));
  if (decision.action === SYNC_ACTIONS.upload) {
    scheduleAttempt();
    return;
  }
  setUploadState(mapDecisionState(decision.action));
  if (decision.action === SYNC_ACTIONS.wait) {
    debounceTimer = setTimeout(() => {
      const next = decideSync(currentSituation(SYNC_TRIGGERS.interval));
      if (next.action === SYNC_ACTIONS.upload) scheduleAttempt();
    }, decision.retryInMs ?? SYNC_DEBOUNCE_MS);
  }
}

function mapDecisionState(action) {
  if (action === SYNC_ACTIONS.wait) return UPLOAD_STATES.waiting;
  if (action === SYNC_ACTIONS.conflict) { hasUnresolvedConflict = true; return UPLOAD_STATES.conflict; }
  if (action === SYNC_ACTIONS.offline) return UPLOAD_STATES.offline;
  if (action === SYNC_ACTIONS.needsAuth) return UPLOAD_STATES.needsAuth;
  return UPLOAD_STATES.idle;
}

/** Forced immediate send, skipping debounce. Used when the page is hidden. */
function flushPendingChanges() {
  clearDebounce();
  const decision = decideSync(currentSituation(SYNC_TRIGGERS.pageHidden));
  if (decision.action === SYNC_ACTIONS.upload) scheduleAttempt(SYNC_TRIGGERS.pageHidden);
}

/** Checked once at startup, per the spec's two-gate conflict rule. */
async function checkForConflictAtStart() {
  if (!readLinkedEmail() || !hasValidToken()) return;
  try {
    cloudSnapshotAt = await fetchSnapshotModifiedTime();
  } catch (error) {
    console.warn('啟動時檢查雲端快照失敗', error);
    return;
  }
  const decision = decideSync(currentSituation(SYNC_TRIGGERS.appStart));
  if (decision.action === SYNC_ACTIONS.conflict) {
    hasUnresolvedConflict = true;
    setUploadState(UPLOAD_STATES.conflict);
  } else if (decision.action === SYNC_ACTIONS.upload) {
    scheduleAttempt();
  }
}

/**
 * Starts listening for changes and connectivity/visibility transitions.
 *
 * @returns {Promise<void>} Resolves once the startup conflict check has
 *   settled. Nothing in this module awaits it internally — the check must
 *   never delay showing the case list — but a caller deciding whether cloud
 *   backup currently looks healthy (e.g. before showing the manual-export
 *   reminder) needs the real answer, not whatever uploadState happened to be
 *   before this async check finished.
 */
function startCloudBackup(onChange) {
  onUploadStateChanged = onChange || (() => {});
  onStateChanged(onLocalChange);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingChanges();
  });
  window.addEventListener('online', () => {
    clearRetry();
    retryCount = 0;
    const decision = decideSync(currentSituation(SYNC_TRIGGERS.interval));
    if (decision.action === SYNC_ACTIONS.upload) scheduleAttempt();
    else setUploadState(mapDecisionState(decision.action));
  });
  window.addEventListener('offline', () => setUploadState(UPLOAD_STATES.offline));
  return checkForConflictAtStart();
}

/**
 * Used by conflict resolution once the user has picked a side. Call only
 * after the caller's own action (an upload, or applying the cloud snapshot to
 * local data) has actually happened — this function does not perform either
 * one itself, only records that the mismatch is settled.
 *
 * Clearing the flag alone is not enough: decideSync detects conflict by
 * comparing cloudSnapshotAt against lastUploadedAt, and neither of those facts
 * changes just because the user made a choice. Without also reconciling
 * lastUploadedAt, the very next change re-runs the same comparison and
 * re-enters conflict — this bit the keepLocal:true path once already (fixed
 * with forceUpload) and would otherwise bite keepLocal:false the same way:
 * applying the cloud snapshot to local data never touches lastUploadedAt on
 * its own, so a stale value left in place looks identical to a real conflict
 * to the very next decideSync check.
 *
 * `keepLocal: true` means local data should overwrite the cloud on the next
 * attempt regardless of the timestamp mismatch that caused the conflict.
 * `keepLocal: false` means the caller already replaced local data with the
 * cloud copy — local and cloud now agree, so lastUploadedAt is set to the
 * cloud snapshot's own timestamp rather than left pointing at a moment before
 * the resolution happened.
 *
 * @param {boolean} keepLocal Whether the user chose to keep local data
 */
function resolveConflict(keepLocal) {
  hasUnresolvedConflict = false;
  if (keepLocal) {
    scheduleAttempt(SYNC_TRIGGERS.pageHidden, { forceUpload: true });
  } else if (cloudSnapshotAt) {
    writeTimestamp(CLOUD_CONFIG.lastUploadedAtKey, cloudSnapshotAt);
  }
}

function currentUploadStatus() {
  return Object.freeze({
    state: uploadState,
    error: lastError,
    lastUploadedAt: readTimestamp(CLOUD_CONFIG.lastUploadedAtKey),
    hasUnresolvedConflict
  });
}

/**
 * When local data actually last changed, not when it was last uploaded. This
 * is what a therapist means by "my data" when comparing devices — the tablet
 * edit from this morning, whether or not it ever made it to Drive — so the
 * conflict prompt compares real edit history rather than upload bookkeeping.
 */
function latestLocalChangeAt() {
  const times = Object.values(state.cases)
    .map(c => c.updatedAt)
    .filter(t => typeof t === 'number' && Number.isFinite(t));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

/**
 * Fetches the cloud snapshot's own case count for the conflict prompt — the
 * modifiedTime tracked elsewhere in this module says when Drive last wrote
 * the file, not how many cases are in it.
 *
 * Unlike cloudSnapshotAt, which this module refreshes only at startup and
 * right before an upload attempt to keep debounce ticks free of network
 * calls, this fetches on every call. Nothing here runs on a timer — it only
 * runs when a human opens the conflict dialog — so there is no equivalent
 * debounce-tick cost to avoid, and showing the most current cloud state right
 * before the user picks a side is worth the round trip.
 *
 * @returns {Promise<{localChangedAt: string|null, localCaseCount: number,
 *   cloudSnapshotAt: string|null, cloudCaseCount: number}|null>} null if
 *   there is no unresolved conflict, or the cloud fetch fails.
 */
async function describeConflict() {
  if (!hasUnresolvedConflict) return null;
  let cloudPayload;
  try {
    cloudPayload = await fetchSnapshot();
  } catch (error) {
    console.warn('無法取得雲端快照內容以顯示衝突詳情', error);
    return null;
  }
  return Object.freeze({
    localChangedAt: latestLocalChangeAt(),
    localCaseCount: Object.keys(state.cases).length,
    cloudSnapshotAt: cloudPayload?.exportedAt || cloudSnapshotAt,
    cloudCaseCount: cloudPayload ? Object.keys(cloudPayload.cases || {}).length : 0
  });
}

export {
  startCloudBackup, resolveConflict, currentUploadStatus, describeConflict, UPLOAD_STATES
};
