import {
  state, defaultSubsidyCalc, SHOWER_ADDON_OPTIONS, showerComboKey
} from '../core/state.js';
import { escapeHtml, escapeAttr } from '../core/dom.js';
import { toNum } from './stair-eligibility.js';

/* Subsidy catalogue, item collection, and calculation
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ===================== 補助額度／金額試算 ===================== */
// 資料來源：身障長照輔具金額對照表_115年更新版.xlsx
// econ 索引：0=低收, 1=中低收, 2=一般戶
// dis / ltc = [低收, 中低收, 一般戶]（※合併費率時三格同值）；ltc:null 代表長照無對應給付。
// 額度佔用（僅長照）= 該品項長照低收(100%)金額 = ltc[0]。
const SUBSIDY_TABLE = {
  // 輪椅：基本型＋附加功能組合（來源：輪椅補助金額對照表.md），整台輪椅算 1 項
  wc_non_light: { label:'輪椅－非輕量化量產型', dis:[3500,2625,1750], ltc:[3000,2700,2100] },
  wc_light:                             { label:'輕量化輪椅',             dis:[4000,3000,2000],  ltc:[4000,3600,2800] },
  wc_light_transfer:                    { label:'輕量化輪椅＋移位',       dis:[9000,8000,7000],  ltc:[9000,8600,7800] },
  wc_light_transfer_recline:            { label:'輕量化輪椅＋移位＋仰躺', dis:[11000,10000,9000],ltc:[11000,10600,9800] },
  wc_light_transfer_tilt:               { label:'輕量化輪椅＋移位＋傾倒', dis:[13000,12000,11000],ltc:[13000,12600,11800] },
  wc_light_transfer_recline_tilt:       { label:'輕量化輪椅＋移位＋仰躺＋傾倒', dis:[15000,14000,13000], ltc:[15000,14600,13800] },
  wc_custom:                            { label:'客製型輪椅',             dis:[9000,9000,9000],  ltc:[9000,9000,9000] },
  wc_custom_transfer:                   { label:'客製型輪椅＋移位',       dis:[14000,14000,14000], ltc:[14000,14000,14000] },
  wc_custom_transfer_recline:           { label:'客製型輪椅＋移位＋仰躺', dis:[16000,16000,16000], ltc:[16000,16000,16000] },
  wc_custom_transfer_tilt:              { label:'客製型輪椅＋移位＋傾倒', dis:[18000,18000,18000], ltc:[18000,18000,18000] },
  wc_custom_transfer_recline_tilt:      { label:'客製型輪椅＋移位＋仰躺＋傾倒', dis:[20000,20000,20000], ltc:[20000,20000,20000] },
  // 沐浴椅／便盆椅
  sh_163: { label:'移動式身體清洗槽－局部型', dis:[1200,900,600], ltc:[2000,1800,1400] },
  sh_164: { label:'移動式身體清洗槽－全身型', dis:[5000,3750,2500], ltc:[5000,4500,3500] },
  sh_166: { label:'馬桶增高器',       dis:[800,600,400],  ltc:[1200,1080,840] },
  sh_167: { label:'沐浴椅（一般型）', dis:[900,675,450],  ltc:[1200,1080,840] },
  sh_168: { label:'便盆椅（一般型）', dis:[1200,900,600], ltc:[1200,1080,840] },
  sh_169: { label:'沐浴／便盆椅附加－附輪',       dis:[1000,750,500],  ltc:null },
  sh_170: { label:'沐浴／便盆椅附加－利於移位扶手', dis:[1000,750,500],  ltc:null },
  sh_171: { label:'沐浴／便盆椅附加－仰躺功能',   dis:[1500,1125,750], ltc:null },
  sh_172: { label:'沐浴／便盆椅附加－空中傾倒功能', dis:[3500,2625,1750], ltc:null },
  // 沐浴椅／便盆椅的常用組合；其他獨立勾選組合會由 ensureShowerSubsidyEntry 即時計算。
  // 身障＝基本型＋各附加項相加，長照＝固定合併價（不因附加功能變動，來源見上方備註）
  sh_167__wheel:                       { label:'沐浴椅＋附輪',                     dis:[1900,1425,950],  ltc:[1200,1080,840] },
  sh_167__wheel_transfer:              { label:'沐浴椅＋附輪＋利於移位',           dis:[2900,2175,1450], ltc:[1200,1080,840] },
  sh_167__wheel_transfer_recline:      { label:'沐浴椅＋附輪＋利於移位＋仰躺',     dis:[4400,3300,2200], ltc:[1200,1080,840] },
  sh_167__wheel_transfer_tilt:         { label:'沐浴椅＋附輪＋利於移位＋空中傾倒', dis:[6400,4800,3200], ltc:[1200,1080,840] },
  sh_167__wheel_transfer_recline_tilt: { label:'沐浴椅＋附輪＋利於移位＋仰躺＋空中傾倒', dis:[7900,5925,3950], ltc:[1200,1080,840] },
  sh_168__wheel:                       { label:'便盆椅＋附輪',                     dis:[2200,1650,1100], ltc:[1200,1080,840] },
  sh_168__wheel_transfer:              { label:'便盆椅＋附輪＋利於移位',           dis:[3200,2400,1600], ltc:[1200,1080,840] },
  sh_168__wheel_transfer_recline:      { label:'便盆椅＋附輪＋利於移位＋仰躺',     dis:[4700,3525,2350], ltc:[1200,1080,840] },
  sh_168__wheel_transfer_tilt:         { label:'便盆椅＋附輪＋利於移位＋空中傾倒', dis:[6700,5025,3350], ltc:[1200,1080,840] },
  sh_168__wheel_transfer_recline_tilt: { label:'便盆椅＋附輪＋利於移位＋仰躺＋空中傾倒', dis:[8200,6150,4100], ltc:[1200,1080,840] },
  // 移位輔具
  tf_belt:         { label:'移位腰帶',       dis:[1500,1125,750],  ltc:[1500,1350,1050] },
  tf_turntable:    { label:'移位轉盤',       dis:[2000,1500,1000], ltc:[2000,1800,1400] },
  tf_board:        { label:'移位板',         dis:[2000,1500,1000], ltc:[2000,1800,1400] },
  tf_sling_manual: { label:'人力移位吊帶',   dis:[4000,3000,2000], ltc:[4000,3600,2800] },
  tf_slide_cloth:  { label:'移位滑布',       dis:[1000,750,500],   ltc:[3000,2700,2100] }, // 長照移位滑墊A款
  tf_slide_lying:  { label:'躺式移位滑墊',   dis:[6000,4500,3000], ltc:[8000,7200,5600] }, // 長照移位滑墊B款
  tf_lift_manual:  { label:'移位機－人力型', dis:[30000,22500,15000], ltc:null },
  tf_lift_electric:{ label:'移位機－電動型', dis:[60000,45000,30000], ltc:[40000,36000,28000] },
  tf_lift_sling:   { label:'移位機吊帶',     dis:[6000,4500,3000], ltc:[6000,5400,4200] },
  // 輪椅座墊（※合併費率，金額不因經濟別分級；來源：輪椅座墊補助金額對照表.md）
  cu_A:    { label:'座墊－連通管氣囊基礎型（A款）', dis:[5000,5000,5000],   ltc:[5000,5000,5000] },
  cu_B:    { label:'座墊－連通管橡膠基礎型（B款）', dis:[8000,8000,8000],   ltc:[10000,10000,10000] },
  cu_zone: { label:'座墊－連通管橡膠分區型',       dis:[11000,11000,11000], ltc:[10000,10000,10000] }, // 身障116→長照EG04 B款
  cu_C:    { label:'座墊－液態凝膠（C款）',         dis:[8000,8000,8000],   ltc:[10000,10000,10000] },
  cu_D:    { label:'座墊－固態凝膠（D款）',         dis:[8000,8000,8000],   ltc:[8000,8000,8000] },
  cu_E:    { label:'座墊－填充式氣囊（E款）',       dis:[10000,10000,10000], ltc:[8000,8000,8000] },
  cu_F:    { label:'座墊－交替充氣型（F款）',       dis:null,               ltc:[5000,5000,5000] }, // 長照EG08，身障無對應
  cu_G:    { label:'座墊－客製化適形泡棉（G款）',   dis:[8000,8000,8000],   ltc:[10000,10000,10000] },
  // 氣墊床／電動床
  // 氣墊床：身障不分經濟別，金額為 10,000～14,000 範圍（依基礎/進階型，於試算表下拉選擇）；長照不分經濟別固定 12,000（B款）。
  ab_airbed:      { label:'氣墊床', dis:[10000,10000,10000], disOptions:[10000,14000], ltc:[12000,12000,12000] },
  // 電動床：身障最高 21,000、長照低收最高 18,000，皆依經濟別（100%/75%/50% 與 100%/90%/70%）計算自負額差異。
  ab_electric_bed:{ label:'電動床', dis:[21000,15750,10500], ltc:[18000,16200,12600] },
  // 助行器
  wk_rollator: { label:'帶輪型助步車（助行椅）', dis:[3000,2250,1500], ltc:[3000,2700,2100] },
  // 爬梯機（長照為租賃制，不納入 4 萬額度）
  st_climber: { label:'爬梯機', dis:[80000,60000,40000],
    ltcVariants:[ { key:'trip', label:'單趟', amts:[700,630,490] }, { key:'month', label:'月租', amts:[4000,3600,2800] } ],
    noQuota:true, noRecommend:true, note:'長照為租賃（單趟／月），不佔額度、不建議管道，請自行選擇' },
  // 居家無障礙
  ha_threshold:        { label:'門檻斜角',             dis:[1000,750,500],   ltc:[1000,900,700] },
  ha_ramp_under_90cm:  { label:'非固定式斜坡板（未達90cm）', dis:[3500,2625,1750], ltc:[3500,3150,2450] },
  ha_ramp_90cm_up:     { label:'非固定式斜坡板（90cm以上）', dis:[5000,3750,2500], ltc:[5000,4500,3500] },
  ha_ramp_120cm_up:    { label:'非固定式斜坡板（120cm以上）', dis:[7000,5250,3500], ltc:[7000,6300,4900] },
  ha_ramp_150cm_up:    { label:'非固定式斜坡板（150cm以上）', dis:[10000,7500,5000], ltc:[10000,9000,7000] },
  ha_antislip:         { label:'防滑措施',             dis:[2000,1500,1000], ltc:[2000,1800,1400] },
  ha_reflective:       { label:'反光貼條或消光處理',   dis:[2000,1500,1000], ltc:[3000,2700,2100] },
  ha_toilet_handrail:  { label:'馬桶扶手',             dis:[900,675,450],    ltc:null },
  ha_bed_handrail:     { label:'床邊扶手',             dis:[1000,750,500],   ltc:[1000,900,700] },
  ha_door_simple:      { label:'門－簡易型',           dis:[7000,5250,3500], ltc:[7000,6300,4900] },
  ha_door_advanced:    { label:'門－進階型',           dis:[10000,7500,5000], ltc:[10000,9000,7000] },
  ha_fixed_handrail:   { label:'固定式扶手（每10cm）', dis:[160,120,80],     ltc:[160,144,112], note:'依實際長度計' },
  ha_movable_handrail: { label:'可動式扶手（單支）',   dis:[3600,2700,1800], ltc:[3600,3240,2520] },
  ha_drainage:         { label:'截水槽',               dis:[6000,4500,3000], ltc:[6000,5400,4200] },
  ha_level_under_10cm: { label:'改善高低差（10cm以下）', dis:[3500,2625,1750], ltc:[3500,3150,2450] },
  ha_level_under_20cm: { label:'改善高低差（20cm以下）', dis:[5000,3750,2500], ltc:[5000,4500,3500] },
  ha_level_under_30cm: { label:'改善高低差（30cm以下）', dis:[7000,5250,3500], ltc:[7000,6300,4900] },
  ha_level_over_30cm:  { label:'改善高低差（超過30cm）', dis:[10000,7500,5000], ltc:[10000,9000,7000] },
  ha_faucet:           { label:'水龍頭',               dis:[3000,2250,1500], ltc:[3000,2700,2100] },
  ha_antislip_tile:    { label:'防滑地磚',             dis:[6000,4500,3000], ltc:[6000,5400,4200] },
  ha_bathtub:          { label:'改善浴缸',             dis:[7000,5250,3500], ltc:[7000,6300,4900] },
  ha_sink:             { label:'改善洗臉台（槽）',     dis:[3000,2250,1500], ltc:[3000,2700,2100] },
  ha_toilet:           { label:'改善馬桶',             dis:[5000,3750,2500], ltc:[5000,4500,3500] },
  ha_toilet_backrest:  { label:'馬桶背靠',             dis:[2000,1500,1000], ltc:[2000,1800,1400] },
  ha_counter:          { label:'改善流理台',           dis:[15000,11250,7500], ltc:[15000,13500,10500] },
  ha_range_hood:       { label:'改善抽油煙機',         dis:[1000,750,500],   ltc:[1000,900,700] },
  ha_partition:        { label:'隔間（每m²）',         dis:[800,600,400],    ltc:[800,720,560], note:'依實際面積計' },
  ha_wall_shower:      { label:'壁掛式淋浴台',         dis:[5000,3750,2500], ltc:[5000,4500,3500] },
  // 免評估項目：單支拐杖／助行器（身障、長照款式不同，需先選管道再選款式；來源：免評估項目補助金額對照表.md）
  ex_cane: { label:'單支拐杖',
    disVariants:[ { key:'mass', label:'量產型', amts:[500,375,250] }, { key:'custom', label:'客製型', amts:[1500,1125,750] } ],
    ltcVariants:[ { key:'steel', label:'不鏽鋼製', amts:[1000,900,700] }, { key:'alu', label:'鋁製', amts:[500,450,350] } ] },
  ex_walker: { label:'助行器',
    disVariants:[ { key:'normal', label:'一般型', amts:[800,600,400] }, { key:'rtype', label:'輪管型／助起型(R型)', amts:[1200,900,600] } ],
    ltcVariants:[ { key:'default', label:'助行器', amts:[800,720,560] } ] }
};

