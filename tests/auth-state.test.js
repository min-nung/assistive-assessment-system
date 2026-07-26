import test from 'node:test';
import assert from 'node:assert/strict';

import { describeLinkState, LINK_STATES } from '../assets/js/cloud/auth-state.js';

/* 連結狀態的規格。
 * 「備份狀態必須誠實可見」——最糟的失敗是使用者以為有備份而不再手動匯出，
 * 結果兩邊都沒有。因此這個對照必須是純函式，且每個狀態都有測試釘住。
 */

function situation(overrides = {}) {
  return {
    linkedEmail: 'therapist@example.com',
    hasValidToken: true,
    isOnline: true,
    ...overrides
  };
}

test('從未連結時狀態為 unlinked', () => {
  const state = describeLinkState(situation({ linkedEmail: null, hasValidToken: false }));
  assert.equal(state.status, LINK_STATES.unlinked);
});

test('從未連結時不顯示任何帳號', () => {
  const state = describeLinkState(situation({ linkedEmail: null, hasValidToken: false }));
  assert.equal(state.email, null);
});

test('已連結且 token 有效時狀態為 linked', () => {
  const state = describeLinkState(situation());
  assert.equal(state.status, LINK_STATES.linked);
});

test('已連結時顯示所連結的帳號', () => {
  const state = describeLinkState(situation({ linkedEmail: 'someone@example.com' }));
  assert.equal(state.email, 'someone@example.com');
});

// 授權過期是「備份已經停了」，必須誠實顯示，不能讓使用者以為還在備份。
test('曾連結但 token 失效時狀態為 needs-relink', () => {
  const state = describeLinkState(situation({ hasValidToken: false }));
  assert.equal(state.status, LINK_STATES.needsRelink);
});

test('需要重新連結時仍顯示原本的帳號，讓使用者知道要重連哪一個', () => {
  const state = describeLinkState(situation({ hasValidToken: false }));
  assert.equal(state.email, 'therapist@example.com');
});

// 離線不代表授權失效，也不該顯示成「需要重新連結」而讓使用者白跑一趟。
test('已連結但離線時狀態為 linked-offline，而非 needs-relink', () => {
  const state = describeLinkState(situation({ isOnline: false }));
  assert.equal(state.status, LINK_STATES.linkedOffline);
});

test('離線且 token 已失效時，仍回報需要重新連結', () => {
  const state = describeLinkState(situation({ isOnline: false, hasValidToken: false }));
  assert.equal(state.status, LINK_STATES.needsRelink);
});

test('未連結且離線時仍回報未連結，不誤報為離線問題', () => {
  const state = describeLinkState(situation({
    linkedEmail: null, hasValidToken: false, isOnline: false
  }));
  assert.equal(state.status, LINK_STATES.unlinked);
});

test('空字串的帳號視為未連結', () => {
  const state = describeLinkState(situation({ linkedEmail: '', hasValidToken: false }));
  assert.equal(state.status, LINK_STATES.unlinked);
});

test('沒有帳號但 token 看似有效時，仍視為未連結', () => {
  const state = describeLinkState(situation({ linkedEmail: null, hasValidToken: true }));
  assert.equal(state.status, LINK_STATES.unlinked);
});

test('完全沒有情境資料時回報未連結而不拋出錯誤', () => {
  assert.equal(describeLinkState({}).status, LINK_STATES.unlinked);
});

test('未提供任何參數時回報未連結而不拋出錯誤', () => {
  assert.equal(describeLinkState().status, LINK_STATES.unlinked);
});

/* ==========================================================================
   誠實可見
   ========================================================================== */

test('每個狀態都有給使用者看的標籤與說明', () => {
  const inputs = [
    situation({ linkedEmail: null, hasValidToken: false }),
    situation(),
    situation({ hasValidToken: false }),
    situation({ isOnline: false })
  ];
  for (const input of inputs) {
    const state = describeLinkState(input);
    assert.equal(typeof state.label, 'string');
    assert.ok(state.label.length > 0);
    assert.equal(typeof state.detail, 'string');
    assert.ok(state.detail.length > 0);
  }
});

// 只有「已連結且在線」能宣稱資料受到保護，其餘一律不得宣稱。
test('只有 linked 狀態回報 isProtected 為真', () => {
  assert.equal(describeLinkState(situation()).isProtected, true);
  assert.equal(describeLinkState(situation({ isOnline: false })).isProtected, false);
  assert.equal(describeLinkState(situation({ hasValidToken: false })).isProtected, false);
  assert.equal(
    describeLinkState(situation({ linkedEmail: null, hasValidToken: false })).isProtected,
    false
  );
});

test('未連結與需要重新連結都應提示可採取的動作', () => {
  assert.equal(describeLinkState(situation({ linkedEmail: null, hasValidToken: false })).canLink, true);
  assert.equal(describeLinkState(situation({ hasValidToken: false })).canLink, true);
  assert.equal(describeLinkState(situation()).canLink, false);
});

test('已連結的任何狀態都可以解除連結', () => {
  assert.equal(describeLinkState(situation()).canUnlink, true);
  assert.equal(describeLinkState(situation({ isOnline: false })).canUnlink, true);
  assert.equal(describeLinkState(situation({ hasValidToken: false })).canUnlink, true);
  assert.equal(
    describeLinkState(situation({ linkedEmail: null, hasValidToken: false })).canUnlink,
    false
  );
});

/* ==========================================================================
   純函式性質
   ========================================================================== */

test('相同輸入永遠得到相同輸出', () => {
  const input = situation();
  assert.deepEqual(describeLinkState(input), describeLinkState(input));
});

test('不修改傳入的情境物件', () => {
  const input = situation();
  const snapshot = structuredClone(input);
  describeLinkState(input);
  assert.deepEqual(input, snapshot);
});

test('回傳的狀態物件無法被修改', () => {
  const state = describeLinkState(situation());
  assert.throws(() => { state.status = 'tampered'; }, TypeError);
});
