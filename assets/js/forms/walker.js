import { state, saveState } from '../core/state.js';
import { escapeHtml, escapeAttr } from '../core/dom.js';
import { touchCase } from '../core/cases.js';
import { showSaved } from '../ui.js';

/* Rollator form
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   Walker Form
   ========================================================================== */
function renderWalkerForm(caseId) {
  const c = state.cases[caseId];
  if (!c) return;
  const wk = c.walker;

  function wkR(field, val, label) {
    return `<label class="wc-option-label"><input type="checkbox" data-wk-radio="${field}" value="${escapeAttr(val)}" ${wk[field]===val?'checked':''}> ${label}</label>`;
  }
  function wkRI(field, val, label) {
    return `<label class="wc-option-label" style="display:inline-flex;margin-right:14px;"><input type="checkbox" data-wk-radio="${field}" value="${escapeAttr(val)}" ${wk[field]===val?'checked':''}> ${label}</label>`;
  }
  function wkC(field, val, label) {
    const arr = Array.isArray(wk[field]) ? wk[field] : [];
    return `<label class="wc-option-label"><input type="checkbox" data-wk-checkbox="${field}" value="${escapeAttr(val)}" ${arr.includes(val)?'checked':''}> ${label}</label>`;
  }
  function tCell(field, val) {
    return `<td><input type="checkbox" data-wk-radio="${field}" value="${escapeAttr(val)}" ${wk[field]===val?'checked':''}></td>`;
  }

  const upperLOtherVis = wk.upperControlL === '其他' ? 'visible' : '';
  const upperROtherVis = wk.upperControlR === '其他' ? 'visible' : '';

  document.getElementById('walkerFormContainer').innerHTML = `
  <div class="wc-section">
    <h3>1. 肌肉張力</h3>
    <table class="assess-table">
      <thead><tr><th>部位</th><th>正常</th><th>低張</th><th>高張</th></tr></thead>
      <tbody>
        <tr><td>頭、頸</td>${tCell('toneHead','正常')}${tCell('toneHead','低張')}${tCell('toneHead','高張')}</tr>
        <tr><td>軀幹</td>${tCell('toneTrunk','正常')}${tCell('toneTrunk','低張')}${tCell('toneTrunk','高張')}</tr>
        <tr><td>左上肢</td>${tCell('toneLeftUpper','正常')}${tCell('toneLeftUpper','低張')}${tCell('toneLeftUpper','高張')}</tr>
        <tr><td>右上肢</td>${tCell('toneRightUpper','正常')}${tCell('toneRightUpper','低張')}${tCell('toneRightUpper','高張')}</tr>
        <tr><td>左下肢</td>${tCell('toneLeftLower','正常')}${tCell('toneLeftLower','低張')}${tCell('toneLeftLower','高張')}</tr>
        <tr><td>右下肢</td>${tCell('toneRightLower','正常')}${tCell('toneRightLower','低張')}${tCell('toneRightLower','高張')}</tr>
      </tbody>
    </table>
  </div>

  <div class="wc-section">
    <h3>2. 關節活動度</h3>
    <table class="assess-table">
      <thead><tr><th>關節</th><th>左：正常</th><th>左：緊</th><th>左：受限</th><th>右：正常</th><th>右：緊</th><th>右：受限</th></tr></thead>
      <tbody>
        <tr><td>肩關節</td>${tCell('romShoulderL','正常')}${tCell('romShoulderL','緊')}${tCell('romShoulderL','受限')}${tCell('romShoulderR','正常')}${tCell('romShoulderR','緊')}${tCell('romShoulderR','受限')}</tr>
        <tr><td>肘關節</td>${tCell('romElbowL','正常')}${tCell('romElbowL','緊')}${tCell('romElbowL','受限')}${tCell('romElbowR','正常')}${tCell('romElbowR','緊')}${tCell('romElbowR','受限')}</tr>
        <tr><td>腕關節</td>${tCell('romWristL','正常')}${tCell('romWristL','緊')}${tCell('romWristL','受限')}${tCell('romWristR','正常')}${tCell('romWristR','緊')}${tCell('romWristR','受限')}</tr>
      </tbody>
    </table>
  </div>

  <div class="wc-section">
    <h3>3. 上肢動作控制</h3>
    <div class="wc-field">
      <label class="wc-label">左上肢</label>
      <div class="wc-options">
        ${wkR('upperControlL','正常','正常')}
        ${wkR('upperControlL','尚可','尚可')}
        ${wkR('upperControlL','不正常協同動作','不正常協同動作')}
        ${wkR('upperControlL','不自主動作','不自主動作')}
        ${wkR('upperControlL','其他','其他')}
      </div>
      <div class="wc-sub-fields ${upperLOtherVis}" id="wk-sub-upperL-other">
        <div class="wc-field">
          <label class="wc-label">其他（說明）</label>
          <input type="text" class="wc-input" data-wk-field="upperControlLOther" value="${escapeAttr(wk.upperControlLOther)}" placeholder="填寫文字">
        </div>
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">右上肢</label>
      <div class="wc-options">
        ${wkR('upperControlR','正常','正常')}
        ${wkR('upperControlR','尚可','尚可')}
        ${wkR('upperControlR','不正常協同動作','不正常協同動作')}
        ${wkR('upperControlR','不自主動作','不自主動作')}
        ${wkR('upperControlR','其他','其他')}
      </div>
      <div class="wc-sub-fields ${upperROtherVis}" id="wk-sub-upperR-other">
        <div class="wc-field">
          <label class="wc-label">其他（說明）</label>
          <input type="text" class="wc-input" data-wk-field="upperControlROther" value="${escapeAttr(wk.upperControlROther)}" placeholder="填寫文字">
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>4. 坐姿平衡</h3>
    <div class="wc-field">
      <label class="wc-label">基礎平衡能力</label>
      <div class="wc-options">
        ${wkR('sittingBalance','良好','良好')}
        ${wkR('sittingBalance','雙手扶持尚可維持平衡','雙手扶持尚可維持平衡')}
        ${wkR('sittingBalance','雙手扶持難以維持平衡','雙手扶持難以維持平衡')}
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">傾倒方向（未扶持情況下，可複選）</label>
      <div class="wc-inline-options">
        ${wkC('sittingFalling','左側','左側')}
        ${wkC('sittingFalling','右側','右側')}
        ${wkC('sittingFalling','前方','前方')}
        ${wkC('sittingFalling','後方','後方')}
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>5. 坐到站</h3>
    <div class="wc-options">
      ${wkR('sitToStand','不用手即可站起','不用手即可站起')}
      ${wkR('sitToStand','用手協助站起','用手協助站起')}
      ${wkR('sitToStand','沒有協助無法站起','沒有協助無法站起')}
    </div>
  </div>

  <div class="wc-section">
    <h3>6. 下肢承重能力</h3>
    <table class="assess-table">
      <thead><tr><th>側別</th><th>全部體重</th><th>大於 50%</th><th>小於 50%</th><th>無法承重</th></tr></thead>
      <tbody>
        <tr><td>左側</td>${tCell('weightBearingL','全部體重')}${tCell('weightBearingL','大於50%')}${tCell('weightBearingL','小於50%')}${tCell('weightBearingL','無法承重')}</tr>
        <tr><td>右側</td>${tCell('weightBearingR','全部體重')}${tCell('weightBearingR','大於50%')}${tCell('weightBearingR','小於50%')}${tCell('weightBearingR','無法承重')}</tr>
      </tbody>
    </table>
  </div>

  <div class="wc-section">
    <h3>7. 站姿平衡</h3>
    <div class="wc-options">
      ${wkR('standingBalance','放手能維持站姿','放手能維持站姿')}
      ${wkR('standingBalance','扶持穩定物才能維持站姿','扶持穩定物才能維持站姿')}
      ${wkR('standingBalance','無法自行維持站姿','無法自行維持站姿')}
    </div>
  </div>

  <div class="wc-section">
    <h3>8. 上下樓梯／平地行走能力</h3>
    <div class="wc-options">
      ${wkR('walkingAbility','不需扶持扶手就可以上下樓梯','不需扶持扶手就可以上下樓梯')}
      ${wkR('walkingAbility','室內平地能放手行走 / 扶持扶手即可自行上下樓梯','室內平地能放手行走 / 扶持扶手即可自行上下樓梯')}
      ${wkR('walkingAbility','室內平地需要扶持穩定物 (如助行器) 或照顧者協助才能行走','室內平地需要扶持穩定物 (如助行器) 或照顧者協助才能行走')}
      ${wkR('walkingAbility','無法行走','無法行走')}
    </div>
  </div>

  <div class="wc-section">
    <h3>9. 量測</h3>
    <div class="wc-field">
      <label class="wc-label">站立手握持高度（約站立時手腕線高度）</label>
      <div class="wc-num-wrap">
        <input type="number" inputmode="decimal" step="0.1" class="wc-num-input"
               data-wk-field="handleHeight" value="${escapeAttr(wk.handleHeight)}" placeholder="—">
        <span class="unit">cm</span>
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">座面高度約</label>
      <div class="wc-num-wrap">
        <input type="number" inputmode="decimal" step="0.1" class="wc-num-input"
               data-wk-field="seatHeight" value="${escapeAttr(wk.seatHeight)}" placeholder="—">
        <span class="unit">cm</span>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>10. 評估結果</h3>
    <div class="wc-options">
      <label class="wc-option-label">
        <input type="checkbox" data-wk-bool="walkerResult" ${wk.walkerResult?'checked':''}> 帶輪型助步車
      </label>
    </div>
  </div>

  <div class="clear-module-section">
    <button class="clear-module-btn" data-clear-module="walker">清除此評估的所有資料</button>
  </div>
  `;
}

function saveWalkerField(field, value) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  c.walker[field] = value;
  touchCase(c.id); saveState(); showSaved();
}

function updateWalkerConditional(field, value) {
  if (field === 'upperControlL') {
    const el = document.getElementById('wk-sub-upperL-other');
    if (el) el.classList.toggle('visible', value === '其他');
  } else if (field === 'upperControlR') {
    const el = document.getElementById('wk-sub-upperR-other');
    if (el) el.classList.toggle('visible', value === '其他');
  }
}

export { renderWalkerForm, saveWalkerField, updateWalkerConditional };
