import { state } from '../core/state.js';
import { escapeHtml, domIdToken } from '../core/dom.js';
import { formatClockTime } from '../core/format-time.js';

/* Case list rendering and shared escaping helpers
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   Rendering — List View
   ========================================================================== */
let editingCaseId = null;

function toggleEditingCase(caseId) {
  editingCaseId = editingCaseId === caseId ? null : caseId;
  return editingCaseId;
}

function clearEditingCase() {
  editingCaseId = null;
}

function moduleHasData(c, key) {
  switch (key) {
    case 'stair': return !!(c.blocks && c.blocks.some(b => b.type === 'stair' && b.steps.some(s => s.height || s.slope)));
    case 'wheelchair': { const wc = c.wheelchair; return !!(wc && (wc.seatWidth || wc.hipToKnee || wc.kneeToFoot || wc.shoulderHeight || wc.shoulderBladeHeight || wc.occipitalHeight || wc.chestWidth || wc.chestDepth || wc.shoulderDistance || wc.upperArmVertical || wc.staticSeating || wc.mobilitySeating || wc.hipLimitL || wc.hipLimitR || wc.hipNoLimitL || wc.hipNoLimitR || wc.kneeLimitL || wc.kneeLimitR || wc.kneeNoLimitL || wc.kneeNoLimitR || wc.headControl || wc.hip || wc.knee || wc.cognition || wc.visualPerception || wc.skinSensation || wc.pressureInjury || wc.transferAbility || wc.abnormalTone || (Array.isArray(wc.fallingDirection) && wc.fallingDirection.length > 0) || (Array.isArray(wc.pelvisPosture) && wc.pelvisPosture.length > 0) || (Array.isArray(wc.pelvisSlide) && wc.pelvisSlide.length > 0) || (Array.isArray(wc.spine) && wc.spine.length > 0) || (Array.isArray(wc.ankle) && wc.ankle.length > 0) || (Array.isArray(wc.subsidy) && wc.subsidy.length > 0) || wc.wcBaseType || (Array.isArray(wc.wcAddons) && wc.wcAddons.length > 0))); }
    case 'shower': { const sh = c.shower; return !!(sh && ((Array.isArray(sh.pelvis) && sh.pelvis.length > 0) || sh.hipWidth || sh.sittingBalance || sh.baseType || (Array.isArray(sh.subsidyItems) && sh.subsidyItems.length > 0))); }
    case 'walker': { const wk = c.walker; return !!(wk && (wk.toneHead || wk.sittingBalance || wk.sitToStand || wk.handleHeight)); }
    case 'transfer': { const tf = c.transfer; return !!(tf && (tf.waist || tf.sittingBalance || tf.sitToStand || (Array.isArray(tf.resultItems) && tf.resultItems.length > 0))); }
    case 'cushion': { const cu = c.cushion; return !!(cu && (cu.hipWidth || cu.staticBalance || cu.pressureRelief || (Array.isArray(cu.assessmentResult) && cu.assessmentResult.length > 0))); }
    case 'airbed': { const ab = c.airbed; return !!(ab && (ab.mattressType || ab.consciousness || ab.staticBalance || (Array.isArray(ab.assessmentResult) && ab.assessmentResult.length > 0))); }
    case 'homeAccessibility': { const ha = c.homeAccessibility; return !!(ha && ((ha.gross_motor && Object.keys(ha.gross_motor).length > 0) || (ha.fine_motor && Object.keys(ha.fine_motor).length > 0) || (Array.isArray(ha.locations) && ha.locations.length > 0) || (Array.isArray(ha.assistive_devices) && ha.assistive_devices.length > 0) || (Array.isArray(ha.renovations) && ha.renovations.length > 0) || (Array.isArray(ha.subsidy) && ha.subsidy.length > 0))); }
    default: return false;
  }
}

function renderList() {
  const list = document.getElementById('caseList');
  const entries = Object.values(state.cases).sort((a, b) => b.updatedAt - a.updatedAt);
  document.getElementById('caseCount').textContent = entries.length ? `${entries.length} 筆` : '';

  if (entries.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>
        </svg>
        <div>尚無個案，輸入名稱建立第一筆</div>
      </div>
    `;
    return;
  }

  list.innerHTML = entries.map(c => {
    const hasStairData    = moduleHasData(c, 'stair');
    const hasWcData       = moduleHasData(c, 'wheelchair');
    const hasShowerData   = moduleHasData(c, 'shower');
    const hasWalkerData   = moduleHasData(c, 'walker');
    const hasTransferData = moduleHasData(c, 'transfer');
    const hasCushionData  = moduleHasData(c, 'cushion');
    const hasAirbedData   = moduleHasData(c, 'airbed');
    const hasHaData       = moduleHasData(c, 'homeAccessibility');
    const isEditing = editingCaseId === c.id;
    function makeBadge(hasData, cls, label, mod) {
      if (!hasData) return '';
      const xBtn = isEditing
        ? `<button class="badge-remove-btn" data-remove-module="${mod}" data-case-id="${c.id}">×</button>`
        : '';
      return `<span class="assess-badge ${cls}">${label}${xBtn}</span>`;
    }
    const badges = [
      makeBadge(hasStairData,    'stair-badge',    '🏠 爬梯機',   'stair'),
      makeBadge(hasWcData,       'wc-badge',       '♿ 輪椅',      'wheelchair'),
      makeBadge(hasCushionData,  'cushion-badge',  '💺 座墊',      'cushion'),
      makeBadge(hasAirbedData,   'airbed-badge',   '🛏 床組',      'airbed'),
      makeBadge(hasShowerData,   'shower-badge',   '🚿 沐浴便盆',  'shower'),
      makeBadge(hasWalkerData,   'walker-badge',   '🚶 助步車',    'walker'),
      makeBadge(hasTransferData, 'transfer-badge', '🔄 移位',      'transfer'),
      makeBadge(hasHaData,       'ha-badge',       '🛠 居家無障礙','homeAccessibility')
    ].filter(Boolean).join('');
    return `
      <div class="case-item" data-open-case="${c.id}">
        <div class="case-meta-row">
          <div class="info">
            <div class="name">${escapeHtml(c.name)}</div>
            <div class="meta">${fmtAssessmentDate(c.assessmentDate)}</div>
            ${badges ? `<div class="assess-badges">${badges}</div>` : ''}
          </div>
          <button class="modify-btn" data-toggle-edit="${c.id}">${isEditing ? '完成' : '修改'}</button>
          <button class="del-btn" data-del="${c.id}">刪除</button>
        </div>
      </div>
    `;
  }).join('');
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `今天 ${formatClockTime(d)}`;
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

function fmtAssessmentDate(d) {
  if (!d) return '未填日期';
  const [date, time] = d.split('T');
  if (!date) return '未填日期';
  const [y, m, day] = date.split('-');
  const formatted = `${y}/${parseInt(m)}/${parseInt(day)}`;
  if (time) {
    return `${formatted} ${time}`;
  }
  return formatted;
}

export {
  moduleHasData, renderList, formatDate, fmtAssessmentDate,
  toggleEditingCase, clearEditingCase
};
