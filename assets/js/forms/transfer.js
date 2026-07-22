import { state, saveState } from '../core/state.js';
import { escapeHtml, escapeAttr } from '../core/dom.js';
import { touchCase } from '../core/cases.js';
import { showSaved } from '../ui.js';

/* Transfer-aid form
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
function saveTransferField(field, value) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  c.transfer[field] = value;
  touchCase(c.id); saveState(); showSaved();
}

function renderTransferForm(caseId) {
  const c = state.cases[caseId];
  if (!c) return;
  const tf = c.transfer;

  function tfR(field, val, label) {
    return `<label class="wc-option-label"><input type="checkbox" data-tf-radio="${field}" value="${escapeAttr(val)}" ${tf[field]===val?'checked':''}> ${label}</label>`;
  }
  function tfRI(field, val, label) {
    return `<label class="wc-option-label" style="display:inline-flex;margin-right:14px;"><input type="checkbox" data-tf-radio="${field}" value="${escapeAttr(val)}" ${tf[field]===val?'checked':''}> ${label}</label>`;
  }
  function tfC(field, val, label) {
    const arr = Array.isArray(tf[field]) ? tf[field] : [];
    return `<label class="wc-option-label"><input type="checkbox" data-tf-checkbox="${field}" value="${escapeAttr(val)}" ${arr.includes(val)?'checked':''}> ${label}</label>`;
  }

  document.getElementById('transferFormContainer').innerHTML = `
  <div class="wc-section">
    <h3>建議輔具</h3>
    <div class="wc-options">
      ${tfC('resultItems','移位腰帶','移位腰帶')}
      ${tfC('resultItems','移位轉盤','移位轉盤')}
      ${tfC('resultItems','移位板','移位板')}
      ${tfC('resultItems','人力移位吊帶','人力移位吊帶')}
      ${tfC('resultItems','移位滑布','移位滑布')}
      ${tfC('resultItems','躺式移位滑墊','躺式移位滑墊')}
      ${tfC('resultItems','移位機-人力型','移位機－人力型')}
      ${tfC('resultItems','移位機-電動型','移位機－電動型')}
      ${tfC('resultItems','移位機吊帶','移位機吊帶')}
    </div>
  </div>

  <div class="wc-section">
    <h3>1. 評估項目</h3>

    <div class="wc-field">
      <label class="wc-label">腰圍約</label>
      <div class="wc-num-wrap">
        <input type="number" inputmode="decimal" step="0.1" class="wc-num-input"
               data-tf-field="waist" value="${escapeAttr(tf.waist)}" placeholder="—">
        <span class="unit">cm</span>
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">坐姿平衡能力</label>
      <div class="two-col-options">
        <div class="col">
          ${tfR('sittingBalance','independent','放手且獨立坐')}
          ${tfR('sittingBalance','shift_with_support','抓握扶持下可重心轉移')}
          ${tfR('sittingBalance','hold_with_support','抓握扶持下僅可維持')}
        </div>
        <div class="col">
          ${tfR('sittingBalance','needs_assistance','需他人協助維持')}
          ${tfR('sittingBalance','fully_dependent','完全依賴')}
        </div>
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">坐姿站起能力</label>
      <div class="two-col-options">
        <div class="col">
          ${tfR('sitToStand','independent','可獨立自行站起')}
          ${tfR('sitToStand','min_assist','輕度協助可站起')}
          ${tfR('sitToStand','mod_assist','中度協助可站起')}
        </div>
        <div class="col">
          ${tfR('sitToStand','max_assist','重度協助可站起')}
          ${tfR('sitToStand','unable','無法站起')}
        </div>
      </div>
    </div>
  </div>

  <div class="clear-module-section">
    <button class="clear-module-btn" data-clear-module="transfer">清除此評估的所有資料</button>
  </div>`;
}

export { saveTransferField, renderTransferForm };
