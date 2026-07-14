import { escapeHtml } from '../core/dom.js';

/* Stair measurements and eligibility rules
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   Calculation
   ========================================================================== */
function toNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function calcRange(values) {
  const nums = values.filter(v => v !== null && Number.isFinite(v));
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, count: nums.length };
}

function fmtNum(n, decimals = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const rounded = Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
  return String(rounded);
}

function fmtRange(r, unit = 'cm', decimals = 1) {
  if (!r) return { text: '—', empty: true };
  const a = fmtNum(r.min, decimals);
  const b = fmtNum(r.max, decimals);
  const text = a === b ? `${a}` : `${a}–${b}`;
  return { text, unit, empty: false };
}

function computeResults(c) {
  const stairs = c.blocks.filter(b => b.type === 'stair');
  const platforms = c.blocks.filter(b => b.type === 'platform');

  // 1. 梯間迴轉平台
  const platformWidths = platforms.map(p => toNum(p.width)).filter(v => v !== null);
  const platformDepths = platforms.flatMap(p => [toNum(p.depth1), toNum(p.depth2)]).filter(v => v !== null);

  // 2. 梯寬
  const stairWidths = stairs.map(s => toNum(s.width)).filter(v => v !== null);

  // 3. 梯深 = 換算階深 = √(斜邊長² − 階高²)。第一階無斜邊長，不計入。
  const allDepths = stairs.flatMap(s => s.steps.slice(1).map(st => {
    const h = toNum(st.height);
    const sl = toNum(st.slope);
    if (h === null || sl === null || sl <= 0) return null;
    if (h > sl) return null;
    return Math.sqrt(sl * sl - h * h);
  })).filter(v => v !== null);

  // 4. 相鄰兩斜邊加總 — 從第 2 階起配對（第 1 階無斜邊）
  const adjSlopeSums = [];
  stairs.forEach(s => {
    for (let i = 1; i < s.steps.length - 1; i++) {
      const a = toNum(s.steps[i].slope);
      const b = toNum(s.steps[i+1].slope);
      if (a !== null && b !== null) adjSlopeSums.push(a + b);
    }
  });

  // 5. 梯階高度（不含第一階）
  const heightsExceptFirst = stairs.flatMap(s => s.steps.slice(1).map(st => toNum(st.height))).filter(v => v !== null);

  // 6. 各樓層第一階高
  const firstStepHeights = stairs.map(s => s.steps[0] ? toNum(s.steps[0].height) : null).filter(v => v !== null);

  // 7. 樓梯傾角 — 不含每段樓梯的第一階；斜邊長為鼻端到鼻端的斜邊（hypotenuse），
  //    故使用 arcsin(階高 / 斜邊長)。若階高 > 斜邊長（資料錯誤）則略過。
  const angles = stairs.flatMap(s => s.steps.slice(1).map(st => {
    const h = toNum(st.height);
    const sl = toNum(st.slope);
    if (h === null || sl === null || sl <= 0) return null;
    if (h > sl) return null;
    return Math.asin(h / sl) * 180 / Math.PI;
  })).filter(v => v !== null);

  return {
    platform: {
      width: calcRange(platformWidths),
      depth: calcRange(platformDepths)
    },
    stairWidth: calcRange(stairWidths),
    stairDepth: calcRange(allDepths),
    adjSlopeSum: calcRange(adjSlopeSums),
    heightExceptFirst: calcRange(heightsExceptFirst),
    firstStepHeight: calcRange(firstStepHeights),
    angle: calcRange(angles)
  };
}

