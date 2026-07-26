import {
  state, defaultBasicInfo, defaultWheelchair, defaultTransfer, defaultCushion,
  defaultAirbed, defaultWalker, defaultShower, defaultHomeAccessibility,
  defaultExemptDevices, defaultSubsidyCalc, saveState, uid, runBackFn
} from './core/state.js';
import {
  createCase, deleteCase, touchCase, renameCurrentCase, updateField, addBlock, addStep, removeStep,
  removeBlock, insertStepRow
} from './core/cases.js';
import { escapeHtml } from './core/dom.js';
import {
  moduleHasData, renderList, toggleEditingCase, clearEditingCase
} from './views/case-list.js';
import {
  showMainMenu, showList, showEditor, showWheelchair, showCushion,
  showTransfer, showShower, showWalker, showAirbed, showHomeAccessibility
} from './navigation.js';
import { renderBackupPanel, exportBackup, importBackupFile } from './backup/backup.js';
import { renderSubsidyCalc } from './calculations/subsidy.js';
import { renderResults, toNum } from './calculations/stair-eligibility.js';
import { renderEditor } from './forms/stair.js';
import { renderWheelchairForm, saveWcField, updateWcConditional } from './forms/wheelchair.js';
import { renderShowerForm, saveShowerField, updateShowerConditional } from './forms/shower.js';
import { renderWalkerForm, saveWalkerField, updateWalkerConditional } from './forms/walker.js';
import { renderCushionForm, saveCushionField, updateCushionConditional } from './forms/cushion.js';
import { renderTransferForm, saveTransferField } from './forms/transfer.js';
import { renderAirbedForm, saveAirbedField, updateAirbedConditional } from './forms/airbed.js';
import {
  renderHomeAccessibilityForm, saveHaGross, saveHaFine, saveHaField,
  saveHaRowField, updateHaSummary, addHaRow, removeHaRow,
  renderGrabCalcResults, calcGrabBar
} from './forms/home-accessibility.js';
import { showToast, showSaved } from './ui.js';
import { renderVersionInfo } from './version.js';
import {
  openCloudDialog, linkCloudAccount, unlinkCloudAccount, renderCloudPanel, ensureCloudLinkVerified,
  confirmCloudRestore, skipCloudRestore, openConflictDialog, keepLocalData, useCloudData, deferConflict,
  renderCloudSummary
} from './cloud/cloud-ui.js';

/* DOM event bindings
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */

document.body.addEventListener('click', event => {
  const clearModule = event.target.getAttribute('data-clear-module');
  if (!clearModule) return;
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  const labels = {
    stair: '爬梯機', wheelchair: '輪椅', cushion: '座墊', airbed: '床組',
    shower: '沐浴便盆', walker: '助步車', transfer: '移位', homeAccessibility: '居家無障礙'
  };
  if (!confirm(`確定要清除「${labels[clearModule] || clearModule}」的所有評估資料嗎？\n此操作無法復原。`)) return;
  if (clearModule === 'stair') c.blocks = [];
  else if (clearModule === 'wheelchair') c.wheelchair = defaultWheelchair();
  else if (clearModule === 'cushion') c.cushion = defaultCushion();
  else if (clearModule === 'airbed') c.airbed = defaultAirbed();
  else if (clearModule === 'shower') c.shower = defaultShower();
  else if (clearModule === 'walker') c.walker = defaultWalker();
  else if (clearModule === 'transfer') c.transfer = defaultTransfer();
  else if (clearModule === 'homeAccessibility') c.homeAccessibility = defaultHomeAccessibility();
  else return;
  touchCase(c.id);
  saveState();
  if (clearModule === 'stair') renderEditor();
  else if (clearModule === 'wheelchair') renderWheelchairForm(c.id);
  else if (clearModule === 'cushion') renderCushionForm(c.id);
  else if (clearModule === 'airbed') renderAirbedForm(c.id);
  else if (clearModule === 'shower') renderShowerForm(c.id);
  else if (clearModule === 'walker') renderWalkerForm(c.id);
  else if (clearModule === 'transfer') renderTransferForm(c.id);
  else renderHomeAccessibilityForm(c.id);
  showToast('已清除評估資料');
});
/* ==========================================================================
   Event wiring
   ========================================================================== */
