/* 時刻的顯示格式。
 *
 * 純函式——不讀現在時間、不碰 DOM，時間一律由呼叫端傳進來。
 *
 * 全系統的時刻都走這裡，因為「幾點幾分」原本在三個地方各自用 padStart 拼了一
 * 次（備份時間、個案清單、回收筒），改成上下午制時三處都得改，而漏掉一處的下
 * 場是同一個畫面上兩種時制並存——那比統一成哪一種更難讀。
 *
 * 不用 toLocaleTimeString('zh-TW')：它排出「下午04:01」，小時補零在中文的上下
 * 午制裡並不自然，而各家瀏覽器對空格與補零的處理又不完全一致。這裡自己組，格
 * 式就跟著程式碼走。
 */

/**
 * 12 小時制的時刻，例如「下午 4:01」「上午 12:30」。
 *
 * 中午 12 點屬下午、凌晨 0 點屬上午 12 點，跟時鐘與日常說法一致；小時不補零
 * （中文不說「下午 04 點」），分鐘固定兩位。
 *
 * @param {Date} date 要顯示的時間
 * @returns {string}
 */
export function formatClockTime(date) {
  const hours = date.getHours();
  const meridiem = hours < 12 ? '上午' : '下午';
  // 0 點與 12 點都顯示成 12：時鐘上沒有「0 點」這個刻度。
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${meridiem} ${displayHour}:${String(date.getMinutes()).padStart(2, '0')}`;
}
