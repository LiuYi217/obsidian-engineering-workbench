/** Pure source/version/meeting policy. No Vault writes, network access, or automatic task updates. */
import {
  isClosed, isValidDate, isValidTimestamp,
  type Adoption, type ClosureStatus, type Decision, type MaterialVersion, type Meeting,
  type MeetingAction, type MeetingDecision, type Task, type WorkbenchData,
} from './domain';

const ID = /^[\p{L}\p{N}][\p{L}\p{N}_.:-]{0,127}$/u;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const stamp = (value: string): number => isValidTimestamp(value) ? Date.parse(value) : NaN;
const byId = (a: { id: string }, b: { id: string }): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function text(errors: string[], record: Record<string, unknown>, key: string, required = true, nonempty = required): void {
  const value = record[key];
  if (value === undefined && !required) return;
  if (typeof value !== 'string' || (nonempty && !value.trim())) errors.push(`${key} 需为${nonempty ? '非空' : ''}字符串`);
}
function id(errors: string[], record: Record<string, unknown>, key: string, required = true): void {
  if (record[key] === undefined && !required) return;
  if (!isId(record[key])) errors.push(`${key} 需为有效记录 ID（字母、数字、点、下划线、冒号、连字符，最长 128 字符）`);
}
function strings(errors: string[], record: Record<string, unknown>, key: string, ids = false): void {
  const value = record[key];
  if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || !entry.trim() || (ids && !isId(entry)))) errors.push(`${key} 需为${ids ? '有效记录 ID' : '非空字符串'}数组`);
  else if (new Set(value).size !== value.length) errors.push(`${key} 含重复项`);
}
function timestamp(errors: string[], record: Record<string, unknown>, key: string): void {
  if (!isValidTimestamp(record[key])) errors.push(`${key} 需为有效 ISO 日期或带时区时间`);
}
function url(errors: string[], record: Record<string, unknown>, key: string): void {
  if (record[key] === undefined) return;
  try {
    if (typeof record[key] !== 'string' || !record[key].trim()) throw new Error();
    const parsed = new URL(record[key]);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
  } catch { errors.push(`${key} 需为无内嵌凭据的 HTTP(S) URL`); }
}
/** Package entries are Vault-relative, never traversal paths or executable URLs. */
export function isSafePackagePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/^[\\/]/.test(value) && !/[\\\x00-\x1f:*?"<>|]/.test(value) && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}
export function validateMaterialVersion(value: unknown): string[] {
  if (!object(value)) return ['资料版本需为对象'];
  const errors: string[] = [];
  for (const key of ['id', 'materialId']) id(errors, value, key);
  for (const key of ['title', 'version', 'project', 'source', 'provider']) text(errors, value, key);
  text(errors, value, 'summary', true, false);
  for (const key of ['module', 'iteration', 'sourceFile', 'runRequirements', 'previewNotes', 'changeNotes', 'path']) text(errors, value, key, false, false);
  if (!['document', 'prototype'].includes(String(value.kind))) errors.push('kind 需为 document 或 prototype');
  if (!['incoming', 'reviewed', 'archived'].includes(String(value.status))) errors.push('status 需为 incoming、reviewed 或 archived；采用状态由 Adoption 推导');
  if (!['unknown', 'pass', 'fail'].includes(String(value.previewStatus))) errors.push('previewStatus 需为 unknown、pass 或 fail');
  for (const key of ['requiresNetwork', 'requiresLogin']) if (typeof value[key] !== 'boolean' && value[key] !== 'unknown') errors.push(`${key} 需为布尔值或 unknown`);
  if (['pass', 'fail'].includes(String(value.previewStatus)) && (typeof value.previewNotes !== 'string' || !value.previewNotes.trim())) errors.push('previewStatus 为 pass/fail 时必须记录非空 previewNotes，不得推断检查结果');
  for (const key of ['createdAt', 'lastUpdated']) timestamp(errors, value, key);
  if (isValidTimestamp(value.createdAt) && isValidTimestamp(value.lastUpdated) && stamp(value.lastUpdated) < stamp(value.createdAt)) errors.push('lastUpdated 不得早于 createdAt');
  strings(errors, value, 'reviewIssues'); url(errors, value, 'sourceUrl');
  for (const key of ['sourceFile', 'packagePath', 'entryPath']) if (value[key] !== undefined && !isSafePackagePath(value[key])) errors.push(`${key} 需为安全的包内或 Vault 相对路径`);
  if (value.entryPath !== undefined && value.packagePath === undefined) errors.push('entryPath 需要 packagePath');
  if (value.files !== undefined) {
    if (!Array.isArray(value.files)) errors.push('files 需为文件清单数组');
    else {
      const paths = new Set<string>();
      for (const file of value.files) {
        if (!object(file) || !isSafePackagePath(file.path) || typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 0 || (file.sha256 !== undefined && (typeof file.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(file.sha256)))) { errors.push('files 每项需含安全相对 path、非负整数 size 和可选 SHA-256'); continue; }
        if (paths.has(file.path)) errors.push(`files 含重复路径 ${file.path}`);
        paths.add(file.path);
      }
      if (typeof value.entryPath === 'string' && typeof value.packagePath === 'string') {
        const prefix = `${value.packagePath}/files/`;
        if (!value.entryPath.startsWith(prefix) || !paths.has(value.entryPath.slice(prefix.length))) errors.push('entryPath 必须指向 packagePath/files 下的 files 清单条目');
      }
    }
  }
  return errors;
}
export function validateAdoption(value: unknown): string[] {
  if (!object(value)) return ['采用记录需为对象'];
  const errors: string[] = [];
  for (const key of ['id', 'materialId', 'versionId']) id(errors, value, key);
  for (const key of ['project', 'source']) text(errors, value, key);
  text(errors, value, 'path', false, false); timestamp(errors, value, 'adoptedAt');
  return errors;
}
export function validateMeeting(value: unknown): string[] {
  if (!object(value)) return ['会议记录需为对象'];
  const errors: string[] = []; id(errors, value, 'id');
  for (const key of ['title', 'project', 'source']) text(errors, value, key);
  for (const key of ['module', 'iteration', 'path']) text(errors, value, key, false, false);
  text(errors, value, 'transcript', true, false);
  for (const key of ['startAt', 'lastUpdated']) timestamp(errors, value, key);
  for (const key of ['participants', 'unresolved']) strings(errors, value, key);
  strings(errors, value, 'materialVersionIds', true);
  for (const key of ['recordingUrl', 'transcriptUrl']) url(errors, value, key);
  for (const key of ['decisions', 'actions'] as const) {
    const items = value[key];
    if (!Array.isArray(items)) { errors.push(`${key} 需为数组`); continue; }
    const ids = new Set<string>();
    for (const item of items) {
      if (!object(item)) { errors.push(`${key} 每项需为对象`); continue; }
      id(errors, item, 'id'); text(errors, item, 'text');
      if (typeof item.id === 'string') { if (ids.has(item.id)) errors.push(`${key} 含重复 ID ${item.id}`); ids.add(item.id); }
      if (key === 'decisions') {
        if (!['discussion', 'suggestion', 'confirmed'].includes(String(item.state))) errors.push('决策 state 需为 discussion、suggestion 或 confirmed');
        text(errors, item, 'source', false, true);
      } else {
        if (!['open', 'done'].includes(String(item.state))) errors.push('行动 state 需为 open 或 done');
        id(errors, item, 'taskId', false); text(errors, item, 'owner', false, false);
        if (item.due !== undefined && !isValidDate(item.due)) errors.push('行动 due 需为有效 ISO 日期');
      }
    }
  }
  return errors;
}
function uniqueVersion(data: WorkbenchData, versionId: string): MaterialVersion | undefined {
  const matches = (data.materialVersions ?? []).filter(version => version.id === versionId);
  return matches.length === 1 ? matches[0] : undefined;
}
/** Latest explicit record is a confirmation token; a revert still has a different Adoption ID. */
export function getLatestAdoption(data: WorkbenchData, materialId: string, project?: string): Adoption | undefined {
  const choices = (data.adoptions ?? []).filter(item => item.materialId === materialId && (!project || item.project === project));
  if (!choices.length || choices.some(item => validateAdoption(item).length > 0)) return undefined;
  if (!project && new Set(choices.map(item => item.project)).size > 1) return undefined;
  const newest = Math.max(...choices.map(item => stamp(item.adoptedAt)));
  const latest = choices.filter(item => stamp(item.adoptedAt) === newest);
  return latest.length === 1 ? latest[0] : undefined;
}
/** Latest explicit adoption wins. Equal timestamps are ambiguous; never silently break that tie. */
export function getAdoptedVersion(data: WorkbenchData, materialId: string, project?: string): MaterialVersion | undefined {
  const latest = getLatestAdoption(data, materialId, project);
  if (!latest) return undefined;
  const version = uniqueVersion(data, latest.versionId);
  return version && version.materialId === materialId && version.project === latest.project && stamp(version.createdAt) <= stamp(latest.adoptedAt) ? version : undefined;
}
/** Arrival never adopts. Version labels are opaque; ordering uses captured creation timestamps. */
export function getNewerPendingVersions(data: WorkbenchData, materialId?: string, project?: string): MaterialVersion[] {
  return (data.materialVersions ?? []).filter(version => {
    if ((materialId && version.materialId !== materialId) || (project && version.project !== project) || version.status === 'archived') return false;
    const adopted = getAdoptedVersion(data, version.materialId, version.project);
    return !adopted || (version.id !== adopted.id && stamp(version.createdAt) > stamp(adopted.createdAt));
  }).sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt) || byId(a, b));
}
export interface TaskTrace {
  task: Task; meetings: Meeting[]; materialVersions: MaterialVersion[]; adoptions: Adoption[]; decisions: Decision[];
  confirmedDecisions: (MeetingDecision & { meetingId: string })[];
  discussionDecisions: (MeetingDecision & { meetingId: string })[];
  linkedActions: (MeetingAction & { meetingId: string })[];
  missingMeetingIds: string[]; missingMaterialVersionIds: string[]; warnings: string[];
}
/** Trace only exact task pins and explicit meeting links; a meeting's references do not become task pins. */
export function taskTrace(data: WorkbenchData, task: Task): TaskTrace {
  const meetingIds = [...new Set(task.meetingIds ?? [])], versionIds = [...new Set(task.materialVersionIds ?? [])];
  const meetings = (data.meetings ?? []).filter(meeting => meetingIds.includes(meeting.id) || meeting.actions.some(action => action.taskId === task.id)).sort(byId);
  const missingMeetingIds = meetingIds.filter(id => meetings.filter(meeting => meeting.id === id).length !== 1);
  const materialVersions = versionIds.map(id => uniqueVersion(data, id)).filter((v): v is MaterialVersion => !!v).sort(byId);
  const missingMaterialVersionIds = versionIds.filter(id => !materialVersions.some(version => version.id === id));
  const confirmedDecisions: TaskTrace['confirmedDecisions'] = [], discussionDecisions: TaskTrace['discussionDecisions'] = [], linkedActions: TaskTrace['linkedActions'] = [];
  const warnings = [
    ...missingMeetingIds.map(id => `任务 ${task.id} 引用的会议 ${id} 缺失或 ID 重复`),
    ...missingMaterialVersionIds.map(id => `任务 ${task.id} 固定的资料版本 ${id} 缺失或 ID 重复；不会改用最新版本`),
  ];
  for (const meeting of meetings) {
    if (meeting.project !== task.project) warnings.push(`任务 ${task.id} 与会议 ${meeting.id} 的项目不一致`);
    meeting.decisions.forEach(decision => (decision.state === 'confirmed' ? confirmedDecisions : discussionDecisions).push({ ...decision, meetingId: meeting.id }));
    meeting.actions.filter(action => action.taskId === task.id).forEach(action => linkedActions.push({ ...action, meetingId: meeting.id }));
  }
  for (const version of materialVersions) if (version.project !== task.project) warnings.push(`任务 ${task.id} 与固定版本 ${version.id} 的项目不一致`);
  return {
    task, meetings, materialVersions,
    adoptions: (data.adoptions ?? []).filter(item => materialVersions.some(version => version.id === item.versionId && version.materialId === item.materialId && version.project === item.project)).sort((a, b) => stamp(a.adoptedAt) - stamp(b.adoptedAt) || byId(a, b)),
    decisions: data.decisions.filter(decision => decision.taskIds?.includes(task.id)).sort(byId),
    confirmedDecisions, discussionDecisions, linkedActions, missingMeetingIds, missingMaterialVersionIds, warnings,
  };
}
export interface KnowledgeReminder {
  id: string; kind: 'overdue-action' | 'pending-version' | 'missing-evidence'; title: string; reason: string; source: string;
  taskId?: string; meetingId?: string; materialId?: string; versionId?: string;
}
export function knowledgeReminders(data: WorkbenchData, today: string, closureStatus: ClosureStatus = 'test-passed'): KnowledgeReminder[] {
  if (!isValidDate(today)) throw new RangeError('today 需为有效 ISO 日期');
  const reminders: KnowledgeReminder[] = [];
  for (const meeting of data.meetings ?? []) for (const action of meeting.actions) {
    const task = action.taskId ? data.tasks.find(task => task.id === action.taskId) : undefined;
    // A linked closed task is already accounted for; no duplicate open action alert.
    if (action.state === 'open' && action.due && action.due < today && !(task && isClosed(task, closureStatus))) reminders.push({ id: `overdue-action:${meeting.id}:${action.id}`, kind: 'overdue-action', title: action.text, reason: `会议记录中的行动截止 ${action.due}，尚未闭环${action.owner ? `；记录负责人：${action.owner}` : ''}`, source: meeting.source, meetingId: meeting.id, taskId: action.taskId });
  }
  for (const version of getNewerPendingVersions(data)) reminders.push({ id: `pending-version:${version.id}`, kind: 'pending-version', title: `${version.title} · ${version.version}`, reason: getAdoptedVersion(data, version.materialId, version.project) ? '有更新资料待评审/采用；现行采用版本及任务版本未改变' : '资料尚无明确采用记录；请评审后决定是否采用', source: version.source, materialId: version.materialId, versionId: version.id });
  for (const task of data.tasks) {
    if (isClosed(task, closureStatus)) continue;
    const trace = taskTrace(data, task);
    const hasEvidence = !!task.source.trim() || (task.facts ?? []).some(note => !!note.text.trim() && !!note.source.trim() && isValidTimestamp(note.recordedAt)) || trace.meetings.length > 0 || trace.materialVersions.length > 0 || trace.decisions.length > 0;
    if (!hasEvidence || trace.warnings.length > 0) reminders.push({ id: `missing-evidence:${task.id}`, kind: 'missing-evidence', title: task.title, reason: !hasEvidence ? '任务缺少来源、事实依据或有效关联记录' : trace.warnings.join('；'), source: task.source, taskId: task.id });
  }
  return reminders;
}
/** Warnings keep unresolved historical references visible without guessing or rewriting old Markdown. */
export function knowledgeWarnings(data: WorkbenchData): string[] {
  const warnings: string[] = [];
  for (const [label, records] of [['资料版本', data.materialVersions ?? []], ['采用记录', data.adoptions ?? []], ['会议', data.meetings ?? []]] as const) {
    const ids = new Set<string>();
    for (const record of records) { if (ids.has(record.id)) warnings.push(`${label} ID 重复：${record.id}`); ids.add(record.id); }
  }
  const identities = new Set<string>(), materialProjects = new Map<string, string>(), materialKinds = new Map<string, string>();
  for (const version of data.materialVersions ?? []) {
    const identity = JSON.stringify([version.materialId, version.version]);
    if (identities.has(identity)) warnings.push(`资料 ${version.materialId} 的版本标签 ${version.version} 重复；无法唯一确认来源快照`);
    identities.add(identity);
    const project = materialProjects.get(version.materialId);
    if (project && project !== version.project) warnings.push(`资料 ${version.materialId} 跨项目使用同一身份`);
    materialProjects.set(version.materialId, version.project);
    const kind = materialKinds.get(version.materialId);
    if (kind && kind !== version.kind) warnings.push(`资料 ${version.materialId} 的文档/原型类型发生冲突`);
    materialKinds.set(version.materialId, version.kind);
  }
  const adoptionTimes = new Set<string>();
  for (const adoption of data.adoptions ?? []) {
    const version = uniqueVersion(data, adoption.versionId);
    if (!version) warnings.push(`采用记录 ${adoption.id} 指向缺失或重复的版本 ${adoption.versionId}`);
    else {
      if (version.materialId !== adoption.materialId || version.project !== adoption.project) warnings.push(`采用记录 ${adoption.id} 的资料/项目与版本 ${version.id} 不一致`);
      if (stamp(adoption.adoptedAt) < stamp(version.createdAt)) warnings.push(`采用记录 ${adoption.id} 的时间早于资料版本创建时间`);
    }
    const timeKey = JSON.stringify([adoption.materialId, adoption.project, stamp(adoption.adoptedAt)]);
    if (adoptionTimes.has(timeKey)) warnings.push(`资料 ${adoption.materialId} 同时存在多条采用记录；当前版本有歧义`);
    adoptionTimes.add(timeKey);
  }
  for (const task of data.tasks) warnings.push(...taskTrace(data, task).warnings);
  for (const meeting of data.meetings ?? []) {
    for (const versionId of meeting.materialVersionIds) {
      const version = uniqueVersion(data, versionId);
      if (!version) warnings.push(`会议 ${meeting.id} 引用缺失或重复的资料版本 ${versionId}`);
      else if (version.project !== meeting.project) warnings.push(`会议 ${meeting.id} 与资料版本 ${versionId} 的项目不一致`);
    }
    for (const action of meeting.actions) {
      if (!action.taskId) continue;
      const task = data.tasks.find(task => task.id === action.taskId);
      if (!task) warnings.push(`会议 ${meeting.id} 行动 ${action.id} 关联的任务 ${action.taskId} 缺失`);
      else if (task.project !== meeting.project) warnings.push(`会议 ${meeting.id} 行动 ${action.id} 与任务 ${task.id} 的项目不一致`);
    }
  }
  return [...new Set(warnings)];
}
/** Validate and freeze an append-only snapshot. A changed source requires a new ID and version label. */
export function createMaterialVersion(data: WorkbenchData, candidate: MaterialVersion): MaterialVersion {
  const errors = validateMaterialVersion(candidate);
  for (const existing of data.materialVersions ?? []) {
    if (existing.id === candidate.id) errors.push(`版本 ID ${candidate.id} 已存在；不可覆写冻结版本`);
    if (existing.materialId !== candidate.materialId) continue;
    if (existing.version === candidate.version) errors.push(`资料 ${candidate.materialId} 版本标签 ${candidate.version} 已存在`);
    if (existing.project !== candidate.project) errors.push('同一 materialId 不可跨项目复用');
    if (existing.kind !== candidate.kind) errors.push('同一 materialId 不可更换文档/原型类型');
  }
  if (errors.length) throw new Error(errors.join('; '));
  return freeze(clone(candidate));
}
/** Explicit new adoption does not modify any version, prior adoption, or task. */
export function createAdoption(data: WorkbenchData, candidate: Adoption): Adoption {
  const errors = validateAdoption(candidate), version = uniqueVersion(data, candidate.versionId);
  if (!version) errors.push(`版本 ${candidate.versionId} 缺失或 ID 重复`);
  else {
    if (version.materialId !== candidate.materialId || version.project !== candidate.project) errors.push('采用记录必须指向同一资料、同一项目的确切版本');
    if (stamp(candidate.adoptedAt) < stamp(version.createdAt)) errors.push('采用时间不得早于版本创建时间');
  }
  for (const existing of data.adoptions ?? []) {
    if (existing.id === candidate.id) errors.push(`采用记录 ${candidate.id} 已存在；不可覆写历史`);
    if (existing.materialId === candidate.materialId && existing.project === candidate.project && stamp(existing.adoptedAt) >= stamp(candidate.adoptedAt)) errors.push('新采用记录的时间必须晚于现有记录，避免旧预览或同刻冲突');
  }
  if (errors.length) throw new Error(errors.join('; '));
  return freeze(clone(candidate));
}
/** Pure preview helper. Persist both returned records only after explicit review; never creates a task. */
export function linkMeetingAction(meeting: Meeting, actionId: string, task: Task, updatedAt: string): { meeting: Meeting; task: Task } {
  const errors = validateMeeting(meeting);
  if (errors.length) throw new Error(errors.join('; '));
  if (!isValidTimestamp(updatedAt) || stamp(updatedAt) < stamp(meeting.lastUpdated) || stamp(updatedAt) < stamp(task.lastUpdated)) throw new Error('关联时间无效或早于现有记录；请刷新预览');
  if (meeting.project !== task.project) throw new Error('会议与任务必须属于同一项目');
  const matches = meeting.actions.filter(action => action.id === actionId);
  if (matches.length !== 1) throw new Error(`会议行动 ${actionId} 缺失或重复`);
  if (matches[0].taskId && matches[0].taskId !== task.id) throw new Error(`会议行动 ${actionId} 已关联任务 ${matches[0].taskId}；不能重复生成`);
  const nextMeeting = clone(meeting), nextTask = clone(task);
  nextMeeting.actions.find(action => action.id === actionId)!.taskId = task.id;
  nextMeeting.lastUpdated = updatedAt;
  nextTask.meetingIds = [...new Set([...(task.meetingIds ?? []), meeting.id])];
  nextTask.lastUpdated = updatedAt;
  // Deliberately do not copy meeting.materialVersionIds: exact task pins require a separate reviewed choice.
  return { meeting: nextMeeting, task: nextTask };
}