const SHOWER_ADDON_SUBSIDY_KEYS = Object.freeze({
  wheel: 'sh_169', transfer: 'sh_170', recline: 'sh_171', tilt: 'sh_172'
});

function ensureShowerSubsidyEntry(baseType, addons) {
  const key = showerComboKey(baseType, addons);
  if (!key || SUBSIDY_TABLE[key]) return key;

  const baseKey = baseType === 'shower' ? 'sh_167' : 'sh_168';
  const base = SUBSIDY_TABLE[baseKey];
  const selected = SHOWER_ADDON_OPTIONS
    .filter(([value]) => Array.isArray(addons) && addons.includes(value))
    .map(([value]) => SUBSIDY_TABLE[SHOWER_ADDON_SUBSIDY_KEYS[value]]);

  SUBSIDY_TABLE[key] = {
    label: [base.label, ...selected.map(item => item.label.replace('沐浴／便盆椅附加－', ''))].join('＋'),
    dis: base.dis.map((amount, econ) => amount + selected.reduce((sum, item) => sum + item.dis[econ], 0)),
    ltc: base.ltc.slice()
  };
  return key;
}

// 輪椅基本型 + 附加功能（可複選）→ 對照表鍵；仰躺／傾倒僅在已選移位時才計入組合
function wcComboKey(baseType, addons) {
  if (baseType === 'non_light') return 'wc_non_light';
  if (baseType !== 'light' && baseType !== 'custom') return null;
  const arr = Array.isArray(addons) ? addons : [];
  let key = 'wc_' + baseType;
  if (arr.includes('transfer')) {
    key += '_transfer';
    if (arr.includes('recline')) key += '_recline';
    if (arr.includes('tilt')) key += '_tilt';
  }
  return key;
}

