import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCapacity, calculateLoad, compareBaseline, DEFAULT_CALENDAR,
  detectExceptions, emptyWorkbenchData, generateBaseline, generateWeeklySummary,
  taskExecutors, taskTouchesPeriod, type Baseline, type Task,
} from '../src/domain';
import { applyApprovedUpdates, CSV_COLUMNS, extractUpdateCandidates, previewImport } from '../src/importer';
import { validateManagedRecord } from '../src/record-policy';

const period = { start: '2026-10-05', end: '2026-10-11' };
const people = ['person-a', 'person-b'].map(id => ({ id, name: id, capacity: { hoursPerDay: 8 } }));
function task(changes: Partial<Task> = {}): Task {
  return {
    id: 'synthetic-task-1', title: 'Synthetic task', project: 'synthetic-project',
    module: 'synthetic-module', executor: 'person-a', status: 'in-progress',
    originalStart: period.start, originalDue: '2026-10-09', forecastDue: '2026-10-09',
    remainingHours: 8, allocations: [], dependencies: [], nextAction: 'Review estimate',
    source: 'Synthetic import fixture', lastUpdated: period.start, ...changes,
  };
}
function csv(value: Task): string {
  const quote = (item: unknown) => `"${String(Array.isArray(item) ? JSON.stringify(item) : item ?? '').replace(/"/g, '""')}"`;
  return `${CSV_COLUMNS.join(',')}\n${CSV_COLUMNS.map(key => quote(value[key])).join(',')}`;
}
function report(tasks: Task[], baselines: Baseline[] = []) {
  return generateWeeklySummary({ ...emptyWorkbenchData(), tasks, people, baselines }, { period, today: period.start });
}

test('unknown dates and effort plus all assignees round-trip both JSON and canonical CSV', () => {
  const original = task({ originalStart: '', originalDue: '', forecastDue: '', remainingHours: null, executors: ['person-a', 'person-b'] });
  const before = JSON.stringify(original);
  for (const format of ['json', 'csv'] as const) {
    const preview = previewImport(format === 'json' ? JSON.stringify([original]) : csv(original), format);
    assert.equal(preview.canApply, true, JSON.stringify(preview.errors));
    assert.deepEqual(preview.tasks, [original]);
    assert.deepEqual(validateManagedRecord('task', preview.tasks[0] as unknown as Record<string, unknown>), []);
  }
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(previewImport(csv(task({ remainingHours: 0 })), 'csv').tasks, [task({ remainingHours: 0 })]);
  assert.equal(previewImport(csv(task()), 'csv').tasks[0].executors, undefined);
});

test('imports normalize assignee whitespace but stored records require canonical assignee IDs', () => {
  const raw = task({ executors: [' person-a ', 'person-b', 'person-b'] });
  const preview = previewImport(JSON.stringify([raw]), 'json');
  assert.deepEqual(preview.tasks[0].executors, ['person-a', 'person-b']);
  assert.ok(preview.warnings.some(item => item.field === 'executors'));
  assert.ok(validateManagedRecord('task', raw as unknown as Record<string, unknown>).some(issue => issue.includes('executors')));
  assert.deepEqual(taskExecutors(preview.tasks[0]), ['person-a', 'person-b']);
});

test('each incomplete current schedule keeps known capacity uncertain without inventing allocations', () => {
  for (const changes of [{ originalStart: '' }, { forecastDue: '' }, { originalStart: '', originalDue: '', forecastDue: '' }]) {
    const value = task(changes);
    assert.deepEqual(previewImport(JSON.stringify([value]), 'json').errors, []);
    const load = calculateLoad([value], 'person-a', period);
    assert.equal(load.allocatedHours, 0);
    assert.deepEqual(load.uncertainTaskIds, [value.id], JSON.stringify(changes));
    assert.equal(calculateCapacity(people[0], period).availableHours, 40);
    assert.ok(detectExceptions([value], { period, today: period.start, people }).some(item => item.kind === 'capacity-incomplete' && item.personId === 'person-a'));
    assert.match(report([value]), /余量待确认/);
  }
});

test('unknown remaining effort differs from a recorded zero even with valid schedule dates', () => {
  const unknown = task({ remainingHours: null });
  assert.deepEqual(calculateLoad([unknown], 'person-a', period).uncertainTaskIds, [unknown.id]);
  assert.deepEqual(calculateLoad([unknown], 'person-a', period).unallocatedTaskIds, []);
  assert.match(report([unknown]), /剩余 未知/);
  const zero = task({ remainingHours: 0 });
  assert.deepEqual(calculateLoad([zero], 'person-a', period).uncertainTaskIds, []);
  assert.deepEqual(calculateLoad([zero], 'person-a', period).unallocatedTaskIds, []);
  assert.match(report([zero]), /剩余 0 小时/);
});

