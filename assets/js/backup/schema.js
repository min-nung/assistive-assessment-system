import {
  defaultBasicInfo, defaultWheelchair, defaultTransfer, defaultCushion,
  defaultAirbed, defaultWalker, defaultShower, defaultHomeAccessibility,
  defaultExemptDevices
} from '../core/state.js';

/* Backup schema validation.
 * Backups are treated as untrusted input and are fully checked before they can
 * replace the current localStorage state.
 */
const BACKUP_SCHEMA = Object.freeze({
  app: '輔具評估系統',
  version: 1,
  maxFileBytes: 10 * 1024 * 1024,
  maxCases: 5000,
  safeId: /^[A-Za-z0-9_-]{1,80}$/
});

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function schemaError(path, message) {
  throw new Error(`${path}：${message}`);
}

function validateJsonTree(value, path = '備份', depth = 0) {
  if (depth > 20) schemaError(path, '資料層級過深');
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (Array.isArray(value)) {
    if (value.length > 20000) schemaError(path, '陣列資料過大');
    value.forEach((item, index) => validateJsonTree(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isPlainRecord(value)) schemaError(path, '必須是 JSON 物件');
  for (const [key, child] of Object.entries(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      schemaError(`${path}.${key}`, '包含不允許的欄位名稱');
    }
    validateJsonTree(child, `${path}.${key}`, depth + 1);
  }
}

function validateSafeId(value, path) {
  if (typeof value !== 'string' || !BACKUP_SCHEMA.safeId.test(value)) {
    schemaError(path, '識別碼格式不正確');
  }
}

function validateOptionalRecord(value, path) {
  if (value !== undefined && !isPlainRecord(value)) schemaError(path, '必須是物件');
}

function validateOptionalArray(value, path) {
  if (value !== undefined && !Array.isArray(value)) schemaError(path, '必須是陣列');
}

function validateModuleAgainstDefaults(value, defaults, path) {
  if (value === undefined) return;
  if (!isPlainRecord(value)) schemaError(path, '必須是物件');
  for (const [field, defaultValue] of Object.entries(defaults)) {
    if (!(field in value)) continue;
    const actual = value[field];
    if (Array.isArray(defaultValue) && !Array.isArray(actual)) {
      schemaError(`${path}.${field}`, '必須是陣列');
    }
    if (isPlainRecord(defaultValue) && !isPlainRecord(actual)) {
      schemaError(`${path}.${field}`, '必須是物件');
    }
  }
}

function validateBlock(block, path) {
  if (!isPlainRecord(block)) schemaError(path, '樓梯或平台資料必須是物件');
  validateSafeId(block.id, `${path}.id`);
  if (block.type !== 'stair' && block.type !== 'platform') {
    schemaError(`${path}.type`, '只能是 stair 或 platform');
  }
  if (block.type === 'stair') {
    if (!Array.isArray(block.steps)) schemaError(`${path}.steps`, '樓梯必須包含階數陣列');
    block.steps.forEach((step, index) => {
      const stepPath = `${path}.steps[${index}]`;
      if (!isPlainRecord(step)) schemaError(stepPath, '階數資料必須是物件');
      validateSafeId(step.id, `${stepPath}.id`);
    });
  }
}

function validateCaseRecord(caseKey, item, path) {
  validateSafeId(caseKey, `${path} key`);
  if (!isPlainRecord(item)) schemaError(path, '個案資料必須是物件');
  validateSafeId(item.id, `${path}.id`);
  if (item.id !== caseKey) schemaError(`${path}.id`, '必須和個案索引一致');
  if (typeof item.name !== 'string' || !item.name.trim()) schemaError(`${path}.name`, '缺少個案名稱');
  if (item.name.trim().length > 40) schemaError(`${path}.name`, '個案名稱最多 40 個字');
  if (item.assessmentDate !== undefined && typeof item.assessmentDate !== 'string') {
    schemaError(`${path}.assessmentDate`, '必須是文字日期');
  }
  if (item.assessmentDate && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(item.assessmentDate)) {
    schemaError(`${path}.assessmentDate`, '日期格式不正確');
  }
  if (!Array.isArray(item.blocks)) schemaError(`${path}.blocks`, '必須是陣列');
  item.blocks.forEach((block, index) => validateBlock(block, `${path}.blocks[${index}]`));

  validateModuleAgainstDefaults(item.basicInfo, defaultBasicInfo(), `${path}.basicInfo`);
  validateModuleAgainstDefaults(item.wheelchair, defaultWheelchair(), `${path}.wheelchair`);
  validateModuleAgainstDefaults(item.transfer, defaultTransfer(), `${path}.transfer`);
  validateModuleAgainstDefaults(item.cushion, defaultCushion(), `${path}.cushion`);
  validateModuleAgainstDefaults(item.airbed, defaultAirbed(), `${path}.airbed`);
  validateModuleAgainstDefaults(item.walker, defaultWalker(), `${path}.walker`);
  validateModuleAgainstDefaults(item.shower, defaultShower(), `${path}.shower`);
  validateModuleAgainstDefaults(item.homeAccessibility, defaultHomeAccessibility(), `${path}.homeAccessibility`);
  validateModuleAgainstDefaults(item.exemptDevices, defaultExemptDevices(), `${path}.exemptDevices`);
  validateOptionalRecord(item.subsidyCalc, `${path}.subsidyCalc`);

  const ha = item.homeAccessibility;
  if (ha) {
    validateOptionalArray(ha.assistive_devices, `${path}.homeAccessibility.assistive_devices`);
    validateOptionalArray(ha.renovations, `${path}.homeAccessibility.renovations`);
    (ha.assistive_devices || []).forEach((row, index) => validateOptionalRecord(row, `${path}.homeAccessibility.assistive_devices[${index}]`));
    (ha.renovations || []).forEach((row, index) => validateOptionalRecord(row, `${path}.homeAccessibility.renovations[${index}]`));
  }
}

function validateBackupPayload(payload, { allowStorageEnvelope = false } = {}) {
  validateJsonTree(payload);
  if (!isPlainRecord(payload)) schemaError('備份', '格式不正確');
  if (!allowStorageEnvelope) {
    if (payload.app !== BACKUP_SCHEMA.app) schemaError('備份.app', '不是本系統的備份檔');
    if (payload.version !== BACKUP_SCHEMA.version) schemaError('備份.version', '不支援此備份版本');
  }
  if (!isPlainRecord(payload.cases)) schemaError('備份.cases', '必須是個案物件');
  const entries = Object.entries(payload.cases);
  if (entries.length > BACKUP_SCHEMA.maxCases) schemaError('備份.cases', '個案數量超過上限');
  entries.forEach(([key, item], index) => validateCaseRecord(key, item, `備份.cases[${index}]`));

  // 回收筒是選擇性欄位：1.7 以前的備份檔沒有它，那些檔案必須照樣匯得進來。
  // 存在時必須通過和一般個案完全相同的檢查——回收筒裡的資料隨時可能被還原
  // 成正式個案，不能是一份寬鬆審查過的資料。
  if (payload.deletedCases !== undefined) {
    if (!isPlainRecord(payload.deletedCases)) schemaError('備份.deletedCases', '必須是個案物件');
    const deleted = Object.entries(payload.deletedCases);
    if (deleted.length > BACKUP_SCHEMA.maxCases) schemaError('備份.deletedCases', '個案數量超過上限');
    deleted.forEach(([key, item], index) => {
      const path = `備份.deletedCases[${index}]`;
      validateCaseRecord(key, item, path);
      // 刪除時間允許缺少或無法判讀——trash-retention.js 會把那種資料留著而
      // 不是清掉，所以它不構成拒絕整份備份的理由。但型別錯得離譜就該擋下。
      const { deletedAt } = item;
      if (deletedAt !== undefined && typeof deletedAt !== 'number' && typeof deletedAt !== 'string') {
        schemaError(`${path}.deletedAt`, '刪除時間必須是數字或文字');
      }
    });
  }
  return payload;
}

export { BACKUP_SCHEMA, validateBackupPayload };