function walkerHasAssessmentData(walker) {
  if (!walker) return false;
  // 保留舊版已勾選結果的相容性；新版則由實際評估內容自動判定。
  if (walker.walkerResult === true) return true;
  const ignoredFields = new Set(['walkerResult', 'subsidy', 'exemptItems']);
  return Object.entries(walker).some(([field, value]) => {
    if (ignoredFields.has(field)) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim() !== '';
    return value === true;
  });
}

// 居家無障礙 item + 規格 → 對照表鍵
function haSubsidyKey(item, spec) {
  switch (item) {
    case 'threshold_slope':  return 'ha_threshold';
    case 'portable_ramp':    return spec ? 'ha_ramp_' + spec : null;
    case 'anti_slip':        return 'ha_antislip';
    case 'reflective_strip': return 'ha_reflective';
    case 'toilet_handrail':  return 'ha_toilet_handrail';
    case 'bed_handrail':     return 'ha_bed_handrail';
    case 'door':             return spec ? 'ha_door_' + spec : null;
    case 'fixed_handrail':   return 'ha_fixed_handrail';
    case 'movable_handrail': return 'ha_movable_handrail';
    case 'drainage_trench':  return 'ha_drainage';
    case 'level_diff':       return spec ? 'ha_level_' + spec : null;
    case 'faucet':           return 'ha_faucet';
    case 'anti_slip_tile':   return 'ha_antislip_tile';
    case 'bathtub':          return 'ha_bathtub';
    case 'sink':             return 'ha_sink';
    case 'toilet':           return 'ha_toilet';
    case 'toilet_backrest':  return 'ha_toilet_backrest';
    case 'counter':          return 'ha_counter';
    case 'range_hood':       return 'ha_range_hood';
    case 'partition':        return 'ha_partition';
    case 'wall_shower':      return 'ha_wall_shower';
    default: return null;
  }
}