test('explicit allocations survive unknown dates and effort and are counted only for their primary executor', () => {
  const value = task({ originalStart: '', originalDue: '', forecastDue: '', remainingHours: null,
    executors: ['person-a', 'person-b'], allocations: [{ periodStart: period.start, periodEnd: period.end, hours: 8 }] });
  const primary = calculateLoad([value], 'person-a', period), collaborator = calculateLoad([value], 'person-b', period);
  assert.equal(primary.allocatedHours, 8); assert.equal(collaborator.allocatedHours, 0);
  assert.deepEqual(primary.uncertainTaskIds, [value.id]); assert.deepEqual(collaborator.uncertainTaskIds, [value.id]);
  assert.deepEqual(primary.taskIds, [value.id]); assert.deepEqual(collaborator.taskIds, [value.id]);
  assert.equal(primary.allocatedHours + collaborator.allocatedHours, 8);
  assert.match(report([value]), /执行人 person-a、person-b/);
});

test('co-assignee involvement remains uncertain instead of duplicating assigned effort', () => {
  const value = task({ executors: ['person-a', 'person-b'], allocations: [{ periodStart: period.start, periodEnd: period.end, hours: 8 }] });
  assert.deepEqual(calculateLoad([value], 'person-a', period).uncertainTaskIds, []);
  assert.deepEqual(calculateLoad([value], 'person-b', period).uncertainTaskIds, [value.id]);
  assert.equal(calculateLoad([value], 'person-b', period).allocatedHours, 0);
});

test('task-level unallocated exceptions are unique when several people share one task', () => {
  const value = task({ executors: ['person-a', 'person-b'] });
  const exceptions = detectExceptions([value], { period, today: period.start, people });
  assert.equal(exceptions.filter(item => item.kind === 'unallocated' && item.taskId === value.id).length, 1);
  assert.equal(new Set(exceptions.map(item => item.id)).size, exceptions.length);
});

test('unassigned recorded work retains its allocation bucket without attributing it to a collaborator', () => {
  const value = task({ executor: '', allocations: [{ periodStart: period.start, periodEnd: period.end, hours: 8 }] });
  assert.equal(calculateLoad([value], '', period).allocatedHours, 8);
  const shared = { ...value, executors: ['person-b'] };
  assert.equal(calculateLoad([shared], '', period).allocatedHours, 8);
  assert.equal(calculateLoad([shared], 'person-b', period).allocatedHours, 0);
  assert.deepEqual(calculateLoad([shared], 'person-b', period).uncertainTaskIds, [shared.id]);
});

test('closed unknown tasks do not block availability while completed allocations still count', () => {
  const changes = { originalStart: '', originalDue: '', forecastDue: '', remainingHours: null,
    allocations: [{ periodStart: period.start, periodEnd: period.end, hours: 8 }] };
  const closed = task({ ...changes, status: 'test-passed' });
  assert.equal(calculateLoad([closed], 'person-a', period).allocatedHours, 8);
  assert.deepEqual(calculateLoad([closed], 'person-a', period).uncertainTaskIds, []);
  assert.deepEqual(calculateLoad([closed], 'person-a', period, DEFAULT_CALENDAR, 'released').uncertainTaskIds, [closed.id]);
  const cancelled = task({ ...changes, status: 'cancelled' });
  assert.equal(calculateLoad([cancelled], 'person-a', period).allocatedHours, 0);
  assert.deepEqual(calculateLoad([cancelled], 'person-a', period).uncertainTaskIds, []);
});

test('a fully scheduled future task does not create a current-period uncertainty warning', () => {
  const future = task({ originalStart: '2026-11-02', originalDue: '2026-11-06', forecastDue: '2026-11-06', remainingHours: null, executors: ['person-a', 'person-b'] });
  for (const person of people) {
    const load = calculateLoad([future], person.id, period);
    assert.deepEqual(load.taskIds, []); assert.deepEqual(load.uncertainTaskIds, []); assert.equal(load.allocatedHours, 0);
  }
});

