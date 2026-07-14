import { state } from '../core/state.js';
import { escapeHtml, escapeAttr } from '../core/dom.js';

/* Stair and platform form rendering
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   Rendering — Editor View
   ========================================================================== */
function renderEditor() {
  const c = state.cases[state.currentCaseId];
  if (!c) return;

  const container = document.getElementById('blocksContainer');
  let stairNum = 0, platformNum = 0;
  container.innerHTML = c.blocks.map((b, idx) => {
    const isLast = idx === c.blocks.length - 1;
    const canDelete = isLast && idx > 0;
    if (b.type === 'stair') {
      stairNum++;
      return renderStair(b, stairNum, canDelete);
    } else {
      platformNum++;
      return renderPlatform(b, platformNum, canDelete);
    }
  }).join('');

  // Update flow buttons
  const last = c.blocks[c.blocks.length - 1];
  const addStair = document.getElementById('addStairBtn');
  const addPlatform = document.getElementById('addPlatformBtn');
  if (last && last.type === 'stair') {
    addStair.disabled = true;
    addPlatform.disabled = false;
  } else {
    addStair.disabled = false;
    addPlatform.disabled = true;
  }

  // Calc button enabled as long as there is at least one stair block
  const calcBtn = document.getElementById('calcBtn');
  calcBtn.disabled = !c.blocks.some(b => b.type === 'stair');
}

function renderStair(b, num, canDelete) {
  const firstStep = b.steps[0];
  const firstStepHtml = `
    <div class="step-row first-step">
      <span class="idx">第1階</span>
      <div class="field">
        <input type="number" inputmode="decimal" step="0.1" min="0"
               data-block="${b.id}" data-step="${firstStep.id}" data-field="height"
               value="${escapeAttr(firstStep.height)}" placeholder="階高" aria-label="第1階階高">
        <span class="unit">cm</span>
        <span class="warn-hint${parseFloat(firstStep.height) >= 100 ? ' visible' : ''}">⚠ 階高好像有問題?!</span>
      </div>
      <div class="no-input">（不量斜邊）</div>
      <div></div>
    </div>
  `;

  const restStepsHtml = b.steps.slice(1).map((s, i) => `
    <div class="step-row">
      <span class="idx">第${i+2}階</span>
      <div class="field">
        <input type="number" inputmode="decimal" step="0.1" min="0"
               data-block="${b.id}" data-step="${s.id}" data-field="height"
               value="${escapeAttr(s.height)}" placeholder="階高" aria-label="第${i+2}階階高">
        <span class="unit">cm</span>
        <span class="warn-hint${parseFloat(s.height) >= 100 ? ' visible' : ''}">⚠ 階高好像有問題?!</span>
      </div>
      <div class="field">
        <input type="number" inputmode="decimal" step="0.1" min="0"
               data-block="${b.id}" data-step="${s.id}" data-field="slope"
               value="${escapeAttr(s.slope)}" placeholder="斜邊長" aria-label="第${i+2}階斜邊長">
        <span class="unit">cm</span>
        <span class="warn-hint${parseFloat(s.slope) >= 100 ? ' visible' : ''}">⚠ 斜邊長好像有問題?!</span>
      </div>
      <button class="del-step" data-del-step data-block="${b.id}" data-step="${s.id}" aria-label="刪除此階">✕</button>
    </div>
  `).join('');

  const stepsHtml = firstStepHtml + restStepsHtml;

  return `
    <div class="block stair" data-block-id="${b.id}">
      <div class="block-header">
        <div class="title">
          <span>第 ${num} 段樓梯</span>
        </div>
        ${canDelete ? `<button class="remove-block" data-remove-block="${b.id}">刪除</button>` : ''}
      </div>
      <div class="block-body">
        <div class="header-row">
          <span>階序</span><span>階高</span><span>斜邊長</span><span></span>
        </div>
        ${stepsHtml}
        <button class="add-step-btn" data-add-step="${b.id}">＋ 新增一階</button>
        <div class="width-field">
          <label class="field-label">梯寬（整段樓梯）</label>
          <div class="field">
            <input type="number" inputmode="decimal" step="0.1" min="0"
                   data-block="${b.id}" data-field="width"
                   value="${escapeAttr(b.width)}" placeholder="梯寬">
            <span class="unit">cm</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPlatform(b, num, canDelete) {
  return `
    <div class="block platform" data-block-id="${b.id}">
      <div class="block-header">
        <div class="title">
          <span>第 ${num} 個迴轉平台</span>
        </div>
        ${canDelete ? `<button class="remove-block" data-remove-block="${b.id}">刪除</button>` : ''}
      </div>
      <div class="block-body">
        <div class="field-group">
          <div>
            <label class="field-label">平台寬度</label>
            <div class="field">
              <input type="number" inputmode="decimal" step="0.1" min="0"
                     data-block="${b.id}" data-field="width"
                     value="${escapeAttr(b.width)}" placeholder="寬度">
              <span class="unit">cm</span>
            </div>
          </div>
          <div class="two-col">
            <div>
              <label class="field-label">平台深度 ①</label>
              <div class="field">
                <input type="number" inputmode="decimal" step="0.1" min="0"
                       data-block="${b.id}" data-field="depth1"
                       value="${escapeAttr(b.depth1)}" placeholder="深度">
                <span class="unit">cm</span>
              </div>
            </div>
            <div>
              <label class="field-label">平台深度 ②（可選）</label>
              <div class="field">
                <input type="number" inputmode="decimal" step="0.1" min="0"
                       data-block="${b.id}" data-field="depth2"
                       value="${escapeAttr(b.depth2)}" placeholder="深度">
                <span class="unit">cm</span>
              </div>
            </div>
          </div>
          <div class="platform-type-wrap">
            <label class="field-label">平台類型</label>
            <div class="shoe-toggle" style="width:fit-content;">
              <input type="radio" id="pt-std-${b.id}" name="pt-${b.id}"
                     data-block="${b.id}" data-field="platformType"
                     value="Standard" ${b.platformType !== 'Special' ? 'checked' : ''}>
              <label for="pt-std-${b.id}">一般</label>
              <input type="radio" id="pt-spc-${b.id}" name="pt-${b.id}"
                     data-block="${b.id}" data-field="platformType"
                     value="Special" ${b.platformType === 'Special' ? 'checked' : ''}>
              <label for="pt-spc-${b.id}">特殊型</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export { renderEditor, renderStair, renderPlatform };