// 固定式扶手依總長度計價；未滿 10 公分以 1 個補助單位計。
function fixedHandrailLength(renovations) {
  return (renovations || []).reduce((total, row) => {
    if (row.item !== 'fixed_handrail') return total;
    if (row.spec === 'L_type') {
      return total + (toNum(row.handrail_length_vertical) || 0) + (toNum(row.handrail_length_horizontal) || 0);
    }
    return total + (toNum(row.handrail_length) || 0);
  }, 0);
}

// 從個案各模組彙整已勾選的建議品項
// family：用於偵測「免評估項目」與其他評估模組重複勾選同一類輔具（如輕量化輪椅、沐浴椅/便盆椅）
function collectSubsidyItems(c) {
  const items = [];
  const add = (id, key, source, group, family, details) => {
    if (key && SUBSIDY_TABLE[key]) items.push(Object.assign({ id, key, source, group, family: family || null }, details));
  };
  // 輪椅：基本型（單選）＋附加功能（可複選）→ 組合鍵，整台輪椅算 1 項
  if (c.wheelchair && c.wheelchair.wcBaseType) {
    const key = wcComboKey(c.wheelchair.wcBaseType, c.wheelchair.wcAddons);
    if (key) add(key, key, '輪椅', 'device', key.startsWith('wc_light') ? 'wc_light' : null);
  }
  // 沐浴椅／便盆椅：基本型（單選）＋附加功能（各自勾選）→ 組合鍵，整件算 1 項
  if (c.shower && c.shower.baseType) {
    const key = ensureShowerSubsidyEntry(c.shower.baseType, c.shower.addons);
    const family = c.shower.baseType === 'shower' ? 'sh_shower' : c.shower.baseType === 'commode' ? 'sh_commode' : null;
    if (key) add(key, key, '沐浴椅／便盆椅', 'device', family);
  }
  // 沐浴椅其他品項：subsidyItems 值形如 '項次163'
  const shMap = { '項次163':'sh_163','項次164':'sh_164','項次166':'sh_166' };
  (c.shower && c.shower.subsidyItems || []).forEach(v => { if (shMap[v]) add(shMap[v], shMap[v], '沐浴椅', 'device'); });
  // 移位：resultItems 為中文名
  const tfMap = { '移位腰帶':'tf_belt','移位轉盤':'tf_turntable','移位板':'tf_board','人力移位吊帶':'tf_sling_manual','移位滑布':'tf_slide_cloth','躺式移位滑墊':'tf_slide_lying','移位機-人力型':'tf_lift_manual','移位機-電動型':'tf_lift_electric','移位機吊帶':'tf_lift_sling' };
  (c.transfer && c.transfer.resultItems || []).forEach(v => { if (tfMap[v]) add(tfMap[v], tfMap[v], '移位輔具', 'device'); });
  // 座墊：assessmentResult slug
  const cuMap = { 'interconnected_basic':'cu_A','interconnected_rubber_basic':'cu_B','interconnected_rubber_zone':'cu_zone','liquid_gel':'cu_C','solid_gel':'cu_D','filled_air':'cu_E','alternating_air':'cu_F','custom_foam':'cu_G' };
  (c.cushion && c.cushion.assessmentResult || []).forEach(v => { if (cuMap[v]) add(cuMap[v], cuMap[v], '輪椅座墊', 'device'); });
  // 氣墊床：assessmentResult slug
  const abMap = { 'airbed':'ab_airbed','electric_bed':'ab_electric_bed' };
  (c.airbed && c.airbed.assessmentResult || []).forEach(v => { if (abMap[v]) add(abMap[v], abMap[v], '氣墊床／電動床', 'device'); });
  // 帶輪型助步車只有單一建議品項；模組有評估資料時自動納入，不需額外勾選。
  if (walkerHasAssessmentData(c.walker)) add('wk_rollator', 'wk_rollator', '帶輪型助步車', 'device');
  // 爬梯機（有量測資料即視為建議）
  if (Array.isArray(c.blocks) && c.blocks.some(b => b.type === 'stair' && Array.isArray(b.steps) && b.steps.some(s => s.height || s.slope))) {
    add('st_climber', 'st_climber', '爬梯機', 'device');
  }
  // 免評估項目（family：輕量化輪椅／沐浴椅／便盆椅可能與其他模組重複，用於偵測警示）
  const ex = c.exemptDevices || {};
  const exMap = {
    cane: { key: 'ex_cane', family: null },
    walker: { key: 'ex_walker', family: null },
    toiletRiser: { key: 'sh_166', family: null },
    commode: { key: 'sh_168', family: 'sh_commode' },
    showerChair: { key: 'sh_167', family: 'sh_shower' },
    wheelchairLight: { key: 'wc_light', family: 'wc_light' }
  };
  Object.keys(exMap).forEach(k => { if (ex[k]) add('exempt#' + k, exMap[k].key, '免評估項目', 'device', exMap[k].family); });
  // 居家無障礙
  const ha = c.homeAccessibility || {};
  (ha.assistive_devices || []).forEach((row, i) => {
    const k = haSubsidyKey(row.item, row.spec);
    if (k) add('assistive_devices#' + i, k, '居家無障礙', 'home');
  });
  (ha.renovations || []).forEach((row, i) => {
    if (row.item === 'fixed_handrail') return;
    const k = haSubsidyKey(row.item, row.spec);
    if (k) add('renovations#' + i, k, '居家無障礙', 'home');
  });
  const handrailLength = fixedHandrailLength(ha.renovations);
  if (handrailLength > 0) {
    const handrailUnits = Math.ceil(handrailLength / 10);
    add('fixed_handrail', 'ha_fixed_handrail', '居家無障礙', 'home', null, {
      multiplier: handrailUnits,
      label: `固定式扶手（${handrailLength}cm／${handrailUnits} 單位）`,
      note: '每 10 公分 1 單位，未滿 10 公分以 1 單位計'
    });
  }
  return items;
}

