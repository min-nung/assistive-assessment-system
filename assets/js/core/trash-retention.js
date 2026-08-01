/* 回收筒的保留期限。
 *
 * 回答一個問題：回收筒裡的這筆資料，還能留多久？
 *
 * 純函式——沒有網路、沒有 DOM、沒有 localStorage，也從不自己讀取現在時間；
 * 呼叫端把「現在」傳進來。這是全系統唯一會真正把個案資料永久移除的判斷，
 * 判斷錯了就沒有下一層保險了，因此獨立出來並且有自動化測試。
 */

/** 回收筒保留天數。刪除後這段期間內都還原得回來。 */
const TRASH_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 把刪除時間讀成毫秒。無法判讀時回傳 null——這個模組一律把「讀不出來」
 * 視為「不確定」，而不確定的資料絕不清除。
 */
function toTime(deletedAt) {
  if (typeof deletedAt === 'number' && Number.isFinite(deletedAt)) return deletedAt;
  if (typeof deletedAt === 'string' && deletedAt !== '') {
    const time = new Date(deletedAt).getTime();
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

/**
 * 這筆資料是否已超過保留期限。
 *
 * 刪除時間無法判讀時一律回傳 false。這種資料多半來自別台裝置或舊版備份，
 * 寧可讓它一直留在回收筒佔位置、由使用者自己決定，也不要因為一個讀不懂的
 * 欄位就把個案評估資料永久刪掉。
 *
 * @param {number|string|undefined} deletedAt 刪除時間
 * @param {number} now 現在時間（毫秒）
 * @returns {boolean}
 */
function isExpired(deletedAt, now) {
  const time = toTime(deletedAt);
  if (time === null) return false;
  // 未來的時間戳（裝置時鐘不準）同樣不清除：那代表 now - time 是負數，
  // 本來就不會超過期限，這裡不需要特別處理，只是別誤以為漏了。
  return now - time > TRASH_RETENTION_DAYS * DAY_MS;
}

/**
 * 還剩幾天可以還原。
 *
 * @param {number|string|undefined} deletedAt 刪除時間
 * @param {number} now 現在時間（毫秒）
 * @returns {number|null} 無條件進位的剩餘天數，最少 0；刪除時間無法判讀時
 *   回傳 null，呼叫端應顯示「保留中」而不是編一個數字出來。
 */
function daysLeftInTrash(deletedAt, now) {
  const time = toTime(deletedAt);
  if (time === null) return null;
  const remaining = TRASH_RETENTION_DAYS * DAY_MS - (now - time);
  if (remaining <= 0) return 0;
  return Math.min(Math.ceil(remaining / DAY_MS), TRASH_RETENTION_DAYS);
}

/**
 * 清掉回收筒裡超過保留期限的資料。
 *
 * 回傳新物件而不是就地修改傳入的物件，呼叫端才能先確認清了幾筆再決定是否
 * 寫回儲存空間——沒有東西過期時就不該產生一次多餘的寫入與上傳。
 *
 * @param {object} deletedCases 回收筒內容，鍵為個案 id
 * @param {number} now 現在時間（毫秒）
 * @returns {{kept: object, purged: number}} 保留下來的內容，以及清掉幾筆
 */
function purgeExpiredDeletedCases(deletedCases, now) {
  const source = deletedCases && typeof deletedCases === 'object' && !Array.isArray(deletedCases)
    ? deletedCases
    : {};
  const kept = {};
  let purged = 0;
  for (const [id, item] of Object.entries(source)) {
    if (item && isExpired(item.deletedAt, now)) purged += 1;
    else kept[id] = item;
  }
  return { kept, purged };
}

export { TRASH_RETENTION_DAYS, isExpired, daysLeftInTrash, purgeExpiredDeletedCases };
