import { state, saveState } from '../core/state.js';
import { escapeHtml, escapeAttr } from '../core/dom.js';
import { touchCase } from '../core/cases.js';

/* Home-accessibility form and calculations
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   Home Accessibility
   ========================================================================== */
const HA_LOCATIONS = [
  ['main_entrance','主要出入口'],
  ['horizontal_path','水平通路'],
  ['vertical_path','垂直通路'],
  ['bathroom','浴廁空間'],
  ['bedroom','臥室空間'],
  ['kitchen','廚房空間'],
  ['other','其他空間']
];
const HA_GROSS_LEVELS = [
  ['independent','獨立完成'],
  ['partial_assist','部份協助'],
  ['major_assist','大量協助'],
  ['unable','無法執行'],
  ['not_required','不須評估']
];
const HA_GROSS_ACTIONS = [
  ['sit','坐'], ['sit_to_stand','坐站'], ['stand','站'],
  ['walk_flat','平地行走'], ['walk_ramp','斜坡行走'],
  ['walk_stairs','樓梯行走'], ['step_over','跨越門檻']
];
const HA_FINE_LEVELS = [
  ['good','良好'], ['fair','尚可'], ['poor','不好'],
  ['very_poor','極差'], ['unable','無法執行']
];
const HA_FINE_COLS = [
  ['finger_right','個別手指（右）'], ['finger_left','個別手指（左）'],
  ['grip_right','抓握（右）'], ['grip_left','抓握（左）'],
  ['function_right','功能操作（右）'], ['function_left','功能操作（左）']
];
const HA_AID_ITEMS = [
  ['threshold_slope','門檻斜角'],
  ['portable_ramp','非固定式斜坡板'],
  ['anti_slip','防滑措施'],
  ['reflective_strip','反光貼條或消光處理'],
  ['toilet_handrail','馬桶扶手'],
  ['bed_handrail','床邊扶手']
];
const HA_RENO_ITEMS = [
  ['door','門'], ['fixed_handrail','固定式扶手'], ['movable_handrail','可動式扶手'],
  ['drainage_trench','截水槽'], ['level_diff','改善高低差'], ['faucet','水龍頭'],
  ['anti_slip_tile','防滑地磚'], ['bathtub','改善浴缸'], ['sink','改善洗臉台（槽）'],
  ['toilet','改善馬桶'], ['toilet_backrest','馬桶背靠'], ['counter','改善流理台'],
  ['range_hood','改善抽油煙機'], ['partition','隔間'], ['wall_shower','壁掛式淋浴台']
];
const HA_RAMP_GRADES = [
  ['under_90cm','未達 90 公分'],
  ['90cm_up','90 公分以上'],
  ['120cm_up','120 公分以上'],
  ['150cm_up','150 公分以上']
];
const HA_DOOR_SPECS = [
  ['simple','A. 簡易型（門片變更／軌道）'],
  ['advanced','B. 進階型（門框施工／加寬／新增）']
];
const HA_HANDRAIL_TYPES = [
  ['L_type','L 型'],
  ['vertical','垂直一字型'],
  ['horizontal','水平一字型'],
  ['U_type','ㄇ字型']
];
function calcGrabBar(width, depth, offMin = 4, offMax = 6) {
  const results = [];
  const seen = new Set();
  for (let os = offMin; os <= offMax + 0.001; os += 0.5) {
    for (let of_ = offMin; of_ <= offMax + 0.001; of_ += 0.5) {
      const backBar = Math.round((width + 2 * os) * 10) / 10;
      const sideArm = Math.round((depth + of_) * 10) / 10;
      const total   = Math.round((backBar + 2 * sideArm) * 10) / 10;
      if (Math.round(total * 10) % 100 !== 0) continue;
      if (!Number.isInteger(backBar) || !Number.isInteger(sideArm)) continue;
      const key = `${backBar}-${sideArm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ backBar, sideArm, total, offsetSide: os, offsetFront: of_, balanced: Math.abs(os - of_) <= 0.5 });
    }
  }
  return results.sort((a, b) => b.balanced - a.balanced);
}

function renderGrabCalcResults(results, idx, appliedTotal) {
  if (!results.length) return '<p class="ha-grab-no-result">無符合條件的方案（總長須為 10 的倍數）</p>';
  const rows = results.map(r => {
    const isApplied = appliedTotal !== undefined && appliedTotal !== null && r.total === +appliedTotal;
    return `<tr class="${r.balanced ? 'balanced' : ''}${isApplied ? ' applied' : ''}">
      <td>${r.backBar} cm</td>
      <td>${r.sideArm} cm</td>
      <td>${r.total} cm</td>
      <td><button type="button" class="ha-grab-apply-btn${isApplied ? ' applied' : ''}"
            data-ha-grab-apply="${idx}" data-total="${r.total}">${isApplied ? '已套用' : '套用'}</button></td>
    </tr>`;
  }).join('');
  return `<table class="ha-grab-table">
    <thead><tr><th>後橫桿</th><th>兩側臂</th><th>總長</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

const HA_LEVELDIFF_SPECS = [
  ['under_10cm','10 公分以下'],
  ['under_20cm','20 公分以下'],
  ['under_30cm','30 公分以下'],
  ['over_30cm','超過 30 公分']
];

function haLabelOf(arr, value) {
  const found = arr.find(x => x[0] === value);
  return found ? found[1] : value;
}

function renderHomeAccessibilityForm(caseId) {
  const c = state.cases[caseId];
  if (!c) return;
  const ha = c.homeAccessibility;
  const checkedLocations = Array.isArray(ha.locations) ? ha.locations : [];
  const showOtherDesc = checkedLocations.includes('other');

  // 1. Gross motor matrix
  const grossHeader = HA_GROSS_LEVELS.map(([_,l]) => `<th>${escapeHtml(l)}</th>`).join('');
  const grossRows = HA_GROSS_ACTIONS.map(([aid, alabel]) => {
    const cells = HA_GROSS_LEVELS.map(([lv, llabel]) => {
      const checked = (ha.gross_motor || {})[aid] === lv ? 'checked' : '';
      return `<td><input type="radio" name="ha_gross_${aid}" data-ha-gross="${aid}" value="${lv}" ${checked} aria-label="${escapeHtml(alabel)} ${escapeHtml(llabel)}"></td>`;
    }).join('');
    return `<tr><td>${escapeHtml(alabel)}</td>${cells}</tr>`;
  }).join('');

  // 2. Fine motor matrix
  const fineHeader = HA_FINE_COLS.map(([_,l]) => `<th>${escapeHtml(l)}</th>`).join('');
  const fineRows = HA_FINE_LEVELS.map(([lv, llabel]) => {
    const cells = HA_FINE_COLS.map(([col]) => {
      const checked = (ha.fine_motor || {})[col] === lv ? 'checked' : '';
      return `<td><input type="radio" name="ha_fine_${col}" data-ha-fine="${col}" value="${lv}" ${checked}></td>`;
    }).join('');
    return `<tr><td>${escapeHtml(llabel)}</td>${cells}</tr>`;
  }).join('');

  // 3. Locations
  const locsHtml = HA_LOCATIONS.map(([v, l]) => {
    const ck = checkedLocations.includes(v) ? 'checked' : '';
    return `<label class="wc-inline-option"><input type="checkbox" data-ha-loc value="${v}" ${ck}><span class="wc-inline-option-text">${escapeHtml(l)}</span></label>`;
  }).join('');

  // 4-5. Rows
  const aidRowsHtml = (ha.assistive_devices || []).map((row, idx) =>
    renderHaAidRow(row, idx, haLocOptions(checkedLocations, row.location))).join('');
  const renoRowsHtml = (ha.renovations || []).map((row, idx) =>
    renderHaRenoRow(row, idx, haLocOptions(checkedLocations, row.location))).join('');

  // 6. Summary
  const summaryHtml = renderHaSummary(ha);

  document.getElementById('homeAccessibilityFormContainer').innerHTML = `
  <div class="wc-section">
    <h3>1. 粗大動作能力</h3>
    <div class="ha-table-wrap">
      <table class="assess-table ha-matrix">
        <thead><tr><th>動作</th>${grossHeader}</tr></thead>
        <tbody>${grossRows}</tbody>
      </table>
    </div>
  </div>

  <div class="wc-section">
    <h3>2. 精細動作能力</h3>
    <div class="ha-table-wrap">
      <table class="assess-table ha-matrix">
        <thead><tr><th>等級</th>${fineHeader}</tr></thead>
        <tbody>${fineRows}</tbody>
      </table>
    </div>
  </div>

  <div class="wc-section">
    <h3>3. 改善地點（可複選）</h3>
    <div class="wc-inline-options">${locsHtml}</div>
    <div class="wc-sub-fields ${showOtherDesc?'visible':''}" id="ha-sub-loc-other">
      <div class="wc-field">
        <label class="wc-label">其他空間說明</label>
        <input type="text" class="wc-input" data-ha-field="locations_other_desc" value="${escapeAttr(ha.locations_other_desc)}" placeholder="填寫文字">
      </div>
    </div>
  </div>

  <div class="wc-section">
    <h3>4. 建議輔具項目</h3>
    <div class="ha-rows" id="haAidRows">${aidRowsHtml || '<div class="ha-empty">尚未新增輔具項目</div>'}</div>
    <button class="add-step-btn ha-add-btn" data-ha-add-row="assistive_devices">＋ 新增輔具項目</button>
  </div>

  <div class="wc-section">
    <h3>5. 建議修繕項目</h3>
    <div class="ha-rows" id="haRenoRows">${renoRowsHtml || '<div class="ha-empty">尚未新增修繕項目</div>'}</div>
    <button class="add-step-btn ha-add-btn" data-ha-add-row="renovations">＋ 新增修繕項目</button>
  </div>

  <div class="wc-section ha-summary-section" id="haSummarySection">
    <h3>6. 總結（自動彙整）</h3>
    ${summaryHtml}
  </div>

  <div class="clear-module-section">
    <button class="clear-module-btn" data-clear-module="homeAccessibility">清除此評估的所有資料</button>
  </div>
  `;
}

function haLocOptions(checkedLocations, currentVal) {
  const opts = ['<option value="">— 選擇地點 —</option>'];
  let hasCurrent = false;
  HA_LOCATIONS.forEach(([v, l]) => {
    if (!checkedLocations.includes(v)) return;
    if (v === currentVal) hasCurrent = true;
    opts.push(`<option value="${v}" ${v===currentVal?'selected':''}>${escapeHtml(l)}</option>`);
  });
  if (currentVal && !hasCurrent) {
    const fallback = haLabelOf(HA_LOCATIONS, currentVal);
    opts.push(`<option value="${currentVal}" selected>${escapeHtml(fallback)}（地點未勾選）</option>`);
  }
  if (checkedLocations.length === 0) {
    opts[0] = '<option value="">（請先在第 3 節勾選地點）</option>';
  }
  return opts.join('');
}

function haNumField(list, idx, field, label, value) {
  return `
    <div class="ha-row-field">
      <label class="wc-label">${escapeHtml(label)}</label>
      <div class="wc-num-wrap" style="display:block;width:100%;">
        <input type="number" inputmode="decimal" step="0.1" min="0" class="wc-num-input" style="width:100%;"
               data-ha-row-list="${list}" data-ha-row-index="${idx}" data-ha-row-field="${field}"
               value="${escapeAttr(value)}" placeholder="—">
        <span class="unit">cm</span>
      </div>
    </div>`;
}

function haRangeField(list, idx, fieldMin, fieldMax, label, valMin, valMax) {
  return `
    <div class="ha-row-field">
      <label class="wc-label">${escapeHtml(label)}</label>
      <div class="ha-range-wrap">
        <input type="number" inputmode="decimal" step="0.1" min="0" class="wc-num-input"
               data-ha-row-list="${list}" data-ha-row-index="${idx}" data-ha-row-field="${fieldMin}"
               value="${escapeAttr(valMin)}" placeholder="最小">
        <span class="ha-range-sep">–</span>
        <input type="number" inputmode="decimal" step="0.1" min="0" class="wc-num-input"
               data-ha-row-list="${list}" data-ha-row-index="${idx}" data-ha-row-field="${fieldMax}"
               value="${escapeAttr(valMax)}" placeholder="最大">
        <span class="unit">cm</span>
      </div>
    </div>`;
}

function renderHaAidRow(row, idx, locOptionsHtml) {
  const itemOpts = ['<option value="">— 選擇品項 —</option>']
    .concat(HA_AID_ITEMS.map(([v,l]) =>
      `<option value="${v}" ${v===row.item?'selected':''}>${escapeHtml(l)}</option>`)).join('');

  let specHtml = '';
  if (row.item === 'portable_ramp') {
    const hd = parseFloat(row.ramp_height_diff);
    const suggHtml = (!isNaN(hd) && hd > 0) ? `
      <div class="ha-ramp-suggestion" data-ramp-sugg-idx="${idx}">
        <span class="ha-ramp-sugg-label">建議斜坡板長度</span>
        <span class="ha-ramp-sugg-value">${(hd*4).toFixed(1)} ~ ${(hd*6).toFixed(1)} cm</span>
      </div>` : `<div class="ha-ramp-suggestion" data-ramp-sugg-idx="${idx}" style="display:none">
        <span class="ha-ramp-sugg-label">建議斜坡板長度</span>
        <span class="ha-ramp-sugg-value"></span>
      </div>`;
    specHtml = `
      <div class="ha-row-measurements">
        ${haNumField('assistive_devices', idx, 'ramp_height_diff', '高低差', row.ramp_height_diff || '')}
      </div>
      ${suggHtml}`;
    const opts = ['<option value="">— 選擇長度級距 —</option>']
      .concat(HA_RAMP_GRADES.map(([v,l]) =>
        `<option value="${v}" ${v===row.spec?'selected':''}>${escapeHtml(l)}</option>`)).join('');
    specHtml += `
      <div class="ha-row-field">
        <label class="wc-label">規格（長度級距）</label>
        <select class="wc-input" data-ha-row-list="assistive_devices" data-ha-row-index="${idx}" data-ha-row-field="spec">${opts}</select>
      </div>`;
    if (row.spec) {
      specHtml += `
      <div class="ha-row-measurements">
        ${haRangeField('assistive_devices', idx, 'ramp_length_min', 'ramp_length_max', '長度', row.ramp_length_min, row.ramp_length_max)}
        ${haRangeField('assistive_devices', idx, 'ramp_width_min', 'ramp_width_max', '寬度', row.ramp_width_min, row.ramp_width_max)}
        ${haNumField('assistive_devices', idx, 'ramp_door_clear_width', '門前淨寬', row.ramp_door_clear_width)}
      </div>`;
    }
  }

  return `
    <div class="ha-row" data-ha-row-list="assistive_devices" data-ha-row-index="${idx}">
      <div class="ha-row-header">
        <span class="ha-row-num">輔具 #${idx+1}</span>
        <button type="button" class="ha-row-del" data-ha-del-row="${idx}" data-ha-list="assistive_devices">🗑 刪除</button>
      </div>
      <div class="ha-row-grid2">
        <div class="ha-row-field">
          <label class="wc-label">地點</label>
          <select class="wc-input" data-ha-row-list="assistive_devices" data-ha-row-index="${idx}" data-ha-row-field="location">${locOptionsHtml}</select>
        </div>
        <div class="ha-row-field">
          <label class="wc-label">品項</label>
          <select class="wc-input" data-ha-row-list="assistive_devices" data-ha-row-index="${idx}" data-ha-row-field="item">${itemOpts}</select>
        </div>
      </div>
      ${specHtml}
      <div class="ha-row-field">
        <label class="wc-label">備註</label>
        <input type="text" class="wc-input" data-ha-row-list="assistive_devices" data-ha-row-index="${idx}" data-ha-row-field="note" value="${escapeAttr(row.note)}" placeholder="選填">
      </div>
    </div>`;
}

function renderHaRenoRow(row, idx, locOptionsHtml) {
  const itemOpts = ['<option value="">— 選擇品項 —</option>']
    .concat(HA_RENO_ITEMS.map(([v,l]) =>
      `<option value="${v}" ${v===row.item?'selected':''}>${escapeHtml(l)}</option>`)).join('');

  let specHtml = '';
  if (row.item === 'door') {
    const opts = ['<option value="">— 選擇 —</option>']
      .concat(HA_DOOR_SPECS.map(([v,l]) =>
        `<option value="${v}" ${v===row.spec?'selected':''}>${escapeHtml(l)}</option>`)).join('');
    specHtml = `<div class="ha-row-field">
        <label class="wc-label">規格</label>
        <select class="wc-input" data-ha-row-list="renovations" data-ha-row-index="${idx}" data-ha-row-field="spec">${opts}</select>
      </div>`;
  } else if (row.item === 'fixed_handrail') {
    const opts = ['<option value="">— 選擇扶手類型 —</option>']
      .concat(HA_HANDRAIL_TYPES.map(([v,l]) =>
        `<option value="${v}" ${v===row.spec?'selected':''}>${escapeHtml(l)}</option>`)).join('');
    specHtml = `<div class="ha-row-field">
        <label class="wc-label">規格（扶手類型）</label>
        <select class="wc-input" data-ha-row-list="renovations" data-ha-row-index="${idx}" data-ha-row-field="spec">${opts}</select>
      </div>`;
    if (row.spec === 'L_type') {
      specHtml += `
      <div class="ha-row-grid3">
        ${haNumField('renovations', idx, 'handrail_height', '離地高度', row.handrail_height)}
        ${haNumField('renovations', idx, 'handrail_length_vertical', '垂直段長度', row.handrail_length_vertical)}
        ${haNumField('renovations', idx, 'handrail_length_horizontal', '水平段長度', row.handrail_length_horizontal)}
      </div>`;
    } else if (row.spec === 'vertical' || row.spec === 'horizontal') {
      specHtml += `
      <div class="ha-row-grid2">
        ${haNumField('renovations', idx, 'handrail_height', '離地高度', row.handrail_height)}
        ${haNumField('renovations', idx, 'handrail_length', '長度', row.handrail_length)}
      </div>`;
    } else if (row.spec === 'U_type') {
      const preResults = (row.u_width && row.u_depth)
        ? renderGrabCalcResults(calcGrabBar(+row.u_width, +row.u_depth), idx, row.handrail_length)
        : '';
      const appliedNote = row.handrail_length
        ? `<div class="ha-grab-applied-note">✓ 已套用總長度：${row.handrail_length} cm <button type="button" class="ha-grab-unapply-btn" data-ha-grab-unapply="${idx}">取消套用</button></div>`
        : '';
      specHtml += `
      <div class="ha-row-grid2">
        ${haNumField('renovations', idx, 'u_width', '面盆寬度', row.u_width)}
        ${haNumField('renovations', idx, 'u_depth', '面盆深度', row.u_depth)}
      </div>
      <div class="ha-row-field">
        <button type="button" class="ha-grab-calc-btn" data-ha-grab-calc="${idx}">計算建議長度</button>
        ${appliedNote}
      </div>
      <div class="ha-grab-results" id="grab-calc-${idx}">${preResults}</div>`;
    }
  } else if (row.item === 'level_diff') {
    const opts = ['<option value="">— 選擇 —</option>']
      .concat(HA_LEVELDIFF_SPECS.map(([v,l]) =>
        `<option value="${v}" ${v===row.spec?'selected':''}>${escapeHtml(l)}</option>`)).join('');
    specHtml = `<div class="ha-row-field">
        <label class="wc-label">規格</label>
        <select class="wc-input" data-ha-row-list="renovations" data-ha-row-index="${idx}" data-ha-row-field="spec">${opts}</select>
      </div>`;
  }

  return `
    <div class="ha-row" data-ha-row-list="renovations" data-ha-row-index="${idx}">
      <div class="ha-row-header">
        <span class="ha-row-num">修繕 #${idx+1}</span>
        <button type="button" class="ha-row-del" data-ha-del-row="${idx}" data-ha-list="renovations">🗑 刪除</button>
      </div>
      <div class="ha-row-grid2">
        <div class="ha-row-field">
          <label class="wc-label">地點</label>
          <select class="wc-input" data-ha-row-list="renovations" data-ha-row-index="${idx}" data-ha-row-field="location">${locOptionsHtml}</select>
        </div>
        <div class="ha-row-field">
          <label class="wc-label">品項</label>
          <select class="wc-input" data-ha-row-list="renovations" data-ha-row-index="${idx}" data-ha-row-field="item">${itemOpts}</select>
        </div>
      </div>
      ${specHtml}
      <div class="ha-row-field">
        <label class="wc-label">備註</label>
        <input type="text" class="wc-input" data-ha-row-list="renovations" data-ha-row-index="${idx}" data-ha-row-field="note" value="${escapeAttr(row.note)}" placeholder="選填">
      </div>
    </div>`;
}

function renderHaSummary(ha) {
  const handrailRows = (ha.renovations || []).filter(r => r.item === 'fixed_handrail');
  let handrailTotal = 0;
  let handrailHasEmpty = false;
  handrailRows.forEach(r => {
    if (r.spec === 'L_type') {
      const v = toNum(r.handrail_length_vertical);
      const h = toNum(r.handrail_length_horizontal);
      if (v === null || h === null) handrailHasEmpty = true;
      handrailTotal += (v || 0) + (h || 0);
    } else if (r.spec === 'vertical' || r.spec === 'horizontal') {
      const l = toNum(r.handrail_length);
      if (l === null) handrailHasEmpty = true;
      handrailTotal += (l || 0);
    } else if (r.spec === 'U_type') {
      const l = toNum(r.handrail_length);
      if (l === null) handrailHasEmpty = true;
      handrailTotal += (l || 0);
    } else {
      handrailHasEmpty = true;
    }
  });

  const all = [...(ha.assistive_devices || []), ...(ha.renovations || [])];
  const countMap = {};
  all.forEach(r => {
    if (!r.item || r.item === 'fixed_handrail') return;
    const mapKey = (r.item === 'portable_ramp' && r.spec) ? `${r.item}__${r.spec}` : r.item;
    if (!countMap[mapKey]) countMap[mapKey] = { item: r.item, spec: (r.item === 'portable_ramp' ? r.spec : null), count: 0 };
    countMap[mapKey].count++;
  });

  const aidSet = new Set(HA_AID_ITEMS.map(([v]) => v));
  const rows = [];
  if (handrailRows.length > 0) {
    const note = handrailHasEmpty ? '<span class="ha-summary-warn">（部分項目尚未填寫長度）</span>' : '';
    rows.push(`<tr><td>修繕</td><td>固定式扶手</td><td>共 ${handrailTotal} 公分${note}</td></tr>`);
  }
  Object.values(countMap).forEach(({ item, spec, count }) => {
    const isAid = aidSet.has(item);
    const cat = isAid ? '輔具' : '修繕';
    let label = haLabelOf(isAid ? HA_AID_ITEMS : HA_RENO_ITEMS, item);
    if (spec) label = `${label}-${haLabelOf(HA_RAMP_GRADES, spec)}`;
    rows.push(`<tr><td>${cat}</td><td>${escapeHtml(label)}</td><td>共 ${count} 處</td></tr>`);
  });

  if (rows.length === 0) {
    return `<div class="ha-empty">尚無資料，請先新增輔具或修繕項目</div>`;
  }
  return `
    <table class="ha-summary-table">
      <thead><tr><th>類別</th><th>項目</th><th>數量</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}

function updateHaSummary() {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  const section = document.getElementById('haSummarySection');
  if (!section) return;
  section.innerHTML = `<h3>6. 總結（自動彙整）</h3>${renderHaSummary(c.homeAccessibility)}`;
}

function saveHaField(field, value) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  c.homeAccessibility[field] = value;
  touchCase(c.id);
  saveState();
}

function saveHaGross(action, level) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  if (!c.homeAccessibility.gross_motor) c.homeAccessibility.gross_motor = {};
  c.homeAccessibility.gross_motor[action] = level;
  touchCase(c.id);
  saveState();
}

function saveHaFine(col, level) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  if (!c.homeAccessibility.fine_motor) c.homeAccessibility.fine_motor = {};
  c.homeAccessibility.fine_motor[col] = level;
  touchCase(c.id);
  saveState();
}

function saveHaRowField(list, idx, field, value) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  const arr = c.homeAccessibility[list];
  if (!arr || !arr[idx]) return;
  arr[idx][field] = value;
  if (field === 'item') {
    arr[idx].spec = null;
    ['ramp_height_diff','ramp_length_min','ramp_length_max','ramp_width_min','ramp_width_max','ramp_door_clear_width',
     'handrail_height','handrail_length','handrail_length_vertical','handrail_length_horizontal',
     'u_width','u_depth']
      .forEach(k => delete arr[idx][k]);
  }
  if (field === 'spec' && arr[idx].item === 'fixed_handrail') {
    ['handrail_length','handrail_length_vertical','handrail_length_horizontal','u_width','u_depth']
      .forEach(k => delete arr[idx][k]);
  }
  touchCase(c.id);
  saveState();
}

function addHaRow(list) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  if (!c.homeAccessibility[list]) c.homeAccessibility[list] = [];
  c.homeAccessibility[list].push({ location: '', item: '', spec: null, note: '' });
  touchCase(c.id);
  saveState();
  renderHomeAccessibilityForm(c.id);
}

function removeHaRow(list, idx) {
  const c = state.cases[state.currentCaseId];
  if (!c) return;
  const arr = c.homeAccessibility[list];
  if (!arr || idx < 0 || idx >= arr.length) return;
  if (!confirm('確定刪除此列？')) return;
  arr.splice(idx, 1);
  touchCase(c.id);
  saveState();
  renderHomeAccessibilityForm(c.id);
}

export {
  HA_LOCATIONS, HA_GROSS_LEVELS, HA_GROSS_ACTIONS, HA_FINE_LEVELS, HA_FINE_COLS,
  HA_AID_ITEMS, HA_RENO_ITEMS, HA_RAMP_GRADES, HA_DOOR_SPECS, HA_HANDRAIL_TYPES,
  HA_LEVELDIFF_SPECS, calcGrabBar, renderGrabCalcResults, haLabelOf,
  renderHomeAccessibilityForm, haLocOptions, haNumField, haRangeField,
  renderHaAidRow, renderHaRenoRow, renderHaSummary, updateHaSummary,
  saveHaField, saveHaGross, saveHaFine, saveHaRowField, addHaRow, removeHaRow
};
