import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBaseline, emptyWorkbenchData, generateBaseline, type Adoption, type MaterialVersion, type Meeting, type Task, type WorkbenchData } from '../src/domain';
import { createAdoption, createMaterialVersion, getAdoptedVersion, getLatestAdoption, getNewerPendingVersions, isSafePackagePath, knowledgeReminders, knowledgeWarnings, linkMeetingAction, taskTrace, validateAdoption, validateMaterialVersion, validateMeeting } from '../src/knowledge';
import { assertFreshTaskFields, validateManagedRecord } from '../src/record-policy';

function task(values: Partial<Task> = {}): Task { return { id: 'T-1', title: 'Implement review', project: 'P-1', module: 'M-1', executor: 'E-1', status: 'in-progress', originalStart: '2026-10-01', originalDue: '2026-10-08', forecastDue: '2026-10-08', remainingHours: 8, allocations: [], dependencies: [], nextAction: 'Check source', source: 'Planning note', lastUpdated: '2026-10-01', ...values }; }
function version(values: Partial<MaterialVersion> = {}): MaterialVersion { return { id: 'V-1', materialId: 'MAT-1', title: 'Prototype snapshot', kind: 'prototype', version: 'v1', project: 'P-1', status: 'incoming', summary: 'First frozen delivery', source: 'Design delivery #1', provider: 'Design team', requiresNetwork: 'unknown', requiresLogin: 'unknown', previewStatus: 'unknown', reviewIssues: [], createdAt: '2026-10-01T09:00:00Z', lastUpdated: '2026-10-01T09:00:00Z', ...values }; }
function adoption(values: Partial<Adoption> = {}): Adoption { return { id: 'A-1', materialId: 'MAT-1', versionId: 'V-1', project: 'P-1', adoptedAt: '2026-10-01T10:00:00Z', source: 'Explicit reviewed adoption', ...values }; }
function meeting(values: Partial<Meeting> = {}): Meeting { return { id: 'MEET-1', title: 'Design review', startAt: '2026-10-01T09:30:00Z', project: 'P-1', participants: ['Designer', 'Engineer'], decisions: [{ id: 'D-1', text: 'Maybe alter layout', state: 'discussion' }, { id: 'D-2', text: 'Suggested navigation', state: 'suggestion' }, { id: 'D-3', text: 'Approved requirement', state: 'confirmed', source: 'Transcript 12:40' }], unresolved: ['Confirm button wording'], actions: [{ id: 'ACT-1', text: 'Validate navigation', owner: 'E-1', due: '2026-10-02', state: 'open' }], materialVersionIds: ['V-1'], transcript: 'Discussed options, then confirmed only the requirement.', source: 'Review transcript', lastUpdated: '2026-10-01T10:00:00Z', ...values }; }
function data(values: Partial<WorkbenchData> = {}): WorkbenchData { return { ...emptyWorkbenchData(), tasks: [task()], materialVersions: [version()], meetings: [meeting()], ...values }; }

