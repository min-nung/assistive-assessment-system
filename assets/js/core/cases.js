import {
  state, defaultBasicInfo, defaultWheelchair, defaultTransfer, defaultCushion,
  defaultAirbed, defaultWalker, defaultShower, defaultHomeAccessibility,
  defaultExemptDevices, defaultSubsidyCalc, saveState, uid, TRASH_RETENTION_DAYS
} from './state.js';
import { showToast, showSaved, showActionToast } from '../ui.js';
import { renderEditor } from '../forms/stair.js';
import { renderList } from '../views/case-list.js';

/* Case and stair-block data operations
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   Case CRUD
   ========================================================================== */
function createCase(name, assessmentDate) {
  const trimmed = (name || '').trim();
  if (!trimmed) { showToast('請輸入個案名稱'); return null; }
  if (trimmed.length > 40) { showToast('個案名稱最多 40 個字'); return null; }
  // Name uniqueness check (case-sensitive exact match)
  for (const id in state.cases) {
    if (state.cases[id].name === trimmed) {
      showToast('已存在相同名稱的個案');
      return null;
    }
  }
  const id = uid();
  const now = Date.now();
  state.cases[id] = {
    id,
    name: trimmed,
    assessmentDate: assessmentDate || '',
    createdAt: now,
    updatedAt: now,
    blocks: [makeStair(1)],
    basicInfo: defaultBasicInfo(),
    wheelchair: defaultWheelchair(),
    transfer: defaultTransfer(),
    cushion: defaultCushion(),
    airbed: defaultAirbed(),
    walker: defaultWalker(),
    shower: defaultShower(),
    homeAccessibility: defaultHomeAccessibility(),
    exemptDevices: defaultExemptDevices(),
    subsidyCalc: defaultSubsidyCalc()
  };
  saveState();
  return id;
}

/**
 * Move a case to the trash. Deliberately not a real delete: the snapshot that
 * goes to the cloud still contains the case, so a mistaken tap here — even one
 * that has already synced to every other device — stays recoverable for
 * TRASH_RETENTION_DAYS instead of being gone the moment the upload finishes.
 *
 * That property is also what lets the undo toast be a plain convenience rather
 * than a race against the upload: nothing needs to be held back, because
 * nothing has actually been destroyed yet.
 */
function deleteCase(id) {
  const target = state.cases[id];
  if (!target) return;
  if (!confirm(`確定刪除個案「${target.name}」？\n\n資料會移到回收筒保留 ${TRASH_RETENTION_DAYS} 天，期間隨時可以還原。`)) return;
  delete state.cases[id];
  state.deletedCases[id] = { ...target, deletedAt: Date.now() };
  saveState();
  renderList();
  showActionToast(`已將「${target.name}」移到回收筒`, '復原', () => restoreDeletedCase(id));
}

/**
 * Put a case back. Refuses when the name is taken, rather than silently
 * creating two cases a therapist cannot tell apart — createCase() enforces the
 * same uniqueness rule, and a restore must not be the one way around it.
 *
 * @returns {boolean} Whether the case was actually restored
 */
function restoreDeletedCase(id) {
  const target = state.deletedCases[id];
  if (!target) { showToast('這筆資料已經不在回收筒裡'); return false; }
  for (const other of Object.values(state.cases)) {
    if (other.name === target.name) {
      showToast(`已有名稱相同的個案「${target.name}」，請先改名再還原`);
      return false;
    }
  }
  const restored = { ...target };
  delete restored.deletedAt;
  delete state.deletedCases[id];
  state.cases[id] = restored;
  saveState();
  renderList();
  showToast(`已還原「${restored.name}」`);
  return true;
}

/**
 * Delete for real, ahead of the retention deadline. This is the only path in
 * the app that destroys case data on purpose, so it says so plainly — including
 * that the cloud copy goes too, which is the part a user emptying a trash can
 * would not otherwise expect.
 *
 * @returns {boolean} Whether the case was actually destroyed
 */
function purgeDeletedCase(id) {
  const target = state.deletedCases[id];
  if (!target) return false;
  if (!confirm(`確定永久刪除「${target.name}」嗎？\n\n此動作無法復原，下次同步後雲端備份裡的這筆資料也會一併移除。`)) return false;
  delete state.deletedCases[id];
  saveState();
  showToast(`已永久刪除「${target.name}」`);
  return true;
}

function touchCase(id) {
  if (state.cases[id]) {
    state.cases[id].updatedAt = Date.now();
  }
}

function renameCurrentCase(newName) {
  const trimmed = (newName || '').trim();
  const c = state.cases[state.currentCaseId];
  if (!c) return false;
  if (!trimmed) {
    showToast('請輸入個案名稱');
    return false;
  }
  if (trimmed.length > 40) {
    showToast('個案名稱最多 40 個字');
    return false;
  }
  // Check for collision with other cases
  for (const id in state.cases) {
    if (id !== c.id && state.cases[id].name === trimmed) {
      showToast('已存在相同名稱的個案');
      return false;
    }
  }
  if (c.name === trimmed) return true;
  c.name = trimmed;
  touchCase(c.id);
  saveState();
  showSaved();
  return true;
}