document.getElementById('createCaseBtn').addEventListener('click', () => {
  const input = document.getElementById('newCaseName');
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const assessmentDate = new Date(now - offset).toISOString().slice(0, 16);
  const id = createCase(input.value, assessmentDate);
  if (id) {
    input.value = '';
    showMainMenu(id);
  }
});
document.getElementById('newCaseName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('createCaseBtn').click();
});
document.getElementById('editCaseNameBtn').addEventListener('click', () => {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  const newName = prompt('修改個案名稱', c.name);
  if (newName === null || !renameCurrentCase(newName)) return;
  document.getElementById('headerTitle').textContent = c.name;
  document.getElementById('editCaseNameBtn').setAttribute('aria-label', `修改個案名稱：${c.name}`);
  showToast('個案名稱已更新');
});
document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('settingsDialog').showModal();
  // Opening settings is a direct result of the user's own click — the safe
  // place for GIS's silent-renewal popup to fire, if the link has not been
  // verified yet this session. Not awaited: the menu is already open and
  // usable; renderCloudPanel() inside this call updates the cloud status
  // once the real answer comes back, and this is also what lets the 7-day
  // manual reminder correctly suppress itself once cloud backup is confirmed
  // healthy, rather than firing every 7 days regardless of real cloud state.
  ensureCloudLinkVerified().catch(error => console.warn('雲端備份驗證失敗', error));
});
document.getElementById('closeSettingsDialogBtn').addEventListener('click', () => document.getElementById('settingsDialog').close());
function openManualBackupDialog() {
  const dialog = document.getElementById('backupDialog');
  renderBackupPanel();
  renderCloudSummary();
  dialog.showModal();
}
document.getElementById('openManualBackupBtn').addEventListener('click', () => {
  document.getElementById('cloudDialog').close();
  openManualBackupDialog();
});
document.getElementById('cloudSummaryLine').addEventListener('click', () => {
  document.getElementById('backupDialog').close();
  openCloudDialog();
});
document.getElementById('openCloudBtn').addEventListener('click', () => {
  document.getElementById('settingsDialog').close();
  openCloudDialog();
});
document.getElementById('closeCloudDialogBtn').addEventListener('click', () => document.getElementById('cloudDialog').close());
document.getElementById('linkCloudBtn').addEventListener('click', linkCloudAccount);
document.getElementById('unlinkCloudBtn').addEventListener('click', unlinkCloudAccount);
document.getElementById('confirmRestoreBtn').addEventListener('click', confirmCloudRestore);
document.getElementById('skipRestoreBtn').addEventListener('click', skipCloudRestore);
document.getElementById('cloudUploadStatus').addEventListener('click', e => {
  if (e.currentTarget.classList.contains('cloud-upload-status-actionable')) openConflictDialog();
});
// role="button" without keyboard activation would leave a keyboard user able
// to focus this element but not act on it — Enter/Space must work the same
// as a click, per the role this element claims when a conflict is pending.
document.getElementById('cloudUploadStatus').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (!e.currentTarget.classList.contains('cloud-upload-status-actionable')) return;
  e.preventDefault();
  openConflictDialog();
});
document.getElementById('keepLocalBtn').addEventListener('click', keepLocalData);
document.getElementById('useCloudBtn').addEventListener('click', useCloudData);
document.getElementById('deferConflictBtn').addEventListener('click', deferConflict);
document.getElementById('openVersionBtn').addEventListener('click', () => {
  document.getElementById('settingsDialog').close();
  renderVersionInfo();
  document.getElementById('versionDialog').showModal();
});
document.getElementById('closeBackupDialogBtn').addEventListener('click', () => document.getElementById('backupDialog').close());
document.getElementById('closeVersionDialogBtn').addEventListener('click', () => document.getElementById('versionDialog').close());
document.getElementById('skipBackupReminderBtn').addEventListener('click', () => document.getElementById('backupReminderDialog').close());
document.getElementById('confirmBackupReminderBtn').addEventListener('click', () => {
  document.getElementById('backupReminderDialog').close();
  exportBackup();
});
document.getElementById('exportBackupBtn').addEventListener('click', exportBackup);
document.getElementById('importBackupBtn').addEventListener('click', () => document.getElementById('importBackupInput').click());
document.getElementById('importBackupInput').addEventListener('change', e => {
  const [file] = e.target.files;
  importBackupFile(file);
  e.target.value = '';
});

// Keep the cloud status text honest when connectivity changes — a re-render
// only, in both directions. Coming back online does not retry the GIS
// renewal here: connectivity changes are not a user gesture, and firing the
// silent-renewal popup off one would risk the same "allow pop-ups?" prompt
// on iOS that deferring it from app start was meant to avoid. The real
// verification happens the next time the user does something that needs it —
// opening the cloud dialog, or an upload attempt failing with needs-auth.
window.addEventListener('online', renderCloudPanel);
window.addEventListener('offline', renderCloudPanel);

document.getElementById('caseList').addEventListener('click', e => {
  // 刪除個案
  const delId = e.target.getAttribute('data-del');
  if (delId) { deleteCase(delId); return; }

  // 修改/完成按鈕：切換 badge 編輯模式
  const toggleId = e.target.getAttribute('data-toggle-edit');
  if (toggleId) {
    toggleEditingCase(toggleId);
    renderList();
    return;
  }

  // 徽章 × 按鈕：清除特定模組資料
  const removeModule = e.target.getAttribute('data-remove-module');
  const removeCaseId = e.target.getAttribute('data-case-id');
  if (removeModule && removeCaseId) {
    const c = state.cases[removeCaseId];
    if (!c) return;
    const moduleNames = {
      stair: '爬梯機', wheelchair: '輪椅', cushion: '座墊',
      airbed: '床組', shower: '沐浴便盆', walker: '助步車',
      transfer: '移位', homeAccessibility: '居家無障礙'
    };
    if (!confirm(`確定要清除「${moduleNames[removeModule] || removeModule}」的所有評估資料嗎？`)) return;
    if (removeModule === 'stair') {
      c.blocks = [];
    } else if (removeModule === 'wheelchair') {
      c.wheelchair = defaultWheelchair();
    } else if (removeModule === 'cushion') {
      c.cushion = defaultCushion();
    } else if (removeModule === 'airbed') {
      c.airbed = defaultAirbed();
    } else if (removeModule === 'shower') {
      c.shower = defaultShower();
    } else if (removeModule === 'walker') {
      c.walker = defaultWalker();
    } else if (removeModule === 'transfer') {
      c.transfer = defaultTransfer();
    } else if (removeModule === 'homeAccessibility') {
      c.homeAccessibility = defaultHomeAccessibility();
    }
    touchCase(c.id);
    saveState();
    renderList();
    return;
  }

  // 開啟個案（點整張卡片，但排除按鈕）
  if (e.target.closest('button')) return;
  const card = e.target.closest('[data-open-case]');
  if (card) {
    clearEditingCase();
    showMainMenu(card.getAttribute('data-open-case'));
  }
});

