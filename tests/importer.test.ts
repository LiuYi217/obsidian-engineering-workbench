import test from 'node:test';
import assert from 'node:assert/strict';
import { applyApprovedUpdates, CSV_COLUMNS, extractUpdateCandidates, previewImport, validateTaskRecord } from '../src/importer';
import type { Task } from '../src/domain';
function task(values: Partial<Task> = {}): Task { return { id: 'T-1', title: 'Synthetic task', project: 'P-1', module: 'M-1', executor: 'E-1', status: 'in-progress', originalStart: '2026-10-01', originalDue: '2026-10-09', forecastDue: '2026-10-09', remainingHours: 20, allocations: [{ periodStart: '2026-10-05', periodEnd: '2026-10-09', hours: 20 }], dependencies: [], nextAction: 'Run synthetic checks', source: 'Synthetic source', lastUpdated: '2026-10-01', ...values }; }
function csv(tasks: Task[]): string {
  const quote = (value: unknown): string => `"${String(Array.isArray(value) ? JSON.stringify(value) : value ?? '').replace(/"/g, '""')}"`;
  return `${CSV_COLUMNS.join(',')}\r\n${tasks.map(task => CSV_COLUMNS.map(key => quote(task[key])).join(',')).join('\r\n')}`;
}
test('JSON array and envelope previews are validated, nonmutating, and never auto-applied', () => {
  const original = task(), existing: Task[] = [];
  const result = previewImport(JSON.stringify([original]), 'json', existing);
  assert.equal(result.canApply, true); assert.deepEqual(result.tasks, [original]); assert.deepEqual(existing, []);
  assert.equal(previewImport(JSON.stringify({ schemaVersion: 1, tasks: [original] }), 'json').canApply, true);
});
test('CSV handles quoted commas, escaped quotes, CRLF, multiline cells, BOM, arrays, and semicolon dependencies', () => {
  const original = task({ title: 'Synthetic, "quoted" task', nextAction: 'First line\nSecond line', dependencies: ['T-2'] });
  const preview = previewImport(`\uFEFF${csv([original])}`, 'csv');
  assert.equal(preview.canApply, true, JSON.stringify(preview.errors)); assert.deepEqual(preview.tasks, [original]);
  assert.match(preview.warnings.find(item => item.field === 'dependencies')!.message, /missing task/);
  const semicolon = csv([task({ dependencies: [] })]).replace('"[]"', '"T-2;T-3;T-2"');
  const result = previewImport(semicolon, 'csv');
  assert.deepEqual(result.tasks[0].dependencies, ['T-2', 'T-3']);
});
test('malformed JSON, dates, values, IDs, and row types prevent import', () => {
  for (const input of ['{', '{}', 'null', '[null]', '[1]']) assert.equal(previewImport(input, 'json').canApply, false);
  const cases = [{ originalDue: '2026-02-30' }, { originalStart: '2026-10-10' }, { remainingHours: -2 }, { remainingHours: '8h' }, { id: '../unsafe' }, { status: 'done' }, { lastUpdated: '2026-10-01 11:00' }, { dependencies: ['T-1'] }, { allocations: [{ periodStart: '2026-10-09', periodEnd: '2026-10-01', hours: 2 }] }];
  for (const patch of cases) {
    const result = previewImport(JSON.stringify([{ ...task(), ...patch }]), 'json');
    assert.equal(result.canApply, false, JSON.stringify(patch)); assert.ok(result.errors.length > 0);
  }
});
test('malformed CSV and duplicate headers are rejected rather than shifted into cells', () => {
  for (const input of ['id,id\nT-1,T-2', 'id,title\nT-1', 'id,title\nT-1,"unclosed', 'id,title\nT-1,un"quoted', 'id,title\nT-1,"closed"oops', '']) {
    const result = previewImport(input, 'csv'); assert.equal(result.canApply, false, input); assert.ok(result.errors.length > 0);
  }
});
test('exact duplicates are previewed and deduplicated, conflicting duplicates block all import', () => {
  const exact = previewImport(JSON.stringify([task(), task()]), 'json');
  assert.equal(exact.tasks.length, 1); assert.equal(exact.duplicates.length, 1); assert.equal(exact.canApply, true);
  const existing = previewImport(JSON.stringify([task()]), 'json', [task({ path: 'A/task.md' })]);
  assert.equal(existing.tasks.length, 0); assert.equal(existing.duplicates.length, 1); assert.equal(existing.canApply, false);
  const conflict = previewImport(JSON.stringify([task(), task({ title: 'Different' })]), 'json');
  assert.equal(conflict.canApply, false); assert.match(conflict.errors[0].message, /different values/);
  const existingConflict = previewImport(JSON.stringify([task({ status: 'test-passed' })]), 'json', [task()]);
  assert.equal(existingConflict.canApply, false);
});
test('external paths and unknown fields are ignored; evidence records require provenance', () => {
  const result = previewImport(JSON.stringify([{ ...task(), path: '../do-not-use.md', unexpected: 'x' }]), 'json');
  assert.equal(result.canApply, true); assert.equal(result.tasks[0].path, undefined); assert.equal(result.warnings.length, 2);
  assert.equal(validateTaskRecord({ ...task(), facts: [{ text: 'Fact without provenance' }] }).task, undefined);
});
test('rule-assisted extraction is explicit, task-ID anchored, offline and preview-only', () => {
  const tasks = [task(), task({ id: 'T-10' })];
  const result = extractUpdateCandidates('T-1: status: dev complete; forecastDue: 2026-10-12; remainingHours: 8h\nT-10 status: test-passed', tasks);
  assert.equal(result.mode, 'offline-rules'); assert.equal(result.previewOnly, true);
  assert.equal(result.candidates.length, 4, JSON.stringify(result));
  assert.deepEqual(result.candidates.filter(item => item.taskId === 'T-1').map(item => item.proposedValue), ['dev-complete', '2026-10-12', 8]);
  assert.equal(tasks[0].status, 'in-progress');
  assert.ok(result.candidates.every(item => item.evidence && item.reason && item.previousValue !== undefined));
});
test('ambiguous, unknown, negated, and free-text lines remain unmatched; no completion inferred', () => {
  const tasks = [task(), task({ id: 'T-2' })];
  const text = 'T-1 and T-2 status: test-passed\nT-404 status: released\nT-1 not test passed\nT-1 status: not test-passed\nT-1 status: done';
  const result = extractUpdateCandidates(text, tasks);
  assert.equal(result.candidates.length, 0); assert.equal(result.unmatched.length, 5); assert.equal(result.warnings.length, 5);
});
test('conflicting rule proposals are omitted while repeated identical values deduplicate', () => {
  const conflict = extractUpdateCandidates('T-1 remaining: 4\nT-1 remaining: 8', [task()]);
  assert.equal(conflict.candidates.length, 0); assert.match(conflict.warnings[0], /Conflicting/); assert.equal(conflict.unmatched.length, 2);
  assert.equal(extractUpdateCandidates('T-1 remaining: 4\nT-1 remaining: 4', [task()]).candidates.length, 1);
});
test('original planning dates cannot be proposed and invalid dates or estimates are rejected', () => {
  const result = extractUpdateCandidates('T-1 originalDue: 2026-11-01\nT-1 forecastDue: 2026-02-30\nT-1 remaining: -4', [task()]);
  assert.equal(result.candidates.length, 0); assert.equal(result.unmatched.length, 3);
});
test('approved application is atomic and preserves originals and source-labeled evidence', () => {
  const original = task();
  const preview = extractUpdateCandidates('T-1 status: dev-complete; forecastDue: 2026-10-12; risk: integration uncertain', [original]);
  const updated = applyApprovedUpdates([original], preview.candidates, { updatedAt: '2026-10-05', source: 'Reviewed synthetic update' });
  assert.equal(updated[0].status, 'dev-complete'); assert.equal(updated[0].originalDue, '2026-10-09'); assert.equal(updated[0].lastUpdated, '2026-10-05');
  assert.equal(original.status, 'in-progress'); assert.equal(original.facts, undefined);
  assert.equal(updated[0].facts![0].source, 'Reviewed synthetic update'); assert.equal(updated[0].forecasts!.length, 1); assert.equal(updated[0].judgments!.length, 1);
  assert.throws(() => applyApprovedUpdates([task({ status: 'blocked' })], preview.candidates), /Stale preview/);
  assert.throws(() => applyApprovedUpdates([original], [...preview.candidates, preview.candidates[0]]), /Multiple approved/);
  assert.throws(() => applyApprovedUpdates([original], [{ ...preview.candidates[0], proposedValue: 'done' }]), /Invalid update/);
});
test('reviewed updates without an original source remain valid with an explicit provenance caveat', () => {
  const original = task({ source: '' });
  const candidates = extractUpdateCandidates('T-1 status: dev-complete', [original]).candidates;
  const updated = applyApprovedUpdates([original], candidates);
  assert.ok(validateTaskRecord(updated[0]).task);
  assert.match(updated[0].facts![0].source, /original source not recorded/);
});

