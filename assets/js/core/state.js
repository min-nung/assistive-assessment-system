import { validateBackupPayload } from '../backup/schema.js';
import { showToast } from '../ui.js';

/* State, defaults, storage, and migrations
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   State & Storage
   ========================================================================== */
const STORAGE_KEY = 'stairAssessmentCases.v1';
const BACKUP_DATE_KEY = 'stairAssessmentLastBackupAt.v1';
const BACKUP_REMINDER_KEY = 'stairAssessmentLastBackupReminderAt.v1';
const BACKUP_REMINDER_DAYS = 7;
let state = {
  cases: {},
  currentCaseId: null
};
let backFn = null;

function setBackFn(handler) {
  backFn = handler;
}

function runBackFn() {
  if (backFn) backFn();
}

// 基本資料：獨立於各評估模組，避免清除模組資料時被連帶清空
function defaultBasicInfo() {
  return { height: '', weight: '', medicalHistory: '', tubes: [], tubesOther: '', notes: '' };
}

function defaultWheelchair() {
  return {
    hipLimitL: '', hipLimitR: '',
    hipNoLimitL: false, hipNoLimitR: false,
    kneeLimitL: '', kneeLimitR: '',
    kneeNoLimitL: false, kneeNoLimitR: false,
    seatWidth: '', hipToKnee: '',
    kneeToFoot: '', kneeToFootWithShoe: false,
    shoulderBladeHeight: '', shoulderHeight: '',
    occipitalHeight: '', chestWidth: '',
    shoulderDistance: '', upperArmVertical: '', chestDepth: '',
    staticSeating: '', fallingDirection: [],
    mobilitySeating: '',
    pelvisPosture: [], pelvisSlide: [],
    spine: [],
    headControl: '', hip: '', knee: '', ankle: [],
    otherContracture: '', otherContractureLocation: '', otherContractureEffect: '',
    abnormalTone: '', toneEffect: '',
    cognition: '', visualPerception: '', skinSensation: '',
    pressureInjury: '', pressureInjuryLocation: '',
    pressureInjuryW: '', pressureInjuryH: '', pressureInjuryGrade: '',
    deepTissuePressure: false,
    transferAbility: '',
    subsidy: [], exemptItems: '',
    wcBaseType: '', wcAddons: []
  };
}

// 免評估項目：勾選後即納入補助試算表（款式／管道於試算表中選擇）
function defaultExemptDevices() {
  return { cane: false, walker: false, toiletRiser: false, commode: false, showerChair: false, wheelchairLight: false };
}

function defaultShower() {
  return {
    hipWidth: '',
    pelvis: [], pelvisSlide: [],
    spine: [], spineOther: '',
    hip: '', hipOther: '',
    knee: '', kneeOther: '',
    headControl: '',
    sittingBalance: '', fallingDirection: [],
    bathroomDifficulty: [],
    baseType: '', addonLevel: 'wheel',
    subsidyItems: [], subsidy: [], exemptItems: ''
  };
}

// 沐浴椅／便盆椅：基本型（單選）＋附加功能等級（單選，累加式）→ 對照表鍵
const SHOWER_ADDON_LEVELS = [
  ['wheel', '附輪'],
  ['wheel_transfer', '附輪＋利於移位'],
  ['wheel_transfer_recline', '附輪＋利於移位＋仰躺功能'],
  ['wheel_transfer_tilt', '附輪＋利於移位＋空中傾倒功能'],
  ['wheel_transfer_recline_tilt', '附輪＋利於移位＋仰躺功能＋空中傾倒功能']
];
function showerComboKey(baseType, addonLevel) {
  if (baseType !== 'shower' && baseType !== 'commode') return null;
  const base = baseType === 'shower' ? 'sh_167' : 'sh_168';
  return base + '__' + (addonLevel || 'wheel');
}

function defaultWalker() {
  return {
    toneHead: '', toneTrunk: '',
    toneLeftUpper: '', toneRightUpper: '',
    toneLeftLower: '', toneRightLower: '',
    romShoulderL: '', romShoulderR: '',
    romElbowL: '', romElbowR: '',
    romWristL: '', romWristR: '',
    upperControlL: '', upperControlLOther: '',
    upperControlR: '', upperControlROther: '',
    sittingBalance: '', sittingFalling: [],
    sitToStand: '',
    weightBearingL: '', weightBearingR: '',
    standingBalance: '',
    walkingAbility: '',
    handleHeight: '', seatHeight: '',
    walkerResult: false,
    subsidy: [], exemptItems: ''
  };
}

function defaultTransfer() {
  return {
    waist: '',
    sittingBalance: '',
    sitToStand: '',
    resultItems: [],
    subsidy: [], exemptItems: ''
  };
}

