import test from 'node:test';
import assert from 'node:assert/strict';

import { decideSync, SYNC_ACTIONS, SYNC_TRIGGERS } from '../assets/js/cloud/sync-decision.js';

/* 同步決策模組的規格。
 * 每個測試給定一組情境，斷言回傳的決定。測試不碰模組內部如何比較時間或
 * 組織條件判斷——只描述「這種情境下，應該做什麼」。
 */

/** 一個最平凡的情境：已連結、在線、本機有變動且已過 debounce。 */
function situation(overrides = {}) {
  return {
    isLinked: true,
    isOnline: true,
    localChangedAt: '2026-07-26T10:00:00.000Z',
    lastUploadedAt: '2026-07-26T09:00:00.000Z',
    cloudSnapshotAt: '2026-07-26T09:00:00.000Z',
    msSinceLastChange: 9000,
    hasUnresolvedConflict: false,
    hasLocalCases: true,
    trigger: SYNC_TRIGGERS.interval,
    ...overrides
  };
}

/** 涵蓋各種極端情境的組合，用來斷言「絕不回傳 upload」這類全稱規則。 */
function everyTrigger() {
  return Object.values(SYNC_TRIGGERS);
}

function variationsAcrossTriggers(overrides) {
  return everyTrigger().flatMap((trigger) => [
    situation({ ...overrides, trigger }),
    situation({ ...overrides, trigger, msSinceLastChange: 0 }),
    situation({ ...overrides, trigger, msSinceLastChange: 600000 }),
    situation({ ...overrides, trigger, lastUploadedAt: null, cloudSnapshotAt: null }),
    situation({ ...overrides, trigger, cloudSnapshotAt: '2027-01-01T00:00:00.000Z' })
  ]);
}

test('未連結時回傳 needs-auth', () => {
  const decision = decideSync(situation({ isLinked: false }));
  assert.equal(decision.action, SYNC_ACTIONS.needsAuth);
});

test('未連結時，任何情境都不回傳 upload', () => {
  for (const input of variationsAcrossTriggers({ isLinked: false })) {
    assert.notEqual(decideSync(input).action, SYNC_ACTIONS.upload);
  }
});

test('離線時回傳 offline', () => {
  const decision = decideSync(situation({ isOnline: false }));
  assert.equal(decision.action, SYNC_ACTIONS.offline);
});

test('離線時，任何情境都不回傳 upload', () => {
  for (const input of variationsAcrossTriggers({ isOnline: false })) {
    assert.notEqual(decideSync(input).action, SYNC_ACTIONS.upload);
  }
});

test('距離最後變動未滿 5 秒時回傳 wait', () => {
  const decision = decideSync(situation({ msSinceLastChange: 4999 }));
  assert.equal(decision.action, SYNC_ACTIONS.wait);
});

test('距離最後變動剛好滿 5 秒時回傳 upload', () => {
  const decision = decideSync(situation({ msSinceLastChange: 5000 }));
  assert.equal(decision.action, SYNC_ACTIONS.upload);
});

test('距離最後變動已超過 5 秒時回傳 upload', () => {
  const decision = decideSync(situation({ msSinceLastChange: 5001 }));
  assert.equal(decision.action, SYNC_ACTIONS.upload);
});

test('使用者離開頁面時，即使未滿 5 秒仍回傳 upload', () => {
  const decision = decideSync(situation({
    trigger: SYNC_TRIGGERS.pageHidden,
    msSinceLastChange: 0
  }));
  assert.equal(decision.action, SYNC_ACTIONS.upload);
});

test('使用者離開頁面但本機自最後一次上傳後無變動時，回傳 idle 而非 upload', () => {
  const decision = decideSync(situation({
    trigger: SYNC_TRIGGERS.pageHidden,
    localChangedAt: '2026-07-26T09:00:00.000Z',
    lastUploadedAt: '2026-07-26T10:00:00.000Z',
    msSinceLastChange: 0
  }));
  assert.equal(decision.action, SYNC_ACTIONS.idle);
});

test('雲端快照比本機最後上傳新時，回傳 conflict 而非 upload', () => {
  const decision = decideSync(situation({
    lastUploadedAt: '2026-07-26T09:00:00.000Z',
    cloudSnapshotAt: '2026-07-26T09:30:00.000Z'
  }));
  assert.equal(decision.action, SYNC_ACTIONS.conflict);
});

test('雲端快照比本機最後上傳舊時回傳 upload', () => {
  const decision = decideSync(situation({
    lastUploadedAt: '2026-07-26T09:00:00.000Z',
    cloudSnapshotAt: '2026-07-26T08:00:00.000Z'
  }));
  assert.equal(decision.action, SYNC_ACTIONS.upload);
});

