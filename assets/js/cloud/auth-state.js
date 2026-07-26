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
  [LINK_STATES.needsRelink]: Object.freeze({
    label: '需要重新連結',
    detail: '授權已過期，備份已停止。請重新連結以恢復備份',
    isProtected: false,
    canLink: true,
    canUnlink: true
  })
});

function resolveStatus(linkedEmail, hasValidToken, isOnline) {
  // No account on record means unlinked, whatever the token looks like.
  if (!linkedEmail) return LINK_STATES.unlinked;
  // An expired authorization means backup has stopped, online or not. Say so.
  if (!hasValidToken) return LINK_STATES.needsRelink;
  // Being offline is temporary and not the user's problem to fix.
  if (!isOnline) return LINK_STATES.linkedOffline;
  return LINK_STATES.linked;
}

/**
 * Describe the current link state for display.
 *
 * @param {object} situation Plain data describing the current state
 * @param {string|null} situation.linkedEmail The linked Google account, if any
 * @param {boolean} situation.hasValidToken Whether a usable access token exists
 * @param {boolean} situation.isOnline Whether the device is online
 * @returns {{status: string, email: string|null, label: string, detail: string,
 *   isProtected: boolean, canLink: boolean, canUnlink: boolean}} A frozen description
 */
function describeLinkState(situation = {}) {
  const {
    linkedEmail = null,
    hasValidToken = false,
    isOnline = false
  } = situation;

  const status = resolveStatus(linkedEmail, hasValidToken, isOnline);
  return Object.freeze({
    status,
    email: linkedEmail || null,
    ...DESCRIPTIONS[status]
  });
}

export { describeLinkState, LINK_STATES };
