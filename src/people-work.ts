/** Read-only personnel projection. Only declared IDs establish requirement/source relationships. */
import {
  isClosed, taskExecutors,
  type ClosureStatus, type MaterialVersion, type Meeting, type Task, type WorkbenchData,
} from './domain';

export interface MeetingMaterialReference {
  version: MaterialVersion;
  /** Context only: these meetings reference the version; this is not a task pin. */
  meetingIds: string[];
}
export interface PersonWorkGroup {
  /** Collision-safe identity, including the project and a distinct ungrouped sentinel. */
  id: string;
  project: string;
  requirementId?: string;
  title: string;
  /** Unique, explicitly recorded HTTP(S) requirement source; never an inferred identity. */
  sourceUrl?: string;
  parentTask?: Task;
  /** Only this person's tasks, counted once; cancelled tasks are always closed. */
  currentTasks: Task[];
  closedTasks: Task[];
  /** All declared siblings, regardless of executor/status. Ungrouped contains only personal tasks. */
  memberTasks: Task[];
  meetings: Meeting[];
  /** Exact pins from members and the parent record. Never latest/adopted-version substitutions. */
  materialVersions: MaterialVersion[];
  /** Meeting context is separate even when a version is also explicitly pinned by a task. */
  meetingMaterialVersions: MeetingMaterialReference[];
  warnings: string[];
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const byId = (a: { id: string }, b: { id: string }): number => compare(a.id, b.id);
const groupKey = (project: string, requirementId?: string): string => JSON.stringify([project, requirementId ?? null]);
const taskKey = (task: Pick<Task, 'project' | 'id'>): string => JSON.stringify([task.project, task.id]);
/** Canonicalization only deduplicates identical input records; never chooses a conflicting record. */
function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => compare(a, b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const item of items) index.set(item.id, [...(index.get(item.id) ?? []), item]);
  return index;
}
function uniqueRecords(tasks: readonly Task[]): Task[] {
  return [...new Map(tasks.map(task => [stableValue(task), task])).entries()]
    .sort(([aKey, a], [bKey, b]) => compare(a.project, b.project) || byId(a, b) || compare(aKey, bKey))
    .map(([, task]) => task);
}
function validSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return value === value.trim() && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}
function declaredRequirement(task: Task): string | undefined {
  // Empty legacy values are absence, but do not normalize or guess a non-empty identity.
  return task.requirementId?.trim() ? task.requirementId : undefined;
}

/**
 * Flat, explicit requirement grouping. The result borrows records, but never modifies them or
 * any input array. Missing parent records are valid external requirements, not fabricated tasks.
 * Conflicting duplicate tasks stay visible as separate source records; ambiguous joins are blocked.
 */
