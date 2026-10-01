import test from 'node:test';
import assert from 'node:assert/strict';
import { allocationHoursInPeriod, calculateCapacity, calculateLoad, calendarDaysBetween, compareBaseline, detectExceptions, emptyWorkbenchData, forecastLabel, generateBaseline, generateWeeklySummary, isClosed, isDelivered, isValidDate, isValidTimestamp, workingDays, type Task, type WorkingCalendar } from '../src/domain';

const week = { start: '2026-10-05', end: '2026-10-11' };
function task(values: Partial<Task> = {}): Task { return { id: 'T-1', title: 'Synthetic task', project: 'P-1', module: 'M-1', executor: 'E-1', status: 'in-progress', originalStart: '2026-10-05', originalDue: '2026-10-09', forecastDue: '2026-10-09', remainingHours: 20, allocations: [{ periodStart: '2026-10-05', periodEnd: '2026-10-09', hours: 20 }], dependencies: [], nextAction: 'Run synthetic checks', source: 'Demo/Tasks/T-1.md', lastUpdated: '2026-10-05', ...values }; }

test('real ISO dates, leap years, timestamps, and calendar math are timezone-independent', () => {
  assert.equal(isValidDate('2024-02-29'), true); assert.equal(isValidDate('2026-02-29'), false);
  for (const value of ['2026-02-30', '2026-13-01', '10/05/2026', '2026-1-01', '', null]) assert.equal(isValidDate(value), false);
  assert.equal(isValidTimestamp('2026-10-01T08:00:00+08:00'), true);
  assert.equal(isValidTimestamp('2026-10-01T08:00:00'), false);
  assert.equal(isValidTimestamp('2026-02-30T08:00:00Z'), false);
  assert.equal(isValidTimestamp('2026-10-01T24:00:00Z'), false);
  assert.equal(calendarDaysBetween('2026-03-07', '2026-03-10'), 3);
});
test('calendar counts actual inclusive periods and working/nonworking exceptions', () => {
  assert.equal(workingDays(week.start, week.end), 5);
  assert.equal(workingDays('2026-10-08', '2026-10-09'), 2);
  assert.equal(workingDays('2026-10-10', '2026-10-11'), 0);
  const calendar: WorkingCalendar = { weekdays: [1, 2, 3, 4, 5], exceptions: { '2026-10-05': false, '2026-10-10': true } };
  assert.equal(workingDays(week.start, week.end, calendar), 5);
  assert.throws(() => workingDays(week.end, week.start), /start/);
  assert.throws(() => workingDays(week.start, week.end, { weekdays: [7] }), /weekdays/);
});
test('capacity subtracts leave, meetings, support, and buffer from the actual period', () => {
  const allocation = (hours: number) => [{ periodStart: week.start, periodEnd: week.end, hours }];
  const capacity = calculateCapacity({ id: 'E-1', name: 'Synthetic person', capacity: { hoursPerDay: 8, leave: allocation(8), meetings: allocation(4), support: allocation(3), buffer: allocation(5) } }, week);
  assert.deepEqual([capacity.workingDays, capacity.grossHours, capacity.availableHours], [5, 40, 20]);
  const partial = calculateCapacity({ id: 'E-1', name: 'Person', capacity: { weeklyHours: 40, leave: allocation(10) } }, { start: '2026-10-08', end: '2026-10-09' });
  assert.deepEqual([partial.grossHours, partial.leaveHours, partial.availableHours], [16, 4, 12]);
});
test('missing capacity is unknown while zero is a known exhausted allocation', () => {
  assert.equal(calculateCapacity({ id: 'E', name: 'Person' }, week).availableHours, null);
  assert.equal(calculateCapacity({ id: 'E', name: 'Person', capacity: { hoursPerDay: 0 } }, week).status, 'known');
  assert.equal(calculateCapacity({ id: 'E', name: 'Person', capacity: { weeklyHours: 0 } }, week).availableHours, 0);
  assert.throws(() => calculateCapacity({ id: 'E', name: 'Person', capacity: { hoursPerDay: -1 } }, week), /non-negative/);
  assert.throws(() => calculateCapacity({ id: 'E', name: 'Person', capacity: { hoursPerDay: Infinity } }, week), /finite/);
});
test('capacity uses person calendar, clamps over-deductions, warns about unusable periods', () => {
  const result = calculateCapacity({ id: 'E', name: 'Person', calendar: { weekdays: [1, 3, 5] }, capacity: { weeklyHours: 24, leave: [{ periodStart: week.start, periodEnd: week.end, hours: 30 }] } }, week);
  assert.equal(result.grossHours, 24); assert.equal(result.availableHours, 0); assert.match(result.warnings[0], /超过/);
  const empty = calculateCapacity({ id: 'E', name: 'Person', calendar: { weekdays: [] }, capacity: { weeklyHours: 40 } }, week);
  assert.equal(empty.status, 'unknown');
});
test('allocation clipping is by overlap working days; no work is invented on weekends', () => {
  const allocation = { periodStart: '2026-10-05', periodEnd: '2026-10-16', hours: 50 };
  assert.equal(allocationHoursInPeriod(allocation, week), 25);
  assert.equal(allocationHoursInPeriod(allocation, { start: '2026-10-10', end: '2026-10-11' }), 0);
  assert.equal(allocationHoursInPeriod(allocation, { start: '2026-11-01', end: '2026-11-02' }), 0);
  assert.equal(allocationHoursInPeriod({ periodStart: '2026-10-10', periodEnd: '2026-10-11', hours: 20 }, week), 0);
});
test('closure defaults to test-passed and retains distinct milestones', () => {
  assert.equal(isClosed(task({ status: 'dev-complete' })), false);
  assert.equal(isClosed(task({ status: 'test-passed' })), true);
  assert.equal(isClosed(task({ status: 'test-passed' }), 'released'), false);
  assert.equal(isClosed(task({ status: 'released' }), 'accepted'), false);
  assert.equal(isClosed(task({ status: 'accepted' }), 'accepted'), true);
  assert.equal(isClosed(task({ status: 'cancelled' })), true);
  assert.equal(isDelivered(task({ status: 'cancelled' })), false);
  assert.equal(isDelivered(task({ status: 'dev-complete' })), false);
  assert.equal(isDelivered(task({ status: 'test-passed' })), true);
});
test('load counts completed period allocations, flags only open unallocated work, and excludes other people', () => {
  const load = calculateLoad([task(), task({ id: 'T-2', allocations: [] }), task({ id: 'T-3', executor: 'E-2' }), task({ id: 'T-4', status: 'test-passed' })], 'E-1', week);
  assert.equal(load.allocatedHours, 40); assert.deepEqual(load.unallocatedTaskIds, ['T-2']); assert.deepEqual(load.taskIds, ['T-1', 'T-2', 'T-4']);
  assert.equal(calculateLoad([task({ status: 'cancelled' })], 'E-1', week).allocatedHours, 0);
  assert.deepEqual(calculateLoad([task({ status: 'test-passed', allocations: [] })], 'E-1', week).unallocatedTaskIds, []);
  assert.equal(calculateLoad([task({ status: 'dev-complete' })], 'E-1', week).allocatedHours, 20);
});
test('frozen baselines are independent deep snapshots with deterministic comparisons', () => {
  const original = task(); const baseline = generateBaseline([original], { id: 'B-1', name: 'Approved plan', createdAt: '2026-10-05T00:00:00Z' });
  original.allocations[0].hours = 999; original.title = 'Modified';
  assert.equal(baseline.tasks[0].allocations[0].hours, 20);
  assert.equal(Object.isFrozen(baseline), true); assert.equal(Object.isFrozen(baseline.tasks[0].allocations[0]), true);
  assert.throws(() => { baseline.tasks[0].allocations[0].hours = 22; }, TypeError);
  const current = task({ forecastDue: '2026-10-12' });
  const diff = compareBaseline(baseline, [current, task({ id: 'T-2' })]);
  assert.deepEqual([diff.added, diff.changed, diff.slipped], [1, 1, 1]);
  assert.equal(diff.changes.find(change => change.taskId === 'T-1')?.slipDays, 3);
  assert.equal(current.originalDue, '2026-10-09'); assert.equal(baseline.tasks[0].forecastDue, '2026-10-09');
});
test('period baselines ignore unrelated additions but retain tasks that slip out', () => {
  const outside = task({ id: 'LATER', originalStart: '2026-11-01', originalDue: '2026-11-10', forecastDue: '2026-11-10', allocations: [] });
  const baseline = generateBaseline([task(), outside], { id: 'B', name: 'Period', createdAt: '2026-10-05', period: week });
  assert.deepEqual(baseline.tasks.map(task => task.id), ['T-1']);
  const diff = compareBaseline(baseline, [task({ forecastDue: '2026-12-01', allocations: [] }), outside, task({ id: 'NEW' })]);
  assert.equal(diff.added, 1); assert.equal(diff.changed, 1); assert.equal(diff.removed, 0);
  assert.throws(() => generateBaseline([task(), task()], { id: 'B', name: 'Bad', createdAt: '2026-10-05' }), /duplicate/);
});
test('exceptions have concrete reasons and cancelled dependencies are not satisfied', () => {
  const tasks = [task({ status: 'blocked', blocker: 'Waiting for contract fixture', dependencies: ['MISSING', 'CANCELLED'], lastUpdated: '2026-09-01', coordinationDue: '2026-10-09', contact: 'Synthetic peer' }), task({ id: 'CANCELLED', status: 'cancelled' })];
  const exceptions = detectExceptions(tasks, { today: '2026-10-12', staleDays: 7 });
  assert.deepEqual(new Set(exceptions.map(item => item.kind)), new Set(['blocked', 'dependency', 'overdue', 'stale', 'coordination']));
  assert.match(exceptions.find(item => item.kind === 'dependency')!.reason, /缺少.*已取消|已取消.*缺少/);
  assert.ok(exceptions.every(item => item.reason && item.source));
  assert.equal(detectExceptions([task({ status: 'test-passed', blocker: 'old' })], { today: '2026-10-30' }).length, 0);
});
test('dependency cycles are stable and reported once per connected cycle', () => {
  const tasks = [task({ id: 'A', dependencies: ['B'] }), task({ id: 'B', dependencies: ['C'] }), task({ id: 'C', dependencies: ['A'] })];
  const result = detectExceptions(tasks, { today: '2026-10-05' }).filter(item => item.kind === 'dependency-cycle');
  assert.equal(result.length, 1); assert.match(result[0].reason, /A, B, C/);
  assert.deepEqual(result, detectExceptions([...tasks].reverse(), { today: '2026-10-05' }).filter(item => item.kind === 'dependency-cycle'));
});
test('capacity exceptions distinguish unknown, over-capacity, and missing allocation', () => {
  const tasks = [task(), task({ id: 'T-2', executor: 'E-2', allocations: [] })];
  const result = detectExceptions(tasks, { today: '2026-10-05', period: week, people: [{ id: 'E-1', name: 'Person', capacity: { hoursPerDay: 0 } }] });
  assert.equal(result.filter(item => item.kind === 'over-capacity').length, 1);
  assert.equal(result.filter(item => item.kind === 'capacity-unknown').length, 1);
  assert.equal(result.filter(item => item.kind === 'unallocated').length, 1);
});
test('weekly summary is deterministic source-backed Markdown, with labeled facts and conditional forecasts', () => {
  const data = emptyWorkbenchData();
  data.tasks = [task({ id: 'T-2', status: 'dev-complete' }), task({ facts: [{ text: 'Fixture received', source: 'Synthetic log', recordedAt: '2026-10-05' }], forecasts: [{ text: 'Assuming 8 hours remain', source: 'Synthetic estimate', recordedAt: '2026-10-05' }] })];
  data.people = [{ id: 'E-1', name: 'Synthetic person' }];
  const summary = generateWeeklySummary(data, { today: '2026-10-05', period: week });
  assert.match(summary, /闭环标准：test-passed/); assert.match(summary, /预测日期附带条件/); assert.match(summary, /来源：Demo\/Tasks\/T-1.md/);
  assert.match(summary, /事实：Fixture received/); assert.match(summary, /预测：Assuming/); assert.match(summary, /容量未知/);
  assert.equal(summary, generateWeeklySummary({ ...data, tasks: [...data.tasks].reverse() }, { today: '2026-10-05', period: week }));
  assert.match(forecastLabel(task()), /以容量/);
});

