import { state, saveState } from '../core/state.js';
import { escapeHtml, escapeAttr } from '../core/dom.js';
import { touchCase } from '../core/cases.js';
import { showSaved } from '../ui.js';

/* Wheelchair cushion form
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
function saveCushionField(field, value) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  c.cushion[field] = value;
  touchCase(c.id); saveState(); showSaved();
}

function updateCushionConditional(field, value) {
  const show = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('visible', !!visible);
  };
  if (field === 'staticBalance') {
    show('cs-sub-staticDir', value !== '' && value !== 'good');
  } else if (field === 'dynamicBalance') {
    show('cs-sub-dynamicDir', value === 'poor');
  } else if (field === 'pelvis') {
    const arr = Array.isArray(value) ? value : [];
    show('cs-sub-pelvisTiltFB', arr.includes('tilt_forward_backward'));
    show('cs-sub-pelvisTiltLR', arr.includes('tilt_left_right'));
    show('cs-sub-pelvisRotateLR', arr.includes('rotate_left_right'));
  } else if (field === 'spine') {
    const arr = Array.isArray(value) ? value : [];
    show('cs-sub-spineGravity', arr.includes('gravity_curve'));
    show('cs-sub-scoliosis', arr.includes('scoliosis'));
    show('cs-sub-kyphosis', arr.includes('hyperkyphosis'));
    show('cs-sub-lordosis', arr.includes('hyperlordosis'));
  } else if (field === 'hip') {
    show('cs-sub-hipCond', ['adduction','abduction','windswept'].includes(value));
    show('cs-sub-hipOther', value === 'other');
  } else if (field === 'pressureInjuryStatus') {
    show('cs-sub-piHistory', value === 'history');
    show('cs-sub-piCurrent', value === 'current');
  } else if (field === 'pressureInjuryRisk') {
    const arr = Array.isArray(value) ? value : [];
    show('cs-sub-riskOther', arr.includes('other'));
  } else if (field === 'chairType') {
    show('cs-sub-chairManual', value === 'manual');
    show('cs-sub-chairPower', value === 'power');
    show('cs-sub-chairOther', value === 'other');
  }
}

function renderCushionForm(caseId) {
  const c = state.cases[caseId];
  if (!c) return;
  const cs = c.cushion;

  function csR(field, val, label) {
    return `<label class="wc-option-label"><input type="checkbox" data-cs-radio="${field}" value="${escapeAttr(val)}" ${cs[field]===val?'checked':''}> ${label}</label>`;
  }
  function csRI(field, val, label) {
    return `<label class="wc-option-label" style="display:inline-flex;margin-right:14px;"><input type="checkbox" data-cs-radio="${field}" value="${escapeAttr(val)}" ${cs[field]===val?'checked':''}> ${label}</label>`;
  }
  function csC(field, val, label) {
    const arr = Array.isArray(cs[field]) ? cs[field] : [];
    return `<label class="wc-option-label"><input type="checkbox" data-cs-checkbox="${field}" value="${escapeAttr(val)}" ${arr.includes(val)?'checked':''}> ${label}</label>`;
  }
  function csCI(field, val, label) {
    const arr = Array.isArray(cs[field]) ? cs[field] : [];
    return `<label class="wc-option-label" style="display:inline-flex;margin-right:14px;"><input type="checkbox" data-cs-checkbox="${field}" value="${escapeAttr(val)}" ${arr.includes(val)?'checked':''}> ${label}</label>`;
  }

  const pelvis = Array.isArray(cs.pelvis) ? cs.pelvis : [];
  const spine  = Array.isArray(cs.spine)  ? cs.spine  : [];
  const risk   = Array.isArray(cs.pressureInjuryRisk) ? cs.pressureInjuryRisk : [];

  const vis = (cond) => cond ? 'visible' : '';

  document.getElementById('cushionFormContainer').innerHTML = `
  <div class="wc-section">
    <h3>1. 身體尺寸量測</h3>
    <div class="wc-field">
      <label class="wc-label">臀寬</label>
      <div class="wc-num-wrap">
        <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-cs-field="hipWidth" value="${escapeAttr(cs.hipWidth)}" placeholder="—">
        <span class="unit">cm</span>
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">臀至膝窩長</label>
      <div class="wc-num-wrap">
        <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-cs-field="thighLength" value="${escapeAttr(cs.thighLength)}" placeholder="—">
        <span class="unit">cm</span>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>2. 身體各部位姿態</h3>

    <div class="wc-field">
      <label class="wc-label">2-1 靜態坐姿平衡</label>
      <div class="wc-options">
        ${csR('staticBalance','good','良好')}
        ${csR('staticBalance','hands_ok','雙手扶持尚可維持平衡')}
        ${csR('staticBalance','hands_hard','雙手扶持難以維持平衡')}
      </div>
      <div class="wc-sub-fields ${vis(cs.staticBalance && cs.staticBalance !== 'good')}" id="cs-sub-staticDir">
        <div class="wc-field">
          <label class="wc-label">在未扶持情況下，身體明顯會倒向（可複選）</label>
          <div class="wc-inline-options">
            ${csCI('staticBalanceDirection','left','左側')}
            ${csCI('staticBalanceDirection','right','右側')}
            ${csCI('staticBalanceDirection','forward','前方')}
            ${csCI('staticBalanceDirection','backward','後方')}
          </div>
        </div>
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">2-2 動態坐姿平衡</label>
      <div class="wc-options">
        ${csR('dynamicBalance','good','良好')}
        ${csR('dynamicBalance','poor','不佳，需用手或他人扶持下協助返回原靜態坐姿')}
      </div>
      <div class="wc-sub-fields ${vis(cs.dynamicBalance === 'poor')}" id="cs-sub-dynamicDir">
        <div class="wc-field">
          <label class="wc-label">在未扶持下，身體重心往該側移動容易失去平衡（可複選）</label>
          <div class="wc-inline-options">
            ${csCI('dynamicBalanceDirection','left','左側')}
            ${csCI('dynamicBalanceDirection','right','右側')}
            ${csCI('dynamicBalanceDirection','forward','前方')}
            ${csCI('dynamicBalanceDirection','backward','後方')}
          </div>
        </div>
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">2-3 骨盆（可複選）</label>
      <div class="wc-options">
        ${csC('pelvis','normal','正常')}
        ${csC('pelvis','tilt_forward_backward','向前／後傾')}
      </div>
      <div class="wc-sub-fields ${vis(pelvis.includes('tilt_forward_backward'))}" id="cs-sub-pelvisTiltFB">
        <div class="wc-field">
          <label class="wc-label">向前／後傾：變形情況</label>
          <div class="wc-options">
            ${csR('pelvisTiltFBCond','adjustable','可調整')}
            ${csR('pelvisTiltFBCond','partial','部分可調整')}
            ${csR('pelvisTiltFBCond','fixed','完全固定變形')}
          </div>
        </div>
      </div>
      <div class="wc-options" style="margin-top:4px;">
        ${csC('pelvis','tilt_left_right','向左／右傾斜')}
      </div>
      <div class="wc-sub-fields ${vis(pelvis.includes('tilt_left_right'))}" id="cs-sub-pelvisTiltLR">
        <div class="wc-field">
          <label class="wc-label">向左／右傾斜：變形情況</label>
          <div class="wc-options">
            ${csR('pelvisTiltLRCond','adjustable','可調整')}
            ${csR('pelvisTiltLRCond','partial','部分可調整')}
            ${csR('pelvisTiltLRCond','fixed','完全固定變形')}
          </div>
        </div>
      </div>
      <div class="wc-options" style="margin-top:4px;">
        ${csC('pelvis','rotate_left_right','向左／右旋轉')}
      </div>
      <div class="wc-sub-fields ${vis(pelvis.includes('rotate_left_right'))}" id="cs-sub-pelvisRotateLR">
        <div class="wc-field">
          <label class="wc-label">向左／右旋轉：變形情況</label>
          <div class="wc-options">
            ${csR('pelvisRotateLRCond','adjustable','可調整')}
            ${csR('pelvisRotateLRCond','partial','部分可調整')}
            ${csR('pelvisRotateLRCond','fixed','完全固定變形')}
          </div>
        </div>
      </div>
      <div class="wc-field" style="margin-top:8px;">
        <label class="wc-label">坐姿時骨盆經常（可複選）</label>
        <div class="wc-options">
          ${csC('pelvisSlide','slide_forward','向前滑動')}
          ${csC('pelvisSlide','slide_backward','向後滑動')}
          ${csC('pelvisSlide','slide_left','向左滑動')}
          ${csC('pelvisSlide','slide_right','向右滑動')}
        </div>
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">2-4 脊柱（可複選）</label>
      <div class="wc-options">
        ${csC('spine','normal','正常或無明顯變形')}
        ${csC('spine','gravity_curve','受重力作用時彎曲變形，且平躺時可回復')}
      </div>
      <div class="wc-sub-fields ${vis(spine.includes('gravity_curve'))}" id="cs-sub-spineGravity">
        <div class="wc-field">
          <label class="wc-label">彎曲說明</label>
          <input type="text" class="wc-input" data-cs-field="spineGravityDesc" value="${escapeAttr(cs.spineGravityDesc)}" placeholder="填寫說明">
        </div>
      </div>
      <div class="wc-options" style="margin-top:4px;">
        ${csC('spine','scoliosis','脊柱側彎')}
      </div>
      <div class="wc-sub-fields ${vis(spine.includes('scoliosis'))}" id="cs-sub-scoliosis">
        <div class="wc-field">
          <label class="wc-label">彎曲類型</label>
          <div class="wc-inline-options">
            ${csRI('scoliosisType','C型','C 型')}
            ${csRI('scoliosisType','S型','S 型')}
          </div>
        </div>
        <div class="wc-field">
          <label class="wc-label">主要凸向（側別）</label>
          <input type="text" class="wc-input" data-cs-field="scoliosisDirection" value="${escapeAttr(cs.scoliosisDirection)}" placeholder="填寫側別">
        </div>
        <div class="wc-field">
          <label class="wc-label">頂點位置</label>
          <input type="text" class="wc-input" data-cs-field="scoliosisApex" value="${escapeAttr(cs.scoliosisApex)}" placeholder="填寫位置">
        </div>
        <div class="wc-field">
          <label class="wc-label">變形情況</label>
          <div class="wc-options">
            ${csR('scoliosisCond','partial','部分可調整')}
            ${csR('scoliosisCond','fixed','完全固定變形')}
          </div>
        </div>
      </div>
      <div class="wc-options" style="margin-top:4px;">
        ${csC('spine','hyperkyphosis','過度後凸（hyperkyphosis）')}
      </div>
      <div class="wc-sub-fields ${vis(spine.includes('hyperkyphosis'))}" id="cs-sub-kyphosis">
        <div class="wc-field">
          <label class="wc-label">過度後凸：變形情況</label>
          <div class="wc-options">
            ${csR('spineKyphosisCond','partial','部分可調整')}
            ${csR('spineKyphosisCond','fixed','完全固定變形')}
          </div>
        </div>
      </div>
      <div class="wc-options" style="margin-top:4px;">
        ${csC('spine','hyperlordosis','過度前凸（hyperlordosis）')}
      </div>
      <div class="wc-sub-fields ${vis(spine.includes('hyperlordosis'))}" id="cs-sub-lordosis">
        <div class="wc-field">
          <label class="wc-label">過度前凸：變形情況</label>
          <div class="wc-options">
            ${csR('spineLordosisCond','partial','部分可調整')}
            ${csR('spineLordosisCond','fixed','完全固定變形')}
          </div>
        </div>
      </div>
      <div class="wc-options" style="margin-top:4px;">
        ${csC('spine','vertebral_rotation','合併有脊柱旋轉（vertebral rotation）')}
      </div>
    </div>

    <div class="wc-field">
      <label class="wc-label">2-5 髖部</label>
      <div class="wc-options">
        ${csR('hip','normal','正常')}
        ${csR('hip','adduction','內收')}
        ${csR('hip','abduction','外展')}
        ${csR('hip','windswept','風吹式變形')}
        ${csR('hip','other','其他')}
      </div>
      <div class="wc-sub-fields ${vis(['adduction','abduction','windswept'].includes(cs.hip))}" id="cs-sub-hipCond">
        <div class="wc-field">
          <label class="wc-label">變形情況</label>
          <div class="wc-options">
            ${csR('hipCond','adjustable','可調整')}
            ${csR('hipCond','partial','部分可調整')}
            ${csR('hipCond','fixed','完全固定變形')}
          </div>
        </div>
      </div>
      <div class="wc-sub-fields ${vis(cs.hip === 'other')}" id="cs-sub-hipOther">
        <div class="wc-field">
          <label class="wc-label">其他（說明）</label>
          <input type="text" class="wc-input" data-cs-field="hipOtherDesc" value="${escapeAttr(cs.hipOtherDesc)}" placeholder="填寫說明">
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>3. 臀部減壓能力</h3>
    <div class="wc-options">
      ${csR('pressureRelief','independent_lift','獨立將身體撐起進行減壓')}
      ${csR('pressureRelief','posture_change','藉由座椅姿勢或角度變換進行減壓')}
      ${csR('pressureRelief','weight_shift','藉由身體重心偏移進行減壓')}
      ${csR('pressureRelief','unable','無自主減壓能力，或減壓效率不彰')}
    </div>
  </div>

  <div class="wc-section">
    <h3>4. 座墊操作能力</h3>
    ${[
      ['cushionOpPlacement',  '移位時放置或改變座墊位置的能力'],
      ['cushionOpInspection', '檢視座墊使用狀態的能力'],
      ['cushionOpAdjustment', '調整座墊壓力或擺位參數的能力'],
      ['cushionOpCleaning',   '清潔、保養座墊的能力'],
    ].map(([f, q]) => `
    <div class="wc-field">
      <label class="wc-label">${q}</label>
      <div class="wc-inline-options">
        ${csRI(f,'independent','可獨立完成')}
        ${csRI(f,'caregiver','需照顧者協助')}
      </div>
    </div>`).join('')}
    <div class="wc-field">
      <label class="wc-label">照顧者是否能協助個案使用此輔具</label>
      <div class="wc-inline-options">
        ${csRI('cushionCaregiverAble','independent','是')}
        ${csRI('cushionCaregiverAble','caregiver','否')}
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>5. 易導致壓傷發生的危險因子（可複選）</h3>
    <div class="wc-options">
      ${csC('pressureInjuryRisk','diabetes','糖尿病')}
      ${csC('pressureInjuryRisk','incontinence','失禁')}
      ${csC('pressureInjuryRisk','poor_hygiene','皮膚清潔狀況不佳')}
      ${csC('pressureInjuryRisk','moist_skin','皮膚經常潮濕')}
      ${csC('pressureInjuryRisk','malnutrition','營養不良')}
      ${csC('pressureInjuryRisk','thin_subcutaneous','臀部皮下軟組織厚度不足')}
      ${csC('pressureInjuryRisk','abnormal_bony','異常骨突結構')}
      ${csC('pressureInjuryRisk','peripheral_vascular','周邊血管病變異常')}
      ${csC('pressureInjuryRisk','skin_infection','有皮膚感染或疾病')}
      ${csC('pressureInjuryRisk','frequent_friction','經常性摩擦')}
      ${csC('pressureInjuryRisk','sensory_loss','臀部皮膚感覺異常或喪失')}
      ${csC('pressureInjuryRisk','no_self_relief','無法自行執行減壓活動')}
      ${csC('pressureInjuryRisk','other','其他')}
    </div>
    <div class="wc-sub-fields ${vis(risk.includes('other'))}" id="cs-sub-riskOther">
      <div class="wc-field">
        <label class="wc-label">其他（說明）</label>
        <input type="text" class="wc-input" data-cs-field="pressureInjuryRiskOtherDesc" value="${escapeAttr(cs.pressureInjuryRiskOtherDesc)}" placeholder="填寫說明">
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>6. 壓傷（褥瘡）</h3>
    <div class="wc-options">
      ${csR('pressureInjuryStatus','none','未發生')}
      ${csR('pressureInjuryStatus','history','過去有')}
      ${csR('pressureInjuryStatus','current','目前有')}
    </div>
    <div class="wc-sub-fields ${vis(cs.pressureInjuryStatus === 'history')}" id="cs-sub-piHistory">
      <div class="wc-field">
        <label class="wc-label">部位</label>
        <input type="text" class="wc-input" data-cs-field="piHistoryLocation" value="${escapeAttr(cs.piHistoryLocation)}" placeholder="填寫部位">
      </div>
    </div>
    <div class="wc-sub-fields ${vis(cs.pressureInjuryStatus === 'current')}" id="cs-sub-piCurrent">
      <div class="wc-field">
        <label class="wc-label">部位</label>
        <input type="text" class="wc-input" data-cs-field="piCurrentLocation" value="${escapeAttr(cs.piCurrentLocation)}" placeholder="填寫部位">
      </div>
      <div class="wc-field">
        <label class="wc-label">尺寸</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-cs-field="piSizeX" value="${escapeAttr(cs.piSizeX)}" placeholder="—">
          <span class="unit">cm</span>
          <span style="color:var(--ink-soft);">×</span>
          <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-cs-field="piSizeY" value="${escapeAttr(cs.piSizeY)}" placeholder="—">
          <span class="unit">cm</span>
        </div>
      </div>
      <div class="wc-field">
        <label class="wc-label">分級</label>
        <div class="wc-options">
          ${csR('piGrade','grade1','第 1 級')}
          ${csR('piGrade','grade2','第 2 級')}
          ${csR('piGrade','grade3','第 3 級')}
          ${csR('piGrade','grade4','第 4 級')}
          ${csR('piGrade','unstageable','無法分級')}
          ${csR('piGrade','dti','深層組織壓傷')}
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>7. 配合座墊使用之座椅</h3>
    <div class="wc-field">
      <label class="wc-label">座寬</label>
      <div class="wc-num-wrap">
        <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-cs-field="seatWidth" value="${escapeAttr(cs.seatWidth)}" placeholder="—">
        <span class="unit">cm</span>
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">座深</label>
      <div class="wc-num-wrap">
        <input type="number" inputmode="decimal" step="0.1" class="wc-num-input" data-cs-field="seatDepth" value="${escapeAttr(cs.seatDepth)}" placeholder="—">
        <span class="unit">cm</span>
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">支撐面</label>
      <div class="wc-inline-options">
        ${csRI('seatSurface','hard_board','硬板')}
        ${csRI('seatSurface','fabric','布面')}
      </div>
    </div>
    <div class="wc-field">
      <label class="wc-label">座椅類型</label>
      <div class="wc-options">
        ${csR('chairType','manual','手動輪椅')}
        ${csR('chairType','power','電動輪椅')}
        ${csR('chairType','other','其他')}
      </div>
      <div class="wc-sub-fields ${vis(cs.chairType === 'manual')}" id="cs-sub-chairManual">
        <div class="wc-field">
          <label class="wc-label">類型</label>
          <div class="wc-inline-options">
            ${csRI('manualType','attendant','介護型')}
            ${csRI('manualType','self_propelled','自推型')}
          </div>
        </div>
        <div class="wc-field">
          <label class="wc-label">減壓功能</label>
          <div class="wc-inline-options">
            ${csRI('manualRelief','none','無')}
            ${csRI('manualRelief','yes','有')}
          </div>
        </div>
      </div>
      <div class="wc-sub-fields ${vis(cs.chairType === 'power')}" id="cs-sub-chairPower">
        <div class="wc-field">
          <label class="wc-label">減壓功能</label>
          <div class="wc-inline-options">
            ${csRI('powerRelief','none','無')}
            ${csRI('powerRelief','manual_op','手動操作')}
            ${csRI('powerRelief','power_op','電動操作')}
          </div>
        </div>
      </div>
      <div class="wc-sub-fields ${vis(cs.chairType === 'other')}" id="cs-sub-chairOther">
        <div class="wc-field">
          <label class="wc-label">其他（說明）</label>
          <input type="text" class="wc-input" data-cs-field="chairTypeOtherDesc" value="${escapeAttr(cs.chairTypeOtherDesc)}" placeholder="填寫說明">
        </div>
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>8. 常態性單次乘坐時間</h3>
    <div class="wc-options">
      ${csR('sittingDuration','under_30min','30 分鐘以下')}
      ${csR('sittingDuration','30min_to_2hr','30 分鐘到 2 小時')}
      ${csR('sittingDuration','over_2hr','2 小時以上')}
    </div>
    <div class="wc-field" style="margin-top:8px;">
      <label class="wc-label">備註說明</label>
      <input type="text" class="wc-input" data-cs-field="sittingDurationNote" value="${escapeAttr(cs.sittingDurationNote)}" placeholder="填寫說明">
    </div>
  </div>

  <div class="wc-section">
    <h3>9. 評估結果（可複選）</h3>
    <div class="wc-options">
      ${csC('assessmentResult','interconnected_basic','連通管氣囊輪椅座墊－基礎型')}
      ${csC('assessmentResult','interconnected_rubber_basic','連通管氣囊輪椅座墊－橡膠材質基礎型')}
      ${csC('assessmentResult','interconnected_rubber_zone','連通管氣囊輪椅座墊－橡膠材質分區型')}
      ${csC('assessmentResult','liquid_gel','液態凝膠輪椅座墊')}
      ${csC('assessmentResult','solid_gel','固態凝膠輪椅座墊')}
      ${csC('assessmentResult','filled_air','填充式氣囊輪椅座墊')}
      ${csC('assessmentResult','custom_foam','客製化適形泡棉輪椅座墊')}
    </div>
  </div>

  <div class="clear-module-section">
    <button class="clear-module-btn" data-clear-module="cushion">清除此評估的所有資料</button>
  </div>`;
}

export { saveCushionField, updateCushionConditional, renderCushionForm };
