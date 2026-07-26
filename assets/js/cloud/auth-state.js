/* Link state description.
 *
 * Maps the raw authorization facts onto what the user is told. Pure function —
 * no network, no DOM, no localStorage; callers pass the facts in.
 *
 * This is separated out and tested because of the third principle in the spec:
 * backup status must be honestly visible. The worst failure mode is a user who
 * believes their data is protected, stops exporting JSON by hand, and ends up
 * with no backup at all. Only one state may claim protection.
 */
const LINK_STATES = Object.freeze({
  unlinked: 'unlinked',
  linked: 'linked',
  linkedOffline: 'linked-offline',
  linkedUnverified: 'linked-unverified',
  needsRelink: 'needs-relink'
});

const DESCRIPTIONS = Object.freeze({
  [LINK_STATES.unlinked]: Object.freeze({
    label: '未連結',
    detail: '評估資料目前只保存在這台裝置上',
    isProtected: false,
    canLink: true,
    canUnlink: false
  }),
  [LINK_STATES.linked]: Object.freeze({
    label: '已連結',
    detail: '資料變動後會自動備份到你的 Google Drive',
    isProtected: true,
    canLink: false,
    canUnlink: true
  }),
  [LINK_STATES.linkedOffline]: Object.freeze({
    label: '已連結（離線）',
    detail: '目前離線，恢復連線後會自動補傳',
    isProtected: false,
    canLink: false,
    canUnlink: true
  }),
  [LINK_STATES.linkedUnverified]: Object.freeze({
    label: '已連結',
    detail: '正在確認授權狀態…',
    isProtected: false,
    canLink: false,
    canUnlink: true
  }),
  [LINK_STATES.needsRelink]: Object.freeze({
    label: '需要重新連結',
    detail: '授權已過期，備份已停止。請重新連結以恢復備份',
    isProtected: false,
    canLink: true,
    canUnlink: true
  })
});

function resolveStatus(linkedEmail, hasValidToken, isOnline, isVerified) {
  // No account on record means unlinked, whatever the token looks like.
  if (!linkedEmail) return LINK_STATES.unlinked;
  // Offline is checked before verification: it is its own honest, certain
  // answer ("cannot verify or sync right now") independent of whether a
  // silent renewal was ever attempted, so it must not be shadowed by
  // "unverified" — a device can sit offline for a long time, and the caller
  // deferring verification should not leave the panel stuck reading
  // "confirming…" the whole time it does.
  if (!isOnline) return LINK_STATES.linkedOffline;
  // hasValidToken has not been checked yet this session — GIS silent renewal
  // was deliberately deferred until a real action needs it, so a background
  // popup does not fire on every launch. Report a hopeful-but-unconfirmed
  // state rather than either extreme: not the reassuring "linked" (isProtected
  // stays false for this state), and not "needs relink", which would send an
  // unaffected user through a real re-authorization for no reason.
  if (!isVerified) return LINK_STATES.linkedUnverified;
  // An expired authorization means backup has stopped. Say so.
  if (!hasValidToken) return LINK_STATES.needsRelink;
  return LINK_STATES.linked;
}

/**
 * Describe the current link state for display.
 *
 * @param {object} situation Plain data describing the current state
 * @param {string|null} situation.linkedEmail The linked Google account, if any
 * @param {boolean} situation.hasValidToken Whether a usable access token exists
 * @param {boolean} situation.isOnline Whether the device is online
 * @param {boolean} [situation.isVerified] Whether hasValidToken reflects a real
 *   check this session, rather than "not checked yet". Defaults to true so
 *   every existing caller keeps its current behavior; only the deferred
 *   startup path passes false.
 * @returns {{status: string, email: string|null, label: string, detail: string,
 *   isProtected: boolean, canLink: boolean, canUnlink: boolean}} A frozen description
 */
function describeLinkState(situation = {}) {
  const {
    linkedEmail = null,
    hasValidToken = false,
    isOnline = false,
    isVerified = true
  } = situation;

  const status = resolveStatus(linkedEmail, hasValidToken, isOnline, isVerified);
  return Object.freeze({
    status,
    email: linkedEmail || null,
    ...DESCRIPTIONS[status]
  });
}

export { describeLinkState, LINK_STATES };