test('weekly summary uses its matching baseline rather than newest unrelated week', () => {
  const data = emptyWorkbenchData(); data.tasks = [task()];
  data.baselines = [generateBaseline(data.tasks, { id: 'RIGHT', name: 'Correct week', createdAt: '2026-10-01', period: week }), generateBaseline(data.tasks, { id: 'WRONG', name: 'Unrelated week', createdAt: '2026-10-03', period: { start: '2026-11-01', end: '2026-11-07' } })];
  const summary = generateWeeklySummary(data, { today: '2026-10-05', period: week });
  assert.match(summary, /Correct week/); assert.doesNotMatch(summary, /Unrelated week/);
});
test('completed work still consumes period capacity and can create an overload', () => {
  const tasks = [task({ allocations: [{ periodStart: week.start, periodEnd: week.end, hours: 20 }] }), task({ id: 'DONE', status: 'test-passed', remainingHours: 0, allocations: [{ periodStart: week.start, periodEnd: week.end, hours: 30 }] })];
  assert.equal(calculateLoad(tasks, 'E-1', week).allocatedHours, 50);
  const exceptions = detectExceptions(tasks, { today: week.start, period: week, people: [{ id: 'E-1', name: 'Person', capacity: { weeklyHours: 40 } }] });
  assert.match(exceptions.find(item => item.kind === 'over-capacity')!.reason, /已分配 50 小时，可用 40/);
});
test('weekly scope excludes unallocated future-due backlog and immediate comparison stays unchanged', () => {
  const tasks = [task({ originalStart: '2026-09-01', originalDue: '2026-11-01', forecastDue: '2026-11-15', allocations: [] })];
  const baseline = generateBaseline(tasks, { id: 'B', name: 'Current', createdAt: '2026-10-05', period: week });
  assert.equal(baseline.tasks.length, 0);
  assert.deepEqual(compareBaseline(baseline, tasks).changes, []);
});
test('zero-hour allocations do not hide unresolved remaining effort', () => {
  const unfinished = task({ remainingHours: 8, allocations: [{ periodStart: week.start, periodEnd: week.end, hours: 0 }] });
  const result = calculateLoad([unfinished], 'E-1', week);
  assert.equal(result.allocatedHours, 0); assert.deepEqual(result.unallocatedTaskIds, ['T-1']);
});

