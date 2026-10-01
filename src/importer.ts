import { validateExternalUrl } from './prototype-security';
/** Offline import/update previews. This module never reads, writes, or calls a network. */
import { TASK_STATUSES, isValidDate, isValidTimestamp, type Allocation, type EvidenceNote, type Task, type TaskStatus } from './domain';

export type ImportFormat = 'csv' | 'json';
export interface ImportIssue { row: number; field: string; message: string }
export interface ImportDuplicate { id: string; row: number; reason: string }
export interface ImportPreview { format: ImportFormat; tasks: Task[]; duplicates: ImportDuplicate[]; errors: ImportIssue[]; warnings: ImportIssue[]; canApply: boolean }
export const CSV_COLUMNS = ['id', 'title', 'project', 'module', 'executor', 'status', 'originalStart', 'originalDue', 'forecastDue', 'remainingHours', 'allocations', 'dependencies', 'nextAction', 'source', 'lastUpdated', 'risk', 'blocker', 'contact', 'coordinationDue', 'meetingIds', 'materialVersionIds', 'executors', 'requirementId', 'requirementTitle', 'requirementSourceUrl'] as const;
const TEXT_FIELDS = ['id', 'title', 'project', 'module', 'executor', 'nextAction', 'source'] as const;
const OPTIONAL_TEXT_FIELDS = ['risk', 'blocker', 'contact'] as const;
const ALLOWED_FIELDS = new Set<string>([...CSV_COLUMNS, 'facts', 'forecasts', 'judgments', 'path', 'executors']);
const ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_.:-]{0,127}$/u;
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.entries(value).filter(([key]) => key !== 'path').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
function parseCsv(text: string): { rows: string[][]; errors: ImportIssue[] } {
  const rows: string[][] = [], errors: ImportIssue[] = [];
  let row: string[] = [], cell = '', quoted = false, afterQuote = false, line = 1, fieldStarted = false;
  const endCell = (): void => { row.push(cell); cell = ''; afterQuote = false; fieldStarted = false; };
  const endRow = (): void => { endCell(); rows.push(row); row = []; };
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') { if (input[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else { cell += char; if (char === '\n') line++; }
    } else if (char === '"') {
      if (fieldStarted || afterQuote) { errors.push({ row: line, field: 'csv', message: 'Unexpected quote inside an unquoted field' }); return { rows: [], errors }; }
      quoted = true; fieldStarted = true;
    } else if (char === ',') endCell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      endRow(); line++;
    } else {
      if (afterQuote) { errors.push({ row: line, field: 'csv', message: 'Unexpected characters after a closing quote' }); return { rows: [], errors }; }
      cell += char; fieldStarted = true;
    }
  }
  if (quoted) errors.push({ row: line, field: 'csv', message: 'Unclosed quoted CSV field' });
  else if (cell.length || row.length || fieldStarted) endRow();
  return { rows, errors };
}
function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== 'string' || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return undefined;
  const number = Number(value.trim());
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}
function embedded(value: unknown, field: string, row: number, errors: ImportIssue[]): unknown {
  if (typeof value !== 'string') return value;
  if (!value.trim()) return [];
  try { return JSON.parse(value); }
  catch { errors.push({ row, field, message: `${field} must contain a JSON array` }); return undefined; }
}
/** Validate a task without mutating input or applying defaults that hide missing dates/capacity. */
export function validateTaskRecord(record: unknown, row = 1, format: ImportFormat = 'json'): { task?: Task; errors: ImportIssue[]; warnings: ImportIssue[] } {
  const errors: ImportIssue[] = [], warnings: ImportIssue[] = [];
  const error = (field: string, message: string): void => { errors.push({ row, field, message }); };
  if (!object(record)) return { errors: [{ row, field: 'row', message: 'Each task must be an object' }], warnings };
  const result: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    if (typeof record[field] !== 'string') { error(field, `${field} must be a string`); continue; }
    result[field] = (record[field] as string).trim();
    if (['id', 'title'].includes(field) && !(result[field] as string)) error(field, `${field} is required`);
    if (['project', 'module', 'executor', 'nextAction', 'source'].includes(field) && !(result[field] as string)) warnings.push({ row, field, message: `${field} is not recorded` });
  }
  if (typeof result.id === 'string' && result.id && !ID_PATTERN.test(result.id)) error('id', 'IDs must use letters, numbers, dots, underscores, colons, or hyphens, start with a letter or number, and contain at most 128 characters');
  const status = typeof record.status === 'string' ? record.status.trim() : record.status;
  if (!TASK_STATUSES.includes(status as TaskStatus)) error('status', `status must be one of: ${TASK_STATUSES.join(', ')}`);
  else result.status = status;
  for (const field of ['originalStart', 'originalDue', 'forecastDue']) {
    const value = typeof record[field] === 'string' ? (record[field] as string).trim() : record[field];
    if (value !== '' && !isValidDate(value)) error(field, `${field} must be a real date in YYYY-MM-DD format`);
    else result[field] = value;
  }
  if (isValidDate(result.originalStart) && isValidDate(result.originalDue) && result.originalStart > result.originalDue) error('originalDue', 'originalDue must not precede originalStart');
  if (isValidDate(result.originalStart) && isValidDate(result.forecastDue) && result.originalStart > result.forecastDue) error('forecastDue', 'forecastDue must not precede originalStart');
  const hours = record.remainingHours === null || (typeof record.remainingHours === 'string' && record.remainingHours.trim() === '') ? null : parseNumber(record.remainingHours);
  if (hours === undefined) error('remainingHours', 'remainingHours must be a finite non-negative number or null (unknown)');
  else result.remainingHours = hours;
  const updated = typeof record.lastUpdated === 'string' ? record.lastUpdated.trim() : record.lastUpdated;
  if (!isValidTimestamp(updated)) error('lastUpdated', 'lastUpdated must be an ISO date or timestamp with timezone');
  else result.lastUpdated = updated;
  const rawAllocations = format === 'csv' ? embedded(record.allocations ?? [], 'allocations', row, errors) : record.allocations ?? [];
  const allocations: Allocation[] = [];
  if (!Array.isArray(rawAllocations)) { if (rawAllocations !== undefined) error('allocations', 'allocations must be an array'); }
  else rawAllocations.forEach((item, index) => {
    if (!object(item)) { error('allocations', `Allocation ${index + 1} must be an object`); return; }
    if (!isValidDate(item.periodStart) || !isValidDate(item.periodEnd)) { error('allocations', `Allocation ${index + 1} requires real periodStart and periodEnd dates`); return; }
    if (item.periodStart > item.periodEnd) { error('allocations', `Allocation ${index + 1} starts after it ends`); return; }
    const allocationHours = parseNumber(item.hours);
    if (allocationHours === undefined) { error('allocations', `Allocation ${index + 1} hours must be finite and non-negative`); return; }
    allocations.push({ periodStart: item.periodStart, periodEnd: item.periodEnd, hours: allocationHours });
  });
  result.allocations = allocations;
  let rawDependencies: unknown = record.dependencies ?? [];
  if (format === 'csv' && typeof rawDependencies === 'string') rawDependencies = rawDependencies.trim().startsWith('[') ? embedded(rawDependencies, 'dependencies', row, errors) : rawDependencies.split(';').map(value => value.trim()).filter(Boolean);
  const dependencies: string[] = [];
  if (!Array.isArray(rawDependencies)) { if (rawDependencies !== undefined) error('dependencies', 'dependencies must be an array of task IDs'); }
  else rawDependencies.forEach(id => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id.trim())) error('dependencies', 'Each dependency must be a valid task ID');
    else if (id.trim() === result.id) error('dependencies', 'A task cannot depend on itself');
    else if (dependencies.includes(id.trim())) warnings.push({ row, field: 'dependencies', message: `Repeated dependency ${id.trim()} was deduplicated` });
    else dependencies.push(id.trim());
  });
  result.dependencies = dependencies;
  for (const field of ['meetingIds', 'materialVersionIds', 'executors'] as const) {
    // Omit absent optional fields so old imports retain their exact shape.
    if (record[field] === undefined || (format === 'csv' && record[field] === '')) continue;
    let raw: unknown = record[field];
    if (format === 'csv' && typeof raw === 'string') raw = raw.trim().startsWith('[') ? embedded(raw, field, row, errors) : raw.split(';').map(value => value.trim()).filter(Boolean);
    if (!Array.isArray(raw)) { error(field, `${field} must be an array of exact record IDs`); continue; }
    const ids: string[] = [];
    for (const id of raw) {
      if (typeof id !== 'string' || !ID_PATTERN.test(id.trim())) error(field, `${field} contains an invalid record ID`);
      else if (ids.includes(id.trim())) warnings.push({ row, field, message: `Repeated reference ${id.trim()} was deduplicated` });
      else ids.push(id.trim());
    }
    result[field] = ids;
  }
  for (const field of ['requirementId', 'requirementTitle'] as const) {
    if (record[field] === undefined || record[field] === '') continue;
    const value = record[field];
    if (typeof value !== 'string' || !value.trim()) { error(field, `${field} must be a nonempty string when supplied`); continue; }
    if (field === 'requirementId' && !ID_PATTERN.test(value.trim())) { error(field, 'requirementId must be a valid stable requirement ID'); continue; }
    result[field] = value.trim();
  }
  if(record.requirementSourceUrl!==undefined&&record.requirementSourceUrl!==''){try{if(typeof record.requirementSourceUrl!=='string')throw new Error('must be a URL string');result.requirementSourceUrl=validateExternalUrl(record.requirementSourceUrl);}catch(e){error('requirementSourceUrl',e instanceof Error?e.message:String(e));}}
  if(result.requirementSourceUrl&&!result.requirementId)error('requirementSourceUrl','requirementSourceUrl requires requirementId');
  if (result.requirementTitle && !result.requirementId) error('requirementTitle', 'requirementTitle requires requirementId; titles alone do not establish grouping');
  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (record[field] === undefined || record[field] === '') continue;
    if (typeof record[field] !== 'string') error(field, `${field} must be a string`);
    else result[field] = record[field].trim();
  }
  if (record.coordinationDue !== undefined && record.coordinationDue !== '') {
    if (!isValidDate(record.coordinationDue)) error('coordinationDue', 'coordinationDue must be a real YYYY-MM-DD date');
    else result.coordinationDue = record.coordinationDue;
  }
  for (const field of ['facts', 'forecasts', 'judgments'] as const) {
    if (record[field] === undefined) continue;
    if (!Array.isArray(record[field])) { error(field, `${field} must be an array`); continue; }
    const notes: EvidenceNote[] = [];
    (record[field] as unknown[]).forEach((note, index) => {
      if (!object(note) || typeof note.text !== 'string' || !note.text.trim() || typeof note.source !== 'string' || !note.source.trim() || !isValidTimestamp(note.recordedAt)) error(field, `Evidence note ${index + 1} requires text, source, and a valid recordedAt timestamp`);
      else notes.push({ text: note.text.trim(), source: note.source.trim(), recordedAt: note.recordedAt });
    });
    result[field] = notes;
  }
  if (record.path !== undefined) warnings.push({ row, field: 'path', message: 'Imported filesystem path was ignored; the workbench chooses its own destination' });
  for (const field of Object.keys(record)) if (!ALLOWED_FIELDS.has(field)) warnings.push({ row, field, message: `Unknown field ${field} was ignored` });
  if (hours !== undefined && hours !== null && allocations.reduce((sum, item) => sum + item.hours, 0) > hours) warnings.push({ row, field: 'allocations', message: 'Total allocation exceeds remaining effort; check the allocation periods and estimate' });
  return { ...(errors.length ? {} : { task: result as unknown as Task }), errors, warnings };
}
export function previewImport(text: string, format: ImportFormat, existingTasks: readonly Task[] = []): ImportPreview {
  const preview: ImportPreview = { format, tasks: [], duplicates: [], errors: [], warnings: [], canApply: false };
  let records: { value: unknown; row: number }[] = [];
  if (format === 'json') {
    try {
      const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
      const values = Array.isArray(parsed) ? parsed : object(parsed) && Array.isArray(parsed.tasks) ? parsed.tasks : undefined;
      if (!values) preview.errors.push({ row: 1, field: 'json', message: 'JSON must be an array of tasks or an object with a tasks array' });
      else records = values.map((value, index) => ({ value, row: index + 1 }));
    } catch (error) { preview.errors.push({ row: 1, field: 'json', message: `Invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}` }); }
  } else if (format === 'csv') {
    const parsed = parseCsv(text);
    preview.errors.push(...parsed.errors);
    const rows = parsed.rows.filter(row => row.some(cell => cell.trim() !== ''));
    if (!rows.length && !preview.errors.length) preview.errors.push({ row: 1, field: 'csv', message: 'CSV is empty; a header row is required' });
    if (rows.length) {
      const headers = rows[0].map(header => header.trim());
      if (headers.some(header => !header)) preview.errors.push({ row: 1, field: 'csv', message: 'CSV headers must not be empty' });
      if (new Set(headers).size !== headers.length) preview.errors.push({ row: 1, field: 'csv', message: 'CSV contains duplicate column names' });
      const required = [...TEXT_FIELDS, 'status', 'originalStart', 'originalDue', 'forecastDue', 'remainingHours', 'lastUpdated'];
      for (const field of required) if (!headers.includes(field)) preview.errors.push({ row: 1, field, message: `Missing required CSV column ${field}` });
      rows.slice(1).forEach((row, index) => {
        if (row.length !== headers.length) preview.errors.push({ row: index + 2, field: 'csv', message: `Expected ${headers.length} cells; found ${row.length}` });
        else records.push({ value: Object.fromEntries(headers.map((header, column) => [header, row[column]])), row: index + 2 });
      });
    }
  } else preview.errors.push({ row: 1, field: 'format', message: 'Supported import formats are csv and json' });
  const seen = new Map<string, { task: Task; origin: string }>();
  for (const task of existingTasks) {
    if (seen.has(task.id)) preview.errors.push({ row: 0, field: 'id', message: `Existing workbench has duplicate ID ${task.id}; resolve it before importing` });
    else seen.set(task.id, { task, origin: 'existing workbench' });
  }
  for (const record of records) {
    const validated = validateTaskRecord(record.value, record.row, format);
    preview.errors.push(...validated.errors); preview.warnings.push(...validated.warnings);
    if (!validated.task) continue;
    const task = validated.task, previous = seen.get(task.id);
    if (previous) {
      if (stable(previous.task) === stable(task)) preview.duplicates.push({ id: task.id, row: record.row, reason: `Exact duplicate of ${previous.origin}; skipped` });
      else { preview.duplicates.push({ id: task.id, row: record.row, reason: `Conflicting duplicate of ${previous.origin}; not applied` }); preview.errors.push({ row: record.row, field: 'id', message: `Task ID ${task.id} already exists with different values; use an explicit reviewed update instead of import` }); }
    } else { seen.set(task.id, { task, origin: `import row ${record.row}` }); preview.tasks.push(task); }
  }
  const known = new Set([...existingTasks, ...preview.tasks].map(task => task.id));
  for (const task of preview.tasks) for (const id of task.dependencies) if (!known.has(id)) preview.warnings.push({ row: records.find(record => object(record.value) && record.value.id === task.id)?.row ?? 0, field: 'dependencies', message: `${task.id} references missing task ${id}; it will be reported as an exception` });
  preview.canApply = preview.errors.length === 0 && preview.tasks.length > 0;
  return preview;
}
export type UpdateField = 'status' | 'forecastDue' | 'remainingHours' | 'blocker' | 'risk' | 'nextAction' | 'contact' | 'coordinationDue';
export interface UpdateCandidate {
  id: string; taskId: string; field: UpdateField; previousValue: string | number | null | undefined;
  proposedValue: string | number; evidence: string; reason: string; confidence: 'high' | 'medium';
}
export interface UpdatePreview { mode: 'offline-rules'; previewOnly: true; candidates: UpdateCandidate[]; warnings: string[]; unmatched: string[] }
const FIELD_ALIASES: Record<string, UpdateField> = { status: 'status', '状态': 'status', forecast: 'forecastDue', forecastdue: 'forecastDue', '预测日期': 'forecastDue', remaining: 'remainingHours', remaininghours: 'remainingHours', '剩余工时': 'remainingHours', blocker: 'blocker', '阻塞': 'blocker', risk: 'risk', '风险': 'risk', next: 'nextAction', nextaction: 'nextAction', '下一步': 'nextAction', contact: 'contact', '联系人': 'contact', coordinationdue: 'coordinationDue', '协调日期': 'coordinationDue' };
const STATUS_ALIASES: Record<string, TaskStatus> = { 'in progress': 'in-progress', 'dev complete': 'dev-complete', 'development complete': 'dev-complete', 'test passed': 'test-passed', 'tests passed': 'test-passed', '开发完成': 'dev-complete', '测试通过': 'test-passed', '已发布': 'released', '已验收': 'accepted', '阻塞': 'blocked', '进行中': 'in-progress', '计划中': 'planned', '已取消': 'cancelled' };
function regexEscape(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
/** Explicit key:value rules only. No model/network, inferred completion, or direct writes. */
export function extractUpdateCandidates(text: string, tasks: readonly Task[]): UpdatePreview {
  const result: UpdatePreview = { mode: 'offline-rules', previewOnly: true, candidates: [], warnings: [], unmatched: [] };
  const uniqueIds = new Set(tasks.map(task => task.id));
  if (uniqueIds.size !== tasks.length) return { ...result, unmatched: text.split(/\r?\n/).filter(line => line.trim()), warnings: ['Duplicate task IDs in the workbench must be resolved before extracting updates'] };
  const aliases = Object.keys(FIELD_ALIASES).sort((a, b) => b.length - a.length).map(regexEscape).join('|');
  const keyPattern = new RegExp(`(?:^|[\\s,;|，；])(${aliases})\\s*[:=：]\\s*`, 'gi');
  for (const [index, original] of text.split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line) continue;
    const matched = tasks.filter(task => new RegExp(`(^|[^\\p{L}\\p{N}_.:-])${regexEscape(task.id)}(?=$|[^\\p{L}\\p{N}_.:-]|:(?=\\s))`, 'u').test(line));
    if (!matched.length) { result.unmatched.push(original); result.warnings.push(`Line ${index + 1}: no known task ID; no update proposed`); continue; }
    if (matched.length > 1) { result.unmatched.push(original); result.warnings.push(`Line ${index + 1}: multiple task IDs (${matched.map(task => task.id).join(', ')}); split into one task per line`); continue; }
    const task = matched[0];
    const matches = [...line.matchAll(keyPattern)];
    if (!matches.length) { result.unmatched.push(original); result.warnings.push(`Line ${index + 1}: use explicit fields such as status: dev-complete, forecastDue: 2026-10-15, remainingHours: 8`); continue; }
    let added = 0;
    for (let position = 0; position < matches.length; position++) {
      const match = matches[position], field = FIELD_ALIASES[match[1].toLowerCase()];
      const begin = match.index! + match[0].length;
      const end = matches[position + 1]?.index ?? line.length;
      let value = line.slice(begin, end).trim().replace(/[;,|，；]+$/, '').trim();
      let proposed: string | number = value;
      if (field === 'status') {
        const normalized = value.toLowerCase();
        const status = STATUS_ALIASES[normalized] ?? normalized;
        if (!TASK_STATUSES.includes(status as TaskStatus)) { result.warnings.push(`Line ${index + 1}: unrecognized explicit status “${value}”; no completion was inferred`); continue; }
        proposed = status;
      } else if (field === 'forecastDue' || field === 'coordinationDue') {
        if (!isValidDate(value) || (field === 'forecastDue' && value < task.originalStart)) { result.warnings.push(`Line ${index + 1}: invalid ${field}; use a real ISO date at or after task start`); continue; }
      } else if (field === 'remainingHours') {
        value = value.replace(/\s*(?:hours?|hrs?|h|小时)$/i, '').trim();
        const number = parseNumber(value);
        if (number === undefined) { result.warnings.push(`Line ${index + 1}: remainingHours must be a finite non-negative number`); continue; }
        proposed = number;
      } else if (!value) { result.warnings.push(`Line ${index + 1}: empty ${field} was not interpreted as deletion`); continue; }
      if (task[field] === proposed) continue;
      result.candidates.push({ id: `${task.id}:${field}:${index + 1}:${position + 1}`, taskId: task.id, field, previousValue: task[field], proposedValue: proposed, evidence: original, reason: `Explicit ${match[1]} field on line ${index + 1}; review against the source before applying`, confidence: 'high' }); added++;
    }
    if (!added) result.unmatched.push(original);
    if (!added && !result.warnings.some(warning => warning.startsWith(`Line ${index + 1}:`))) result.warnings.push(`Line ${index + 1}: no changed values found`);
  }
  const byField = new Map<string, UpdateCandidate[]>();
  result.candidates.forEach(candidate => { const key = `${candidate.taskId}:${candidate.field}`; byField.set(key, [...(byField.get(key) ?? []), candidate]); });
  const candidates: UpdateCandidate[] = [];
  for (const [key, group] of byField) {
    if (new Set(group.map(candidate => String(candidate.proposedValue))).size > 1) { result.warnings.push(`Conflicting proposals for ${key}; no candidate retained until the ambiguity is resolved`); result.unmatched.push(...group.map(candidate => candidate.evidence)); }
    else candidates.push(group[0]);
  }
  result.candidates = candidates;
  result.unmatched = [...new Set(result.unmatched)];
  return result;
}
/** Explicitly selected candidates only. Atomic, copy-on-write, with stale-preview checks. */
export function applyApprovedUpdates(tasks: readonly Task[], candidates: readonly UpdateCandidate[], options: { updatedAt?: string; source?: string } = {}): Task[] {
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('Duplicate task IDs prevent safe updates');
  if (options.updatedAt !== undefined && !isValidTimestamp(options.updatedAt)) throw new Error('updatedAt must be an ISO date or timestamp');
  const copy = JSON.parse(JSON.stringify(tasks)) as Task[];
  const taskMap = new Map(copy.map(task => [task.id, task]));
  const fieldSet = new Set<string>();
  for (const candidate of candidates) {
    if (!Object.values(FIELD_ALIASES).includes(candidate.field)) throw new Error(`Unsupported update field ${candidate.field}`);
    const key = `${candidate.taskId}:${candidate.field}`;
    if (fieldSet.has(key)) throw new Error(`Multiple approved updates for ${key}`);
    fieldSet.add(key);
    const task = taskMap.get(candidate.taskId);
    if (!task) throw new Error(`Task ${candidate.taskId} no longer exists`);
    if (task[candidate.field] !== candidate.previousValue) throw new Error(`Stale preview for ${key}; refresh before applying`);
    (task as unknown as Record<string, unknown>)[candidate.field] = candidate.proposedValue;
    const validated = validateTaskRecord(task);
    if (!validated.task) throw new Error(`Invalid update for ${key}: ${validated.errors.map(error => error.message).join('; ')}`);
    if (options.updatedAt) task.lastUpdated = options.updatedAt;
    const category = candidate.field === 'forecastDue' || candidate.field === 'remainingHours' ? 'forecasts' : candidate.field === 'risk' ? 'judgments' : 'facts';
    const note: EvidenceNote = { text: `Reviewed ${candidate.field}: ${String(candidate.proposedValue)}. Evidence: ${candidate.evidence}`, source: options.source?.trim() || task.source.trim() || 'User-reviewed offline update (original source not recorded)', recordedAt: options.updatedAt ?? task.lastUpdated };
    task[category] = [...(task[category] ?? []), note];
  }
  return copy;
}
