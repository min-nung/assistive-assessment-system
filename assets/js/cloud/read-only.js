import { CLOUD_CONFIG } from './cloud-config.js';

/* 唯讀檢視裝置。
 *
 * 一台只用來「看」評估紀錄的裝置——典型情境是治療師的電腦：手機在案家記錄，
 * 電腦只想調閱。這種裝置永遠不上傳，因此絕不可能覆蓋掉手機那份雲端快照。
 *
 * 這個設定是「每台裝置各自持有」，不隨快照同步：它描述的是這台裝置扮演什麼
 * 角色，不是資料本身的性質。手機開啟同一個網址仍然是正常的可寫裝置。
 *
 * 這個模組只負責保存與讀取這個事實。「唯讀時該做什麼」的判斷屬於
 * sync-decision.js，「唯讀時該顯示什麼」屬於 cloud-ui.js。
 */

function readKey(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    // 瀏覽器停用儲存空間時不可讓評估功能壞掉。讀不到就當作沒設定過。
    return null;
  }
}

function writeKey(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch (error) {
    console.warn('無法保存唯讀檢視設定', error);
  }
}

/**
 * 這台裝置是否為唯讀檢視裝置。
 *
 * 呼叫端每次都重新讀取，而不是啟動時讀一次存在記憶體裡：使用者可能在這個
 * 工作階段中途才打開這個開關，而開關打開的那一刻就必須生效——正在等待
 * debounce 的上傳也不例外。
 *
 * @returns {boolean}
 */
function isReadOnlyDevice() {
  return readKey(CLOUD_CONFIG.readOnlyKey) === '1';
}

/**
 * 設定這台裝置是否為唯讀檢視裝置。
 *
 * @param {boolean} on
 */
function setReadOnlyDevice(on) {
  writeKey(CLOUD_CONFIG.readOnlyKey, on ? '1' : null);
  // 關閉唯讀後，上一次載入的時間不再具意義：這台裝置從此會自己上傳，
  // 「本機是否有雲端沒有的變動」改由 lastUploadedAt 判斷。
  if (!on) writeKey(CLOUD_CONFIG.readOnlyPulledAtKey, null);
}

/**
 * 用網址開啟唯讀檢視，讓電腦端可以直接把 `?readonly=1` 存成書籤——不必先
 * 進設定、也不必記得每次要先切換，開啟的那一刻就已經是唯讀。這正是「怕電腦
 * 打開網址就覆蓋雲端」這個顧慮真正需要的保證。
 *
 * 設定會寫入這台裝置，因此之後即使開啟不帶參數的網址仍然維持唯讀；
 * `?readonly=0` 是對應的解除方式。
 *
 * @returns {boolean|null} 這次網址是否指定了唯讀狀態；null 表示網址沒有提及，
 *   既有設定原封不動。
 */
function applyReadOnlyFromUrl() {
  let raw = null;
  try {
    raw = new URLSearchParams(window.location.search).get('readonly');
  } catch (error) {
    console.warn('無法解析網址參數', error);
    return null;
  }
  if (raw === null) {
    if (window.location.hash !== '#readonly') return null;
    raw = '1';
  }
  const on = raw !== '0' && raw !== 'false';
  setReadOnlyDevice(on);
  return on;
}

/** 這台裝置最後一次從雲端載入快照的時間，未曾載入過則為 null。 */
function lastPullAt() {
  return readKey(CLOUD_CONFIG.readOnlyPulledAtKey);
}

/** 記錄一次成功的雲端載入。 */
function recordPull(at = new Date().toISOString()) {
  writeKey(CLOUD_CONFIG.readOnlyPulledAtKey, at);
}

/**
 * 本機是否有「載入之後才產生、而且永遠不會被上傳」的變動。
 *
 * 唯讀裝置上的任何修改都只留在這台裝置，所以覆蓋掉它們不會影響雲端；但那仍是
 * 使用者輸入過的東西，覆蓋前值得先匯出保險。反過來說，只是重新載入一份沒被
 * 動過的檢視資料時，不該每次都丟一個 JSON 檔到使用者的下載資料夾。
 *
 * @param {string|null} localChangedAt 本機最後一次變動的時間
 * @returns {boolean}
 */
function hasUnsavedViewEdits(localChangedAt) {
  if (!localChangedAt) return false;
  const changed = new Date(localChangedAt).getTime();
  if (Number.isNaN(changed)) return true; // 讀不出來就當作有，寧可多匯出一次。
  const pulled = lastPullAt();
  if (!pulled) return true;
  const pulledTime = new Date(pulled).getTime();
  if (Number.isNaN(pulledTime)) return true;
  return changed > pulledTime;
}

export {
  isReadOnlyDevice, setReadOnlyDevice, applyReadOnlyFromUrl,
  lastPullAt, recordPull, hasUnsavedViewEdits
};