test('存在未解決的衝突時回傳 conflict', () => {
  const decision = decideSync(situation({ hasUnresolvedConflict: true }));
  assert.equal(decision.action, SYNC_ACTIONS.conflict);
});

test('存在未解決的衝突時，任何情境都不回傳 upload', () => {
  for (const input of variationsAcrossTriggers({ hasUnresolvedConflict: true })) {
    assert.notEqual(decideSync(input).action, SYNC_ACTIONS.upload);
  }
});

test('雲端尚無快照且本機有個案資料時回傳 upload', () => {
  const decision = decideSync(situation({
    cloudSnapshotAt: null,
    lastUploadedAt: null,
    hasLocalCases: true
  }));
  assert.equal(decision.action, SYNC_ACTIONS.upload);
});

test('雲端尚無快照且本機沒有個案資料時回傳 idle', () => {
  const decision = decideSync(situation({
    cloudSnapshotAt: null,
    lastUploadedAt: null,
    localChangedAt: null,
    hasLocalCases: false
  }));
  assert.equal(decision.action, SYNC_ACTIONS.idle);
});

test('本機自最後一次上傳後無任何變動時回傳 idle', () => {
  const decision = decideSync(situation({
    localChangedAt: '2026-07-26T09:00:00.000Z',
    lastUploadedAt: '2026-07-26T10:00:00.000Z',
    cloudSnapshotAt: '2026-07-26T10:00:00.000Z'
  }));
  assert.equal(decision.action, SYNC_ACTIONS.idle);
});

test('應用程式啟動且雲端較新時回傳 conflict', () => {
  const decision = decideSync(situation({
    trigger: SYNC_TRIGGERS.appStart,
    lastUploadedAt: '2026-07-26T09:00:00.000Z',
    cloudSnapshotAt: '2026-07-26T11:00:00.000Z'
  }));
  assert.equal(decision.action, SYNC_ACTIONS.conflict);
});

test('應用程式啟動且雲端與本機一致時回傳 idle', () => {
  const decision = decideSync(situation({
    trigger: SYNC_TRIGGERS.appStart,
    localChangedAt: '2026-07-26T09:00:00.000Z',
    lastUploadedAt: '2026-07-26T10:00:00.000Z',
    cloudSnapshotAt: '2026-07-26T10:00:00.000Z'
  }));
  assert.equal(decision.action, SYNC_ACTIONS.idle);
});

// 啟動時的未上傳變動來自上一次工作階段，使用者並非正在打字，因此不需再等 debounce。
test('應用程式啟動且本機有未上傳的變動時回傳 upload，不受 debounce 影響', () => {
  const decision = decideSync(situation({
    trigger: SYNC_TRIGGERS.appStart,
    localChangedAt: '2026-07-26T10:00:00.000Z',
    lastUploadedAt: '2026-07-26T09:00:00.000Z',
    msSinceLastChange: 0
  }));
  assert.equal(decision.action, SYNC_ACTIONS.upload);
});

// 不確定時必須選擇等待。無法辨識的觸發原因若跳過 debounce 直接上傳，
// 這個模組就會從「防止資料遺失」變成「可能造成資料遺失」。
test('無法辨識的觸發原因仍走 debounce，未滿 5 秒時回傳 wait', () => {
  const decision = decideSync(situation({
    trigger: '未知的觸發原因',
    msSinceLastChange: 0
  }));
  assert.equal(decision.action, SYNC_ACTIONS.wait);
});

test('無法辨識的觸發原因在 debounce 屆滿後回傳 upload', () => {
  const decision = decideSync(situation({
    trigger: '未知的觸發原因',
    msSinceLastChange: 5000
  }));
  assert.equal(decision.action, SYNC_ACTIONS.upload);
});

test('缺少觸發原因時視為定時檢查，未滿 5 秒回傳 wait', () => {
  const decision = decideSync(situation({
    trigger: undefined,
    msSinceLastChange: 0
  }));
  assert.equal(decision.action, SYNC_ACTIONS.wait);
});

test('負數的經過時間不會被當成已屆滿 debounce', () => {
  const decision = decideSync(situation({ msSinceLastChange: -1 }));
  assert.equal(decision.action, SYNC_ACTIONS.wait);
});

/* ==========================================================================
   邊界情境
   ========================================================================== */

test('雲端與本機上傳時間戳相同時不視為衝突', () => {
  const decision = decideSync(situation({
    lastUploadedAt: '2026-07-26T09:00:00.000Z',
    cloudSnapshotAt: '2026-07-26T09:00:00.000Z'
  }));
  assert.notEqual(decision.action, SYNC_ACTIONS.conflict);
});

