/** Pure, deterministic domain model. Dates are ISO calendar dates (YYYY-MM-DD). */
export const TASK_STATUSES = ['planned', 'in-progress', 'blocked', 'dev-complete', 'test-passed', 'released', 'accepted', 'cancelled'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export type ClosureStatus = 'dev-complete' | 'test-passed' | 'released' | 'accepted';
export interface Period { start: string; end: string }
export interface Allocation { periodStart: string; periodEnd: string; hours: number }
export interface WorkingCalendar { weekdays: number[]; exceptions?: Record<string, boolean> }
export interface EvidenceNote { text: string; source: string; recordedAt: string }
export interface Task {
  id: string; title: string; project: string; module: string; executor: string;
  /** Empty dates mean unrecorded, never today or a fabricated commitment. */
  status: TaskStatus; originalStart: string; originalDue: string; forecastDue: string;
  remainingHours: number | null; allocations: Allocation[]; dependencies: string[];
  nextAction: string; source: string; lastUpdated: string;
  risk?: string; blocker?: string; contact?: string; coordinationDue?: string; path?: string;
  facts?: EvidenceNote[]; forecasts?: EvidenceNote[]; judgments?: EvidenceNote[];
  /** Explicit source links. Material IDs pin exact immutable version records, never the latest version. */
  meetingIds?: string[]; materialVersionIds?: string[]; executors?: string[];
}
export interface Milestone { id: string; title: string; date: string; status?: 'planned' | 'completed'; source?: string }
export interface Project { id: string; name: string; owner?: string; targetDate?: string; milestones?: Milestone[]; description?: string; source?: string; path?: string }
export interface Module { id: string; name: string; project: string; owner?: string; source?: string; path?: string }
export interface CapacityPlan {
  /** Set either hoursPerDay or weeklyHours. hoursPerDay takes precedence when both exist. */
  hoursPerDay?: number; weeklyHours?: number;
  leave?: Allocation[]; meetings?: Allocation[]; support?: Allocation[]; buffer?: Allocation[];
}
export interface Person { id: string; name: string; calendar?: WorkingCalendar; capacity?: CapacityPlan; source?: string; path?: string }
export interface Decision { id: string; title: string; date: string; owner: string; decision: string; source: string; project?: string; taskIds?: string[]; path?: string }
export interface Baseline {
  readonly id: string; readonly name: string; readonly createdAt: string;
  readonly period?: Readonly<Period>; readonly tasks: readonly Task[]; readonly schemaVersion: 1;
  readonly path?: string;
}
export interface MaterialFile { readonly path: string; readonly size: number; readonly sha256?: string }
/** A captured version is append-only. Review/adoption never changes an earlier version or task pin. */
export interface MaterialVersion {
  readonly id: string; readonly materialId: string; readonly title: string;
  readonly kind: 'document' | 'prototype'; readonly version: string; readonly project: string;
  readonly module?: string; readonly iteration?: string; readonly status: 'incoming' | 'reviewed' | 'archived';
  readonly summary: string; readonly source: string; readonly provider: string;
  readonly sourceUrl?: string; readonly sourceFile?: string; readonly packagePath?: string; readonly entryPath?: string;
  readonly files?: readonly MaterialFile[]; readonly requiresNetwork: boolean | 'unknown'; readonly requiresLogin: boolean | 'unknown';
  readonly runRequirements?: string; readonly previewStatus: 'unknown' | 'pass' | 'fail';
  readonly previewNotes?: string; readonly changeNotes?: string; readonly reviewIssues: readonly string[];
  readonly createdAt: string; readonly lastUpdated: string; readonly path?: string;
}
/** Every adoption is a separate immutable decision about one exact version. */
export interface Adoption {
  readonly id: string; readonly materialId: string; readonly versionId: string; readonly project: string;
  readonly adoptedAt: string; readonly source: string; readonly path?: string;
}
export interface MeetingDecision { id: string; text: string; state: 'discussion' | 'suggestion' | 'confirmed'; source?: string }
export interface MeetingAction { id: string; text: string; taskId?: string; owner?: string; due?: string; state: 'open' | 'done' }
export interface Meeting {
  id: string; title: string; startAt: string; project: string; participants: string[];
  module?: string; iteration?: string; decisions: MeetingDecision[]; unresolved: string[]; actions: MeetingAction[];
  materialVersionIds: string[]; recordingUrl?: string; transcriptUrl?: string; transcript: string;
  source: string; lastUpdated: string; path?: string;
}
/** Optional collections preserve compatibility with schemaVersion 1 Markdown and old fixtures. */
export interface WorkbenchData {
  schemaVersion: 1; tasks: Task[]; projects: Project[]; people: Person[]; modules: Module[]; decisions: Decision[]; baselines: Baseline[];
  materialVersions?: MaterialVersion[]; adoptions?: Adoption[]; meetings?: Meeting[];
}
export interface WorkbenchSettings { closureStatus: ClosureStatus; staleDays: number; calendar: WorkingCalendar }
export interface CapacityResult {
  status: 'known' | 'unknown'; workingDays: number; grossHours: number | null;
  leaveHours: number; meetingsHours: number; supportHours: number; bufferHours: number;
  availableHours: number | null; warnings: string[];
}
export interface LoadResult { allocatedHours: number; unallocatedTaskIds: string[]; uncertainTaskIds: string[]; taskIds: string[] }
export type ExceptionKind = 'blocked' | 'dependency' | 'dependency-cycle' | 'overdue' | 'stale' | 'coordination' | 'capacity-unknown' | 'capacity-incomplete' | 'over-capacity' | 'unallocated';
export interface WorkbenchException { id: string; kind: ExceptionKind; severity: 'high' | 'medium'; taskId?: string; personId?: string; title: string; reason: string; source: string }
export interface ExceptionOptions { today: string; staleDays?: number; closureStatus?: ClosureStatus; people?: Person[]; period?: Period; calendar?: WorkingCalendar }
export interface BaselineFieldChange { field: string; baseline: unknown; current: unknown }
export interface BaselineChange { taskId: string; type: 'added' | 'removed' | 'changed'; fields: BaselineFieldChange[]; baselineDue?: string; currentDue?: string; slipDays?: number }
export interface BaselineComparison { baselineId: string; changes: BaselineChange[]; added: number; removed: number; changed: number; slipped: number }
export interface SummaryOptions extends ExceptionOptions { period: Period }
export const DEFAULT_CALENDAR: WorkingCalendar = { weekdays: [1, 2, 3, 4, 5], exceptions: {} };
export const DEFAULT_SETTINGS: WorkbenchSettings = { closureStatus: 'test-passed', staleDays: 7, calendar: DEFAULT_CALENDAR };
export function emptyWorkbenchData(): WorkbenchData { return { schemaVersion: 1, tasks: [], projects: [], people: [], modules: [], decisions: [], baselines: [], materialVersions: [], adoptions: [], meetings: [] }; }

const DAY_MS = 86_400_000;
const STATUS_ORDER: Record<TaskStatus, number> = { planned: 0, 'in-progress': 1, blocked: 1, 'dev-complete': 2, 'test-passed': 3, released: 4, accepted: 5, cancelled: -1 };
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function isValidTimestamp(value: unknown): value is string {
  if (isValidDate(value)) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return isValidDate(value.slice(0, 10)) && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60 && Number.isFinite(Date.parse(value));
}
function dateNumber(value: string): number {
  if (!isValidDate(value)) throw new RangeError(`Invalid ISO date: ${value}`);
  return Date.parse(`${value}T00:00:00.000Z`);
}
export function calendarDaysBetween(start: string, end: string): number { return (dateNumber(end) - dateNumber(start)) / DAY_MS; }
function assertPeriod(period: Period): void {
  if (dateNumber(period.start) > dateNumber(period.end)) throw new RangeError('Period start must be on or before period end');
}
function validateCalendar(calendar: WorkingCalendar): void {
  if (!Array.isArray(calendar.weekdays) || calendar.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new RangeError('Calendar weekdays must be integers 0–6');
  for (const [day, working] of Object.entries(calendar.exceptions ?? {})) {
    if (!isValidDate(day) || typeof working !== 'boolean') throw new RangeError('Calendar exceptions require valid ISO dates and boolean values');
  }
}
export function isWorkingDay(date: string, calendar: WorkingCalendar = DEFAULT_CALENDAR): boolean {
  const day = new Date(dateNumber(date)).getUTCDay();
  validateCalendar(calendar);
  return calendar.exceptions?.[date] ?? calendar.weekdays.includes(day);
}
export function workingDays(start: string, end: string, calendar: WorkingCalendar = DEFAULT_CALENDAR): number {
  assertPeriod({ start, end }); validateCalendar(calendar);
  let total = 0;
  for (let stamp = dateNumber(start), until = dateNumber(end); stamp <= until; stamp += DAY_MS) {
    const date = new Date(stamp).toISOString().slice(0, 10);
    if (calendar.exceptions?.[date] ?? calendar.weekdays.includes(new Date(stamp).getUTCDay())) total++;
  }
  return total;
}
export function periodsOverlap(a: Period, b: Period): boolean { assertPeriod(a); assertPeriod(b); return a.start <= b.end && b.start <= a.end; }
export function isClosed(task: Pick<Task, 'status'>, closureStatus: ClosureStatus = 'test-passed'): boolean {
  return task.status === 'cancelled' || STATUS_ORDER[task.status] >= STATUS_ORDER[closureStatus];
}
export function isDelivered(task: Pick<Task, 'status'>, closureStatus: ClosureStatus = 'test-passed'): boolean {
  return task.status !== 'cancelled' && isClosed(task, closureStatus);
}
function nonnegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a finite non-negative number`);
  return value;
}
function round(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
/** Allocate only the working-day proportion intersecting this inclusive period. */
export function allocationHoursInPeriod(allocation: Allocation, period: Period, calendar: WorkingCalendar = DEFAULT_CALENDAR): number {
  nonnegative(allocation.hours, 'Allocation hours');
  const allocationPeriod = { start: allocation.periodStart, end: allocation.periodEnd };
  assertPeriod(allocationPeriod); assertPeriod(period);
  if (!periodsOverlap(allocationPeriod, period)) return 0;
  const denominator = workingDays(allocation.periodStart, allocation.periodEnd, calendar);
  if (denominator === 0) return 0;
  const numerator = workingDays(allocation.periodStart > period.start ? allocation.periodStart : period.start, allocation.periodEnd < period.end ? allocation.periodEnd : period.end, calendar);
  return allocation.hours * numerator / denominator;
}
export function calculateCapacity(person: Person, period: Period, calendar: WorkingCalendar = DEFAULT_CALENDAR): CapacityResult {
  assertPeriod(period);
  const ownCalendar = person.calendar ?? calendar;
  const days = workingDays(period.start, period.end, ownCalendar);
  const warnings: string[] = [];
  const plan = person.capacity;
  const sum = (items: Allocation[] = []): number => round(items.reduce((hours, item) => hours + allocationHoursInPeriod(item, period, ownCalendar), 0));
  const leaveHours = sum(plan?.leave), meetingsHours = sum(plan?.meetings), supportHours = sum(plan?.support), bufferHours = sum(plan?.buffer);
  let dailyHours = plan?.hoursPerDay;
  if (dailyHours === undefined && plan?.weeklyHours !== undefined) {
    nonnegative(plan.weeklyHours, 'Weekly hours');
    const normalDays = new Set(ownCalendar.weekdays).size;
    if (normalDays > 0) dailyHours = plan.weeklyHours / normalDays;
    else if (plan.weeklyHours === 0) dailyHours = 0;
    else warnings.push('工作日历未设置常规工作日，无法分摊周工时；请设置 hoursPerDay');
  }
  for (const [category, items] of Object.entries({ leave: plan?.leave, meetings: plan?.meetings, support: plan?.support, buffer: plan?.buffer })) {
    if (items?.some(item => item.hours > 0 && periodsOverlap({ start: item.periodStart, end: item.periodEnd }, period) && workingDays(item.periodStart, item.periodEnd, ownCalendar) === 0)) warnings.push(`${({ leave: '请假', meetings: '会议', support: '支持', buffer: '缓冲' } as Record<string, string>)[category]}记录包含无工作日期间的工时，本次未扣减；请核对日历`);
  }
  if (dailyHours === undefined) return { status: 'unknown', workingDays: days, grossHours: null, leaveHours, meetingsHours, supportHours, bufferHours, availableHours: null, warnings: ['容量未配置；未知不等于空闲', ...warnings] };
  nonnegative(dailyHours, 'Daily hours');
  const grossHours = round(days * dailyHours);
  const deductions = leaveHours + meetingsHours + supportHours + bufferHours;
  if (deductions > grossHours) warnings.push('扣减工时超过总工时，可用容量按零计算');
  return { status: 'known', workingDays: days, grossHours, leaveHours, meetingsHours, supportHours, bufferHours, availableHours: round(Math.max(0, grossHours - deductions)), warnings };
}
export function taskExecutors(task: Pick<Task, 'executor' | 'executors'>): string[] { return [...new Set([task.executor, ...(task.executors ?? [])])]; }
export function calculateLoad(tasks: readonly Task[], personId: string, period: Period, calendar: WorkingCalendar = DEFAULT_CALENDAR, closureStatus: ClosureStatus = 'test-passed'): LoadResult {
  assertPeriod(period);
  let allocatedHours = 0;
  const unallocatedTaskIds: string[] = [], uncertainTaskIds: string[] = [], taskIds: string[] = [];
  for (const task of [...tasks].sort(byId)) {
    if (!taskExecutors(task).includes(personId) || task.status === 'cancelled') continue;
    const overlaps = task.allocations.filter(allocation => periodsOverlap({ start: allocation.periodStart, end: allocation.periodEnd }, period));
    const taskOverlaps = isValidDate(task.originalStart) && isValidDate(task.forecastDue) && periodsOverlap({ start: task.originalStart, end: task.forecastDue >= task.originalStart ? task.forecastDue : task.originalStart }, period);
    const active = !isClosed(task, closureStatus);
    const completeSchedule = isValidDate(task.originalStart) && isValidDate(task.forecastDue);
    const touches = overlaps.length > 0 || taskOverlaps || taskTouchesPeriod(task, period);
    if (active && (!completeSchedule || (touches && (task.remainingHours === null || task.executor !== personId)))) uncertainTaskIds.push(task.id);
    if (!touches) continue;
    taskIds.push(task.id);
    // Existing allocations belong to the primary executor; collaborators never duplicate them.
    const periodHours = (task.executor === personId ? overlaps : []).reduce((sum, allocation) => sum + allocationHoursInPeriod(allocation, period, calendar), 0);
    allocatedHours += periodHours;
    if (!isClosed(task, closureStatus) && task.remainingHours !== null && task.remainingHours > 0 && periodHours <= 0) unallocatedTaskIds.push(task.id);
  }
  return { allocatedHours: round(allocatedHours), unallocatedTaskIds, uncertainTaskIds, taskIds };
}
function byId(a: { id: string }, b: { id: string }): number { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}
export function taskTouchesPeriod(task: Task, period: Period): boolean {
  assertPeriod(period);
  return (task.forecastDue >= period.start && task.forecastDue <= period.end) || task.allocations.some(item => periodsOverlap({ start: item.periodStart, end: item.periodEnd }, period));
}
export function generateBaseline(tasks: readonly Task[], options: { id: string; name: string; createdAt: string; period?: Period }): Baseline {
  if (!options.id.trim() || !options.name.trim() || !isValidTimestamp(options.createdAt)) throw new RangeError('Baseline requires an ID, name, and valid creation timestamp');
  if (options.period) assertPeriod(options.period);
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new RangeError('Cannot freeze a baseline with duplicate task IDs');
  return deepFreeze({ schemaVersion: 1 as const, ...clone(options), tasks: clone(tasks.filter(task => !options.period || taskTouchesPeriod(task, options.period)).sort(byId)) });
}
const BASELINE_FIELDS: (keyof Task)[] = ['title', 'project', 'module', 'executor', 'executors', 'status', 'originalStart', 'originalDue', 'forecastDue', 'remainingHours', 'allocations', 'dependencies', 'nextAction', 'risk', 'blocker', 'contact', 'coordinationDue', 'meetingIds', 'materialVersionIds'];
function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
export function compareBaseline(baseline: Baseline, tasks: readonly Task[]): BaselineComparison {
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new RangeError('Cannot compare duplicate task IDs');
  const previous = new Map(baseline.tasks.map(task => [task.id, task]));
  const current = new Map(tasks.filter(task => previous.has(task.id) || !baseline.period || taskTouchesPeriod(task, baseline.period)).map(task => [task.id, task]));
  const changes: BaselineChange[] = [];
  for (const taskId of [...new Set([...previous.keys(), ...current.keys()])].sort()) {
    const before = previous.get(taskId), after = current.get(taskId);
    if (!before) { changes.push({ taskId, type: 'added', fields: [], currentDue: after!.forecastDue }); continue; }
    if (!after) { changes.push({ taskId, type: 'removed', fields: [], baselineDue: before.forecastDue }); continue; }
    const fields = BASELINE_FIELDS.filter(field => stableValue(before[field]) !== stableValue(after[field])).map(field => ({ field, baseline: clone(before[field] ?? null), current: clone(after[field] ?? null) }));
    if (fields.length) changes.push({ taskId, type: 'changed', fields, baselineDue: before.forecastDue, currentDue: after.forecastDue, slipDays: isValidDate(before.forecastDue) && isValidDate(after.forecastDue) ? calendarDaysBetween(before.forecastDue, after.forecastDue) : undefined });
  }
  return { baselineId: baseline.id, changes, added: changes.filter(change => change.type === 'added').length, removed: changes.filter(change => change.type === 'removed').length, changed: changes.filter(change => change.type === 'changed').length, slipped: changes.filter(change => (change.slipDays ?? 0) > 0).length };
}
function dependencyCycles(tasks: readonly Task[], closure: ClosureStatus): string[][] {
  const active = new Map(tasks.filter(task => !isClosed(task, closure)).map(task => [task.id, task]));
  // Tarjan strongly-connected components: one stable exception per cycle, not one per path.
  let nextIndex = 0;
  const indices = new Map<string, number>(), low = new Map<string, number>();
  const stack: string[] = [], onStack = new Set<string>(), cycles: string[][] = [];
  const visit = (id: string): void => {
    indices.set(id, nextIndex); low.set(id, nextIndex++); stack.push(id); onStack.add(id);
    for (const dependency of [...active.get(id)!.dependencies].sort()) {
      if (!active.has(dependency)) continue;
      if (!indices.has(dependency)) { visit(dependency); low.set(id, Math.min(low.get(id)!, low.get(dependency)!)); }
      else if (onStack.has(dependency)) low.set(id, Math.min(low.get(id)!, indices.get(dependency)!));
    }
    if (low.get(id) !== indices.get(id)) return;
    const component: string[] = [];
    let member: string;
    do { member = stack.pop()!; onStack.delete(member); component.push(member); } while (member !== id);
    if (component.length > 1 || active.get(id)!.dependencies.includes(id)) cycles.push(component.sort());
  };
  [...active.keys()].sort().forEach(id => { if (!indices.has(id)) visit(id); });
  return cycles.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
}
export function detectExceptions(tasks: readonly Task[], options: ExceptionOptions): WorkbenchException[] {
  dateNumber(options.today);
  const closure = options.closureStatus ?? 'test-passed';
  const staleDays = options.staleDays ?? 7;
  nonnegative(staleDays, 'Stale threshold');
  const taskMap = new Map(tasks.map(task => [task.id, task]));
  const exceptions: WorkbenchException[] = [];
  const add = (task: Task, kind: ExceptionKind, reason: string, severity: 'high' | 'medium' = 'medium'): void => { if (!exceptions.some(item => item.id === `${kind}:${task.id}`)) exceptions.push({ id: `${kind}:${task.id}`, kind, severity, taskId: task.id, title: task.title, reason, source: task.source }); };
  for (const task of [...tasks].sort(byId)) {
    if (isClosed(task, closure)) continue;
    if (task.status === 'blocked' || task.blocker?.trim()) add(task, 'blocked', task.blocker?.trim() || '状态为 blocked，但尚未记录阻塞原因', 'high');
    const reasons = [...new Set(task.dependencies)].sort().flatMap(id => {
      const dependency = taskMap.get(id);
      if (!dependency) return [`工作台中缺少依赖 ${id}`];
      if (dependency.status === 'cancelled') return [`依赖 ${id} 已取消，需要明确解除或替换依赖`];
      return isClosed(dependency, closure) ? [] : [`依赖 ${id} 当前为 ${dependency.status}，尚未达到闭环标准 ${closure}`];
    });
    if (reasons.length) add(task, 'dependency', reasons.join('; '), 'high');
    if (isValidDate(task.originalDue) && task.originalDue < options.today) add(task, 'overdue', `原始截止日 ${task.originalDue} 已逾期 ${calendarDaysBetween(task.originalDue, options.today)} 个自然日；当前条件性预测为 ${task.forecastDue || '未评估'}`, 'high');
    else if (isValidDate(task.forecastDue) && task.forecastDue < options.today) add(task, 'overdue', `条件性预测日 ${task.forecastDue} 已过，尚未达到 ${closure}；原始截止日为 ${task.originalDue || '未排期'}`, 'high');
    if (!isValidTimestamp(task.lastUpdated)) add(task, 'stale', '最后更新时间无效，无法判断信息是否过期');
    else {
      const age = calendarDaysBetween(task.lastUpdated.slice(0, 10), options.today);
      if (age > staleDays) add(task, 'stale', `最后更新于 ${task.lastUpdated}，距今 ${age} 个自然日，超过 ${staleDays} 天阈值`);
      if (age < 0) add(task, 'stale', `最后更新日期 ${task.lastUpdated} 在未来，请核对时间记录`);
    }
    if (task.coordinationDue && task.coordinationDue <= options.today) add(task, 'coordination', `协调截止日 ${task.coordinationDue}${task.contact ? `；联系人：${task.contact}` : '；尚未记录联系人'}${task.nextAction ? `；下一步：${task.nextAction}` : ''}`, 'high');
  }
  for (const cycle of dependencyCycles(tasks, closure)) {
    const task = taskMap.get(cycle[0])!;
    exceptions.push({ id: `dependency-cycle:${cycle.join(',')}`, kind: 'dependency-cycle', severity: 'high', taskId: task.id, title: '循环依赖', reason: `${cycle.join(', ')} 之间存在循环依赖，无法排出顺序执行路径`, source: cycle.map(id => taskMap.get(id)!.source).filter(Boolean).join('; ') });
  }
  if (options.period) {
    const people = new Map((options.people ?? []).map(person => [person.id, person]));
    const ids = [...new Set([...people.keys(), ...tasks.filter(task => task.status !== 'cancelled').flatMap(task => taskExecutors(task))])].sort();
    for (const personId of ids) {
      const person = people.get(personId) ?? { id: personId, name: personId || '未分配' };
      const calendar = person.calendar ?? options.calendar ?? DEFAULT_CALENDAR;
      const load = calculateLoad(tasks, personId, options.period, calendar, closure);
      const capacity = calculateCapacity(person, options.period, calendar);
      if (!load.taskIds.length && !load.uncertainTaskIds.length && !people.has(personId)) continue;
      if (capacity.status === 'unknown') exceptions.push({ id: `capacity-unknown:${personId}`, kind: 'capacity-unknown', severity: 'medium', personId, title: person.name, reason: '容量未配置；可用性未知，不能视为空闲', source: person.source ?? '' });
      else if (load.allocatedHours > capacity.availableHours!) exceptions.push({ id: `over-capacity:${personId}`, kind: 'over-capacity', severity: 'high', personId, title: person.name, reason: `${options.period.start}–${options.period.end} 已分配 ${load.allocatedHours} 小时，可用 ${capacity.availableHours} 小时，超出 ${round(load.allocatedHours - capacity.availableHours!)} 小时`, source: person.source ?? load.taskIds.map(id => taskMap.get(id)?.source).filter(Boolean).join('; ') });
      if (capacity.status === 'known' && load.uncertainTaskIds.length) exceptions.push({ id: `capacity-incomplete:${personId}`, kind: 'capacity-incomplete', severity: 'medium', personId, title: person.name, reason: `${load.uncertainTaskIds.length} 项任务的排期、估算或本人投入尚未明确；余量待确认`, source: load.uncertainTaskIds.map(id => taskMap.get(id)?.source).filter(Boolean).join('; ') });
      for (const id of load.unallocatedTaskIds) add(taskMap.get(id)!, 'unallocated', `已记录剩余工时，但 ${options.period.start}–${options.period.end} 没有正工时的工作日分配；负载信息不完整`);
    }
  }
  return exceptions.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1) || byId(a, b));
}
export function forecastLabel(task: Pick<Task, 'forecastDue'>): string { return task.forecastDue ? `条件性预测：${task.forecastDue}（以容量、估算和依赖条件保持为前提）` : '尚未评估预测日期'; }
function markdown(value: unknown): string { return String(value ?? '').replace(/\r?\n/g, ' ').replace(/[\\`*_{}\[\]<>#|]/g, char => `\\${char}`); }
function sourceText(source: string): string { return source.trim() ? markdown(source) : '未记录'; }
function taskLine(task: Task): string { return `- ${markdown(task.id)}：${markdown(task.title)} | 状态 ${markdown(task.status)} | 执行人 ${markdown(taskExecutors(task).map(id => id || '未分配').join('、') || '未分配')} | 原始截止 ${task.originalDue || '未排期'} | 条件性预测 ${task.forecastDue || '未评估'} | 剩余 ${task.remainingHours === null ? '未知' : task.remainingHours + ' 小时'}\n  - 下一步：${markdown(task.nextAction || '未记录')} · 来源：${sourceText(task.source)} · 更新：${markdown(task.lastUpdated)}`; }
export function generateWeeklySummary(data: WorkbenchData, options: SummaryOptions): string {
  assertPeriod(options.period); dateNumber(options.today);
  const closure = options.closureStatus ?? 'test-passed';
  const sorted = [...data.tasks].sort(byId);
  const relevant = sorted.filter(task => taskTouchesPeriod(task, options.period));
  const active = relevant.filter(task => !isClosed(task, closure));
  const closed = relevant.filter(task => task.status !== 'cancelled' && isClosed(task, closure));
  const cancelled = relevant.filter(task => task.status === 'cancelled');
  const exceptions = detectExceptions(data.tasks, { ...options, people: data.people });
  const lines = ['# 工程负责人周报', '', `周期：${options.period.start}–${options.period.end}（含首尾日期）`, `截至：${options.today} · 闭环标准：${closure}`, '', '> 本报告是可追溯来源的当前快照。预测日期附带条件，并非交付保证。当前状态和最后更新时间不能证明某里程碑在本期达成。', '', '## 本期概览', `- 本期 ${active.length} 项未闭环；${closed.length} 项当前达到或超过 ${closure}；${cancelled.length} 项已取消`, `- 全部工作中识别出 ${exceptions.length} 项异常`, '', '## 本期未闭环工作', ...(!active.length ? ['- 本期未记录'] : active.map(taskLine)), '', `## 当前达到或超过 ${closure}`, ...(!closed.length ? ['- 本期未记录'] : closed.map(taskLine)), '', '## 异常与协调'];
  if (!exceptions.length) lines.push('- 根据已记录数据，未发现异常');
  else for (const exception of exceptions) lines.push(`- [${exception.severity === 'high' ? '高' : '中'}] ${markdown(exception.taskId ?? exception.personId ?? exception.id)}：${markdown(exception.reason)} · 来源：${sourceText(exception.source)}`);
  lines.push('', '## 容量与分配');
  const people = new Map(data.people.map(person => [person.id, person]));
  for (const id of sorted.filter(task => !isClosed(task, closure) || relevant.includes(task)).filter(task => task.status !== 'cancelled').flatMap(task => taskExecutors(task))) if (!people.has(id)) people.set(id, { id, name: id || '未分配' });
  if (!people.size) lines.push('- 尚未记录人员或容量数据');
  for (const person of [...people.values()].sort(byId)) {
    const calendar = person.calendar ?? options.calendar ?? DEFAULT_CALENDAR;
    const capacity = calculateCapacity(person, options.period, calendar), load = calculateLoad(data.tasks, person.id, options.period, calendar, closure);
    lines.push(`- ${markdown(person.name)}：${capacity.availableHours === null ? '容量未知' : `可用 ${capacity.availableHours} 小时`} / 已分配 ${load.allocatedHours} 小时${load.unallocatedTaskIds.length ? `；以下任务分配不完整：${load.unallocatedTaskIds.map(markdown).join('、')}` : ''} · 来源：${sourceText(person.source ?? '')}`);
    if (capacity.status === 'known') lines.push(`  - ${capacity.workingDays} 个工作日；总工时 ${capacity.grossHours}；扣减请假 ${capacity.leaveHours}、会议 ${capacity.meetingsHours}、支持 ${capacity.supportHours}、缓冲 ${capacity.bufferHours} 小时`);
    if (load.uncertainTaskIds.length) lines.push(`  - 排期、估算或本人投入未明确，余量待确认：${load.uncertainTaskIds.map(markdown).join('、')}`);
    capacity.warnings.forEach(warning => lines.push(`  - ${markdown(warning)}`));
  }
  lines.push('', '## 本期里程碑（按已记录状态）');
  const milestones = [...data.projects].sort(byId).flatMap(project => [...(project.milestones ?? [])].filter(milestone => milestone.date >= options.period.start && milestone.date <= options.period.end).sort(byId).map(milestone => ({ project, milestone })));
  if (!milestones.length) lines.push('- 本期未记录');
  for (const { project, milestone } of milestones) lines.push(`- ${milestone.date} · ${markdown(project.id)} / ${markdown(milestone.id)} ${markdown(milestone.title)} · 状态：${milestone.status === 'completed' ? '已完成（记录值）' : milestone.status === 'planned' ? '计划中' : '未记录'} · 来源：${sourceText(milestone.source ?? project.source ?? '')}`);
  lines.push('', '## 已记录决策');
  const decisions = data.decisions.filter(decision => decision.date >= options.period.start && decision.date <= options.period.end).sort(byId);
  if (!decisions.length) lines.push('- 本期未记录');
  else for (const decision of decisions) lines.push(`- ${decision.date} · ${markdown(decision.id)} ${markdown(decision.title)}：${markdown(decision.decision)} · 负责人：${markdown(decision.owner)} · 来源：${sourceText(decision.source)}`);
  lines.push('', '## 冻结基线对比');
  const periodBaselines = data.baselines.filter(item => item.period?.start === options.period.start && item.period?.end === options.period.end);
  const baseline = (periodBaselines.length ? periodBaselines : data.baselines.filter(item => !item.period)).sort((a, b) => a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : byId(a, b))[0];
  if (!baseline) lines.push('- 尚未记录适用的冻结基线');
  else {
    const comparison = compareBaseline(baseline, data.tasks);
    lines.push(`- 冻结基线 ${markdown(baseline.name)}（${markdown(baseline.id)}），创建于 ${markdown(baseline.createdAt)}：新增 ${comparison.added} 项，移除 ${comparison.removed} 项，变化 ${comparison.changed} 项，预测延期 ${comparison.slipped} 项`);
    const changeLabels = { added: '新增', removed: '移除', changed: '变化' };
    for (const change of comparison.changes) lines.push(`  - ${markdown(change.taskId)}：${changeLabels[change.type]}${change.type === 'changed' ? `；变化字段 ${change.fields.map(field => field.field).join('、')}；预测 ${change.baselineDue || '未评估'} → ${change.currentDue || '未评估'}${change.slipDays === undefined ? '（日期不完整，延期未知）' : `（${change.slipDays > 0 ? '+' : ''}${change.slipDays} 个自然日）`}` : ''}`);
  }
  lines.push('', '## 证据：事实 / 预测 / 判断');
  let notes = 0;
  for (const task of relevant) for (const [kind, evidence] of [['事实', task.facts], ['预测', task.forecasts], ['判断', task.judgments]] as const) for (const note of evidence ?? []) { notes++; lines.push(`- ${markdown(task.id)} · ${kind}：${markdown(note.text)} · 来源：${sourceText(note.source)} · 记录：${markdown(note.recordedAt)}`); }
  if (!notes) lines.push('- 尚未记录单独标注类别的证据');
  lines.push('', '## 简短复盘（待人工补充）', '- 偏差原因：哪些估算、依赖或容量假设发生了变化？请引用具体来源', '- 影响：对范围、日期、投入和下游任务产生了什么影响？', '- 下一步：采取什么行动，由谁负责，何时复查？');
  return `${lines.join('\n')}\n`;
}