// 試算核心
function computeSubsidy(items, eligibility, econ, overrides) {
  const wantDis = eligibility.includes('身障');
  const wantLtc = eligibility.includes('長照');
  const QUOTA_LIMIT = 40000;
  const rows = items.map(it => {
    const t = SUBSIDY_TABLE[it.key];
    const ov = overrides[it.id] || {};
    const multiplier = Number.isFinite(it.multiplier) ? it.multiplier : 1;
    // disVariants：身障同一項有多種款式（如免評估拐杖 量產/客製），各有經濟別金額，由使用者於試算表選擇
    const disVariants = t.disVariants || null;
    const disAvail = wantDis && (Array.isArray(t.dis) || !!disVariants);
    // ltcVariants：長照同一項有多種方案（如爬梯機 單趟／月），各有經濟別金額，由使用者於試算表選擇
    const ltcVariants = t.ltcVariants || null;
    const ltcAvail = wantLtc && (Array.isArray(t.ltc) || !!ltcVariants);
    // disOptions：不分經濟別、金額為固定選項清單（如氣墊床 10,000/14,000），由使用者於試算表選擇
    const disOptions = t.disOptions || null;
    let disAmt = null, disVariantKey = null;
    if (disAvail) {
      if (disVariants) {
        const sel = disVariants.find(v => v.key === ov.disVariant) || disVariants[0];
        disVariantKey = sel.key;
        disAmt = sel.amts[econ] * multiplier;
      } else disAmt = (disOptions ? (disOptions.includes(ov.disAmount) ? ov.disAmount : disOptions[0]) : t.dis[econ]) * multiplier;
    }
    let ltcAmt = null, ltcVariantKey = null;
    if (ltcAvail) {
      if (ltcVariants) {
        const sel = ltcVariants.find(v => v.key === ov.ltcVariant) || ltcVariants[0];
        ltcVariantKey = sel.key;
        ltcAmt = sel.amts[econ] * multiplier;
      } else ltcAmt = t.ltc[econ] * multiplier;
    }
    // 佔額度：noQuota 項目（如爬梯機租賃）不佔用長照額度
    const quota = (ltcAvail && !t.noQuota)
      ? (ltcVariants ? (ltcVariants.find(v => v.key === ltcVariantKey) || ltcVariants[0]).amts[0] : t.ltc[0]) * multiplier
      : 0;
    // 預設推薦：可用管道中補助金額較高者（同額則身障，保留長照額度）
    // noRecommend 項目（如爬梯機：購買 vs 租賃性質不同）不推薦、也不預設自動選管道
    let recommend = 'none';
    if (!t.noRecommend) {
      if (disAvail && ltcAvail) recommend = (ltcAmt > disAmt) ? 'ltc' : 'dis';
      else if (disAvail) recommend = 'dis';
      else if (ltcAvail) recommend = 'ltc';
    }
    // 使用者覆寫
    let channel = ov.channel || recommend;
    if (channel === 'dis' && !disAvail) channel = recommend;
    if (channel === 'ltc' && !ltcAvail) channel = recommend;
    const included = ov.included !== false;
    return Object.assign({}, it, { label: it.label || t.label, note: it.note || t.note || '', disAmt, ltcAmt, quota, disAvail, ltcAvail, disOptions, disVariants, disVariantKey, ltcVariants, ltcVariantKey, noQuota: !!t.noQuota, recommend, channel, included });
  });
  let disCount = 0, disTotal = 0, haDisTotal = 0, hasHomeDis = false, ltcTotal = 0, quotaUsed = 0;
  rows.forEach(r => {
    if (!r.included) return;
    if (r.channel === 'dis') {
      if (r.group === 'home') {
        haDisTotal += r.disAmt || 0;
        hasHomeDis = true;
      }
      else { disTotal += r.disAmt || 0; disCount++; }
    } else if (r.channel === 'ltc') {
      ltcTotal += r.ltcAmt || 0;
      quotaUsed += r.quota || 0;
    }
  });
  // 居家無障礙不論納入幾個品項，身障補助合併計 1 項次。
  if (hasHomeDis) disCount++;
  return { rows, wantDis, wantLtc, disCount, disTotal, haDisTotal, hasHomeDis, ltcTotal, quotaUsed, QUOTA_LIMIT };
}

