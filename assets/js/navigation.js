import { state, defaultBasicInfo, defaultExemptDevices, setBackFn } from './core/state.js';
import { escapeHtml, escapeAttr, domIdToken } from './core/dom.js';
import { renderList } from './views/case-list.js';
import { renderEditor } from './forms/stair.js';
import { renderWheelchairForm } from './forms/wheelchair.js';
import { renderCushionForm } from './forms/cushion.js';
import { renderTransferForm } from './forms/transfer.js';
import { renderShowerForm } from './forms/shower.js';
import { renderWalkerForm } from './forms/walker.js';
import { renderAirbedForm } from './forms/airbed.js';
import { renderHomeAccessibilityForm } from './forms/home-accessibility.js';
import { renderSubsidyCalc } from './calculations/subsidy.js';
import { renderBackupPanel } from './backup/backup.js';

/* View navigation and main-menu basic information
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   Navigation
   ========================================================================== */
function hideAllViews() {
  ['mainMenuView', 'listView', 'editorView', 'wheelchairView', 'cushionView', 'showerView', 'walkerView', 'transferView', 'airbedView', 'homeAccessibilityView'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('settingsBtn').style.display = 'none';
  document.getElementById('editCaseNameBtn').style.display = 'none';
  ['settingsDialog', 'backupDialog', 'versionDialog'].forEach(id => {
    const dialog = document.getElementById(id);
    if (dialog.open) dialog.close();
  });
}

function showMainMenu(caseId) {
  if (caseId) state.currentCaseId = caseId;
  hideAllViews();
  document.getElementById('mainMenuView').style.display = '';
  document.getElementById('backBtn').style.display = '';
  const c = state.cases[state.currentCaseId];
  document.getElementById('headerTitle').textContent = c ? c.name : '輔具評估系統';
  const editCaseNameBtn = document.getElementById('editCaseNameBtn');
  editCaseNameBtn.style.display = c ? '' : 'none';
  editCaseNameBtn.setAttribute('aria-label', c ? `修改個案名稱：${c.name}` : '修改個案名稱');
  document.getElementById('subtitle').textContent = '請選擇評估項目';
  setBackFn(showList);
  renderMenuBasicInfo();
  renderSubsidyCalc(state.currentCaseId);
}

const EXEMPT_DEVICE_OPTIONS = [
  ['cane', '單支拐杖'],
  ['walker', '助行器'],
  ['toiletRiser', '馬桶增高器'],
  ['commode', '便盆椅'],
  ['showerChair', '沐浴椅'],
  ['wheelchairLight', '輕量化輪椅']
];

function biC(fieldName, value, label, bi) {
  const checked = Array.isArray(bi[fieldName]) && bi[fieldName].includes(value) ? 'checked' : '';
  const id = `bi_${fieldName}_${domIdToken(value)}`;
  return `<label class="wc-inline-option" for="${id}">
    <input type="checkbox" id="${id}" data-bi-checkbox="${fieldName}" value="${escapeAttr(value)}" ${checked}>
    <span class="wc-inline-option-text">${escapeHtml(label)}</span>
  </label>`;
}
function biNum(fieldName, label, unit, bi) {
  return `<div class="wc-field">
    <label class="wc-label">${label}</label>
    <div class="wc-num-wrap">
      <input type="number" inputmode="decimal" step="0.1" min="0" class="wc-num-input"
             data-bi-field="${fieldName}" value="${escapeAttr(bi[fieldName])}" placeholder="—">
      <span class="unit">${unit}</span>
    </div>
  </div>`;
}

function renderMenuBasicInfo() {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  if (!c.basicInfo) c.basicInfo = defaultBasicInfo();
  const bi = c.basicInfo;
  const ex = c.exemptDevices || defaultExemptDevices();
  const tubesOptions = ['無','氣切管','鼻胃管','尿管','胃造口','腸造口','膀胱造','其他'];
  const tubesHtml = tubesOptions.map(t => biC('tubes', t, t, bi)).join('');
  const tubesOtherVisible = Array.isArray(bi.tubes) && bi.tubes.includes('其他') ? 'visible' : '';
  const exemptHtml = EXEMPT_DEVICE_OPTIONS.map(([key, label]) => {
    const checked = ex[key] ? 'checked' : '';
    const id = `menu_exempt_${key}`;
    return `<label class="wc-inline-option" for="${id}">
      <input type="checkbox" id="${id}" data-exempt-device="${key}" ${checked}>
      <span class="wc-inline-option-text">${escapeHtml(label)}</span>
    </label>`;
  }).join('');
  document.getElementById('menuBasicInfo').innerHTML = `
    <div class="wc-section" style="margin-top:4px;">
      <h3>基本資料</h3>
      <div class="wc-two-col">
        ${biNum('height','身高','cm',bi)}
        ${biNum('weight','體重','kg',bi)}
      </div>
      <div class="wc-field">
        <label class="wc-label">過去病史</label>
        <textarea class="wc-textarea" data-bi-field="medicalHistory" placeholder="填寫文字">${escapeHtml(bi.medicalHistory)}</textarea>
      </div>
      <div class="wc-field">
        <label class="wc-label">管路／造口（可複選）</label>
        <div class="wc-inline-options">${tubesHtml}</div>
        <div class="wc-sub-fields ${tubesOtherVisible}" id="menu-sub-tubes-other">
          <div class="wc-field">
            <label class="wc-label">其他（說明）</label>
            <input type="text" class="wc-input" data-bi-field="tubesOther" value="${escapeAttr(bi.tubesOther)}" placeholder="填寫文字">
          </div>
        </div>
      </div>
      <div class="wc-field">
        <label class="wc-label">免評估項目（可複選）</label>
        <div class="wc-inline-options">${exemptHtml}</div>
        <div class="wc-hint">勾選後自動納入下方補助試算；款式與採用管道請於試算表中選擇。附加功能輔具（如可仰躺沐浴椅、移位輪椅等）請至對應模組評估。</div>
      </div>
      <div class="wc-field">
        <label class="wc-label">備註</label>
        <textarea class="wc-textarea" data-bi-field="notes" placeholder="填寫備註">${escapeHtml(bi.notes || '')}</textarea>
      </div>
    </div>
  `;
}

function showList() {
  state.currentCaseId = null;
  hideAllViews();
  document.getElementById('listView').style.display = '';
  document.getElementById('backBtn').style.display = 'none';
  document.getElementById('settingsBtn').style.display = '';
  document.getElementById('headerTitle').textContent = '輔具評估系統';
  document.getElementById('subtitle').textContent = '個案清單';
  setBackFn(null);
  renderBackupPanel();
  renderList();
}

function showEditor(caseId) {
  if (!state.cases[caseId]) return;
  state.currentCaseId = caseId;
  hideAllViews();
  document.getElementById('editorView').style.display = '';
  document.getElementById('inlineResults').style.display = 'none';
  document.getElementById('backBtn').style.display = '';
  document.getElementById('headerTitle').textContent = '爬梯機評估';
  document.getElementById('subtitle').textContent = state.cases[caseId].name;
  setBackFn(() => showMainMenu(state.currentCaseId));
  renderEditor();
  window.scrollTo(0, 0);
}

function showWheelchair(caseId) {
  if (!state.cases[caseId]) return;
  state.currentCaseId = caseId;
  hideAllViews();
  document.getElementById('wheelchairView').style.display = '';
  document.getElementById('backBtn').style.display = '';
  document.getElementById('headerTitle').textContent = '輪椅評估';
  document.getElementById('subtitle').textContent = state.cases[caseId].name;
  setBackFn(() => showMainMenu(state.currentCaseId));
  renderWheelchairForm(caseId);
  window.scrollTo(0, 0);
}

function showCushion(caseId) {
  if (!state.cases[caseId]) return;
  state.currentCaseId = caseId;
  hideAllViews();
  document.getElementById('cushionView').style.display = '';
  document.getElementById('backBtn').style.display = '';
  document.getElementById('headerTitle').textContent = '輪椅座墊評估';
  document.getElementById('subtitle').textContent = state.cases[caseId].name;
  setBackFn(() => showMainMenu(state.currentCaseId));
  renderCushionForm(caseId);
  window.scrollTo(0, 0);
}

function showTransfer(caseId) {
  if (!state.cases[caseId]) return;
  state.currentCaseId = caseId;
  hideAllViews();
  document.getElementById('transferView').style.display = '';
  document.getElementById('backBtn').style.display = '';
  document.getElementById('headerTitle').textContent = '移位輔具評估';
  document.getElementById('subtitle').textContent = state.cases[caseId].name;
  setBackFn(() => showMainMenu(state.currentCaseId));
  renderTransferForm(caseId);
  window.scrollTo(0, 0);
}

function showShower(caseId) {
  if (!state.cases[caseId]) return;
  state.currentCaseId = caseId;
  hideAllViews();
  document.getElementById('showerView').style.display = '';
  document.getElementById('backBtn').style.display = '';
  document.getElementById('headerTitle').textContent = '沐浴椅／便盆椅評估';
  document.getElementById('subtitle').textContent = state.cases[caseId].name;
  setBackFn(() => showMainMenu(state.currentCaseId));
  renderShowerForm(caseId);
  window.scrollTo(0, 0);
}

function showWalker(caseId) {
  if (!state.cases[caseId]) return;
  state.currentCaseId = caseId;
  hideAllViews();
  document.getElementById('walkerView').style.display = '';
  document.getElementById('backBtn').style.display = '';
  document.getElementById('headerTitle').textContent = '帶輪型助步車評估';
  document.getElementById('subtitle').textContent = state.cases[caseId].name;
  setBackFn(() => showMainMenu(state.currentCaseId));
  renderWalkerForm(caseId);
  window.scrollTo(0, 0);
}

function showAirbed(caseId) {
  if (!state.cases[caseId]) return;
  state.currentCaseId = caseId;
  hideAllViews();
  document.getElementById('airbedView').style.display = '';
  document.getElementById('backBtn').style.display = '';
  document.getElementById('headerTitle').textContent = '氣墊床／電動床評估';
  document.getElementById('subtitle').textContent = state.cases[caseId].name;
  setBackFn(() => showMainMenu(state.currentCaseId));
  renderAirbedForm(caseId);
  window.scrollTo(0, 0);
}

function showHomeAccessibility(caseId) {
  if (!state.cases[caseId]) return;
  state.currentCaseId = caseId;
  hideAllViews();
  document.getElementById('homeAccessibilityView').style.display = '';
  document.getElementById('backBtn').style.display = '';
  document.getElementById('headerTitle').textContent = '居家無障礙評估';
  document.getElementById('subtitle').textContent = state.cases[caseId].name;
  setBackFn(() => showMainMenu(state.currentCaseId));
  renderHomeAccessibilityForm(caseId);
  window.scrollTo(0, 0);
}

export {
  hideAllViews, showMainMenu, EXEMPT_DEVICE_OPTIONS, biC, biNum,
  renderMenuBasicInfo, showList, showEditor, showWheelchair, showCushion,
  showTransfer, showShower, showWalker, showAirbed, showHomeAccessibility
};
