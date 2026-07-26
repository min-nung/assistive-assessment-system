import { CLOUD_CONFIG } from './cloud-config.js';
import { describeLinkState, LINK_STATES } from './auth-state.js';
import {
  requestAccess, renewAccessSilently, revokeAccess, fetchLinkedEmail,
  hasValidToken, forgetToken, DriveAuthError
} from './drive-client.js';
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

function renderCloudPanel() {
  const status = document.getElementById('cloudStatus');
  const detail = document.getElementById('cloudDetail');
  const account = document.getElementById('cloudAccount');
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
  linkBtn.hidden = !state.canLink;
  linkBtn.textContent = state.status === LINK_STATES.needsRelink ? '重新連結' : '連結 Google 帳號';
  unlinkBtn.hidden = !state.canUnlink;
}

function openCloudDialog() {
  renderCloudPanel();
  const dialog = document.getElementById('cloudDialog');
  if (dialog?.showModal) dialog.showModal();
}

async function linkCloudAccount() {
  const linkBtn = document.getElementById('linkCloudBtn');
  if (linkBtn) linkBtn.disabled = true;
  try {
    await requestAccess();
    const email = await fetchLinkedEmail();
    writeLinkedEmail(email);
    renderCloudPanel();
    showToast(email ? `已連結 ${email}` : '已連結 Google 帳號');
  } catch (error) {
    // Failing to link must leave no impression that backup is active.
    forgetToken();
    renderCloudPanel();
    const message = error instanceof DriveAuthError ? error.message : '連結失敗，請再試一次';
    showToast(message);
    console.warn('連結 Google 帳號失敗', error);
  } finally {
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

export {
  renderCloudPanel, openCloudDialog, linkCloudAccount,
  unlinkCloudAccount, restoreCloudLink, currentLinkState
};