function computeEligibility(c, r, climberType, serviceMode) {
  const angle         = r.angle         ? r.angle.max          : null;
  const h1            = r.firstStepHeight ? r.firstStepHeight.max : null;
  const h_others      = r.heightExceptFirst ? r.heightExceptFirst.max : null;
  const step_depth    = r.stairDepth    ? r.stairDepth.min     : null;
  const platform_depth = r.platform.depth ? r.platform.depth.min : null;
  const hasSpecial = c.blocks.some(b => b.type === 'platform' && b.platformType === 'Special');

  const missingMeasurements = [];
  if (angle === null) missingMeasurements.push('樓梯傾角（階高與斜邊長）');
  if (h1 === null) missingMeasurements.push('第一階高');
  if (h_others === null) missingMeasurements.push('第二階起的階高');
  if (step_depth === null) missingMeasurements.push('梯深（階高與斜邊長）');
  if (c.blocks.some(b => b.type === 'platform') && platform_depth === null) {
    missingMeasurements.push('迴轉平台深度');
  }

  if (missingMeasurements.length) {
    return {
      eligibility: 'Incomplete',
      constraints: [`資料不足：請補填${missingMeasurements.join('、')}`],
      required_actions: [],
      missing_docs: []
    };
  }

  let eligibility = 'Allow';
  const constraints = [];
  const required_actions = [];
  const missing_docs = [];

  const promote = (level) => {
    const rank = { Allow: 0, Warning: 1, Project: 2, Forbidden: 3 };
    if (rank[level] > rank[eligibility]) eligibility = level;
  };

  if (climberType === 'Crawler' || climberType === 'CrawlerChair') {
    if (angle !== null) {
      if (serviceMode === 'Single') {
        if (angle > 40) {
          promote('Project'); constraints.push(`傾角 ${angle.toFixed(1)}° 超過 40°（單次服務上限）`);
        } else if (angle > 35) {
          promote('Warning');
          constraints.push(`傾角 ${angle.toFixed(1)}° 超出產品建議使用之安全範圍`);
        }
      } else {
        if (angle > 37) {
          promote('Project'); constraints.push(`傾角 ${angle.toFixed(1)}° 超過 37°`);
        } else if (angle > 35) {
          promote('Warning'); constraints.push(`傾角 ${angle.toFixed(1)}° 超出建議範圍（35°–37°）`);
        }
      }
    }
    if (climberType === 'Crawler' && h1 !== null && h1 > 20) {
      promote('Warning');
      required_actions.push('需加墊使第一階低於 20 cm');
    }
    if (platform_depth !== null || hasSpecial) {
      const pd = platform_depth;
      if (hasSpecial || (pd !== null && pd < 85)) {
        // 規格：深度 < 85 或特殊型平台，僅限 CrawlerChair 走專案申請
        if (climberType === 'Crawler') {
          promote('Forbidden');
          constraints.push('平台深度 < 85 cm 或特殊型平台，不適用（請改用履帶式電動爬梯椅）');
        } else {
          promote('Project');
          constraints.push('平台深度 < 85 cm 或特殊型平台，需專案申請');
          missing_docs.push('廠商或照顧者操作影片');
        }
      } else if (pd !== null && pd < 90) {
        // 規格：85–90 cm，僅限 CrawlerChair，不需附文件
        if (climberType === 'Crawler') {
          promote('Forbidden');
          constraints.push(`平台深度 ${pd.toFixed(1)} cm（85–90 cm），不適用（請改用履帶式電動爬梯椅）`);
        } else {
          constraints.push(`平台深度 ${pd.toFixed(1)} cm（85–90 cm），僅適用履帶式電動爬梯椅`);
        }
      } else if (pd !== null && pd < 95) {
        if (climberType === 'Crawler') {
          promote('Warning');
          constraints.push(`平台深度 ${pd.toFixed(1)} cm（90–95 cm），建議直接坐椅型，需影片複評`);
          missing_docs.push('操作影片');
        }
      } else if (pd !== null && pd < 100) {
        if (climberType === 'Crawler') {
          promote('Warning');
          constraints.push(`平台深度 ${pd.toFixed(1)} cm（95–100 cm），建議輪椅附掛型，需影片複評`);
          missing_docs.push('操作影片');
        }
      } else if (pd !== null && pd < 105) {
        if (climberType === 'Crawler') {
          promote('Warning');
          constraints.push(`平台深度 ${pd.toFixed(1)} cm（100–105 cm），建議兩用型，需影片複評`);
          missing_docs.push('操作影片');
        }
      }
    }
  }

  if (climberType === 'Stick') {
    if (h1 !== null && h1 > 21 && h_others !== null && h_others <= 21) {
      promote('Warning');
      required_actions.push('需加墊（第一階超 21 cm，墊子深度 ≥ 12 cm）');
    }
    if (h_others !== null && h_others > 21) {
      if (serviceMode !== 'Purchase') {
        promote('Forbidden');
        constraints.push(`其餘各階高度 ${h_others.toFixed(1)} cm 超過 21 cm，不可租賃`);
      } else if (h_others <= 22.5) {
        // 規格：21 < h_others ≤ 22.5，購置可選配撐桿加長配件
        promote('Warning');
        required_actions.push('需選配撐桿加長配件（其餘各階高超過 21 cm）');
      } else {
        // 規格：h_others > 22.5，購置也無法使用
        promote('Forbidden');
        constraints.push(`其餘各階高度 ${h_others.toFixed(1)} cm 超過 22.5 cm，不可使用`);
      }
    }
    if (step_depth !== null) {
      if (step_depth < 12) {
        promote('Forbidden');
        constraints.push(`梯深 ${step_depth.toFixed(1)} cm 不足 12 cm，不可使用`);
      } else if (step_depth < 14) {
        promote('Warning');
        constraints.push(`梯深 ${step_depth.toFixed(1)} cm（12–14 cm），需拍攝操作影片複評`);
        missing_docs.push('操作影片（影片複評）');
      }
    }
    if (platform_depth !== null && platform_depth < 63) {
      promote('Forbidden');
      constraints.push(`平台深度 ${platform_depth.toFixed(1)} cm 不足 63 cm，不可使用`);
    }
    if (hasSpecial) {
      promote('Warning');
      constraints.push('特殊型平台，需拍攝操作影片複評');
      missing_docs.push('操作影片（特殊型平台）');
    }
  }

  if (eligibility === 'Project') {
    missing_docs.unshift('使用爬梯機服務風險告知同意書');
    const hasVideo = missing_docs.some(d => d.includes('操作影片'));
    if (!hasVideo) {
      missing_docs.push(serviceMode === 'Single' ? '廠商操作影片' : '照顧者操作影片');
    }
    // 月租/購置 或 平台<85/特殊型：規格為「報告書或認證書」擇一
    const needsCertOr = serviceMode === 'Monthly' || serviceMode === 'Purchase' ||
        (platform_depth !== null && platform_depth < 85) || hasSpecial;
    missing_docs.push(needsCertOr
      ? '「爬梯機操作改善報告書或廠商核發之操作認證書」'
      : '爬梯機操作改善報告書');
  }

  const seen = new Set();
  const uniqueDocs = missing_docs.filter(d => { if (seen.has(d)) return false; seen.add(d); return true; });

  return { eligibility, constraints, required_actions, missing_docs: uniqueDocs };
}