test('unknown schedules warn about capacity but do not become period commitments or baseline additions', () => {
  const unknown = task({ originalStart: '', originalDue: '', forecastDue: '', remainingHours: null });
  assert.equal(taskTouchesPeriod(unknown, period), false);
  const baseline = generateBaseline([unknown], { id: 'synthetic-baseline', name: 'Synthetic period', createdAt: period.start, period });
  assert.deepEqual(baseline.tasks, []); assert.deepEqual(compareBaseline(baseline, [unknown]).changes, []);
  const summary = report([unknown], [baseline]);
  assert.match(summary, /本期 0 项未闭环/); assert.match(summary, /余量待确认/);
  const allocated = { ...unknown, allocations: [{ periodStart: period.start, periodEnd: period.end, hours: 8 }] };
  assert.equal(taskTouchesPeriod(allocated, period), true);
  assert.equal(generateBaseline([allocated], { id: 'synthetic-baseline-2', name: 'Explicit allocation', createdAt: period.start, period }).tasks.length, 1);
});

test('baseline serialization preserves unknowns, co-assignees and immutable snapshot values', () => {
  const original = task({ originalStart: '', originalDue: '', forecastDue: '', remainingHours: null, executors: ['person-a', 'person-b'] });
  const baseline = generateBaseline([original], { id: 'synthetic-baseline', name: 'Synthetic snapshot', createdAt: period.start });
  const restored = JSON.parse(JSON.stringify(baseline)) as Baseline;
  assert.deepEqual(validateManagedRecord('baseline', restored as unknown as Record<string, unknown>), []);
  assert.deepEqual(restored.tasks, [original]); assert.deepEqual(compareBaseline(restored, [original]).changes, []);
  original.executors!.push('person-c'); original.remainingHours = 12;
  assert.deepEqual(baseline.tasks[0].executors, ['person-a', 'person-b']); assert.equal(baseline.tasks[0].remainingHours, null);
  const change = compareBaseline(restored, [original]).changes[0];
  assert.deepEqual(change.fields.map(field => field.field), ['executors', 'remainingHours']);
  assert.equal(change.slipDays, undefined);
});

test('known-to-unknown and unknown-to-known forecast changes never print fabricated slip days', () => {
  for (const [before, after] of [['', '2026-10-09'], ['2026-10-09', ''], ['', '']] as const) {
    const original = task({ forecastDue: before, remainingHours: null });
    const baseline = generateBaseline([original], { id: 'synthetic-baseline', name: 'Synthetic snapshot', createdAt: period.start });
    const current = { ...original, forecastDue: after, nextAction: 'Review changed forecast' };
    const diff = compareBaseline(baseline, [current]);
    assert.equal(diff.slipped, 0); assert.equal(diff.changes[0].slipDays, undefined);
    const summary = report([current], [baseline]);
    assert.doesNotMatch(summary, /undefined|NaN|null 小时/); assert.match(summary, /未评估/);
  }
});

test('period baseline retains a known commitment when its current forecast is cleared', () => {
  const original = task(), baseline = generateBaseline([original], { id: 'synthetic-baseline', name: 'Synthetic period', createdAt: period.start, period });
  const current = { ...original, forecastDue: '' };
  const diff = compareBaseline(baseline, [current]);
  assert.equal(diff.removed, 0); assert.equal(diff.changed, 1); assert.equal(diff.slipped, 0);
  assert.equal(diff.changes[0].fields[0].field, 'forecastDue'); assert.equal(baseline.tasks[0].forecastDue, original.forecastDue);
});

test('reviewed unknown-to-known estimate update retains all unrelated unknown and assignment fields', () => {
  const original = task({ originalStart: '', originalDue: '', forecastDue: '', remainingHours: null, executors: ['person-a', 'person-b'] });
  const preview = extractUpdateCandidates(`${original.id} remainingHours: 4`, [original]);
  assert.equal(preview.candidates.length, 1); assert.equal(preview.candidates[0].previousValue, null);
  const updated = applyApprovedUpdates([original], preview.candidates, { updatedAt: period.start, source: 'Reviewed synthetic estimate' });
  assert.equal(updated[0].remainingHours, 4); assert.equal(original.remainingHours, null);
  for (const key of ['originalStart', 'originalDue', 'forecastDue'] as const) assert.equal(updated[0][key], '');
  assert.deepEqual(updated[0].executors, original.executors);
  assert.throws(() => applyApprovedUpdates([{ ...original, remainingHours: 0 }], preview.candidates), /Stale preview/);
});
