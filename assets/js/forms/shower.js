import { state, saveState, SHOWER_ADDON_OPTIONS } from '../core/state.js';
import { escapeHtml, escapeAttr } from '../core/dom.js';
import { touchCase } from '../core/cases.js';
import { showSaved } from '../ui.js';

/* Shower and commode-chair form
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   Shower / Commode Form
   ========================================================================== */
function renderShowerForm(caseId) {
  const c = state.cases[caseId];
  if (!c) return;
  const sh = c.shower;

  function shR(field, val, label) {
    return `<label class="wc-option-label"><input type="checkbox" data-sh-radio="${field}" value="${escapeAttr(val)}" ${sh[field]===val?'checked':''}> ${label}</label>`;
  }
  function shRI(field, val, label) {
    return `<label class="wc-option-label" style="display:inline-flex;margin-right:14px;"><input type="checkbox" data-sh-radio="${field}" value="${escapeAttr(val)}" ${sh[field]===val?'checked':''}> ${label}</label>`;
  }
  function shC(field, val, label) {
    const arr = Array.isArray(sh[field]) ? sh[field] : [];
    return `<label class="wc-option-label"><input type="checkbox" data-sh-checkbox="${field}" value="${escapeAttr(val)}" ${arr.includes(val)?'checked':''}> ${label}</label>`;
  }
  function shResultR(field, val, label) {
    const id = `sh-result-${field}-${val}`;
    return `<label class="wc-option-label" for="${id}"><input type="radio" id="${id}" name="sh_${field}" data-sh-radio="${field}" value="${escapeAttr(val)}" ${sh[field]===val?'checked':''}> ${label}</label>`;
  }

  const spineOtherVis = Array.isArray(sh.spine) && sh.spine.includes('其他變形') ? 'visible' : '';
  const hipOtherVis   = sh.hip   === '其他' ? 'visible' : '';
  const kneeOtherVis  = sh.knee  === '其他' ? 'visible' : '';

  document.getElementById('showerFormContainer').innerHTML = `
  <div class="wc-section">
    <h3>建議輔具</h3>
    <div class="wc-field">
      <label class="wc-label">基本型（單選）</label>
      <div class="wc-options">
        ${shResultR('baseType','shower','沐浴椅')}
        ${shResultR('baseType','commode','便盆椅')}
      </div>
    </div>
    <div class="wc-field${sh.baseType ? '' : ' wc-field-disabled'}">
      <label class="wc-label">附加功能（需要的項目逐項勾選）</label>
      <div class="wc-options">
        ${SHOWER_ADDON_OPTIONS.map(([value, label]) => `<label class="wc-option-label"><input type="checkbox" data-sh-checkbox="addons" value="${value}" ${!sh.baseType ? 'disabled' : ''} ${Array.isArray(sh.addons) && sh.addons.includes(value) ? 'checked' : ''}> ${label}</label>`).join('')}
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">其他品項（可複選）</label>
      <div class="wc-options">
        ${shC('subsidyItems','項次163','項次163 移動式身體清洗槽－局部型')}
        ${shC('subsidyItems','項次164','項次164 移動式身體清洗槽－全身型')}
        ${shC('subsidyItems','項次166','項次166 馬桶增高器')}
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>1. 評估項目</h3>

    <div class="wc-field">
      <label class="wc-label">臀寬約</label>
      <div class="wc-num-wrap">
        <input type="number" inputmode="decimal" step="0.1" class="wc-num-input"
               data-sh-field="hipWidth" value="${escapeAttr(sh.hipWidth)}" placeholder="—">
        <span class="unit">cm</span>
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">骨盆（可複選）</label>
      <div class="wc-options">
        ${shC('pelvis','正常','正常')}
        ${shC('pelvis','向前/後傾','向前/後傾')}
        ${shC('pelvis','向左/右傾斜','向左/右傾斜')}
        ${shC('pelvis','向左/右旋轉','向左/右旋轉')}
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">坐姿時骨盆經常</label>
      <div class="wc-options">
        ${shC('pelvisSlide','向前滑動','向前滑動')}
        ${shC('pelvisSlide','向後滑動','向後滑動')}
        ${shC('pelvisSlide','向左滑動','向左滑動')}
        ${shC('pelvisSlide','向右滑動','向右滑動')}
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">脊柱（可複選）</label>
      <div class="wc-options">
        ${shC('spine','正常或無明顯變形','正常或無明顯變形')}
        ${shC('spine','脊柱側彎','脊柱側彎')}
        ${shC('spine','過度前凸 (hyperlordosis)','過度前凸 (hyperlordosis)')}
        ${shC('spine','過度後凸 (hyperkyphosis)','過度後凸 (hyperkyphosis)')}
        ${shC('spine','其他變形','其他變形')}
      </div>
      <div class="wc-sub-fields ${spineOtherVis}" id="sh-sub-spineOther">
        <div class="wc-field">
          <label class="wc-label">其他（說明）</label>
          <input type="text" class="wc-input" data-sh-field="spineOther" value="${escapeAttr(sh.spineOther)}" placeholder="填寫文字">
        </div>
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">髖部</label>
      <div class="wc-options">
        ${shR('hip','正常','正常')}
        ${shR('hip','內收變形','內收變形')}
        ${shR('hip','外展變形','外展變形')}
        ${shR('hip','風吹式變形','風吹式變形')}
        ${shR('hip','其他','其他')}
      </div>
      <div class="wc-sub-fields ${hipOtherVis}" id="sh-sub-hipOther">
        <div class="wc-field">
          <label class="wc-label">其他（說明）</label>
          <input type="text" class="wc-input" data-sh-field="hipOther" value="${escapeAttr(sh.hipOther)}" placeholder="填寫文字">
        </div>
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">膝部</label>
      <div class="wc-options">
        ${shR('knee','正常','正常')}
        ${shR('knee','屈曲變形','屈曲變形')}
        ${shR('knee','伸直變形','伸直變形')}
        ${shR('knee','其他','其他')}
      </div>
      <div class="wc-sub-fields ${kneeOtherVis}" id="sh-sub-kneeOther">
        <div class="wc-field">
          <label class="wc-label">其他（說明）</label>
          <input type="text" class="wc-input" data-sh-field="kneeOther" value="${escapeAttr(sh.kneeOther)}" placeholder="填寫文字">
        </div>
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">頭部控制</label>
      <div class="wc-options">
        ${shR('headControl','正常','正常')}
        ${shR('headControl','偶可維持頭部正中位置但控制不佳或耐力不足','偶可維持頭部正中位置但控制不佳或耐力不足')}
        ${shR('headControl','完全無法控制','完全無法控制')}
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">坐姿平衡</label>
      <div class="wc-options">
        ${shR('sittingBalance','良好','良好')}
        ${shR('sittingBalance','雙手扶持尚可維持平衡','雙手扶持尚可維持平衡')}
        ${shR('sittingBalance','雙手扶持難以維持平衡','雙手扶持難以維持平衡')}
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">在未扶持情況下，身體明顯會倒向（可複選）</label>
      <div class="wc-inline-options">
        ${shC('fallingDirection','左側','左側')}
        ${shC('fallingDirection','右側','右側')}
        ${shC('fallingDirection','前方','前方')}
        ${shC('fallingDirection','後方','後方')}
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">如廁沐浴困難（可複選）</label>
      <div class="wc-options">
        ${shC('bathroomDifficulty','浴廁內移動、操作有跌倒疑慮','浴廁內移動、操作有跌倒疑慮')}
        ${shC('bathroomDifficulty','無法及時步行到達浴廁，如廁常來不及','無法及時步行到達浴廁，如廁常來不及')}
        ${shC('bathroomDifficulty','步行至浴廁有安全疑慮','步行至浴廁有安全疑慮')}
        ${shC('bathroomDifficulty','無法步行至浴廁','無法步行至浴廁')}
        ${shC('bathroomDifficulty','無法以下肢承重轉位','無法以下肢承重轉位')}
      </div>
    </div>
  </div>

  <div class="clear-module-section">
    <button class="clear-module-btn" data-clear-module="shower">清除此評估的所有資料</button>
  </div>
  `;
}

function saveShowerField(field, value) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  c.shower[field] = value;
  touchCase(c.id); saveState(); showSaved();
}

function updateShowerConditional(field, value) {
  if (field === 'spine') {
    const el = document.getElementById('sh-sub-spineOther');
    if (el) el.classList.toggle('visible', Array.isArray(value) ? value.includes('其他變形') : false);
  } else if (field === 'hip') {
    const el = document.getElementById('sh-sub-hipOther');
    if (el) el.classList.toggle('visible', value === '其他');
  } else if (field === 'knee') {
    const el = document.getElementById('sh-sub-kneeOther');
    if (el) el.classList.toggle('visible', value === '其他');
  }
}

export { renderShowerForm, saveShowerField, updateShowerConditional };
