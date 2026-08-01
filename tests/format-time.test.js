import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClockTime } from '../assets/js/core/format-time.js';

/* 上下午制的交界處是這支函式唯一會出錯的地方：12 % 12 是 0，天真的寫法會把
 * 中午印成「下午 0:05」、把凌晨印成「上午 0:30」。時鐘上沒有 0 點這個刻度。 */

test('上午顯示上午', () => {
  assert.equal(formatClockTime(new Date(2026, 7, 1, 9, 5)), '上午 9:05');
});

test('下午顯示下午，且換算成 12 小時制', () => {
  assert.equal(formatClockTime(new Date(2026, 7, 1, 16, 1)), '下午 4:01');
});

test('中午 12 點是下午 12 點，不是下午 0 點', () => {
  assert.equal(formatClockTime(new Date(2026, 7, 1, 12, 0)), '下午 12:00');
});

test('午夜 0 點是上午 12 點，不是上午 0 點', () => {
  assert.equal(formatClockTime(new Date(2026, 7, 1, 0, 30)), '上午 12:30');
});

test('中午前一分鐘仍屬上午', () => {
  assert.equal(formatClockTime(new Date(2026, 7, 1, 11, 59)), '上午 11:59');
});

test('一天的最後一分鐘屬下午', () => {
  assert.equal(formatClockTime(new Date(2026, 7, 1, 23, 59)), '下午 11:59');
});

test('小時不補零，分鐘補零', () => {
  assert.equal(formatClockTime(new Date(2026, 7, 1, 13, 7)), '下午 1:07');
});
