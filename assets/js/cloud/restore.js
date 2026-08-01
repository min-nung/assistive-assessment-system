import { state, migrateCases, persistCases, readDeletedCases } from '../core/state.js';
import { validateBackupPayload } from '../backup/schema.js';
import { exportBackup } from '../backup/backup.js';
import { fetchSnapshot } from './drive-client.js';
import { renderList } from '../views/case-list.js';
import { showToast } from '../ui.js';

/* Restore from cloud.
 *
 * A cloud snapshot is untrusted input, exactly like a JSON file the user
 * picked to import — it goes through validateBackupPayload() and
 * migrateCases(), the same functions backup.js uses for a manual import.
 * Restoring is a one-way overwrite of local data, so this module never
 * applies a snapshot without an explicit confirmation, and always exports the
 * current local data to a JSON file first, in case the wrong choice gets made.
 */

/**
 * Fetch the cloud snapshot and describe it for the confirmation prompt,
 * without touching local state. Throws DriveAuthError or a plain Error on
 * network failure — callers decide how to surface that.
 *
 * @returns {Promise<{payload: object, caseCount: number, snapshotAt: string|null}|null>}
 *   null when Drive has no snapshot yet.
 */
async function previewCloudSnapshot() {
  const payload = await fetchSnapshot();
  if (!payload) return null;
  return {
    payload,
    caseCount: Object.keys(payload.cases || {}).length,
    snapshotAt: payload.exportedAt || null
  };
}

/**
 * Validate, migrate, and apply a cloud snapshot fetched by
 * previewCloudSnapshot(). Kept separate from the fetch so the caller can show
 * a confirmation dialog between "here is what the cloud has" and "actually
 * overwrite local data with it" without re-fetching.
 *
 * @param {object} rawPayload The payload from previewCloudSnapshot()
 * @param {object} [options]
 * @param {boolean} [options.safetyExport] Whether to export local data to a
 *   JSON file first. Defaults to true, so every path that has not thought
 *   about it keeps the insurance. A view-only device refreshing its copy of
 *   the cloud passes false when local data holds nothing the cloud does not:
 *   there is nothing to insure, and downloading a file on every refresh would
 *   train the user to ignore the one export that actually mattered.
 * @returns {{ok: true, count: number}|{ok: false, message: string}} Never
 *   throws — a validation failure is reported, not raised, so a caller cannot
 *   forget to catch it and accidentally let a bad snapshot half-apply.
 */
function applyCloudSnapshot(rawPayload, { safetyExport = true } = {}) {
  let nextCases;
  let nextDeleted;
  try {
    const validated = validateBackupPayload(rawPayload);
    nextCases = validated.cases;
    migrateCases(nextCases);
    nextDeleted = readDeletedCases(validated.deletedCases);
    migrateCases(nextDeleted);
  } catch (error) {
    console.warn('雲端快照驗證失敗', error);
    return Object.freeze({ ok: false, message: error.message || '格式不正確' });
  }

  // The safety export happens only after validation succeeds, so a snapshot
  // that fails validation never touches local data or triggers a needless
  // export — the restore did not happen, so there is nothing to insure against.
  if (safetyExport) exportBackup();

  if (!persistCases(nextCases, nextDeleted)) {
    return Object.freeze({ ok: false, message: '無法寫入瀏覽器儲存空間' });
  }
  state.cases = nextCases;
  state.deletedCases = nextDeleted;
  state.currentCaseId = null;
  renderList();
  const count = Object.keys(nextCases).length;
  showToast(`已從雲端還原 ${count} 筆個案資料`);
  return Object.freeze({ ok: true, count });
}

export { previewCloudSnapshot, applyCloudSnapshot };