function computeAllEligibility(c) {
  const r = computeResults(c);
  const types = ['Crawler', 'CrawlerChair', 'Stick'];
  const modes = ['Single', 'Monthly', 'Purchase'];
  const results = {};
  for (const t of types) {
    results[t] = {};
    for (const m of modes) {
      results[t][m] = computeEligibility(c, r, t, m);
    }
  }
  return results;
}

function renderResults(c) {
  const r = computeResults(c);

  const rowHtml = (label, widthCell, depthCell) => {
    return `<tr>
      <td class="label">${label}</td>
      <td class="value ${widthCell.empty ? 'none' : ''}">${widthCell.empty ? '—' : `${widthCell.text}<span class="unit-sm">${widthCell.unit||''}</span>`}</td>
      <td class="value ${depthCell && depthCell.empty ? 'none' : ''}">${depthCell ? (depthCell.empty ? '—' : `${depthCell.text}<span class="unit-sm">${depthCell.unit||''}</span>`) : ''}</td>
    </tr>`;
  };

  const rows = [];
  rows.push(rowHtml('梯間迴轉平台（寬 × 深）', fmtRange(r.platform.width), fmtRange(r.platform.depth)));
  rows.push(rowHtml('梯寬', fmtRange(r.stairWidth), null));
  rows.push(rowHtml('梯深', fmtRange(r.stairDepth, 'cm', 0), null));
  rows.push(rowHtml('相鄰兩斜邊加總', fmtRange(r.adjSlopeSum), null));
  rows.push(rowHtml('梯階高度', fmtRange(r.heightExceptFirst), null));
  rows.push(rowHtml('第一階高', fmtRange(r.firstStepHeight), null));
  rows.push(rowHtml('樓梯傾角', fmtRange(r.angle, '°', 0), null));

  document.getElementById('resultsBody').innerHTML = rows.join('');
  document.getElementById('eligibilitySection').innerHTML = renderEligibilitySection(c);
  const inlineResults = document.getElementById('inlineResults');
  inlineResults.style.display = 'block';
  inlineResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderEligibilitySection(c) {
  const all = computeAllEligibility(c);
  const typeLabels = { Crawler: '履帶式爬梯機', CrawlerChair: '履帶式電動爬梯椅', Stick: '撐桿式爬梯機' };
  const modeLabels = { Single: '單次', Monthly: '月租', Purchase: '購置' };
  const badgeClass = { Incomplete: 'elig-incomplete', Allow: 'elig-allow', Warning: 'elig-warning', Project: 'elig-project', Forbidden: 'elig-forbidden' };
  const badgeLabel = { Incomplete: '資料不足', Allow: '適用', Warning: '注意', Project: '專案申請', Forbidden: '不適用' };

  const typeCards = Object.entries(all).map(([type, modes]) => {
    const modeRows = Object.entries(modes).map(([mode, res]) => {
      const noteItems = [...res.constraints, ...res.required_actions];
      const noteHtml = noteItems.length > 0
        ? `<ul class="elig-notes">${noteItems.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
        : '';
      const docsHtml = res.missing_docs.length > 0
        ? `<div class="elig-docs">所需文件：${res.missing_docs.map(d => escapeHtml(d)).join('、')}</div>`
        : '';
      return `
        <div class="elig-mode-row">
          <span class="elig-mode-label">${modeLabels[mode]}</span>
          <span class="elig-badge ${badgeClass[res.eligibility]}">${badgeLabel[res.eligibility]}</span>
          <div class="elig-detail">${noteHtml}${docsHtml}</div>
        </div>`;
    }).join('');
    return `
      <div class="elig-type-card">
        <div class="elig-type-title">${typeLabels[type]}</div>
        ${modeRows}
      </div>`;
  }).join('');

  return `
    <div class="elig-section">
      <div class="elig-section-title">爬梯機適用性</div>
      ${typeCards}
    </div>`;
}

function resultsAsText(c) {
  const r = computeResults(c);
  const line = (label, w, d) => {
    const wt = w.empty ? '—' : `${w.text}${w.unit?' '+w.unit:''}`;
    if (d) {
      const dt = d.empty ? '—' : `${d.text}${d.unit?' '+d.unit:''}`;
      return `${label}：寬 ${wt}　深 ${dt}`;
    }
    return `${label}：${wt}`;
  };
  const lines = [
    `【${c.name}】量測結果`,
    line('梯間迴轉平台', fmtRange(r.platform.width), fmtRange(r.platform.depth)),
    line('梯寬', fmtRange(r.stairWidth)),
    line('梯深', fmtRange(r.stairDepth, 'cm', 0)),
    line('相鄰兩斜邊加總', fmtRange(r.adjSlopeSum)),
    line('梯階高度', fmtRange(r.heightExceptFirst)),
    line('第一階高', fmtRange(r.firstStepHeight)),
    line('樓梯傾角', fmtRange(r.angle, '°', 0))
  ];

  const all = computeAllEligibility(c);
  const typeLabels = { Crawler: '履帶式爬梯機', CrawlerChair: '履帶式電動爬梯椅', Stick: '撐桿式爬梯機' };
  const modeLabels = { Single: '單次', Monthly: '月租', Purchase: '購置' };
  const badgeLabel = { Allow: '適用', Warning: '注意', Project: '專案申請', Forbidden: '不適用' };
  lines.push('\n【爬梯機適用性】');
  for (const [type, modes] of Object.entries(all)) {
    lines.push(typeLabels[type]);
    for (const [mode, res] of Object.entries(modes)) {
      const label = `  ${modeLabels[mode]}：${badgeLabel[res.eligibility]}`;
      const notes = [...res.constraints, ...res.required_actions];
      lines.push(notes.length > 0 ? `${label}（${notes.join('；')}）` : label);
      if (res.missing_docs.length > 0) {
        lines.push(`    所需文件：${res.missing_docs.join('、')}`);
      }
    }
  }

  return lines.join('\n');
}

export {
  toNum, calcRange, fmtNum, fmtRange, computeResults, computeEligibility,
  computeAllEligibility, renderResults, renderEligibilitySection, resultsAsText
};