function renderSubsidyCalc(caseId) {
  const host = document.getElementById('menuSubsidyCalc');
  if (!host) return;
  const c = state.cases[caseId];
  if (!c) { host.innerHTML = ''; return; }
  if (!c.subsidyCalc) c.subsidyCalc = defaultSubsidyCalc();
  const s = c.subsidyCalc;
  const eligibility = Array.isArray(s.eligibility) ? s.eligibility : [];
  const econ = [0,1,2].indexOf(s.econ) > -1 ? s.econ : 2;
  const overrides = s.overrides || {};
  const items = collectSubsidyItems(c);
  const R = computeSubsidy(items, eligibility, econ, overrides);
  const wantDis = R.wantDis, wantLtc = R.wantLtc;
  const fmt = n => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US'));

  // 重複偵測：免評估項目與其他模組勾選了同一類輔具（如輕量化輪椅、沐浴椅/便盆椅）
  const familyGroups = {};
  items.forEach(it => {
    if (!it.family) return;
    (familyGroups[it.family] = familyGroups[it.family] || []).push(it);
  });
  const dupWarnings = Object.values(familyGroups)
    .filter(group => group.length > 1)
    .map(group => group.map(it => `${it.source}－${SUBSIDY_TABLE[it.key].label}`).join('、'));
  const dupWarningHtml = dupWarnings.length
    ? `<div class="sub-dup-warning">⚠ 偵測到重複勾選同一類輔具，請確認是否需要重複申請：<ul>${dupWarnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`
    : '';

  const econLabels = ['低收','中低收','一般戶'];
  const econSeg = econLabels.map((l, i) =>
    `<button type="button" class="sub-seg-btn${i === econ ? ' active' : ''}" data-subsidy-econ="${i}">${l}</button>`).join('');
  const eligChecks = [['身障','身障'],['長照','長照']].map(([v, l]) =>
    `<label class="sub-chk"><input type="checkbox" data-subsidy-eligibility="${v}" ${eligibility.indexOf(v) > -1 ? 'checked' : ''}>${l}</label>`).join('');

  let body;
  if (!items.length) {
    body = `<div class="sub-empty">尚未於各模組勾選建議品項，完成評估並勾選建議品項後即可自動試算。</div>`;
  } else if (!eligibility.length) {
    body = `<div class="sub-empty">請先勾選個案具備的補助別（身障／長照）。</div>`;
  } else {
    // 表格式：身障／長照金額對齊成欄比較；採用管道與納入放在該項下方獨立一行，品項名不加來源小字
    const colspan = 1 + (wantDis ? 1 : 0) + (wantLtc ? 1 : 0);
    const trs = R.rows.map(r => {
      const bothAvail = wantDis && wantLtc && r.disAvail && r.ltcAvail;
      const ckDis = (bothAvail && r.recommend === 'dis') ? '<span class="sub-ck">✓建議</span>' : '';
      const ckLtc = (bothAvail && r.recommend === 'ltc') ? '<span class="sub-ck">✓建議</span>' : '';
      // 身障金額（氣墊床可下拉金額；免評估拐杖／助行器可下拉款式）
      let disInner = '<span class="sub-na">無給付</span>';
      let disVarSel = '';
      if (r.disAvail) {
        if (r.disOptions) {
          const optHtml = r.disOptions.map(v => `<option value="${v}"${v === r.disAmt ? ' selected' : ''}>${fmt(v)}</option>`).join('');
          disInner = `<select class="sub-ch-sel" data-subsidy-disamt="${escapeAttr(r.id)}" ${!r.included ? 'disabled' : ''}>${optHtml}</select>`;
        } else {
          disInner = fmt(r.disAmt);
          if (r.disVariants) {
            const varOpts = r.disVariants.map(v => `<option value="${v.key}"${v.key === r.disVariantKey ? ' selected' : ''}>${escapeHtml(v.label)}</option>`).join('');
            disVarSel = `<select class="sub-var-sel" data-subsidy-disvar="${escapeAttr(r.id)}" ${!r.included ? 'disabled' : ''}>${varOpts}</select>`;
          }
        }
      }
      const disCell = wantDis
        ? `<td class="sub-amt2 sub-c-dis${r.channel === 'dis' && r.included ? ' picked' : ''}"><div class="sub-amt2-main">${disInner}${ckDis}</div>${disVarSel}</td>` : '';
      // 長照金額 + 佔額度子行（爬梯機等 noQuota 項目不佔額度；ltcVariants 提供單趟／月下拉）
      const ltcMain = r.ltcAvail ? `${fmt(r.ltcAmt)}${ckLtc}` : '<span class="sub-na">無給付</span>';
      let ltcVarSel = '';
      if (r.ltcAvail && r.ltcVariants) {
        const varOpts = r.ltcVariants.map(v => `<option value="${v.key}"${v.key === r.ltcVariantKey ? ' selected' : ''}>${escapeHtml(v.label)}</option>`).join('');
        ltcVarSel = `<select class="sub-var-sel" data-subsidy-ltcvar="${escapeAttr(r.id)}" ${!r.included ? 'disabled' : ''}>${varOpts}</select>`;
      }
      const ltcQuota = r.ltcAvail
        ? (r.noQuota ? '<div class="sub-amt2-quota sub-noquota">不佔額度</div>' : `<div class="sub-amt2-quota">額度 ${fmt(r.quota)}</div>`)
        : '';
      const ltcCell = wantLtc
        ? `<td class="sub-amt2 sub-c-ltc${r.channel === 'ltc' && r.included ? ' picked' : ''}"><div class="sub-amt2-main">${ltcMain}</div>${ltcVarSel}${ltcQuota}</td>` : '';
      // 採用管道（segmented，只列可用管道；不申請改由「納入」控制）
      const chBtns = [];
      if (r.disAvail) chBtns.push(['dis', '身障']);
      if (r.ltcAvail) chBtns.push(['ltc', '長照']);
      const chGroup = chBtns.length
        ? `<div class="sub-chgroup">${chBtns.map(([v, l]) => `<button type="button" class="sub-chbtn${r.channel === v ? ' active' : ''}" data-subsidy-channel-btn="${escapeAttr(r.id)}" data-ch="${v}" ${!r.included ? 'disabled' : ''}>${l}</button>`).join('')}</div>`
        : '<span class="sub-nofund">此補助別無給付</span>';
      const noteInline = r.note ? `<span class="sub-note-inline">${escapeHtml(r.note)}</span>` : '';
      return `<tr class="sub-r-main${r.included ? '' : ' sub-row-off'}">
          <td class="sub-item2">${escapeHtml(r.label)}</td>${disCell}${ltcCell}
        </tr>
        <tr class="sub-r-ctrl${r.included ? '' : ' sub-row-off'}">
          <td colspan="${colspan}">
            <div class="sub-ctrl-line">
              <label class="sub-inc-lbl"><input type="checkbox" data-subsidy-include="${escapeAttr(r.id)}" ${r.included ? 'checked' : ''}>納入</label>
              <span class="sub-ctrl-sep">採用</span>${chGroup}${noteInline}
            </div>
          </td>
        </tr>`;
    }).join('');
    const thDis = wantDis ? '<th class="sub-c-dis">身障</th>' : '';
    const thLtc = wantLtc ? '<th class="sub-c-ltc">長照<div class="sub-th-sub">含佔額度</div></th>' : '';
    const theadHtml = `<thead><tr><th class="sub-th-item">品項</th>${thDis}${thLtc}</tr></thead>`;
    const quotaNote = wantLtc
      ? `<div class="sub-caption">※「額度」僅長照計算（3 年 4 萬）；身障無額度上限，改以 2 年 4 項計。</div>`
      : '';
    const tableHtml = `<div class="sub-table-wrap"><table class="sub-table sub-table-compact">
      ${theadHtml}
      <tbody>${trs}</tbody></table></div>${quotaNote}`;

    let sumHtml = '<div class="sub-summary">';
    if (wantDis) {
      const over = R.disCount > 4;
      sumHtml += `<div class="sub-card sub-card-dis">
        <div class="sub-card-h">身障補助</div>
        <div class="sub-card-row"><span>補助項次</span><strong class="${over ? 'sub-warn-text' : ''}">${R.disCount} / 4</strong></div>
        ${over ? '<div class="sub-warn">⚠ 超過身障 2 年 4 項上限，請調整管道</div>' : ''}
        <div class="sub-card-row"><span>輔具補助合計</span><strong>${fmt(R.disTotal)}</strong></div>
        ${R.haDisTotal > 0 ? `<div class="sub-card-row"><span>居家無障礙補助</span><strong>${fmt(R.haDisTotal)}</strong></div><div class="sub-mini">＊居家無障礙不論申請幾項，身障補助合併計 1 項次。</div>` : ''}
      </div>`;
    }
    if (wantLtc) {
      const prior = parseInt(s.usedQuotaPrior, 10) || 0;
      const remaining = R.QUOTA_LIMIT - prior - R.quotaUsed;
      const over = remaining < 0;
      sumHtml += `<div class="sub-card sub-card-ltc">
        <div class="sub-card-h">長照補助（3 年 4 萬）</div>
        <div class="sub-card-row"><span>補助金額合計</span><strong>${fmt(R.ltcTotal)}</strong></div>
        <div class="sub-card-row"><span>先前已使用額度</span><input type="number" inputmode="numeric" min="0" class="sub-used-input" data-subsidy-used value="${escapeAttr(s.usedQuotaPrior)}" placeholder="0"></div>
        <div class="sub-card-row"><span>本次佔用額度</span><strong>${fmt(R.quotaUsed)}</strong></div>
        <div class="sub-card-row"><span>剩餘額度</span><strong class="${over ? 'sub-warn-text' : ''}">${fmt(remaining)} / ${fmt(R.QUOTA_LIMIT)}</strong></div>
        ${over ? '<div class="sub-warn">⚠ 已超出 4 萬額度，請調整管道或品項</div>' : ''}
      </div>`;
    }
    sumHtml += '</div>';

    let overall = '';
    if (wantDis && wantLtc) {
      const nDis = R.disCount;
      const nLtc = R.rows.filter(r => r.included && r.channel === 'ltc').length;
      const parts = [];
      if (nDis) parts.push(`身障 ${nDis} 項`);
      if (nLtc) parts.push(`長照 ${nLtc} 項`);
      overall = `<div class="sub-overall">建議管道：${parts.length ? parts.join('、') : '—'}（已依各品項較高補助自動配置，可於上方逐項調整）</div>`;
    }
    body = tableHtml + sumHtml + overall;
  }

  host.innerHTML = `
    <div class="sub-block">
      <div class="sub-head">
        <h3>補助額度／金額試算</h3>
        <div class="sub-hint">身障：2 年 4 項　|　長照：3 年 4 萬</div>
      </div>
      <div class="sub-controls">
        <div class="sub-ctrl-group"><span class="sub-ctrl-label">補助別</span><div class="sub-elig">${eligChecks}</div></div>
        <div class="sub-ctrl-group"><span class="sub-ctrl-label">經濟別</span><div class="sub-seg">${econSeg}</div></div>
      </div>
      ${dupWarningHtml}
      ${body}
    </div>`;
}

export {
  SUBSIDY_TABLE, defaultSubsidyCalc, wcComboKey, walkerHasAssessmentData, haSubsidyKey,
  fixedHandrailLength, collectSubsidyItems, computeSubsidy, renderSubsidyCalc
};
