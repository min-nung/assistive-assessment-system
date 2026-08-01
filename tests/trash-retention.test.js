import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRASH_RETENTION_DAYS, isExpired, daysLeftInTrash, purgeExpiredDeletedCases
} from '../assets/js/core/trash-retention.js';

/* 回收筒保留期限的規格。
 * 這是全系統唯一會永久移除個案資料的判斷，因此測試的重點放在「什麼情況下
 * 絕對不可以清除」，而不只是天數算得對不對。
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-08T12:00:00.000Z').getTime();

/** 刪除於 n 天前。 */
function daysAgo(n) {
  return NOW - n * DAY;
}

test('保留天數為 7 天', () => {
  assert.equal(TRASH_RETENTION_DAYS, 7);
});

/* ==========================================================================
   是否過期
   ========================================================================== */

test('剛刪除的資料沒有過期', () => {
  assert.equal(isExpired(NOW, NOW), false);
});

test('刪除 6 天的資料沒有過期', () => {
  assert.equal(isExpired(daysAgo(6), NOW), false);
});

test('剛好滿 7 天的資料還沒過期', () => {
  assert.equal(isExpired(daysAgo(7), NOW), false);
});

test('超過 7 天的資料才過期', () => {
  assert.equal(isExpired(daysAgo(7) - 1, NOW), true);
  assert.equal(isExpired(daysAgo(8), NOW), true);
});

test('接受 ISO 字串格式的刪除時間', () => {
  assert.equal(isExpired(new Date(daysAgo(8)).toISOString(), NOW), true);
  assert.equal(isExpired(new Date(daysAgo(3)).toISOString(), NOW), false);
});

/* 不確定就不清除。這些資料多半來自別台裝置或舊版備份，因為一個讀不懂的
 * 欄位就把個案評估資料永久刪掉，是這個模組最不能犯的錯。 */

test('缺少刪除時間的資料絕不清除', () => {
  assert.equal(isExpired(undefined, NOW), false);
  assert.equal(isExpired(null, NOW), false);
  assert.equal(isExpired('', NOW), false);
});

test('無法判讀的刪除時間絕不清除', () => {
  assert.equal(isExpired('不是日期', NOW), false);
  assert.equal(isExpired(NaN, NOW), false);
  assert.equal(isExpired(Infinity, NOW), false);
  assert.equal(isExpired({}, NOW), false);
});

test('刪除時間在未來時不清除', () => {
  assert.equal(isExpired(NOW + 100 * DAY, NOW), false);
});

/* ==========================================================================
   剩餘天數
   ========================================================================== */

test('剛刪除時顯示滿額的保留天數', () => {
  assert.equal(daysLeftInTrash(NOW, NOW), TRASH_RETENTION_DAYS);
});

test('剩餘天數無條件進位，不會提早顯示 0', () => {
  assert.equal(daysLeftInTrash(daysAgo(6.5), NOW), 1);
  assert.equal(daysLeftInTrash(daysAgo(6.99), NOW), 1);
});

test('已過期時剩餘天數為 0', () => {
  assert.equal(daysLeftInTrash(daysAgo(9), NOW), 0);
});

test('刪除時間無法判讀時不編造天數', () => {
  assert.equal(daysLeftInTrash(undefined, NOW), null);
  assert.equal(daysLeftInTrash('壞掉的時間', NOW), null);
});

test('裝置時鐘不準導致刪除時間在未來時，天數不超過保留上限', () => {
  assert.equal(daysLeftInTrash(NOW + 100 * DAY, NOW), TRASH_RETENTION_DAYS);
});

/* ==========================================================================
   清除
   ========================================================================== */

test('只清掉過期的那幾筆', () => {
  const { kept, purged } = purgeExpiredDeletedCases({
    a: { id: 'a', deletedAt: daysAgo(9) },
    b: { id: 'b', deletedAt: daysAgo(2) },
    c: { id: 'c', deletedAt: daysAgo(30) }
  }, NOW);
  assert.equal(purged, 2);
  assert.deepEqual(Object.keys(kept), ['b']);
});

test('沒有東西過期時回報 0，讓呼叫端可以省下一次寫入', () => {
  const { kept, purged } = purgeExpiredDeletedCases({
    a: { id: 'a', deletedAt: daysAgo(1) }
  }, NOW);
  assert.equal(purged, 0);
  assert.deepEqual(Object.keys(kept), ['a']);
});

test('不修改傳入的回收筒物件', () => {
  const input = { a: { id: 'a', deletedAt: daysAgo(9) } };
  const snapshot = structuredClone(input);
  purgeExpiredDeletedCases(input, NOW);
  assert.deepEqual(input, snapshot);
});

test('保留下來的個案資料原封不動', () => {
  const item = { id: 'b', name: '王先生', deletedAt: daysAgo(2), blocks: [] };
  const { kept } = purgeExpiredDeletedCases({ b: item }, NOW);
  assert.equal(kept.b, item);
});

test('缺少或壞掉的刪除時間不會被清除', () => {
  const { kept, purged } = purgeExpiredDeletedCases({
    a: { id: 'a' },
    b: { id: 'b', deletedAt: '壞掉的時間' },
    c: { id: 'c', deletedAt: daysAgo(9) }
  }, NOW);
  assert.equal(purged, 1);
  assert.deepEqual(Object.keys(kept).sort(), ['a', 'b']);
});

test('傳入非物件時回傳空回收筒而不拋出錯誤', () => {
  for (const input of [null, undefined, 'x', 42, []]) {
    const { kept, purged } = purgeExpiredDeletedCases(input, NOW);
    assert.deepEqual(kept, {});
    assert.equal(purged, 0);
  }
});

test('回收筒內容為 null 的項目不會讓清除崩潰', () => {
  const { kept, purged } = purgeExpiredDeletedCases({ a: null }, NOW);
  assert.equal(purged, 0);
  assert.deepEqual(Object.keys(kept), ['a']);
});
