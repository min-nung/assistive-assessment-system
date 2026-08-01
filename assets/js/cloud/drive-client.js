import { CLOUD_CONFIG } from './cloud-config.js';

/* Google Identity Services and Drive API calls.
 *
 * Deliberately thin: this module only does what it is told. It holds no
 * judgement about whether an upload should happen — that belongs to
 * sync-decision.js. Nothing here writes to localStorage or touches the DOM.
 *
 * Google Identity Services is fetched on demand rather than from a script tag
 * in index.html. Assessment work must never depend on a third-party script
 * being reachable, so going offline must not even attempt the request.
 */
const AUTH_ERRORS = Object.freeze({
  offline: 'offline',
  scriptBlocked: 'script-blocked',
  denied: 'denied',
  noToken: 'no-token'
});

class DriveAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DriveAuthError';
    this.code = code;
  }
}

/* The access token lives in memory only. Persisting it would mean a stale
 * credential survives in localStorage where it cannot be revoked; on the next
 * visit we ask GIS for a fresh one instead. */
let accessToken = null;
let tokenExpiresAt = 0;
let gisLoading = null;

/* Never report a token as usable this close to expiry, so an upload does not
 * start with a credential that dies mid-request. */
const TOKEN_EXPIRY_GUARD_MS = 60000;

/**
 * Whether a token exists and still has `marginMs` of life left.
 *
 * Callers renewing ahead of time pass a larger margin than callers about to
 * make a single request: Google's access tokens last an hour, and an
 * assessment session easily outlives one, so waiting for actual expiry would
 * mean every long session hits a window where uploads simply fail. The guard
 * below is a floor, never a ceiling — no caller may declare a token usable
 * later than hasValidToken() would.
 *
 * @param {number} [marginMs] How much remaining life to require
 * @returns {boolean}
 */
function hasFreshToken(marginMs = TOKEN_EXPIRY_GUARD_MS) {
  const margin = Math.max(Number(marginMs) || 0, TOKEN_EXPIRY_GUARD_MS);
  return Boolean(accessToken) && Date.now() < tokenExpiresAt - margin;
}

function hasValidToken() {
  return hasFreshToken(TOKEN_EXPIRY_GUARD_MS);
}

function getAccessToken() {
  return hasValidToken() ? accessToken : null;
}

function forgetToken() {
  accessToken = null;
  tokenExpiresAt = 0;
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const settle = script => {
      script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); });
      script.addEventListener('error', () => reject(new Error('script load failed')));
    };
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      // A script that already finished loading will never fire 'load' again, so
      // waiting on the event would hang. The flag records that it is done.
      if (existing.dataset.loaded === 'true') { resolve(); return; }
      settle(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    settle(script);
    document.head.appendChild(script);
  });
}

/** Load Google Identity Services, but never while offline. */
async function ensureGisLoaded() {
  if (window.google?.accounts?.oauth2) return;
  if (!navigator.onLine) {
    throw new DriveAuthError(AUTH_ERRORS.offline, '目前離線，無法連結 Google 帳號');
  }
  // Share one in-flight load so concurrent callers do not inject twice.
  if (!gisLoading) {
    gisLoading = injectScript(CLOUD_CONFIG.gisUrl).finally(() => { gisLoading = null; });
  }
  try {
    await gisLoading;
  } catch {
    throw new DriveAuthError(AUTH_ERRORS.scriptBlocked, '無法載入 Google 授權元件，請確認網路或瀏覽器擴充功能');
  }
  if (!window.google?.accounts?.oauth2) {
    throw new DriveAuthError(AUTH_ERRORS.scriptBlocked, 'Google 授權元件載入後仍無法使用');
  }
}

function getTokenClient(onToken) {
  // GIS binds the callback at construction time, so a fresh client per request
  // is what keeps each request talking to its own caller. Deliberately not
  // cached: a reused client would answer an earlier caller's promise.
  return window.google.accounts.oauth2.initTokenClient({
    client_id: CLOUD_CONFIG.clientId,
    scope: CLOUD_CONFIG.scope,
    callback: onToken
  });
}

/* GIS reports back through a callback, and it stays silent in cases we cannot
 * detect otherwise — the user dismisses the popup, or an extension blocks it.
 * Without a deadline the returned promise would never settle and the caller
 * would wait forever, leaving the panel stuck mid-action. */
const TOKEN_TIMEOUT_MS = 120000;

function requestToken({ silent }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = fn => (...args) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(...args);
    };
    const succeed = finish(resolve);
    const fail = finish(reject);

    const timer = setTimeout(() => {
      fail(new DriveAuthError(
        silent ? AUTH_ERRORS.noToken : AUTH_ERRORS.denied,
        silent ? '靜默續期沒有回應' : '授權未完成，請再試一次'
      ));
    }, TOKEN_TIMEOUT_MS);

    const client = getTokenClient(response => {
      if (response.error || !response.access_token) {
        fail(new DriveAuthError(
          silent ? AUTH_ERRORS.noToken : AUTH_ERRORS.denied,
          response.error_description || '未取得授權'
        ));
        return;
      }
      accessToken = response.access_token;
      // expires_in is seconds; GIS omits it occasionally, so fall back to an
      // hour, which is Google's standard access-token lifetime.
      const lifetimeMs = (Number(response.expires_in) || 3600) * 1000;
      tokenExpiresAt = Date.now() + lifetimeMs;
      succeed(accessToken);
    });

    try {
      // 'none' asks Google to reuse an existing grant with no UI at all, which
      // is what silent renewal needs. An empty prompt lets Google decide, and
      // it skips the consent screen when the user has already approved.
      client.requestAccessToken({ prompt: silent ? 'none' : '' });
    } catch (error) {
      fail(new DriveAuthError(AUTH_ERRORS.denied, error.message || '無法開啟授權畫面'));
    }
  });
}