document.getElementById('backBtn').addEventListener('click', runBackFn);

// Main menu buttons — now lead to assessment for currentCaseId
document.getElementById('menuStairBtn').addEventListener('click', () => showEditor(state.currentCaseId));
document.getElementById('menuWheelchairBtn').addEventListener('click', () => showWheelchair(state.currentCaseId));
document.getElementById('menuTransferBtn').addEventListener('click', () => showTransfer(state.currentCaseId));
document.getElementById('menuCushionBtn').addEventListener('click', () => showCushion(state.currentCaseId));
document.getElementById('menuAirbedBtn').addEventListener('click', () => showAirbed(state.currentCaseId));
document.getElementById('menuWalkerBtn').addEventListener('click', () => showWalker(state.currentCaseId));
document.getElementById('menuShowerBtn').addEventListener('click', () => showShower(state.currentCaseId));
document.getElementById('menuHomeAccessBtn').addEventListener('click', () => showHomeAccessibility(state.currentCaseId));
// Long-press on menu cards to clear module data
(function() {
  const cardModuleMap = {
    menuStairBtn:       { key: 'stair',             label: '爬梯機' },
    menuWheelchairBtn:  { key: 'wheelchair',         label: '輪椅' },
    menuTransferBtn:    { key: 'transfer',           label: '移位輔具' },
    menuCushionBtn:     { key: 'cushion',            label: '輪椅座墊' },
    menuAirbedBtn:      { key: 'airbed',             label: '氣墊床／電動床' },
    menuWalkerBtn:      { key: 'walker',             label: '帶輪型助步車' },
    menuShowerBtn:      { key: 'shower',             label: '沐浴椅／便盆椅' },
    menuHomeAccessBtn:  { key: 'homeAccessibility',  label: '居家無障礙' }
  };

  let lpTimer = null;
  let lpMoved = false;

  function cancelLP() {
    clearTimeout(lpTimer);
    lpTimer = null;
  }

  function showLPMenu(moduleKey, moduleLabel) {
    let overlay = document.createElement('div');
    overlay.className = 'lp-overlay';
    overlay.innerHTML = `
      <div class="lp-menu">
        <div class="lp-menu-title">${escapeHtml(moduleLabel)}</div>
        <button class="lp-menu-item danger" id="lpClearBtn">清除評估資料</button>
        <button class="lp-menu-cancel" id="lpCancelBtn">取消</button>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#lpClearBtn').addEventListener('click', () => {
      document.body.removeChild(overlay);
      const c = state.cases[state.currentCaseId];
      if (!c) return;
      if (!confirm(`確定要清除「${moduleLabel}」的所有評估資料嗎？\n此操作無法復原。`)) return;
      if (moduleKey === 'stair') c.blocks = [];
      else if (moduleKey === 'wheelchair') c.wheelchair = defaultWheelchair();
      else if (moduleKey === 'cushion') c.cushion = defaultCushion();
      else if (moduleKey === 'airbed') c.airbed = defaultAirbed();
      else if (moduleKey === 'shower') c.shower = defaultShower();
      else if (moduleKey === 'walker') c.walker = defaultWalker();
      else if (moduleKey === 'transfer') c.transfer = defaultTransfer();
      else if (moduleKey === 'homeAccessibility') c.homeAccessibility = defaultHomeAccessibility();
      touchCase(c.id);
      saveState();
      showToast('已清除評估資料');
    });

    overlay.querySelector('#lpCancelBtn').addEventListener('click', () => {
      document.body.removeChild(overlay);
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
  }

  Object.entries(cardModuleMap).forEach(([btnId, { key, label }]) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.addEventListener('touchstart', e => {
      lpMoved = false;
      lpTimer = setTimeout(() => {
        e.preventDefault();
        const c = state.cases[state.currentCaseId];
        if (c && !moduleHasData(c, key)) { showToast(`「${label}」尚未填寫任何資料`); return; }
        showLPMenu(key, label);
      }, 500);
    }, { passive: false });

    btn.addEventListener('touchmove', () => { lpMoved = true; cancelLP(); });
    btn.addEventListener('touchend', () => { if (!lpMoved) cancelLP(); });
    btn.addEventListener('touchcancel', cancelLP);

    btn.addEventListener('mousedown', () => {
      lpMoved = false;
      lpTimer = setTimeout(() => {
        const c = state.cases[state.currentCaseId];
        if (c && !moduleHasData(c, key)) { showToast(`「${label}」尚未填寫任何資料`); return; }
        showLPMenu(key, label);
      }, 500);
    });
    btn.addEventListener('mousemove', () => { lpMoved = true; cancelLP(); });
    btn.addEventListener('mouseup', () => { if (!lpMoved) cancelLP(); });
    btn.addEventListener('mouseleave', cancelLP);
  });
})();

function saveBasicInfoField(field, value) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  if (!c.basicInfo) c.basicInfo = defaultBasicInfo();
  c.basicInfo[field] = value;
  touchCase(c.id);
  saveState();
}

// mainMenuView basic info — event delegation for basicInfo fields + tubes checkbox
document.getElementById('mainMenuView').addEventListener('change', e => {
  const t = e.target;
  const checkboxField = t.getAttribute('data-bi-checkbox');
  const exemptKey = t.getAttribute('data-exempt-device');
  if (exemptKey !== null) {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    if (!c.exemptDevices) c.exemptDevices = defaultExemptDevices();
    c.exemptDevices[exemptKey] = t.checked;
    touchCase(c.id);
    saveState();
    renderSubsidyCalc(state.currentCaseId);
    return;
  }
  if (checkboxField) {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    if (!c.basicInfo) c.basicInfo = defaultBasicInfo();
    const arr = Array.isArray(c.basicInfo[checkboxField]) ? c.basicInfo[checkboxField] : [];
    if (t.checked) { if (!arr.includes(t.value)) arr.push(t.value); }
    else { const i = arr.indexOf(t.value); if (i > -1) arr.splice(i, 1); }
    saveBasicInfoField(checkboxField, arr);
    if (checkboxField === 'tubes') {
      const showOther = arr.includes('其他');
      const el = document.getElementById('menu-sub-tubes-other');
      if (el) el.classList.toggle('visible', showOther);
    }
  }
});
document.getElementById('mainMenuView').addEventListener('input', e => {
  const t = e.target;
  const field = t.getAttribute('data-bi-field');
  if (field && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') &&
      t.type !== 'radio' && t.type !== 'checkbox') {
    saveBasicInfoField(field, t.value);
  }
});

// 補助額度／金額試算 — event delegation
(function () {
  const menu = document.getElementById('mainMenuView');
  function sc() {
    const c = state.cases[state.currentCaseId];
    if (!c) return null;
    if (!c.subsidyCalc) c.subsidyCalc = defaultSubsidyCalc();
    return c.subsidyCalc;
  }
  menu.addEventListener('click', e => {
    const econBtn = e.target.closest('[data-subsidy-econ]');
    if (econBtn) {
      const s = sc(); if (!s) return;
      s.econ = parseInt(econBtn.getAttribute('data-subsidy-econ'), 10);
      saveState();
      renderSubsidyCalc(state.currentCaseId);
      return;
    }
    const chBtn = e.target.closest('[data-subsidy-channel-btn]');
    if (chBtn && !chBtn.disabled) {
      const s = sc(); if (!s) return;
      const id = chBtn.getAttribute('data-subsidy-channel-btn');
      s.overrides = s.overrides || {};
      s.overrides[id] = Object.assign({}, s.overrides[id], { channel: chBtn.getAttribute('data-ch') });
      saveState();
      renderSubsidyCalc(state.currentCaseId);
      return;
    }
  });
  menu.addEventListener('change', e => {
    const t = e.target;
    if (t.hasAttribute && t.hasAttribute('data-subsidy-used')) {
      const s = sc(); if (!s) return;
      s.usedQuotaPrior = t.value;
      saveState();
      renderSubsidyCalc(state.currentCaseId);
      return;
    }
    const elig = t.getAttribute('data-subsidy-eligibility');
    const chId = t.getAttribute('data-subsidy-channel');
    const incId = t.getAttribute('data-subsidy-include');
    const disAmtId = t.getAttribute('data-subsidy-disamt');
    const ltcVarId = t.getAttribute('data-subsidy-ltcvar');
    const disVarId = t.getAttribute('data-subsidy-disvar');
    if (ltcVarId !== null) {
      const s = sc(); if (!s) return;
      s.overrides = s.overrides || {};
      s.overrides[ltcVarId] = Object.assign({}, s.overrides[ltcVarId], { ltcVariant: t.value });
      saveState();
      renderSubsidyCalc(state.currentCaseId);
    } else if (disVarId !== null) {
      const s = sc(); if (!s) return;
      s.overrides = s.overrides || {};
      s.overrides[disVarId] = Object.assign({}, s.overrides[disVarId], { disVariant: t.value });
      saveState();
      renderSubsidyCalc(state.currentCaseId);
    } else if (elig !== null) {
      const s = sc(); if (!s) return;
      const arr = Array.isArray(s.eligibility) ? s.eligibility : [];
      if (t.checked) { if (arr.indexOf(elig) === -1) arr.push(elig); }
      else { const i = arr.indexOf(elig); if (i > -1) arr.splice(i, 1); }
      s.eligibility = arr;
      saveState();
      renderSubsidyCalc(state.currentCaseId);
    } else if (chId !== null) {
      const s = sc(); if (!s) return;
      s.overrides = s.overrides || {};
      s.overrides[chId] = Object.assign({}, s.overrides[chId], { channel: t.value });
      saveState();
      renderSubsidyCalc(state.currentCaseId);
    } else if (disAmtId !== null) {
      const s = sc(); if (!s) return;
      s.overrides = s.overrides || {};
      s.overrides[disAmtId] = Object.assign({}, s.overrides[disAmtId], { disAmount: parseInt(t.value, 10) });
      saveState();
      renderSubsidyCalc(state.currentCaseId);
    } else if (incId !== null) {
      const s = sc(); if (!s) return;
      s.overrides = s.overrides || {};
      s.overrides[incId] = Object.assign({}, s.overrides[incId], { included: t.checked });
      saveState();
      renderSubsidyCalc(state.currentCaseId);
    }
  });
  menu.addEventListener('input', e => {
    const t = e.target;
    if (t.hasAttribute && t.hasAttribute('data-subsidy-used')) {
      const s = sc(); if (!s) return;
      s.usedQuotaPrior = t.value;
      saveState();
    }
  });
})();

// Wheelchair view event delegation
document.getElementById('wheelchairView').addEventListener('change', e => {
  const t = e.target;
  const field = t.getAttribute('data-wc-field');
  const radioField = t.getAttribute('data-wc-radio');
  const checkboxField = t.getAttribute('data-wc-checkbox');
  const boolField = t.getAttribute('data-wc-bool');
  const shoeVal = t.getAttribute('data-wc-shoe');

  if (shoeVal !== null && t.checked) {
    saveWcField('kneeToFootWithShoe', shoeVal === 'true');
  } else if (radioField === 'wcBaseType' && t.type === 'radio' && t.checked) {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    c.wheelchair.wcBaseType = t.value;
    if (t.value === 'non_light') c.wheelchair.wcAddons = [];
    else if (!Array.isArray(c.wheelchair.wcAddons) || !c.wheelchair.wcAddons.length) c.wheelchair.wcAddons = ['transfer'];
    saveState();
    renderWheelchairForm(c.id);
  } else if (radioField && t.type === 'radio' && t.checked) {
    saveWcField(radioField, t.value);
    updateWcConditional(radioField, t.value);
  } else if (checkboxField === 'wcAddons') {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    let arr = Array.isArray(c.wheelchair.wcAddons) ? c.wheelchair.wcAddons.slice() : [];
    if (t.checked) { if (!arr.includes(t.value)) arr.push(t.value); }
    else { const i = arr.indexOf(t.value); if (i > -1) arr.splice(i, 1); }
    if (!arr.includes('transfer')) arr = arr.filter(v => v === 'transfer');
    c.wheelchair.wcAddons = arr;
    saveState();
    renderWheelchairForm(c.id);
  } else if (checkboxField) {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    const arr = Array.isArray(c.wheelchair[checkboxField]) ? c.wheelchair[checkboxField] : [];
    if (t.checked) { if (!arr.includes(t.value)) arr.push(t.value); }
    else { const i = arr.indexOf(t.value); if (i > -1) arr.splice(i, 1); }
    saveWcField(checkboxField, arr);
    if (checkboxField === 'tubes') updateWcConditional('tubes', arr);
  } else if (boolField) {
    saveWcField(boolField, t.checked);
    updateWcConditional(boolField, t.checked);
  }
});

function updateWcLengthSum() {
  const c = state.cases[state.currentCaseId];
  const el = document.getElementById('wc-length-sum');
  if (!el || !c) return;
  const a = toNum(c.wheelchair.hipToKnee);
  const b = toNum(c.wheelchair.kneeToFoot);
  const cc = toNum(c.wheelchair.occipitalHeight);
  el.textContent = (a !== null && b !== null && cc !== null)
    ? Math.round((a + b + cc) * 10) / 10 : '—';
}

document.getElementById('wheelchairView').addEventListener('input', e => {
  const t = e.target;
  const field = t.getAttribute('data-wc-field');
  if (field && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') &&
      t.type !== 'radio' && t.type !== 'checkbox') {
    saveWcField(field, t.value);
    if (field === 'hipToKnee' || field === 'kneeToFoot' || field === 'occipitalHeight') {
      updateWcLengthSum();
    }
  }
});

// Shower view event delegation
document.getElementById('showerView').addEventListener('change', e => {
  const t = e.target;
  const radioField = t.getAttribute('data-sh-radio');
  const checkboxField = t.getAttribute('data-sh-checkbox');
  if (radioField === 'baseType') {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    const newVal = t.checked ? t.value : '';
    if (t.checked) {
      document.querySelectorAll(`[data-sh-radio="baseType"]`).forEach(el => { if (el !== t) el.checked = false; });
    }
    c.shower.baseType = newVal;
    touchCase(c.id); saveState(); showSaved();
    renderShowerForm(c.id);
  } else if (radioField) {
    const newVal = t.checked ? t.value : '';
    if (t.checked) {
      document.querySelectorAll(`[data-sh-radio="${radioField}"]`).forEach(el => { if (el !== t) el.checked = false; });
    }
    saveShowerField(radioField, newVal);
    updateShowerConditional(radioField, newVal);
  } else if (checkboxField) {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    const arr = Array.isArray(c.shower[checkboxField]) ? c.shower[checkboxField] : [];
    if (t.checked) { if (!arr.includes(t.value)) arr.push(t.value); }
    else { const i = arr.indexOf(t.value); if (i > -1) arr.splice(i, 1); }
    saveShowerField(checkboxField, arr);
    updateShowerConditional(checkboxField, arr);
  }
});
document.getElementById('showerView').addEventListener('input', e => {
  const t = e.target;
  const field = t.getAttribute('data-sh-field');
  if (field && t.type !== 'radio' && t.type !== 'checkbox') saveShowerField(field, t.value);
});

// Walker view event delegation
document.getElementById('walkerView').addEventListener('change', e => {
  const t = e.target;
  const radioField = t.getAttribute('data-wk-radio');
  const checkboxField = t.getAttribute('data-wk-checkbox');
  const boolField = t.getAttribute('data-wk-bool');
  if (radioField) {
    const newVal = t.checked ? t.value : '';
    if (t.checked) {
      document.querySelectorAll(`[data-wk-radio="${radioField}"]`).forEach(el => { if (el !== t) el.checked = false; });
    }
    saveWalkerField(radioField, newVal);
    updateWalkerConditional(radioField, newVal);
  } else if (checkboxField) {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    const arr = Array.isArray(c.walker[checkboxField]) ? c.walker[checkboxField] : [];
    if (t.checked) { if (!arr.includes(t.value)) arr.push(t.value); }
    else { const i = arr.indexOf(t.value); if (i > -1) arr.splice(i, 1); }
    saveWalkerField(checkboxField, arr);
  } else if (boolField) {
    saveWalkerField(boolField, t.checked);
  }
});
document.getElementById('walkerView').addEventListener('input', e => {
  const t = e.target;
  const field = t.getAttribute('data-wk-field');
  if (field && t.type !== 'radio' && t.type !== 'checkbox') saveWalkerField(field, t.value);
});

// Cushion view event delegation
document.getElementById('cushionView').addEventListener('change', e => {
  const t = e.target;
  const radioField = t.getAttribute('data-cs-radio');
  const checkboxField = t.getAttribute('data-cs-checkbox');
  if (radioField) {
    const newVal = t.checked ? t.value : '';
    if (t.checked) {
      document.querySelectorAll(`[data-cs-radio="${radioField}"]`).forEach(el => { if (el !== t) el.checked = false; });
    }
    saveCushionField(radioField, newVal);
    updateCushionConditional(radioField, newVal);
  } else if (checkboxField) {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    const arr = Array.isArray(c.cushion[checkboxField]) ? c.cushion[checkboxField] : [];
    if (t.checked) { if (!arr.includes(t.value)) arr.push(t.value); }
    else { const i = arr.indexOf(t.value); if (i > -1) arr.splice(i, 1); }
    saveCushionField(checkboxField, arr);
    updateCushionConditional(checkboxField, arr);
  }
});
document.getElementById('cushionView').addEventListener('input', e => {
  const t = e.target;
  const field = t.getAttribute('data-cs-field');
  if (field && t.type !== 'radio' && t.type !== 'checkbox') saveCushionField(field, t.value);
});

// Transfer view event delegation
document.getElementById('transferView').addEventListener('change', e => {
  const t = e.target;
  const radioField = t.getAttribute('data-tf-radio');
  const checkboxField = t.getAttribute('data-tf-checkbox');
  if (radioField) {
    const newVal = t.checked ? t.value : '';
    if (t.checked) {
      document.querySelectorAll(`[data-tf-radio="${radioField}"]`).forEach(el => { if (el !== t) el.checked = false; });
    }
    saveTransferField(radioField, newVal);
  } else if (checkboxField) {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    const arr = Array.isArray(c.transfer[checkboxField]) ? c.transfer[checkboxField] : [];
    if (t.checked) { if (!arr.includes(t.value)) arr.push(t.value); }
    else { const i = arr.indexOf(t.value); if (i > -1) arr.splice(i, 1); }
    saveTransferField(checkboxField, arr);
  }
});
document.getElementById('transferView').addEventListener('input', e => {
  const t = e.target;
  const field = t.getAttribute('data-tf-field');
  if (field && t.type !== 'radio' && t.type !== 'checkbox') saveTransferField(field, t.value);
});

// Airbed view event delegation
document.getElementById('airbedView').addEventListener('change', e => {
  const t = e.target;
  const radioField = t.getAttribute('data-ab-radio');
  const checkboxField = t.getAttribute('data-ab-checkbox');
  const boolField = t.getAttribute('data-ab-bool');
  if (radioField) {
    const newVal = t.checked ? t.value : '';
    if (t.checked) {
      document.querySelectorAll(`[data-ab-radio="${radioField}"]`).forEach(el => { if (el !== t) el.checked = false; });
    }
    saveAirbedField(radioField, newVal);
    updateAirbedConditional(radioField, newVal);
  } else if (checkboxField) {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    const arr = Array.isArray(c.airbed[checkboxField]) ? c.airbed[checkboxField] : [];
    if (t.checked) { if (!arr.includes(t.value)) arr.push(t.value); }
    else { const i = arr.indexOf(t.value); if (i > -1) arr.splice(i, 1); }
    saveAirbedField(checkboxField, arr);
    updateAirbedConditional(checkboxField, arr);
  } else if (boolField) {
    saveAirbedField(boolField, t.checked);
    updateAirbedConditional(boolField, t.checked);
  }
});
document.getElementById('airbedView').addEventListener('input', e => {
  const t = e.target;
  const field = t.getAttribute('data-ab-field');
  if (field && t.type !== 'radio' && t.type !== 'checkbox') saveAirbedField(field, t.value);
});

// Home Accessibility view event delegation
document.getElementById('homeAccessibilityView').addEventListener('change', e => {
  const t = e.target;
  const grossField = t.getAttribute('data-ha-gross');
  const fineField = t.getAttribute('data-ha-fine');
  const rowField = t.getAttribute('data-ha-row-field');

  if (grossField && t.type === 'radio' && t.checked) {
    saveHaGross(grossField, t.value);
    return;
  }
  if (fineField && t.type === 'radio' && t.checked) {
    saveHaFine(fineField, t.value);
    return;
  }
  if (t.hasAttribute('data-ha-loc')) {
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    const arr = Array.isArray(c.homeAccessibility.locations) ? c.homeAccessibility.locations : [];
    if (t.checked) { if (!arr.includes(t.value)) arr.push(t.value); }
    else { const i = arr.indexOf(t.value); if (i > -1) arr.splice(i, 1); }
    saveHaField('locations', arr);
    renderHomeAccessibilityForm(c.id);
    return;
  }
  if (rowField && t.tagName === 'SELECT') {
    const list = t.getAttribute('data-ha-row-list');
    const idx = +t.getAttribute('data-ha-row-index');
    saveHaRowField(list, idx, rowField, t.value);
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    if (rowField === 'item') {
      renderHomeAccessibilityForm(c.id);
    } else if (rowField === 'spec') {
      const row = c.homeAccessibility[list][idx];
      if (row && (row.item === 'fixed_handrail' || row.item === 'portable_ramp')) {
        renderHomeAccessibilityForm(c.id);
      } else {
        updateHaSummary();
      }
    } else {
      updateHaSummary();
    }
    return;
  }
});

document.getElementById('homeAccessibilityView').addEventListener('input', e => {
  const t = e.target;
  if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') return;
  if (t.type === 'radio' || t.type === 'checkbox') return;
  const field = t.getAttribute('data-ha-field');
  const rowField = t.getAttribute('data-ha-row-field');
  if (field) {
    saveHaField(field, t.value);
    return;
  }
  if (rowField) {
    const list = t.getAttribute('data-ha-row-list');
    const idx = +t.getAttribute('data-ha-row-index');
    saveHaRowField(list, idx, rowField, t.value);
    if (rowField === 'ramp_height_diff') {
      const suggEl = document.querySelector(`.ha-ramp-suggestion[data-ramp-sugg-idx="${idx}"]`);
      if (suggEl) {
        const hd = parseFloat(t.value);
        if (!isNaN(hd) && hd > 0) {
          suggEl.querySelector('.ha-ramp-sugg-value').textContent = `${(hd*4).toFixed(1)} ~ ${(hd*6).toFixed(1)} cm`;
          suggEl.style.display = '';
        } else {
          suggEl.style.display = 'none';
        }
      }
    }
    updateHaSummary();
  }
});

document.getElementById('homeAccessibilityView').addEventListener('click', e => {
  const addBtn     = e.target.closest('[data-ha-add-row]');
  const delBtn     = e.target.closest('[data-ha-del-row]');
  const calcBtn    = e.target.closest('[data-ha-grab-calc]');
  const applyBtn   = e.target.closest('[data-ha-grab-apply]');
  const unapplyBtn = e.target.closest('[data-ha-grab-unapply]');
  if (addBtn) {
    addHaRow(addBtn.getAttribute('data-ha-add-row'));
  } else if (delBtn) {
    removeHaRow(delBtn.getAttribute('data-ha-list'), +delBtn.getAttribute('data-ha-del-row'));
  } else if (unapplyBtn) {
    const idx = +unapplyBtn.getAttribute('data-ha-grab-unapply');
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    delete c.homeAccessibility.renovations[idx].handrail_length;
    touchCase(c.id);
    saveState();
    renderHomeAccessibilityForm(c.id);
    updateHaSummary();
  } else if (calcBtn) {
    const idx = +calcBtn.getAttribute('data-ha-grab-calc');
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    const row = c.homeAccessibility.renovations[idx];
    const w = parseFloat(row.u_width);
    const d = parseFloat(row.u_depth);
    const el = document.getElementById(`grab-calc-${idx}`);
    if (!el) return;
    if (isNaN(w) || isNaN(d)) {
      el.innerHTML = '<p class="ha-grab-no-result">請先填寫空間寬度與前後深度</p>';
      return;
    }
    el.innerHTML = renderGrabCalcResults(calcGrabBar(w, d), idx, row.handrail_length);
  } else if (applyBtn) {
    const idx   = +applyBtn.getAttribute('data-ha-grab-apply');
    const total = +applyBtn.getAttribute('data-total');
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    saveHaRowField('renovations', idx, 'handrail_length', total);
    renderHomeAccessibilityForm(c.id);
    updateHaSummary();
  }
});

document.getElementById('addStairBtn').addEventListener('click', () => addBlock('stair'));
document.getElementById('addPlatformBtn').addEventListener('click', () => addBlock('platform'));

document.getElementById('calcBtn').addEventListener('click', () => {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  renderResults(c);
});

// Title rename
// Delegated input handler for all measurement fields
const _jumpTimers = new Map();
document.getElementById('blocksContainer').addEventListener('input', e => {
  const t = e.target;
  if (t.tagName !== 'INPUT') return;
  const blockId = t.getAttribute('data-block');
  const stepId = t.getAttribute('data-step');
  const field = t.getAttribute('data-field');
  if (!blockId || !field) return;
  updateField(blockId, field, t.value, stepId);

  // 三位數警示（階高、斜邊長）
  if ((field === 'height' || field === 'slope') && stepId) {
    const num = parseFloat(t.value);
    const isWarn = !isNaN(num) && num >= 100;
    t.classList.toggle('input-warn', isWarn);
    const hint = t.closest('.field').querySelector('.warn-hint');
    if (hint) hint.classList.toggle('visible', isWarn);
  }

  // 停頓 700ms 後自動跳格（支援整數如 15 或小數如 15.5）
  if ((field === 'height' || field === 'slope') && stepId) {
    const timerKey = `${blockId}-${stepId}-${field}`;
    clearTimeout(_jumpTimers.get(timerKey));
    const val = t.value.trim();
    const isValid = val !== '' && val !== '.' && !isNaN(parseFloat(val));
    if (isValid) {
      _jumpTimers.set(timerKey, setTimeout(() => {
        _jumpTimers.delete(timerKey);
        if (field === 'height') {
          const stepRow = t.closest('.step-row');
          if (stepRow) {
            const allRows = Array.from(stepRow.parentElement.querySelectorAll('.step-row'));
            const idx = allRows.indexOf(stepRow);
            if (idx + 1 < allRows.length) {
              const nextSlope = allRows[idx + 1].querySelector('[data-field="slope"]');
              if (nextSlope) { nextSlope.focus(); nextSlope.select(); }
            } else {
              const c = state.cases[state.currentCaseId];
              if (c) {
                const block = c.blocks.find(b => b.id === blockId);
                if (block && block.type === 'stair') {
                  const newStep = { id: uid(), height: '', slope: '' };
                  block.steps.push(newStep);
                  touchCase(c.id);
                  saveState();
                  const newRow = insertStepRow(blockId, newStep, block.steps.length);
                  if (newRow) {
                    const newSlope = newRow.querySelector('[data-field="slope"]');
                    if (newSlope) { newSlope.focus(); }
                  }
                }
              }
            }
          }
        } else if (field === 'slope') {
          const stepRow = t.closest('.step-row');
          if (stepRow) {
            const allRows = Array.from(stepRow.parentElement.querySelectorAll('.step-row'));
            const isLast = allRows.indexOf(stepRow) === allRows.length - 1;
            if (isLast) {
              const c = state.cases[state.currentCaseId];
              if (c) {
                const block = c.blocks.find(b => b.id === blockId);
                if (block && block.type === 'stair') {
                  const newStep = { id: uid(), height: '', slope: '' };
                  block.steps.push(newStep);
                  touchCase(c.id);
                  saveState();
                  insertStepRow(blockId, newStep, block.steps.length);
                  const heightInput = stepRow.querySelector('[data-field="height"]');
                  if (heightInput) { heightInput.focus(); heightInput.select(); }
                }
              }
            } else {
              const heightInput = stepRow.querySelector('[data-field="height"]');
              if (heightInput) { heightInput.focus(); heightInput.select(); }
            }
          }
        }
      }, 700));
    }
  }
});

// 焦點離開樓梯區塊時，自動清除尾端完全空白的階（保留至少2階）
document.getElementById('blocksContainer').addEventListener('focusout', e => {
  const container = document.getElementById('blocksContainer');
  if (e.relatedTarget && container.contains(e.relatedTarget)) return;
  // 延遲100ms，確保自動新增階的setTimeout(50ms)先完成聚焦，再判斷是否清除
  setTimeout(() => {
    if (container.contains(document.activeElement)) return;
    const c = state.cases[state.currentCaseId];
    if (!c) return;
    c.blocks.forEach(block => {
      if (block.type !== 'stair' || block.steps.length <= 2) return;
      const last = block.steps[block.steps.length - 1];
      if (last.height === '' && last.slope === '') {
        block.steps.pop();
        touchCase(c.id);
        saveState();
        const blockEl = document.querySelector(`[data-block-id="${block.id}"]`);
        if (blockEl) {
          const rows = blockEl.querySelectorAll('.step-row');
          if (rows.length) rows[rows.length - 1].remove();
        }
      }
    });
  }, 100);
});

// Delegated click handler for block-level actions
document.getElementById('blocksContainer').addEventListener('click', e => {
  const addStepId = e.target.getAttribute('data-add-step');
  const delStepBtn = e.target.closest('[data-del-step]');
  const removeBlockId = e.target.getAttribute('data-remove-block');

  if (addStepId) {
    addStep(addStepId);
  } else if (delStepBtn) {
    const blockId = delStepBtn.getAttribute('data-block');
    const stepId = delStepBtn.getAttribute('data-step');
    removeStep(blockId, stepId);
  } else if (removeBlockId) {
    removeBlock(removeBlockId);
  }
});

// Inline results actions
document.getElementById('homeFromResultsBtn').addEventListener('click', () => {
  showList();
});