function defaultCushion() {
  return {
    // 1. 身體尺寸
    hipWidth: '', thighLength: '', chairSeatWidth: '', chairSeatDepth: '',
    // 2-1. 靜態坐姿平衡
    staticBalance: '', staticBalanceDirection: [],
    // 2-2. 動態坐姿平衡
    dynamicBalance: '', dynamicBalanceDirection: [],
    // 2-3. 骨盆
    pelvis: [],
    pelvisTiltFBCond: '', pelvisTiltLRCond: '', pelvisRotateLRCond: '',
    pelvisSlide: [],
    // 2-4. 脊柱
    spine: [],
    spineGravityDesc: '',
    scoliosisType: '', scoliosisDirection: '', scoliosisApex: '', scoliosisCond: '',
    spineKyphosisCond: '', spineLordosisCond: '',
    // 2-5. 髖部
    hip: '', hipOtherDesc: '', hipCond: '',
    // 3. 臀部減壓能力
    pressureRelief: '',
    // 4. 座墊操作能力
    cushionOpPlacement: '', cushionOpInspection: '', cushionOpAdjustment: '',
    cushionOpCleaning: '', cushionCaregiverAble: '',
    // 5. 壓傷危險因子
    pressureInjuryRisk: [], pressureInjuryRiskOtherDesc: '',
    // 6. 壓傷狀態
    pressureInjuryStatus: '',
    piHistoryLocation: '',
    piCurrentLocation: '', piSizeX: '', piSizeY: '', piGrade: '',
    // 7. 配合座椅
    seatWidth: '', seatDepth: '', seatSurface: '', chairType: '', chairTypeOtherDesc: '',
    manualType: '', manualRelief: '', powerRelief: '',
    // 8. 乘坐時間
    sittingDuration: '', sittingDurationNote: '',
    // 9. 評估結果 + 補助
    assessmentResult: [],
    subsidy: [], exemptItems: ''
  };
}

function defaultAirbed() {
  return {
    mattressType: '', mattressHeight: '',
    bedFrameType: '', bedFrameTypeOtherDesc: '', bedFrameHeight: '',
    consciousness: '', consciousnessOtherDesc: '',
    cognitiveFunction: '', cognitiveFunctionOtherDesc: '',
    skinSensation: '', skinSensationAbnormalDesc: '', skinSensationLostDesc: '', skinSensationUnableReason: '',
    orthostaticHypotension: '',
    currentEndurance: '',
    endurancePrognosis: '',
    rom: '', romLimitedJoints: [], romLimitedOtherDesc: '',
    controllerOperation: '',
    railOperation: '',
    rollLeft: '', rollRight: '',
    sitUp: '',
    staticBalance: '', staticBalanceDirection: [],
    dynamicBalance: '', dynamicBalanceDirection: [],
    transfer: '',
    clientHeight: '', clientWeight: '', poplitealHeight: '', shoulderWidth: '',
    caregiverHeight: '', suitableCareHeight: '',
    roomLength: '', roomWidth: '',
    transferSpaceLength: '', transferSpaceWidth: '',
    spaceLimited: false, spaceLimitedDesc: '', bedMeasurementOtherDesc: '',
    pressureInjuryRisk: [], pressureInjuryRiskOtherDesc: '',
    pressureInjuryStatus: '',
    piHistoryLocation: '',
    piCurrentLocation: '', piSizeX: '', piSizeY: '', piGrade: '',
    assessmentResult: [],
    subsidy: [], exemptItems: ''
  };
}

function defaultHomeAccessibility() {
  return {
    gross_motor: {},
    fine_motor: {},
    locations: [],
    locations_other_desc: '',
    assistive_devices: [],
    renovations: [],
    subsidy: [],
    exemptItems: ''
  };
}

function defaultSubsidyCalc() {
  return { eligibility: ['身障','長照'], econ: 2, usedQuotaPrior: '', overrides: {} };
}

