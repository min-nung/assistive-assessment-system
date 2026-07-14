import { state, saveState } from '../core/state.js';
import { escapeHtml, escapeAttr } from '../core/dom.js';
import { touchCase } from '../core/cases.js';
import { showSaved } from '../ui.js';

/* Air mattress and electric-bed form
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
function saveAirbedField(field, value) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  c.airbed[field] = value;
  touchCase(c.id); saveState(); showSaved();
}

function updateAirbedConditional(field, value) {
  const show = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('visible', !!visible);
  };
  if (field === 'bedFrameType') {
    show('ab-sub-bedFrameOther', value === 'other');
  } else if (field === 'consciousness') {
    show('ab-sub-consciousnessOther', value === 'other');
  } else if (field === 'cognitiveFunction') {
    show('ab-sub-cogFuncOther', value === 'other');
  } else if (field === 'skinSensation') {
    show('ab-sub-skinAbnormal', value === 'abnormal');
    show('ab-sub-skinLost', value === 'lost');
    show('ab-sub-skinUnable', value === 'unable');
  } else if (field === 'rom') {
    show('ab-sub-romLimited', value === 'limited');
  } else if (field === 'romLimitedJoints') {
    const arr = Array.isArray(value) ? value : [];
    show('ab-sub-romOther', arr.includes('other'));
  } else if (field === 'staticBalance') {
    show('ab-sub-staticDir', value !== '' && value !== 'good');
  } else if (field === 'dynamicBalance') {
    show('ab-sub-dynamicDir', value === 'poor');
  } else if (field === 'spaceLimited') {
    show('ab-sub-spaceLimited', !!value);
  } else if (field === 'pressureInjuryRisk') {
    const arr = Array.isArray(value) ? value : [];
    show('ab-sub-riskOther', arr.includes('other'));
  } else if (field === 'pressureInjuryStatus') {
    show('ab-sub-piHistory', value === 'history');
    show('ab-sub-piCurrent', value === 'current');
  }
}

function renderAirbedForm(caseId) {
  const c = state.cases[caseId];
  if (!c) return;
  const ab = c.airbed;

  function abR(field, val, label) {
    return `<label class="wc-option-label"><input type="checkbox" data-ab-radio="${field}" value="${escapeAttr(val)}" ${ab[field]===val?'checked':''}> ${label}</label>`;
  }
  function abRI(field, val, label) {
    return `<label class="wc-option-label" style="display:inline-flex;margin-right:14px;"><input type="checkbox" data-ab-radio="${field}" value="${escapeAttr(val)}" ${ab[field]===val?'checked':''}> ${label}</label>`;
  }
  function abC(field, val, label) {
    const arr = Array.isArray(ab[field]) ? ab[field] : [];
    return `<label class="wc-option-label"><input type="checkbox" data-ab-checkbox="${field}" value="${escapeAttr(val)}" ${arr.includes(val)?'checked':''}> ${label}</label>`;
  }
  function abCI(field, val, label) {
    const arr = Array.isArray(ab[field]) ? ab[field] : [];
    return `<label class="wc-option-label" style="display:inline-flex;margin-right:14px;"><input type="checkbox" data-ab-checkbox="${field}" value="${escapeAttr(val)}" ${arr.includes(val)?'checked':''}> ${label}</label>`;
  }
  function abNum(field, label, unit) {
    return `<div class="wc-field">
      <label class="wc-label">${label}</label>
      <div class="wc-num-wrap">
        <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-ab-field="${field}" value="${escapeAttr(ab[field])}" placeholder="—">
        <span class="unit">${unit}</span>
      </div>
    </div>`;
  }

  const risk = Array.isArray(ab.pressureInjuryRisk) ? ab.pressureInjuryRisk : [];
  const romJoints = Array.isArray(ab.romLimitedJoints) ? ab.romLimitedJoints : [];
  const vis = (cond) => cond ? 'visible' : '';

  document.getElementById('airbedFormContainer').innerHTML = `
  <div class="wc-section">
    <h3>1. 目前使用的床墊</h3>
    <div class="wc-field">
      <label class="wc-label">1-1 床墊種類</label>
      <div class="wc-options">
        ${abR('mattressType','spring','彈簧床墊')}
        ${abR('mattressType','foam','泡棉減壓床墊')}
        ${abR('mattressType','latex','乳膠床墊')}
        ${abR('mattressType','solid_gel','固態凝膠床墊')}
        ${abR('mattressType','air','氣墊床')}
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">1-2 床墊高度</label>
      <div class="wc-num-wrap">
        <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-ab-field="mattressHeight" value="${escapeAttr(ab.mattressHeight)}" placeholder="—">
        <span class="unit">cm</span>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>2. 目前使用的床架</h3>
    <div class="wc-field">
      <label class="wc-label">2-1 輔具種類</label>
      <div class="wc-options">
        ${abR('bedFrameType','floor','和式地板（無床架）')}
        ${abR('bedFrameType','general','一般市售床')}
        ${abR('bedFrameType','manual_care','手動居家用照顧床')}
        ${abR('bedFrameType','electric_care','電動居家用照顧床')}
        ${abR('bedFrameType','other','其他')}
      </div>
      <div class="wc-sub-fields ${vis(ab.bedFrameType === 'other')}" id="ab-sub-bedFrameOther">
        <div class="wc-field">
          <input type="text" class="wc-input" data-ab-field="bedFrameTypeOtherDesc" value="${escapeAttr(ab.bedFrameTypeOtherDesc)}" placeholder="請說明">
        </div>
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">2-2 床架高度</label>
      <div class="wc-num-wrap">
        <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-ab-field="bedFrameHeight" value="${escapeAttr(ab.bedFrameHeight)}" placeholder="—">
        <span class="unit">cm</span>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>3. 意識狀態</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('consciousness','normal','正常')}
        ${abR('consciousness','drowsy','嗜睡')}
        ${abR('consciousness','confused','錯亂或混亂')}
        ${abR('consciousness','unresponsive','無明顯反應')}
        ${abR('consciousness','other','其他')}
      </div>
      <div class="wc-sub-fields ${vis(ab.consciousness === 'other')}" id="ab-sub-consciousnessOther">
        <div class="wc-field">
          <input type="text" class="wc-input" data-ab-field="consciousnessOtherDesc" value="${escapeAttr(ab.consciousnessOtherDesc)}" placeholder="請說明">
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>4. 心智功能</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('cognitiveFunction','normal','正常')}
        ${abR('cognitiveFunction','psychiatric','有精神／行為問題')}
        ${abR('cognitiveFunction','other','其他')}
      </div>
      <div class="wc-sub-fields ${vis(ab.cognitiveFunction === 'other')}" id="ab-sub-cogFuncOther">
        <div class="wc-field">
          <input type="text" class="wc-input" data-ab-field="cognitiveFunctionOtherDesc" value="${escapeAttr(ab.cognitiveFunctionOtherDesc)}" placeholder="請說明">
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>5. 皮膚感覺</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('skinSensation','normal','正常')}
        ${abR('skinSensation','abnormal','異常')}
      </div>
      <div class="wc-sub-fields ${vis(ab.skinSensation === 'abnormal')}" id="ab-sub-skinAbnormal">
        <div class="wc-field">
          <input type="text" class="wc-input" data-ab-field="skinSensationAbnormalDesc" value="${escapeAttr(ab.skinSensationAbnormalDesc)}" placeholder="請說明">
        </div>
      </div>
      <div class="wc-options" style="margin-top:4px;">
        ${abR('skinSensation','lost','喪失')}
      </div>
      <div class="wc-sub-fields ${vis(ab.skinSensation === 'lost')}" id="ab-sub-skinLost">
        <div class="wc-field">
          <input type="text" class="wc-input" data-ab-field="skinSensationLostDesc" value="${escapeAttr(ab.skinSensationLostDesc)}" placeholder="請說明">
        </div>
      </div>
      <div class="wc-options" style="margin-top:4px;">
        ${abR('skinSensation','unable','無法施測')}
      </div>
      <div class="wc-sub-fields ${vis(ab.skinSensation === 'unable')}" id="ab-sub-skinUnable">
        <div class="wc-field">
          <label class="wc-label">原因</label>
          <input type="text" class="wc-input" data-ab-field="skinSensationUnableReason" value="${escapeAttr(ab.skinSensationUnableReason)}" placeholder="請說明">
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>6. 姿勢性低血壓</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('orthostaticHypotension','yes','有')}
        ${abR('orthostaticHypotension','no','無')}
        ${abR('orthostaticHypotension','not_tested','未施測')}
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>7. 目前體力狀態</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('currentEndurance','good','良好')}
        ${abR('currentEndurance','fair','尚可')}
        ${abR('currentEndurance','poor','不佳')}
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>8. 體力可能進展</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('endurancePrognosis','maintain','維持')}
        ${abR('endurancePrognosis','improve','進步')}
        ${abR('endurancePrognosis','decline','退化')}
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>9. 關節活動度</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('rom','normal','正常')}
        ${abR('rom','limited','受限制')}
      </div>
      <div class="wc-sub-fields ${vis(ab.rom === 'limited')}" id="ab-sub-romLimited">
        <div class="wc-field">
          <label class="wc-label">受限關節（可複選）</label>
          <div class="wc-options">
            ${abC('romLimitedJoints','hip','髖關節')}
            ${abC('romLimitedJoints','knee','膝關節')}
            ${abC('romLimitedJoints','other','其他關節')}
          </div>
          <div class="wc-sub-fields ${vis(romJoints.includes('other'))}" id="ab-sub-romOther">
            <div class="wc-field">
              <input type="text" class="wc-input" data-ab-field="romLimitedOtherDesc" value="${escapeAttr(ab.romLimitedOtherDesc)}" placeholder="請說明">
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>10. 控制器操作能力</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('controllerOperation','independent','獨立操作')}
        ${abR('controllerOperation','partial_assist','需照顧者部分協助')}
        ${abR('controllerOperation','caregiver','照顧者協助操作')}
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>11. 護欄操作能力</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('railOperation','independent','獨立操作')}
        ${abR('railOperation','partial_assist','需照顧者部分協助')}
        ${abR('railOperation','caregiver','照顧者協助操作')}
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>12. 翻身能力</h3>
    <div class="wc-field">
      <label class="wc-label">12-1 翻至左側</label>
      <div class="wc-options">
        ${abR('rollLeft','independent','可獨立輕易完成')}
        ${abR('rollLeft','effortful','執行費力耗時、需借助輔具或人力協助')}
        ${abR('rollLeft','dependent','完全依賴')}
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">12-2 翻至右側</label>
      <div class="wc-options">
        ${abR('rollRight','independent','可獨立輕易完成')}
        ${abR('rollRight','effortful','執行費力耗時、需借助輔具或人力協助')}
        ${abR('rollRight','dependent','完全依賴')}
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>13. 坐起能力</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('sitUp','independent','可獨立輕易完成')}
        ${abR('sitUp','effortful','執行費力耗時、需借助輔具或人力協助')}
        ${abR('sitUp','dependent','完全依賴')}
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>14. 靜態坐姿平衡</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('staticBalance','good','良好')}
        ${abR('staticBalance','hands_ok','雙手扶持尚可維持平衡')}
        ${abR('staticBalance','hands_hard','雙手扶持難以維持平衡')}
      </div>
      <div class="wc-sub-fields ${vis(ab.staticBalance && ab.staticBalance !== 'good')}" id="ab-sub-staticDir">
        <div class="wc-field">
          <label class="wc-label">在未扶持情況下，身體明顯會倒向（可複選）</label>
          <div class="wc-inline-options">
            ${abCI('staticBalanceDirection','left','左側')}
            ${abCI('staticBalanceDirection','right','右側')}
            ${abCI('staticBalanceDirection','forward','前方')}
            ${abCI('staticBalanceDirection','backward','後方')}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>15. 動態坐姿平衡</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('dynamicBalance','good','良好')}
        ${abR('dynamicBalance','poor','不佳，需用手或他人扶持下協助返回原靜態坐姿')}
      </div>
      <div class="wc-sub-fields ${vis(ab.dynamicBalance === 'poor')}" id="ab-sub-dynamicDir">
        <div class="wc-field">
          <label class="wc-label">在未扶持下，身體重心往該側移動容易失去平衡（可複選）</label>
          <div class="wc-inline-options">
            ${abCI('dynamicBalanceDirection','left','左側')}
            ${abCI('dynamicBalanceDirection','right','右側')}
            ${abCI('dynamicBalanceDirection','forward','前方')}
            ${abCI('dynamicBalanceDirection','backward','後方')}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>16. 轉位能力</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('transfer','independent','可獨立輕易完成')}
        ${abR('transfer','effortful','執行費力耗時、需借助輔具或人力協助')}
        ${abR('transfer','dependent','完全依賴')}
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>17. 床面相關身體及空間量測</h3>
    ${abNum('poplitealHeight','個案膝窩高','cm')}
    ${abNum('shoulderWidth','個案肩寬','cm')}
    ${abNum('caregiverHeight','主要照顧者身高','cm')}
    ${abNum('suitableCareHeight','適合照顧高度約','cm')}
    <div class="wc-field">
      <label class="wc-label">床擺放空間</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span style="font-size:13px;color:var(--ink-soft);">長</span>
        <div class="wc-num-wrap" style="flex:1;min-width:80px;">
          <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-ab-field="roomLength" value="${escapeAttr(ab.roomLength)}" placeholder="—">
          <span class="unit">cm</span>
        </div>
        <span style="font-size:13px;color:var(--ink-soft);">寬</span>
        <div class="wc-num-wrap" style="flex:1;min-width:80px;">
          <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-ab-field="roomWidth" value="${escapeAttr(ab.roomWidth)}" placeholder="—">
          <span class="unit">cm</span>
        </div>
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">床邊可使用的轉移位空間</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span style="font-size:13px;color:var(--ink-soft);">長</span>
        <div class="wc-num-wrap" style="flex:1;min-width:80px;">
          <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-ab-field="transferSpaceLength" value="${escapeAttr(ab.transferSpaceLength)}" placeholder="—">
          <span class="unit">cm</span>
        </div>
        <span style="font-size:13px;color:var(--ink-soft);">寬</span>
        <div class="wc-num-wrap" style="flex:1;min-width:80px;">
          <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-ab-field="transferSpaceWidth" value="${escapeAttr(ab.transferSpaceWidth)}" placeholder="—">
          <span class="unit">cm</span>
        </div>
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-option-label"><input type="checkbox" data-ab-bool="spaceLimited" ${ab.spaceLimited ? 'checked' : ''}> 照顧空間較不足需注意輔具選擇</label>
      <div class="wc-sub-fields ${vis(ab.spaceLimited)}" id="ab-sub-spaceLimited">
        <div class="wc-field">
          <input type="text" class="wc-input" data-ab-field="spaceLimitedDesc" value="${escapeAttr(ab.spaceLimitedDesc)}" placeholder="請說明">
        </div>
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">其他說明</label>
      <textarea class="wc-textarea" data-ab-field="bedMeasurementOtherDesc" placeholder="填寫說明">${escapeHtml(ab.bedMeasurementOtherDesc || '')}</textarea>
    </div>
  </div>

  <div class="wc-section">
    <h3>18. 易導致壓傷（褥瘡）相關危險因子（可複選）</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abC('pressureInjuryRisk','diabetes','糖尿病')}
        ${abC('pressureInjuryRisk','incontinence','失禁')}
        ${abC('pressureInjuryRisk','poor_hygiene','皮膚清潔狀況不佳')}
        ${abC('pressureInjuryRisk','moist_skin','皮膚經常潮濕')}
        ${abC('pressureInjuryRisk','malnutrition','營養不良')}
        ${abC('pressureInjuryRisk','thin_subcutaneous','骨突處皮下軟組織厚度不足')}
        ${abC('pressureInjuryRisk','abnormal_bony','異常骨突結構')}
        ${abC('pressureInjuryRisk','peripheral_vascular','周邊血管病變異常')}
        ${abC('pressureInjuryRisk','skin_infection','有皮膚感染或疾病')}
        ${abC('pressureInjuryRisk','frequent_friction','經常性摩擦')}
        ${abC('pressureInjuryRisk','sensory_loss','皮膚感覺異常或喪失')}
        ${abC('pressureInjuryRisk','no_self_relief','無法自行執行減壓活動')}
        ${abC('pressureInjuryRisk','other','其他')}
      </div>
      <div class="wc-sub-fields ${vis(risk.includes('other'))}" id="ab-sub-riskOther">
        <div class="wc-field">
          <input type="text" class="wc-input" data-ab-field="pressureInjuryRiskOtherDesc" value="${escapeAttr(ab.pressureInjuryRiskOtherDesc)}" placeholder="請說明">
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>19. 壓傷（褥瘡）</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abR('pressureInjuryStatus','none','未發生')}
        ${abR('pressureInjuryStatus','history','過去有')}
      </div>
      <div class="wc-sub-fields ${vis(ab.pressureInjuryStatus === 'history')}" id="ab-sub-piHistory">
        <div class="wc-field">
          <label class="wc-label">部位</label>
          <input type="text" class="wc-input" data-ab-field="piHistoryLocation" value="${escapeAttr(ab.piHistoryLocation)}" placeholder="請說明">
        </div>
      </div>
      <div class="wc-options" style="margin-top:4px;">
        ${abR('pressureInjuryStatus','current','目前有')}
      </div>
      <div class="wc-sub-fields ${vis(ab.pressureInjuryStatus === 'current')}" id="ab-sub-piCurrent">
        <div class="wc-field">
          <label class="wc-label">部位</label>
          <input type="text" class="wc-input" data-ab-field="piCurrentLocation" value="${escapeAttr(ab.piCurrentLocation)}" placeholder="請說明">
        </div>
        <div class="wc-field">
          <label class="wc-label">尺寸</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span style="font-size:13px;color:var(--ink-soft);">長</span>
            <div class="wc-num-wrap" style="flex:1;min-width:80px;">
              <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-ab-field="piSizeX" value="${escapeAttr(ab.piSizeX)}" placeholder="—">
              <span class="unit">cm</span>
            </div>
            <span style="font-size:13px;color:var(--ink-soft);">寬</span>
            <div class="wc-num-wrap" style="flex:1;min-width:80px;">
              <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-ab-field="piSizeY" value="${escapeAttr(ab.piSizeY)}" placeholder="—">
              <span class="unit">cm</span>
            </div>
          </div>
        </div>
        <div class="wc-field">
          <label class="wc-label">分級</label>
          <div class="wc-inline-options">
            ${abRI('piGrade','grade1','第1級')}
            ${abRI('piGrade','grade2','第2級')}
            ${abRI('piGrade','grade3','第3級')}
            ${abRI('piGrade','grade4','第4級')}
            ${abRI('piGrade','unstageable','無法分級')}
            ${abRI('piGrade','dti','深層組織壓傷')}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>20. 評估結果（可複選）</h3>
    <div class="wc-field">
      <div class="wc-options">
        ${abC('assessmentResult','airbed','氣墊床')}
        ${abC('assessmentResult','electric_bed','電動床')}
      </div>
    </div>
  </div>

  <div class="clear-module-section">
    <button class="clear-module-btn" data-clear-module="airbed">清除此評估的所有資料</button>
  </div>
  `;
}

export { saveAirbedField, updateAirbedConditional, renderAirbedForm };