/** Interactive link. Shows Google's consent screen. */
async function requestAccess() {
  await ensureGisLoaded();
  return requestToken({ silent: false });
}

/**
 * Silent renewal for app start. Fails quietly by design — an expired
 * authorization must not interrupt an assessment in progress.
 */
async function renewAccessSilently() {
  await ensureGisLoaded();
  return requestToken({ silent: true });
}

async function driveFetch(url, options = {}) {
  const token = getAccessToken();
  if (!token) throw new DriveAuthError(AUTH_ERRORS.noToken, '沒有有效的授權');
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` }
  });
  if (response.status === 401 || response.status === 403) {
    forgetToken();
    throw new DriveAuthError(AUTH_ERRORS.noToken, '授權已失效');
  }
  if (!response.ok) throw new Error(`Drive API ${response.status}`);
  return response;
}

/** The signed-in account, used only to show which account is linked. */
async function fetchLinkedEmail() {
  const response = await driveFetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
  const data = await response.json();
  return data.user?.emailAddress || null;
}

/* Drive keeps exactly one snapshot file. It is found by name rather than by a
 * remembered file ID, because the ID would need its own persistence and its
 * own recovery path for exactly the case that matters most here — the
 * browser's storage was cleared and the app has nothing memorized. Name
 * lookup needs no such fallback: it already is the fallback. */
const SNAPSHOT_FILENAME = '輔具評估系統雲端快照.json';
const SNAPSHOT_MIME_TYPE = 'application/json';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * Find the snapshot file, trusting Drive's search rather than a cached ID.
 * @returns {Promise<{id: string, modifiedTime: string}|null>} null when no
 *   snapshot exists yet — a normal state for a first-time upload.
 */
async function findSnapshotFile() {
  const query = encodeURIComponent(`name='${SNAPSHOT_FILENAME}' and trashed=false`);
  const response = await driveFetch(
    `${DRIVE_FILES_URL}?q=${query}&spaces=drive&fields=files(id,modifiedTime)&pageSize=1`
  );
  const data = await response.json();
  return data.files?.[0] || null;
}

/** The snapshot's last-modified time, or null when none exists. */
async function fetchSnapshotModifiedTime() {
  const file = await findSnapshotFile();
  return file?.modifiedTime || null;
}

async function fetchSnapshot() {
  const file = await findSnapshotFile();
  if (!file) return null;
  const response = await driveFetch(`${DRIVE_FILES_URL}/${file.id}?alt=media`);
  return response.json();
}

/**
 * Create or update the single snapshot file. Multipart upload lets metadata
 * (the filename) and content ride in one request; a plain media upload cannot
 * set the name Drive shows the user.
 */
async function uploadSnapshot(payload) {
  const existing = await findSnapshotFile();
  const boundary = `snapshot-${Date.now()}`;
  const metadata = existing ? {} : { name: SNAPSHOT_FILENAME };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${SNAPSHOT_MIME_TYPE}\r\n\r\n${JSON.stringify(payload)}\r\n` +
    `--${boundary}--`;

  const url = existing
    ? `${DRIVE_UPLOAD_URL}/${existing.id}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
  const response = await driveFetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  const file = await response.json();
  return { id: file.id, modifiedTime: file.modifiedTime };
}

/**
 * Drop the local authorization. Deliberately does not delete the snapshot on
 * Drive — an accidental tap must not destroy the user's backup.
 *
 * Synchronous on purpose: clearing the local token is the part that decides
 * what the user is told, and it happens immediately. Telling Google is best
 * effort, because the local state is already unlinked either way.
 *
 * @returns {boolean} Whether the revocation request reached Google. False
 *   means only the local token was dropped — the grant may still exist in the
 *   user's Google account, where they can remove it manually.
 */
function revokeAccess() {
  const token = accessToken;
  forgetToken();
  if (!token || !navigator.onLine) return false;
  const revoke = window.google?.accounts?.oauth2?.revoke;
  // GIS may never have been loaded this session, in which case there is nothing
  // to call and the grant simply stays on Google's side.
  if (typeof revoke !== 'function') return false;
  try {
    revoke(token, () => {});
    return true;
  } catch (error) {
    console.warn('撤銷 Google 授權失敗', error);
    return false;
  }
}

export {
  requestAccess, renewAccessSilently, revokeAccess, fetchLinkedEmail,
  getAccessToken, hasValidToken, hasFreshToken, forgetToken, driveFetch,
  fetchSnapshotModifiedTime, fetchSnapshot, uploadSnapshot,
  DriveAuthError, AUTH_ERRORS, SNAPSHOT_FILENAME
};
