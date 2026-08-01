import { state, TRASH_RETENTION_DAYS } from '../core/state.js';
import { escapeHtml } from '../core/dom.js';
import { daysLeftInTrash } from '../core/trash-retention.js';

/* 回收筒畫面。
 *
 * 只負責把回收筒的內容畫出來；「還能留多久」的判斷屬於 trash-retention.js，
 * 「還原／永久刪除」屬於 core/cases.js。這個模組不做任何決定。
 */

function trashCount() {
  return Object.keys(state.deletedCases).length;
}

/** 刪除時間顯示成「今天 14:30」或「8/1 14:30」，和個案列表同樣的體感。 */
function formatDeletedAt(deletedAt) {
  const time = new Date(deletedAt).getTime();
  if (Number.isNaN(time)) return '刪除時間不明';
  const d = new Date(time);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `今天 ${hhmm} 刪除` : `${d.getMonth() + 1}/${d.getDate()} ${hhmm} 刪除`;
}

/**
 * 剩餘天數。讀不出刪除時間的資料顯示「保留中」而不是編一個數字——
 * trash-retention.js 也不會自動清掉它們，兩邊說的是同一件事。
 */
function describeRemaining(deletedAt) {
  const days = daysLeftInTrash(deletedAt, Date.now());
  if (days === null) return '保留中';
  if (days <= 0) return '即將清除';
  return `還可還原 ${days} 天`;
}

function renderTrashList() {
  const host = document.getElementById('trashList');
  const note = document.getElementById('trashNote');
  if (!host) return;
  if (note) note.textContent = `刪除的個案會在回收筒保留 ${TRASH_RETENTION_DAYS} 天，期間隨時可以還原。超過期限會自動清除。`;

  const entries = Object.values(state.deletedCases)
    .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

  if (entries.length === 0) {
    host.innerHTML = '<div class="trash-empty">回收筒是空的</div>';
    return;
  }

  host.innerHTML = entries.map(c => `
    <div class="trash-item">
      <div class="trash-info">
        <div class="trash-name">${escapeHtml(c.name)}</div>
        <div class="trash-meta">${escapeHtml(formatDeletedAt(c.deletedAt))}　${escapeHtml(describeRemaining(c.deletedAt))}</div>
      </div>
      <div class="trash-item-actions">
        <button type="button" class="trash-restore" data-restore-case="${c.id}">還原</button>
        <button type="button" class="trash-purge" data-purge-case="${c.id}">永久刪除</button>
      </div>
    </div>
  `).join('');
}

/**
 * 回收筒在設定選單裡的副標。有東西時直接寫出筆數，讓使用者不必點進去才
 * 知道裡面還留著剛才刪掉的那筆。
 */
function renderTrashMenuItem() {
  const label = document.getElementById('trashMenuLabel');
  if (!label) return;
  const count = trashCount();
  label.textContent = count
    ? `${count} 筆已刪除的個案，可還原`
    : `已刪除的個案保留 ${TRASH_RETENTION_DAYS} 天`;
}

function openTrashDialog() {
  renderTrashList();
  const dialog = document.getElementById('trashDialog');
  if (dialog?.showModal) dialog.showModal();
}

export { renderTrashList, renderTrashMenuItem, openTrashDialog, trashCount };