test('old schemaVersion 1 data needs no migration; optional references remain absent', () => {
  const old: WorkbenchData = { schemaVersion: 1, tasks: [task()], projects: [], people: [], modules: [], decisions: [], baselines: [] };
  assert.deepEqual(knowledgeWarnings(old), []);
  assert.deepEqual(taskTrace(old, old.tasks[0]).materialVersions, []);
  assert.deepEqual(knowledgeReminders(old, '2026-10-02'), []);
  assert.equal(getAdoptedVersion(old, 'MAT-1'), undefined);
  assert.deepEqual(emptyWorkbenchData().meetings, []);
  assert.equal(old.tasks[0].meetingIds, undefined);
});
test('new immutable versions and adoptions are cloned and deeply frozen', () => {
  const original = version({ reviewIssues: ['Check spacing'], files: [{ path: 'index.html', size: 123 }] });
  const captured = createMaterialVersion(emptyWorkbenchData(), original);
  assert(Object.isFrozen(captured)); assert(Object.isFrozen(captured.reviewIssues)); assert(Object.isFrozen(captured.files![0]));
  assert.notEqual(captured, original);
  (original.reviewIssues as string[]).push('Later note'); assert.deepEqual(captured.reviewIssues, ['Check spacing']);
  const accepted = createAdoption(data(), adoption()); assert(Object.isFrozen(accepted));
  assert.equal(original.status, 'incoming');
});
test('new delivery never adopts itself or moves any exact task/meeting version pin', () => {
  const current = data({ tasks: [task({ materialVersionIds: ['V-1'], meetingIds: ['MEET-1'] })], adoptions: [adoption()] });
  current.materialVersions!.push(createMaterialVersion(current, version({ id: 'V-2', version: 'v2', createdAt: '2026-10-02', lastUpdated: '2026-10-02' })));
  assert.equal(getAdoptedVersion(current, 'MAT-1')!.id, 'V-1');
  assert.deepEqual(getNewerPendingVersions(current).map(item => item.id), ['V-2']);
  assert.deepEqual(taskTrace(current, current.tasks[0]).materialVersions.map(item => item.id), ['V-1']);
  assert.deepEqual(current.meetings![0].materialVersionIds, ['V-1']);
  const accepted = createAdoption(current, adoption({ id: 'A-2', versionId: 'V-2', adoptedAt: '2026-10-03' }));
  current.adoptions!.push(accepted);
  assert.equal(getAdoptedVersion(current, 'MAT-1')!.id, 'V-2');
  assert.deepEqual(getNewerPendingVersions(current), []);
  assert.deepEqual(current.tasks[0].materialVersionIds, ['V-1']);
  assert.deepEqual(current.adoptions!.map(item => item.versionId), ['V-1', 'V-2']);
});
test('version labels are opaque, timestamps determine newer pending versions and archives are excluded', () => {
  const current = data({ adoptions: [adoption()], materialVersions: [version(), version({ id: 'V-z', version: 'very old label', createdAt: '2026-10-03', lastUpdated: '2026-10-03' }), version({ id: 'V-archive', version: 'v100', status: 'archived', createdAt: '2026-10-04', lastUpdated: '2026-10-04' })] });
  assert.deepEqual(getNewerPendingVersions(current, 'MAT-1', 'P-1').map(item => item.id), ['V-z']);
  assert.deepEqual(getNewerPendingVersions(current, 'MAT-1', 'P-other'), []);
});
test('existing version IDs, version labels and material identity cannot be overwritten', () => {
  const current = data();
  assert.throws(() => createMaterialVersion(current, version({ summary: 'New meaning' })), /不可覆写/);
  assert.throws(() => createMaterialVersion(current, version({ id: 'V-2' })), /版本标签/);
  assert.throws(() => createMaterialVersion(current, version({ id: 'V-2', version: 'v2', project: 'P-other' })), /跨项目/);
});
test('adoption validates exact identity, source, chronology, duplicate ID and stale concurrent history', () => {
  const current = data({ adoptions: [adoption()] });
  for (const patch of [{ id: 'A-1', adoptedAt: '2026-10-03' }, { id: 'A-2', versionId: 'missing', adoptedAt: '2026-10-03' }, { id: 'A-2', materialId: 'wrong', adoptedAt: '2026-10-03' }, { id: 'A-2', project: 'wrong', adoptedAt: '2026-10-03' }, { id: 'A-2', adoptedAt: '2026-10-01T09:30:00Z' }, { id: 'A-2', adoptedAt: '2026-10-01T10:00:00Z' }, { id: 'A-2', source: '', adoptedAt: '2026-10-03' }]) assert.throws(() => createAdoption(current, adoption(patch)), JSON.stringify(patch));
  assert.throws(() => createAdoption(data(), adoption({ adoptedAt: '2026-09-01' })), /早于/);
  assert.equal(current.adoptions!.length, 1);
});
test('equal adoption timestamps are ambiguous rather than silently choosing one', () => {
  const current = data({ adoptions: [adoption(), adoption({ id: 'A-2' })] });
  assert.equal(getAdoptedVersion(current, 'MAT-1'), undefined);
  assert(knowledgeWarnings(current).some(item => item.includes('歧义')));
});
test('latest invalid adoption does not silently fall back to older approved record', () => {
  const current = data({ adoptions: [adoption(), adoption({ id: 'A-2', versionId: 'MISSING', adoptedAt: '2026-10-04' })] });
  assert.equal(getAdoptedVersion(current, 'MAT-1'), undefined);
  assert(knowledgeWarnings(current).some(item => item.includes('MISSING')));
});
test('record validation rejects malformed flags, preview claims without notes and invalid timestamps', () => {
  assert.deepEqual(validateMaterialVersion(version()), []);
  for (const patch of [{ requiresNetwork: undefined }, { requiresLogin: 'maybe' }, { previewStatus: 'pass' }, { previewStatus: 'fail', previewNotes: ' ' }, { createdAt: 'yesterday' }, { lastUpdated: '2026-09-30' }, { source: '' }, { provider: '' }, { status: 'adopted' }, { id: '../escape' }, { reviewIssues: [23] }]) assert(validateMaterialVersion({ ...version(), ...patch }).length, JSON.stringify(patch));
  assert.deepEqual(validateMaterialVersion(version({ previewStatus: 'pass', previewNotes: 'Manually reviewed on device; navigation passed', requiresNetwork: true, requiresLogin: false })), []);
  assert(validateAdoption({ ...adoption(), adoptedAt: 'bad' }).length);
});
test('prototype manifests retain safe Vault paths, hashes, sizes and exact entry', () => {
  const packageVersion = version({ packagePath: 'Workbench/Assets/设计包', sourceFile: 'Workbench/Assets/设计包/original/演示.zip', entryPath: 'Workbench/Assets/设计包/files/site/index.html', files: [{ path: 'site/index.html', size: 100, sha256: 'a'.repeat(64) }, { path: 'assets/a b.png', size: 200 }] });
  assert.deepEqual(validateMaterialVersion(packageVersion), []);
  for (const path of ['../escape', '/absolute', 'C:/windows', 'a\\b', 'a/../b', 'a//b', 'https://host/file', 'bad\u0000file']) assert.equal(isSafePackagePath(path), false, path);
  for (const patch of [{ sourceFile: '/absolute.zip' }, { entryPath: 'another/files/index.html' }, { files: [{ path: '../x', size: 1 }] }, { files: [{ path: 'x', size: -1 }] }, { files: [{ path: 'x', size: 1.2 }] }, { files: [{ path: 'x', size: 1, sha256: 'invalid' }] }]) assert(validateMaterialVersion({ ...packageVersion, ...patch }).length, JSON.stringify(patch));
});
test('dangerous or credential-bearing URLs are rejected; legitimate sources preserve URL details', () => {
  for (const sourceUrl of ['javascript:alert(1)', 'file:///tmp/secret', 'https://user:password@example.test/', 'not-a-url']) assert(validateMaterialVersion(version({ sourceUrl })).length);
  assert.deepEqual(validateMaterialVersion(version({ sourceUrl: 'https://example.test/proto?version=1#screen-2' })), []);
  assert(validateMeeting(meeting({ recordingUrl: 'javascript:alert(1)' })).length);
});
test('discussion and suggestion remain separate from confirmed conclusions in source trace', () => {
  const current = data({ tasks: [task({ meetingIds: ['MEET-1'], materialVersionIds: ['V-1'] })] });
  const trace = taskTrace(current, current.tasks[0]);
  assert.deepEqual(trace.confirmedDecisions.map(item => item.id), ['D-3']);
  assert.deepEqual(trace.discussionDecisions.map(item => item.id), ['D-1', 'D-2']);
  assert.equal(trace.confirmedDecisions[0].source, 'Transcript 12:40');
  assert.equal(trace.confirmedDecisions[0].meetingId, 'MEET-1');
  assert.equal(current.tasks[0].status, 'in-progress');
});
test('reverse action links trace meeting without altering task pins or promoting meeting versions', () => {
  const current = data({ meetings: [meeting({ actions: [{ id: 'ACT-1', text: 'Review', taskId: 'T-1', state: 'open' }] })] });
  const trace = taskTrace(current, current.tasks[0]);
  assert.equal(trace.meetings[0].id, 'MEET-1'); assert.equal(trace.linkedActions[0].id, 'ACT-1');
  assert.deepEqual(trace.materialVersions, []); assert.equal(current.tasks[0].materialVersionIds, undefined);
});
test('missing source IDs are explicit warnings and never fall forward to a newer version', () => {
  const current = data({ tasks: [task({ meetingIds: ['MISSING-MEETING'], materialVersionIds: ['MISSING-VERSION'] })] });
  const trace = taskTrace(current, current.tasks[0]);
  assert.deepEqual(trace.missingMeetingIds, ['MISSING-MEETING']);
  assert.deepEqual(trace.missingMaterialVersionIds, ['MISSING-VERSION']);
  assert.deepEqual(trace.materialVersions, []); assert.match(trace.warnings.join(';'), /不会改用最新/);
  assert(knowledgeReminders(current, '2026-10-03').some(item => item.kind === 'missing-evidence'));
});
test('action-to-task linking is copy-on-write, repeat-safe and never creates duplicate tasks', () => {
  const originalMeeting = meeting(), originalTask = task({ materialVersionIds: ['V-0'] });
  const linked = linkMeetingAction(originalMeeting, 'ACT-1', originalTask, '2026-10-02');
  assert.equal(linked.meeting.actions[0].taskId, 'T-1'); assert.deepEqual(linked.task.meetingIds, ['MEET-1']);
  assert.deepEqual(linked.task.materialVersionIds, ['V-0']); assert.equal(linked.task.status, 'in-progress');
  assert.equal(originalMeeting.actions[0].taskId, undefined); assert.equal(originalTask.meetingIds, undefined);
  const repeated = linkMeetingAction(linked.meeting, 'ACT-1', linked.task, '2026-10-02');
  assert.deepEqual(repeated.task.meetingIds, ['MEET-1']);
  assert.throws(() => linkMeetingAction(linked.meeting, 'ACT-1', task({ id: 'T-2' }), '2026-10-03'), /已关联/);
  assert.throws(() => linkMeetingAction(originalMeeting, 'missing', originalTask, '2026-10-02'), /缺失/);
  assert.throws(() => linkMeetingAction(originalMeeting, 'ACT-1', task({ project: 'wrong' }), '2026-10-02'), /同一项目/);
  assert.throws(() => linkMeetingAction(originalMeeting, 'ACT-1', originalTask, '2026-09-30'), /刷新/);
});
test('meeting validation rejects missing provenance, repeated action identity and unsupported states', () => {
  assert.deepEqual(validateMeeting(meeting()), []);
  for (const patch of [{ source: '' }, { startAt: 'yesterday' }, { participants: 'someone' }, { materialVersionIds: ['bad id'] }, { decisions: [{ id: 'D', text: 'Maybe', state: 'approved' }] }, { actions: [{ id: 'A', text: 'Do it', state: 'open', due: '2026-02-30' }] }, { actions: [{ id: 'A', text: 'First', state: 'open' }, { id: 'A', text: 'Second', state: 'open' }] }]) assert(validateMeeting({ ...meeting(), ...patch }).length, JSON.stringify(patch));
});
test('overdue open actions alert once; due today, done and linked closed tasks do not alert', () => {
  const current = data({ meetings: [meeting({ actions: [
    { id: 'open', text: 'Open action', due: '2026-10-02', state: 'open', owner: 'E-1' },
    { id: 'today', text: 'Due today', due: '2026-10-03', state: 'open' },
    { id: 'done', text: 'Already done', due: '2026-10-02', state: 'done' },
    { id: 'task', text: 'Task done', due: '2026-10-02', state: 'open', taskId: 'T-1' },
  ] })], tasks: [task({ status: 'test-passed' })] });
  const alerts = knowledgeReminders(current, '2026-10-03').filter(item => item.kind === 'overdue-action');
  assert.equal(alerts.length, 1); assert.equal(alerts[0].title, 'Open action'); assert.match(alerts[0].reason, /E-1/);
  assert.throws(() => knowledgeReminders(current, 'today'), /ISO/);
});
test('missing evidence reminder distinguishes sourced tasks and broken pins from truly unsupported tasks', () => {
  const current = data({ tasks: [task({ id: 'T-no', source: '' }), task({ id: 'T-note', source: '', facts: [{ text: 'Confirmed scope', source: 'Email', recordedAt: '2026-10-01' }] }), task({ id: 'T-linked', source: '', materialVersionIds: ['V-1'] }), task({ id: 'T-closed', source: '', status: 'test-passed' }), task({ id: 'T-broken', materialVersionIds: ['missing'] })] });
  assert.deepEqual(knowledgeReminders(current, '2026-10-01').filter(item => item.kind === 'missing-evidence').map(item => item.taskId), ['T-no', 'T-broken']);
});
test('cross-record warnings identify broken task/action/version/project references without modifying records', () => {
  const current = data({ meetings: [meeting({ project: 'wrong', materialVersionIds: ['missing'], actions: [{ id: 'ACT', text: 'Do it', taskId: 'missing', state: 'open' }] })], tasks: [task({ meetingIds: ['MEET-1'], materialVersionIds: ['V-1'] })], materialVersions: [version({ project: 'wrong' })], adoptions: [adoption()] });
  const before = JSON.stringify(current), warnings = knowledgeWarnings(current);
  assert(warnings.some(item => item.includes('采用记录'))); assert(warnings.some(item => item.includes('关联的任务')));
  assert(warnings.some(item => item.includes('项目不一致'))); assert.equal(JSON.stringify(current), before);
});
test('record-policy accepts new kinds and blocks stale changes to explicit task pins', () => {
  assert.deepEqual(validateManagedRecord('material-version', { ...version() }), []);
  assert.deepEqual(validateManagedRecord('adoption', { ...adoption() }), []);
  assert.deepEqual(validateManagedRecord('meeting', { ...meeting() }), []);
  const snapshot = task({ materialVersionIds: ['V-1'], meetingIds: ['MEET-1'] });
  assert.throws(() => assertFreshTaskFields({ ...snapshot, materialVersionIds: ['V-2'] }, { ...snapshot }, { materialVersionIds: ['V-3'] }), /materialVersionIds/);
  assert(validateManagedRecord('task', { ...snapshot, materialVersionIds: 'V-1' }).length);
  assert(validateManagedRecord('task', { ...snapshot, meetingIds: [' MEET-1 '] }).length);
});
test('frozen task baselines retain exact source pins and report explicitly approved pin changes', () => {
  const original = task({ materialVersionIds: ['V-1'], meetingIds: ['MEET-1'] });
  const baseline = generateBaseline([original], { id: 'BASE', name: 'Before adoption', createdAt: '2026-10-01' });
  original.materialVersionIds!.push('V-2');
  assert.deepEqual(baseline.tasks[0].materialVersionIds, ['V-1']);
  assert(compareBaseline(baseline, [original]).changes[0].fields.some(field => field.field === 'materialVersionIds'));
});

test('latest adoption identity changes even when later explicit adoption returns to the same version', () => {
  const current = data({ adoptions: [adoption(), adoption({ id: 'A-2', adoptedAt: '2026-10-02' })] });
  assert.equal(getAdoptedVersion(current, 'MAT-1')!.id, 'V-1');
  assert.equal(getLatestAdoption(current, 'MAT-1')!.id, 'A-2');
  assert.throws(() => createMaterialVersion(current, version({ id: 'V-2', version: 'v2', kind: 'document' })), /不可更换/);
});
