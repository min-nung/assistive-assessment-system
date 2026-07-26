import {
  state, defaultBasicInfo, defaultWheelchair, defaultTransfer, defaultCushion,
  defaultAirbed, defaultWalker, defaultShower, defaultHomeAccessibility,
  defaultExemptDevices, defaultSubsidyCalc, saveState, uid
} from './state.js';
import { showToast, showSaved } from '../ui.js';
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

function deleteCase(id) {
  if (!state.cases[id]) return;
  if (!confirm(`確定刪除個案「${state.cases[id].name}」？此動作無法復原。`)) return;
  delete state.cases[id];
  saveState();
  renderList();
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
  createCase, deleteCase, touchCase, renameCurrentCase, makeStair, makePlatform,
  addBlock, removeBlock, addStep, insertStepRow, removeStep, updateField
};