test('optional exact version and meeting references round-trip JSON and CSV without changing old tasks', () => {
  const linked = task({ meetingIds: ['MEET-1'], materialVersionIds: ['V-1', 'V-2'] });
  assert.deepEqual(previewImport(JSON.stringify([linked]), 'json').tasks, [linked]);
  assert.deepEqual(previewImport(csv([linked]), 'csv').tasks, [linked]);
  assert.deepEqual(previewImport(csv([task()]), 'csv').tasks, [task()]);
  const oldHeaders = CSV_COLUMNS.filter(key => !['meetingIds', 'materialVersionIds'].includes(key));
  const oldCsv = oldHeaders.join(',') + '\n' + oldHeaders.map(key => `"${String(Array.isArray(task()[key]) ? JSON.stringify(task()[key]) : task()[key] ?? '').replace(/"/g, '""')}"`).join(',');
  assert.equal(previewImport(oldCsv, 'csv').canApply, true);
  assert.equal(previewImport(oldCsv, 'csv').tasks[0].materialVersionIds, undefined);
});
test('reference arrays validate IDs, deduplicate repeats visibly and do not rewrite to latest', () => {
  const result = validateTaskRecord(task({ meetingIds: ['MEET-1', 'MEET-1'], materialVersionIds: ['VERSION-OLD'] }));
  assert.deepEqual(result.task!.meetingIds, ['MEET-1']);
  assert.deepEqual(result.task!.materialVersionIds, ['VERSION-OLD']);
  assert.equal(result.warnings.filter(item => item.field === 'meetingIds').length, 1);
  for (const patch of [{ meetingIds: 'MEET-1' }, { materialVersionIds: ['../escape'] }, { meetingIds: [123] }, { materialVersionIds: [''] }]) assert.equal(validateTaskRecord({ ...task(), ...patch }).task, undefined);
});
test('same task ID with a changed exact source pin is a reviewed update conflict', () => {
  const result = previewImport(JSON.stringify([task({ materialVersionIds: ['V-2'] })]), 'json', [task({ materialVersionIds: ['V-1'] })]);
  assert.equal(result.canApply, false); assert.match(result.errors[0].message, /different values/);
});