/* ==========================================================================
   Block helpers
   ========================================================================== */
function makeStair() {
  return {
    id: uid(),
    type: 'stair',
    steps: [
      { id: uid(), height: '', slope: '' },
      { id: uid(), height: '', slope: '' }
    ],
    width: ''
  };
}

function makePlatform() {
  return {
    id: uid(),
    type: 'platform',
    width: '',
    depth1: '',
    depth2: '',
    platformType: 'Standard'
  };
}

function addBlock(type) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  const last = c.blocks[c.blocks.length - 1];
  if (type === 'stair') {
    if (last && last.type === 'stair') { showToast('前一項為樓梯段，請先新增迴轉平台'); return; }
    c.blocks.push(makeStair());
  } else {
    if (!last || last.type !== 'stair') { showToast('迴轉平台需接在樓梯段之後'); return; }
    // Also prevent starting with platform
    c.blocks.push(makePlatform());
  }
  touchCase(c.id);
  saveState();
  renderEditor();
  // Scroll to newly added block
  setTimeout(() => {
    const container = document.getElementById('blocksContainer');
    const last = container.lastElementChild;
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}

function removeBlock(blockId) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  const idx = c.blocks.findIndex(b => b.id === blockId);
  if (idx === -1) return;
  // Only allow removing last block, and not the very first stair (flow must start with stair)
  if (idx !== c.blocks.length - 1) {
    showToast('僅可刪除最後一個區塊以保持順序');
    return;
  }
  if (idx === 0) {
    showToast('至少需保留第一個樓梯段');
    return;
  }
  if (!confirm('確定刪除此區塊？')) return;
  c.blocks.splice(idx, 1);
  touchCase(c.id);
  saveState();
  renderEditor();
}

function addStep(blockId) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  const b = c.blocks.find(x => x.id === blockId);
  if (!b || b.type !== 'stair') return;
  b.steps.push({ id: uid(), height: '', slope: '' });
  touchCase(c.id);
  saveState();
  renderEditor();
  setTimeout(() => {
    const row = document.querySelector(`[data-block-id="${blockId}"] .step-row:last-of-type input`);
    if (row) row.focus();
  }, 50);
}

// 直接插入新階列到 DOM（不重繪整個表單，避免手機鍵盤消失）
// 回傳新列的 DOM 元素
function insertStepRow(blockId, step, stepNum) {
  const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!blockEl) return null;
  const addBtn = blockEl.querySelector('.add-step-btn');
  if (!addBtn) return null;
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="step-row">
      <span class="idx">第${stepNum}階</span>
      <div class="field">
        <input type="number" inputmode="decimal" step="0.1" min="0"
               data-block="${blockId}" data-step="${step.id}" data-field="height"
               value="" placeholder="階高" aria-label="第${stepNum}階階高">
        <span class="unit">cm</span>
        <span class="warn-hint">⚠ 階高好像有問題?!</span>
      </div>
      <div class="field">
        <input type="number" inputmode="decimal" step="0.1" min="0"
               data-block="${blockId}" data-step="${step.id}" data-field="slope"
               value="" placeholder="斜邊長" aria-label="第${stepNum}階斜邊長">
        <span class="unit">cm</span>
        <span class="warn-hint">⚠ 斜邊長好像有問題?!</span>
      </div>
      <button class="del-step" data-del-step data-block="${blockId}" data-step="${step.id}" aria-label="刪除此階">✕</button>
    </div>`;
  const newRow = div.firstElementChild;
  addBtn.before(newRow);
  return newRow;
}

function removeStep(blockId, stepId) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  const b = c.blocks.find(x => x.id === blockId);
  if (!b || b.type !== 'stair') return;
  if (b.steps.length <= 2) { showToast('至少需保留兩階'); return; }
  b.steps = b.steps.filter(s => s.id !== stepId);
  touchCase(c.id);
  saveState();
  renderEditor();
}

/* ==========================================================================
   Field update (auto-save)
   ========================================================================== */
function updateField(blockId, field, value, stepId) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  const b = c.blocks.find(x => x.id === blockId);
  if (!b) return;
  if (stepId) {
    const st = b.steps.find(s => s.id === stepId);
    if (st) st[field] = value;
  } else {
    b[field] = value;
  }
  touchCase(c.id);
  saveState();
  showSaved();
}

export {
  createCase, deleteCase, restoreDeletedCase, purgeDeletedCase,
  touchCase, renameCurrentCase, makeStair, makePlatform,
  addBlock, removeBlock, addStep, insertStepRow, removeStep, updateField
};