test('雲端有快照但本機從未上傳過時回傳 conflict', () => {
  const decision = decideSync(situation({
    lastUploadedAt: null,
    cloudSnapshotAt: '2026-07-26T09:00:00.000Z'
  }));
  assert.equal(decision.action, SYNC_ACTIONS.conflict);
});

test('缺少本機變動時間但雲端無快照且本機有資料時回傳 upload', () => {
  const decision = decideSync(situation({
    localChangedAt: null,
    lastUploadedAt: null,
    cloudSnapshotAt: null,
    hasLocalCases: true
  }));
  assert.equal(decision.action, SYNC_ACTIONS.upload);
});

// 時間戳損壞時無法判斷雲端新舊，上傳可能靜默覆蓋較新的快照。
test('時間戳格式無法解析時回傳 conflict 而非 upload', () => {
  const decision = decideSync(situation({
    localChangedAt: '不是日期',
    lastUploadedAt: '也不是日期',
    cloudSnapshotAt: '仍然不是日期'
  }));
  assert.equal(decision.action, SYNC_ACTIONS.conflict);
});

test('僅雲端時間戳無法解析時回傳 conflict 而非 upload', () => {
  const decision = decideSync(situation({ cloudSnapshotAt: '壞掉的時間' }));
  assert.equal(decision.action, SYNC_ACTIONS.conflict);
});

test('空字串時間戳視為不存在，而非無法判讀', () => {
  const decision = decideSync(situation({
    localChangedAt: '',
    lastUploadedAt: '',
    cloudSnapshotAt: '',
    hasLocalCases: true
  }));
  assert.equal(decision.action, SYNC_ACTIONS.upload);
});

test('完全沒有情境資料時回傳 needs-auth 而不拋出錯誤', () => {
  const decision = decideSync({});
  assert.equal(decision.action, SYNC_ACTIONS.needsAuth);
});

test('未提供任何參數時回傳 needs-auth 而不拋出錯誤', () => {
  const decision = decideSync();
  assert.equal(decision.action, SYNC_ACTIONS.needsAuth);
});

test('debounce 剩餘時間在 wait 決定中一併回報', () => {
  const decision = decideSync(situation({ msSinceLastChange: 2000 }));
  assert.equal(decision.action, SYNC_ACTIONS.wait);
  assert.equal(decision.retryInMs, 3000);
});

/* ==========================================================================
   決定的優先順序
   ========================================================================== */

test('未連結優先於離線', () => {
  const decision = decideSync(situation({ isLinked: false, isOnline: false }));
  assert.equal(decision.action, SYNC_ACTIONS.needsAuth);
});

test('未解決的衝突優先於離線', () => {
  const decision = decideSync(situation({ hasUnresolvedConflict: true, isOnline: false }));
  assert.equal(decision.action, SYNC_ACTIONS.conflict);
});

test('未解決的衝突優先於 debounce 等待', () => {
  const decision = decideSync(situation({
    hasUnresolvedConflict: true,
    msSinceLastChange: 0
  }));
  assert.equal(decision.action, SYNC_ACTIONS.conflict);
});

test('雲端較新優先於 debounce 等待', () => {
  const decision = decideSync(situation({
    msSinceLastChange: 0,
    lastUploadedAt: '2026-07-26T09:00:00.000Z',
    cloudSnapshotAt: '2026-07-26T09:30:00.000Z'
  }));
  assert.equal(decision.action, SYNC_ACTIONS.conflict);
});

/* ==========================================================================
   純函式性質
   ========================================================================== */

test('相同輸入永遠得到相同輸出', () => {
  const input = situation();
  assert.deepEqual(decideSync(input), decideSync(input));
});

test('不修改傳入的情境物件', () => {
  const input = situation();
  const snapshot = structuredClone(input);
  decideSync(input);
  assert.deepEqual(input, snapshot);
});

test('回傳的決定物件無法被修改', () => {
  const decision = decideSync(situation());
  assert.throws(() => { decision.action = 'tampered'; }, TypeError);
});

test('每個決定都是已定義的動作之一', () => {
  const actions = new Set(Object.values(SYNC_ACTIONS));
  const inputs = [
    ...variationsAcrossTriggers({}),
    ...variationsAcrossTriggers({ isLinked: false }),
    ...variationsAcrossTriggers({ isOnline: false }),
    ...variationsAcrossTriggers({ hasUnresolvedConflict: true }),
    ...variationsAcrossTriggers({ hasLocalCases: false, localChangedAt: null })
  ];
  for (const input of inputs) {
    assert.ok(actions.has(decideSync(input).action));
  }
});

test('每個決定都附帶可顯示給使用者的理由', () => {
  for (const input of variationsAcrossTriggers({})) {
    assert.equal(typeof decideSync(input).reason, 'string');
    assert.ok(decideSync(input).reason.length > 0);
  }
});