test('Chinese summary includes only retrospective prompts, without inventing causes or actions', () => {
  const summary = generateWeeklySummary(emptyWorkbenchData(), { today: week.start, period: week });
  assert.match(summary, /# 工程负责人周报/);
  assert.match(summary, /## 简短复盘（待人工补充）/);
  assert.match(summary, /偏差原因：哪些/); assert.match(summary, /影响：对范围/); assert.match(summary, /下一步：采取什么行动/);
  assert.match(summary, /当前状态和最后更新时间不能证明某里程碑在本期达成/);
});
test('project milestones retain explicit recorded status without inferring completion from tasks', () => {
  const data = emptyWorkbenchData();
  data.tasks = [task({ status: 'accepted' })];
  data.projects = [{ id: 'P-1', name: 'Synthetic project', milestones: [{ id: 'MS-1', title: 'Explicit plan', date: '2026-10-09', status: 'planned', source: 'Synthetic project note' }, { id: 'MS-2', title: 'Unknown status', date: '2026-10-09' }] }];
  const summary = generateWeeklySummary(data, { today: week.start, period: week });
  assert.match(summary, /MS-1 Explicit plan · 状态：计划中/);
  assert.match(summary, /MS-2 Unknown status · 状态：未记录/);
  assert.doesNotMatch(summary, /已完成（记录值）/);
});