export function buildPersonWorkGroups(
  data: WorkbenchData, personId: string, closureStatus: ClosureStatus = 'test-passed',
): PersonWorkGroup[] {
  const allTasks = uniqueRecords(data.tasks);
  const tasksByProjectId = new Map<string, Task[]>();
  for (const task of data.tasks) {
    const key = taskKey(task);
    tasksByProjectId.set(key, [...(tasksByProjectId.get(key) ?? []), task]);
  }
  const referencedParents = new Set(allTasks.flatMap(task => {
    const requirementId = declaredRequirement(task);
    return requirementId === undefined ? [] : [groupKey(task.project, requirementId)];
  }));
  const requirementFor = (task: Task): string | undefined => declaredRequirement(task)
    ?? (referencedParents.has(groupKey(task.project, task.id)) ? task.id : undefined);
  const membersByGroup = new Map<string, Task[]>();
  for (const task of allTasks) {
    const key = groupKey(task.project, requirementFor(task));
    membersByGroup.set(key, [...(membersByGroup.get(key) ?? []), task]);
  }
  const meetingIndex = indexById(data.meetings ?? []);
  const versionIndex = indexById(data.materialVersions ?? []);
  const groups: PersonWorkGroup[] = [];
  for (const [id, allMembers] of membersByGroup) {
    const personal = allMembers.filter(task => taskExecutors(task).includes(personId));
    if (!personal.length) continue;
    const { project } = personal[0];
    const requirementId = requirementFor(personal[0]);
    const warnings = new Set<string>();
    const parentCandidates = requirementId === undefined ? [] : tasksByProjectId.get(groupKey(project, requirementId)) ?? [];
    const parentTask = parentCandidates.length === 1 ? parentCandidates[0] : undefined;
    if (parentCandidates.length > 1) warnings.add(`上级需求 ${requirementId} 的任务 ID 重复，未关联上级记录`);
    const memberTasks = requirementId === undefined ? personal : allMembers;
    const titleCandidates = requirementId === undefined ? [] : [...new Set(memberTasks.filter(task => declaredRequirement(task) === requirementId)
      .map(task => task.requirementTitle?.trim()).filter((title): title is string => !!title))].sort(compare);
    if (titleCandidates.length > 1) warnings.add(`需求 ${requirementId} 的名称不一致，请核对来源`);
    if (parentTask && titleCandidates.some(title => title !== parentTask.title.trim())) warnings.add(`需求 ${requirementId} 的名称与上级记录不一致，显示上级标题`);
    const title = requirementId === undefined ? '未分组'
      : parentTask?.title || (titleCandidates.length === 1 ? titleCandidates[0] : requirementId);
    const sourceCandidates = requirementId === undefined ? [] : [...new Set(memberTasks
      .map(task => task.requirementSourceUrl).filter((url): url is string => !!url))].sort(compare);
    if (sourceCandidates.some(url => !validSourceUrl(url))) warnings.add(`需求 ${requirementId} 的来源链接无效，未关联`);
    if (sourceCandidates.length > 1) warnings.add(`需求 ${requirementId} 的来源链接不一致，未关联`);
    const sourceUrl = sourceCandidates.length === 1 && validSourceUrl(sourceCandidates[0]) ? sourceCandidates[0] : undefined;
    // A parent is evidence, not an extra personal task. Explicit nested parents keep their declared group.
    const evidenceTasks = uniqueRecords(parentTask ? [...memberTasks, parentTask] : memberTasks);
    const evidenceTaskIds = new Set(evidenceTasks.map(task => task.id));
    for (const task of evidenceTasks) {
      if ((tasksByProjectId.get(taskKey(task))?.length ?? 0) > 1) warnings.add(`任务 ${task.id} 的 ID 重复，未使用按任务 ID 的关联`);
    }
    const meetings = new Map<string, Meeting>();
    const resolveMeeting = (meetingId: string): Meeting | undefined => {
      const matches = meetingIndex.get(meetingId) ?? [];
      if (matches.length !== 1) {
        warnings.add(`会议 ${meetingId} ${matches.length ? 'ID 重复' : '缺失'}，未关联`);
        return undefined;
      }
      if (matches[0].project !== project) {
        warnings.add(`会议 ${meetingId} 跨项目，未关联`);
        return undefined;
      }
      return matches[0];
    };
    for (const task of evidenceTasks) {
      for (const meetingId of new Set(task.meetingIds ?? [])) {
        const meeting = resolveMeeting(meetingId);
        if (meeting) meetings.set(meeting.id, meeting);
      }
    }
    // Reverse action links are explicit relationships too, but need a unique project-local task.
    for (const meeting of data.meetings ?? []) {
      const linkedIds = new Set(meeting.actions.filter(action => action.taskId && evidenceTaskIds.has(action.taskId)).map(action => action.taskId!));
      if (!linkedIds.size) continue;
      if (meeting.project !== project) {
        // The same task ID can legitimately occur in another project; it cannot link this group.
        if ([...linkedIds].some(taskId => !tasksByProjectId.has(groupKey(meeting.project, taskId)))) warnings.add(`会议 ${meeting.id} 跨项目，未关联`);
        continue;
      }
      const unambiguous = [...linkedIds].some(taskId => (tasksByProjectId.get(groupKey(project, taskId))?.length ?? 0) === 1);
      if (!unambiguous) continue;
      const resolved = resolveMeeting(meeting.id);
      if (resolved) meetings.set(resolved.id, resolved);
    }
    const resolveVersion = (versionId: string): MaterialVersion | undefined => {
      const matches = versionIndex.get(versionId) ?? [];
      if (matches.length !== 1) {
        warnings.add(`资料版本 ${versionId} ${matches.length ? 'ID 重复' : '缺失'}，未关联；不会改用最新版本`);
        return undefined;
      }
      if (matches[0].project !== project) {
        warnings.add(`资料版本 ${versionId} 跨项目，未关联`);
        return undefined;
      }
      return matches[0];
    };
    const materialVersions = new Map<string, MaterialVersion>();
    for (const task of evidenceTasks) for (const versionId of new Set(task.materialVersionIds ?? [])) {
      const version = resolveVersion(versionId);
      if (version) materialVersions.set(version.id, version);
    }
    const meetingMaterialVersions = new Map<string, MeetingMaterialReference>();
    for (const meeting of meetings.values()) for (const versionId of new Set(meeting.materialVersionIds)) {
      const version = resolveVersion(versionId);
      if (!version) continue;
      const reference = meetingMaterialVersions.get(version.id) ?? { version, meetingIds: [] };
      reference.meetingIds.push(meeting.id);
      meetingMaterialVersions.set(version.id, reference);
    }
    groups.push({
      id, project, requirementId, title, sourceUrl, parentTask,
      currentTasks: personal.filter(task => !isClosed(task, closureStatus)),
      closedTasks: personal.filter(task => isClosed(task, closureStatus)),
      memberTasks, meetings: [...meetings.values()].sort(byId),
      materialVersions: [...materialVersions.values()].sort(byId),
      meetingMaterialVersions: [...meetingMaterialVersions.values()]
        .sort((a, b) => byId(a.version, b.version)).map(reference => ({ ...reference, meetingIds: reference.meetingIds.sort(compare) })),
      warnings: [...warnings].sort(compare),
    });
  }
  return groups.sort((a, b) => Number(b.currentTasks.length > 0) - Number(a.currentTasks.length > 0)
    || compare(a.project, b.project) || Number(a.requirementId === undefined) - Number(b.requirementId === undefined)
    || compare(a.title, b.title) || compare(a.id, b.id));
}