function migrateCases(cases) {
  // Migrate: add missing fields to old cases
  for (const id in cases) {
    const c = cases[id];
    if (!c.wheelchair) c.wheelchair = defaultWheelchair();
    // Migrate: 基本資料 fields used to live on c.wheelchair — move them out so
    // clearing/resetting the 輪椅 module no longer wipes 基本資料.
    if (!c.basicInfo) {
      const wc = c.wheelchair;
      c.basicInfo = {
        height: wc.height || '', weight: wc.weight || '', medicalHistory: wc.medicalHistory || '',
        tubes: Array.isArray(wc.tubes) ? wc.tubes : [], tubesOther: wc.tubesOther || '', notes: wc.notes || ''
      };
    }
    delete c.wheelchair.height; delete c.wheelchair.weight; delete c.wheelchair.medicalHistory;
    delete c.wheelchair.tubes; delete c.wheelchair.tubesOther; delete c.wheelchair.notes;
    if (!c.transfer)  c.transfer  = defaultTransfer();
    if (!c.cushion)   c.cushion   = defaultCushion();
    if (!c.airbed)    c.airbed    = defaultAirbed();
    if (!c.walker)    c.walker    = defaultWalker();
    if (!c.shower)    c.shower    = defaultShower();
    // Migrate: 沐浴椅／便盆椅 舊版「項次167/168＋169-172」勾選 → 新版 baseType/addonLevel 單選組合
    if (c.shower.baseType === undefined) {
      const items = Array.isArray(c.shower.subsidyItems) ? c.shower.subsidyItems : [];
      let baseType = '';
      if (items.includes('項次167')) baseType = 'shower';
      else if (items.includes('項次168')) baseType = 'commode';
      let addonLevel = 'wheel';
      const hasTransfer = items.includes('項次170');
      const hasRecline = items.includes('項次171');
      const hasTilt = items.includes('項次172');
      if (hasTransfer && hasRecline && hasTilt) addonLevel = 'wheel_transfer_recline_tilt';
      else if (hasTransfer && hasTilt) addonLevel = 'wheel_transfer_tilt';
      else if (hasTransfer && hasRecline) addonLevel = 'wheel_transfer_recline';
      else if (hasTransfer) addonLevel = 'wheel_transfer';
      c.shower.baseType = baseType;
      c.shower.addonLevel = addonLevel;
      c.shower.subsidyItems = items.filter(v => !['項次167','項次168','項次169','項次170','項次171','項次172'].includes(v));
    }
    if (!c.homeAccessibility) c.homeAccessibility = defaultHomeAccessibility();
    if (!c.exemptDevices) c.exemptDevices = defaultExemptDevices();
    if (!c.subsidyCalc) c.subsidyCalc = defaultSubsidyCalc();
    // Migrate: add platformType to existing platform blocks
    if (c.blocks) {
      c.blocks.forEach(b => {
        if (b.type === 'platform' && !b.platformType) b.platformType = 'Standard';
        // Migrate: ensure stair blocks have at least 2 steps
        if (b.type === 'stair' && (!b.steps || b.steps.length < 2)) {
          if (!b.steps) b.steps = [];
          while (b.steps.length < 2) {
            b.steps.push({ id: uid(), height: '', slope: '' });
          }
        }
      });
    }
    // Migrate subsidy from string to array
    ['wheelchair','shower','walker','transfer','cushion','airbed','homeAccessibility'].forEach(key => {
      if (c[key] && typeof c[key].subsidy === 'string') {
        c[key].subsidy = c[key].subsidy ? [c[key].subsidy] : [];
      }
    });
    // Migrate: ramp_length/ramp_width to min/max fields
    if (c.homeAccessibility && c.homeAccessibility.assistive_devices) {
      c.homeAccessibility.assistive_devices.forEach(row => {
        if (row.ramp_length !== undefined && !row.ramp_length_min) {
          row.ramp_length_min = row.ramp_length;
        }
        if (row.ramp_width !== undefined && !row.ramp_width_min) {
          row.ramp_width_min = row.ramp_width;
        }
        delete row.ramp_length;
        delete row.ramp_width;
      });
    }
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    validateBackupPayload(parsed, { allowStorageEnvelope: true });
    migrateCases(parsed.cases);
    state.cases = parsed.cases;
    return true;
  } catch (error) {
    console.warn('載入失敗', error);
    state.cases = {};
    setTimeout(() => showToast('既有資料格式異常，請由備份重新匯入'), 0);
    return false;
  }
}

function persistCases(cases) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cases }));
    return true;
  } catch (error) {
    console.error('儲存失敗', error);
    showToast('儲存失敗，儲存空間可能已滿');
    return false;
  }
}

function saveState() {
  return persistCases(state.cases);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export {
  STORAGE_KEY, BACKUP_DATE_KEY, BACKUP_REMINDER_KEY, BACKUP_REMINDER_DAYS,
  state, defaultBasicInfo, defaultWheelchair, defaultExemptDevices,
  defaultShower, SHOWER_ADDON_LEVELS, showerComboKey, defaultWalker,
  defaultTransfer, defaultCushion, defaultAirbed, defaultHomeAccessibility, defaultSubsidyCalc,
  migrateCases, loadState, persistCases, saveState, uid, setBackFn, runBackFn
};
