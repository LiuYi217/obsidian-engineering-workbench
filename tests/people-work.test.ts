import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkbenchData, type ClosureStatus, type MaterialVersion, type Meeting, type Task, type WorkbenchData } from '../src/domain';
import { buildPersonWorkGroups } from '../src/people-work';

function task(values: Partial<Task> = {}): Task {
  return { id: 'T-1', title: 'Implement flow', project: 'P-1', module: 'M-1', executor: 'E-1', status: 'in-progress', originalStart: '', originalDue: '', forecastDue: '', remainingHours: null, allocations: [], dependencies: [], nextAction: '', source: 'Explicit planning record', lastUpdated: '2026-10-01', ...values };
}
function version(values: Partial<MaterialVersion> = {}): MaterialVersion {
  return { id: 'V-1', materialId: 'MAT-1', title: 'Document snapshot', kind: 'document', version: 'v1', project: 'P-1', status: 'incoming', summary: '', source: 'Delivery record', provider: 'Design team', requiresNetwork: 'unknown', requiresLogin: 'unknown', previewStatus: 'unknown', reviewIssues: [], createdAt: '2026-10-01', lastUpdated: '2026-10-01', ...values };
}
function meeting(values: Partial<Meeting> = {}): Meeting {
  return { id: 'MEET-1', title: 'Scope review', project: 'P-1', startAt: '2026-10-01T10:00:00Z', participants: [], decisions: [], unresolved: [], actions: [], materialVersionIds: [], transcript: '', source: 'Meeting record', lastUpdated: '2026-10-01', ...values };
}
function data(values: Partial<WorkbenchData> = {}): WorkbenchData { return { ...emptyWorkbenchData(), ...values }; }
const ids = (items: readonly { id: string }[]): string[] => items.map(item => item.id);
const groupsFor = (tasks: Task[], person = 'E-1', closure?: ClosureStatus) => buildPersonWorkGroups(data({ tasks }), person, closure);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('legacy tasks use one project-local ungrouped bucket, never titles, modules, dependencies or URLs', () => {
  const tasks = [task({ id: 'T-b', title: 'Parent-like title', requirementTitle: 'Title only', source: 'https://example.test/requirements/R-1', dependencies: ['T-parent'] }), task({ id: 'T-a', title: 'Parent-like title' }), task({ id: 'T-parent', executor: 'E-2' }), task({ id: 'T-c', project: 'P-2' })];
  const groups = groupsFor(tasks);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => [group.project, group.title, group.requirementId]), [['P-1', '未分组', undefined], ['P-2', '未分组', undefined]]);
  assert.deepEqual(ids(groups[0].currentTasks), ['T-a', 'T-b']);
  assert.deepEqual(ids(groups[0].memberTasks), ['T-a', 'T-b']);
  assert.equal(groups[0].parentTask, undefined);
  assert.deepEqual(groupsFor(tasks, 'not-assigned'), []);
});

test('external requirement IDs group current work even when no parent task is present', () => {
  const groups = groupsFor([task({ id: 'T-2', requirementId: 'R-1', requirementTitle: 'External requirement' }), task({ requirementId: 'R-1', requirementTitle: 'External requirement' }), task({ id: 'T-3', requirementId: 'R-2' })]);
  assert.equal(groups.length, 2);
  const external = groups.find(group => group.requirementId === 'R-1')!;
  assert.equal(external.title, 'External requirement'); assert.equal(external.parentTask, undefined);
  assert.deepEqual(ids(external.currentTasks), ['T-1', 'T-2']);
  assert.equal(groups.find(group => group.requirementId === 'R-2')!.title, 'R-2');
  assert.deepEqual(external.warnings, []);
});

test('identity is project plus requirement ID; identical names and IDs never merge distinct requirements/projects', () => {
  const groups = groupsFor([task({ id: 'A', requirementId: 'R', requirementTitle: 'Same' }), task({ id: 'B', requirementId: 'S', requirementTitle: 'Same' }), task({ id: 'C', project: 'P-2', requirementId: 'R', requirementTitle: 'Same' }), task({ id: 'D', requirementId: '未分组' }), task({ id: 'E' })]);
  assert.equal(groups.length, 5); assert.equal(new Set(groups.map(group => group.id)).size, 5);
  assert.equal(groups.filter(group => group.requirementId === 'R').length, 2);
  assert.deepEqual(groups.map(group => group.currentTasks.length), [1, 1, 1, 1, 1]);
});

test('composite group keys cannot collide through project/ID separators or sentinel-looking IDs', () => {
  const groups = groupsFor([task({ id: 'A', project: 'a:b', requirementId: 'c' }), task({ id: 'B', project: 'a', requirementId: 'b:c' }), task({ id: 'C', project: 'a', requirementId: 'null' }), task({ id: 'D', project: 'a' })]);
  assert.equal(new Set(groups.map(group => group.id)).size, 4);
});

test('a same-project task referenced as a parent joins its own group exactly once', () => {
  const parent = task({ id: 'R-1', title: 'Authoritative parent' });
  const child = task({ id: 'T-1', requirementId: 'R-1', requirementTitle: 'Authoritative parent' });
  const [group] = groupsFor([child, parent]);
  assert.equal(group.parentTask, parent); assert.equal(group.title, parent.title);
  assert.deepEqual(ids(group.currentTasks), ['R-1', 'T-1']);
  assert.deepEqual(group.warnings, []);
});

test('a parent assigned to someone else supplies metadata but is never fabricated as personal work', () => {
  const parent = task({ id: 'R-1', title: 'Parent scope', executor: 'E-2' });
  const [group] = groupsFor([parent, task({ requirementId: 'R-1' })]);
  assert.deepEqual(ids(group.currentTasks), ['T-1']); assert.equal(group.parentTask, parent);
  assert.deepEqual(ids(group.memberTasks), ['R-1', 'T-1']);
});

test('flat explicit groups remain stable for nested declarations and cycles without duplicate work', () => {
  const tasks = [task({ id: 'R-1', requirementId: 'R-0' }), task({ id: 'R-0', requirementId: 'R-1' }), task({ id: 'T-1', requirementId: 'R-1' })];
  const groups = groupsFor(tasks);
  assert.deepEqual(ids(groups.flatMap(group => group.currentTasks)).sort(), ['R-0', 'R-1', 'T-1']);
  assert.deepEqual(ids(groups.find(group => group.requirementId === 'R-0')!.currentTasks), ['R-1']);
  assert.equal(groups.find(group => group.requirementId === 'R-1')!.parentTask?.id, 'R-1');
});

test('a parent ID in another project neither absorbs unrelated tasks nor supplies parent metadata', () => {
  const groups = groupsFor([task({ id: 'R-1', project: 'P-2', title: 'Wrong parent' }), task({ requirementId: 'R-1', requirementTitle: 'External local scope' })]);
  const local = groups.find(group => group.project === 'P-1')!;
  assert.equal(local.title, 'External local scope'); assert.equal(local.parentTask, undefined);
  assert.equal(groups.find(group => group.project === 'P-2')!.requirementId, undefined);
});

test('duplicate parent titles do not choose a requirement; same-ID title conflicts are explicit', () => {
  const [group] = groupsFor([task({ requirementId: 'R-1', requirementTitle: 'Alpha' }), task({ id: 'T-2', requirementId: 'R-1', requirementTitle: 'Beta', executor: 'E-2' })]);
  assert.equal(group.title, 'R-1'); assert.match(group.warnings.join(';'), /名称不一致/);
  const parent = task({ id: 'R-1', title: 'Parent title', executor: 'E-2' });
  const [withParent] = groupsFor([parent, task({ requirementId: 'R-1', requirementTitle: 'Child label' })]);
  assert.equal(withParent.title, 'Parent title'); assert.match(withParent.warnings.join(';'), /显示上级标题/);
});

test('collaborator assignment is exact and duplicate executors never duplicate work', () => {
  const shared = task({ executor: 'E-2', executors: ['E-1', 'E-1', 'E-2'], requirementId: 'R-1' });
  assert.deepEqual(ids(groupsFor([shared])[0].currentTasks), ['T-1']);
  assert.deepEqual(ids(groupsFor([shared], 'E-2')[0].currentTasks), ['T-1']);
  assert.deepEqual(groupsFor([shared], 'E'), []);
});

test('configured closure splits all statuses; cancelled never appears in current work', () => {
  const statuses: Task['status'][] = ['planned', 'in-progress', 'blocked', 'dev-complete', 'test-passed', 'released', 'accepted', 'cancelled'];
  const tasks = statuses.map(status => task({ id: status, status, requirementId: 'R-1' }));
  for (const [closure, currentStatuses] of [
    ['dev-complete', ['planned', 'in-progress', 'blocked']],
    ['test-passed', ['planned', 'in-progress', 'blocked', 'dev-complete']],
    ['released', ['planned', 'in-progress', 'blocked', 'dev-complete', 'test-passed']],
    ['accepted', ['planned', 'in-progress', 'blocked', 'dev-complete', 'test-passed', 'released']],
  ] as [ClosureStatus, string[]][]) {
    const [group] = groupsFor(tasks, 'E-1', closure);
    assert.deepEqual(ids(group.currentTasks).sort(), currentStatuses.sort(), closure);
    assert.equal(group.currentTasks.length + group.closedTasks.length, statuses.length);
    assert(group.closedTasks.some(item => item.status === 'cancelled'));
  }
});

test('completed-only groups remain available but active groups sort first regardless of title', () => {
  const groups = groupsFor([task({ id: 'A', requirementId: 'A', status: 'accepted' }), task({ id: 'B', requirementId: 'Z' })]);
  assert.deepEqual(groups.map(group => group.requirementId), ['Z', 'A']);
  assert.deepEqual(groups[1].currentTasks, []); assert.equal(groups[1].closedTasks.length, 1);
});

test('source aggregation includes global siblings, completed siblings and the exact nested parent', () => {
  const records = data({ tasks: [
    task({ requirementId: 'R-1', materialVersionIds: ['V-1'], meetingIds: ['MEET-1'] }),
    task({ id: 'T-other', executor: 'E-2', status: 'accepted', requirementId: 'R-1', materialVersionIds: ['V-2'], meetingIds: ['MEET-2'] }),
    task({ id: 'R-1', executor: 'E-2', requirementId: 'R-0', materialVersionIds: ['V-parent'], meetingIds: ['MEET-parent'] }),
    task({ id: 'unrelated', executor: 'E-2', requirementId: 'other', materialVersionIds: ['V-no'], meetingIds: ['MEET-no'] }),
  ], meetings: ['MEET-1', 'MEET-2', 'MEET-parent', 'MEET-no'].map(id => meeting({ id })), materialVersions: ['V-1', 'V-2', 'V-parent', 'V-no'].map(id => version({ id })) });
  const [group] = buildPersonWorkGroups(records, 'E-1');
  assert.deepEqual(ids(group.currentTasks), ['T-1']);
  assert.deepEqual(ids(group.memberTasks), ['T-1', 'T-other']);
  assert.deepEqual(ids(group.meetings), ['MEET-1', 'MEET-2', 'MEET-parent']);
  assert.deepEqual(ids(group.materialVersions), ['V-1', 'V-2', 'V-parent']);
});

test('ungrouped people never inherit unrelated ungrouped coworker sources', () => {
  const records = data({ tasks: [task(), task({ id: 'T-other', executor: 'E-2', materialVersionIds: ['V-1'], meetingIds: ['MEET-1'] })], meetings: [meeting()], materialVersions: [version()] });
  const [group] = buildPersonWorkGroups(records, 'E-1');
  assert.deepEqual(group.materialVersions, []); assert.deepEqual(group.meetings, []);
});

test('reverse meeting action links are explicit, deduplicated, and can target siblings or parent records', () => {
  const records = data({ tasks: [task({ requirementId: 'R-1', meetingIds: ['MEET-1', 'MEET-1'] }), task({ id: 'T-2', requirementId: 'R-1', executor: 'E-2' }), task({ id: 'R-1', executor: 'E-2' })], meetings: [meeting({ actions: [{ id: 'A-1', text: 'Work', taskId: 'T-1', state: 'open' }, { id: 'A-2', text: 'Work', taskId: 'T-2', state: 'done' }] }), meeting({ id: 'MEET-parent', actions: [{ id: 'A-3', text: 'Work', taskId: 'R-1', state: 'open' }] }), meeting({ id: 'MEET-unrelated' })] });
  const [group] = buildPersonWorkGroups(records, 'E-1');
  assert.deepEqual(ids(group.meetings), ['MEET-1', 'MEET-parent']);
});

test('meeting-only versions retain exact IDs and provenance without becoming task pins', () => {
  const records = data({ tasks: [task({ requirementId: 'R-1', materialVersionIds: ['V-1', 'V-1'], meetingIds: ['M-2', 'M-1'] })], meetings: [meeting({ id: 'M-2', materialVersionIds: ['V-2', 'V-2', 'V-1'] }), meeting({ id: 'M-1', materialVersionIds: ['V-2'] })], materialVersions: [version(), version({ id: 'V-2', kind: 'prototype', version: 'older-label', createdAt: '2026-09-01' }), version({ id: 'V-new', version: 'latest', createdAt: '2026-10-05' })], adoptions: [{ id: 'A', materialId: 'MAT-1', versionId: 'V-new', project: 'P-1', adoptedAt: '2026-10-06', source: 'Decision' }] });
  const before = JSON.stringify(records);
  const [group] = buildPersonWorkGroups(records, 'E-1');
  assert.deepEqual(ids(group.materialVersions), ['V-1']);
  assert.deepEqual(group.meetingMaterialVersions.map(item => [item.version.id, item.meetingIds]), [['V-1', ['M-2']], ['V-2', ['M-1', 'M-2']]]);
  assert.equal(JSON.stringify(records), before);
});

test('cross-project direct pins, reverse links and contextual pins are rejected with concise warnings', () => {
  const records = data({ tasks: [task({ requirementId: 'R-1', materialVersionIds: ['V-wrong'], meetingIds: ['M-wrong', 'M-good'] })], meetings: [meeting({ id: 'M-wrong', project: 'P-2' }), meeting({ id: 'M-reverse', project: 'P-2', actions: [{ id: 'A', text: 'Work', taskId: 'T-1', state: 'open' }] }), meeting({ id: 'M-good', materialVersionIds: ['V-wrong'] })], materialVersions: [version({ id: 'V-wrong', project: 'P-2' })] });
  const [group] = buildPersonWorkGroups(records, 'E-1');
  assert.deepEqual(ids(group.meetings), ['M-good']); assert.deepEqual(group.materialVersions, []); assert.deepEqual(group.meetingMaterialVersions, []);
  assert.equal(group.warnings.filter(warning => warning.includes('V-wrong')).length, 1);
  for (const id of ['V-wrong', 'M-wrong', 'M-reverse']) assert(group.warnings.some(warning => warning.includes(id) && warning.includes('跨项目')));
});

test('duplicate meeting/version IDs are rejected globally even when exactly one candidate is same-project', () => {
  const records = data({ tasks: [task({ meetingIds: ['M'], materialVersionIds: ['V'] })], meetings: [meeting({ id: 'M' }), meeting({ id: 'M', project: 'P-2' })], materialVersions: [version({ id: 'V' }), version({ id: 'V', project: 'P-2' })] });
  const [group] = buildPersonWorkGroups(records, 'E-1');
  assert.deepEqual(group.meetings, []); assert.deepEqual(group.materialVersions, []);
  assert.equal(group.warnings.filter(warning => warning.includes('ID 重复')).length, 2);
});

test('missing exact pins warn, without guessing from source URLs, available latest versions or meeting titles', () => {
  const records = data({ tasks: [task({ meetingIds: ['M-missing'], materialVersionIds: ['V-missing'] })], meetings: [meeting()], materialVersions: [version()] });
  const [group] = buildPersonWorkGroups(records, 'E-1');
  assert.deepEqual(group.meetings, []); assert.deepEqual(group.materialVersions, []);
  assert.match(group.warnings.join(';'), /M-missing.*缺失/); assert.match(group.warnings.join(';'), /V-missing.*不会改用最新/);
});

test('duplicate task IDs cannot resolve a parent or reverse action, while explicit record pins remain usable', () => {
  const records = data({ tasks: [task({ id: 'R', title: 'Parent one', executor: 'E-2' }), task({ id: 'R', title: 'Parent two', executor: 'E-2' }), task({ requirementId: 'R', meetingIds: ['M-direct'] }), task({ id: 'T-dup', title: 'First', requirementId: 'R' }), task({ id: 'T-dup', title: 'Second', requirementId: 'R' })], meetings: [meeting({ id: 'M-direct' }), meeting({ id: 'M-ambiguous', actions: [{ id: 'A', text: 'Work', taskId: 'T-dup', state: 'open' }] }), meeting({ id: 'M-parent', actions: [{ id: 'A', text: 'Work', taskId: 'R', state: 'open' }] })] });
  const [group] = buildPersonWorkGroups(records, 'E-1');
  assert.equal(group.parentTask, undefined); assert.equal(group.title, 'R');
  assert.deepEqual(ids(group.meetings), ['M-direct']);
  assert.equal(group.currentTasks.length, 3, 'Conflicting records remain visible rather than selecting one arbitrary status/title');
  assert.match(group.warnings.join(';'), /上级需求 R.*ID 重复/); assert.match(group.warnings.join(';'), /任务 T-dup.*ID 重复/);
});

test('identical repeated task records display once without mutating or trusting duplicate-ID reverse links', () => {
  const original = task({ requirementId: 'R-1' });
  const records = data({ tasks: [original, { ...original }, original], meetings: [meeting({ actions: [{ id: 'A', text: 'Work', taskId: 'T-1', state: 'open' }] })] });
  const [group] = buildPersonWorkGroups(records, 'E-1');
  assert.deepEqual(ids(group.currentTasks), ['T-1']); assert.deepEqual(group.meetings, []);
  assert.equal(records.tasks.length, 3);
});

test('same task IDs across projects resolve only project-local parent and reverse links', () => {
  const records = data({ tasks: [task({ id: 'R', executor: 'E-2', title: 'Local parent' }), task({ id: 'R', project: 'P-2', executor: 'E-2', title: 'Other parent' }), task({ id: 'T', requirementId: 'R' }), task({ id: 'T', project: 'P-2', requirementId: 'R', executor: 'E-2' })], meetings: [meeting({ id: 'M-local', actions: [{ id: 'A', text: 'Work', taskId: 'T', state: 'open' }] }), meeting({ id: 'M-other', project: 'P-2', actions: [{ id: 'A', text: 'Work', taskId: 'T', state: 'open' }] })] });
  const [group] = buildPersonWorkGroups(records, 'E-1');
  assert.equal(group.title, 'Local parent'); assert.deepEqual(ids(group.meetings), ['M-local']); assert.deepEqual(group.warnings, []);
});

test('empty optional collections and empty legacy requirement IDs are safe without migration', () => {
  const records: WorkbenchData = { schemaVersion: 1, tasks: [task({ requirementId: '', requirementTitle: 'Not identity' })], projects: [], people: [], modules: [], decisions: [], baselines: [] };
  const [group] = buildPersonWorkGroups(records, 'E-1');
  assert.equal(group.title, '未分组'); assert.deepEqual(group.meetings, []); assert.deepEqual(group.materialVersions, []);
  assert.deepEqual(buildPersonWorkGroups(emptyWorkbenchData(), 'E-1'), []);
});

test('output ordering is independent of source array ordering and the entire input may be deeply frozen', () => {
  const records = data({ tasks: [task({ id: 'T-b', requirementId: 'R', requirementTitle: 'Scope', meetingIds: ['M-b', 'M-a'], materialVersionIds: ['V-b', 'V-a'] }), task({ id: 'T-a', requirementId: 'R', requirementTitle: 'Scope' }), task({ id: 'T-c', requirementId: 'C', status: 'cancelled' }), task({ id: 'T-d', project: 'P-2' })], meetings: [meeting({ id: 'M-b', materialVersionIds: ['V-b', 'V-a'] }), meeting({ id: 'M-a', materialVersionIds: ['V-b'] })], materialVersions: [version({ id: 'V-b' }), version({ id: 'V-a' })] });
  const reordered = { ...records, tasks: [...records.tasks].reverse(), meetings: [...records.meetings!].reverse(), materialVersions: [...records.materialVersions!].reverse() };
  const before = JSON.stringify(records);
  freeze(records);
  assert.deepEqual(buildPersonWorkGroups(records, 'E-1'), buildPersonWorkGroups(reordered, 'E-1'));
  assert.equal(JSON.stringify(records), before);
});

test('only a unique explicit requirement source URL is exposed, preserving its exact version query/fragment', () => {
  const sourceUrl = 'https://example.test/requirements/R-1?revision=2#scope';
  const [group] = groupsFor([task({ requirementId: 'R-1', requirementSourceUrl: sourceUrl }), task({ id: 'T-2', executor: 'E-2', requirementId: 'R-1', requirementSourceUrl: sourceUrl })]);
  assert.equal(group.sourceUrl, sourceUrl); assert.deepEqual(group.warnings, []);
  const [noSource] = groupsFor([task({ requirementId: 'R-1', source: sourceUrl })]);
  assert.equal(noSource.sourceUrl, undefined);
});

test('conflicting requirement source URLs are omitted rather than selecting the first or latest', () => {
  const tasks = [task({ requirementId: 'R', requirementSourceUrl: 'https://example.test/one' }), task({ id: 'T-2', requirementId: 'R', requirementSourceUrl: 'https://example.test/two' })];
  const [group] = groupsFor(tasks);
  assert.equal(group.sourceUrl, undefined); assert.match(group.warnings.join(';'), /来源链接不一致/);
  assert.deepEqual(groupsFor([...tasks].reverse()), [group]);
});

test('unsafe and credential-bearing requirement source URLs never become navigable links', () => {
  for (const requirementSourceUrl of ['javascript:alert(1)', 'file:///tmp/record', 'https://user:secret@example.test/', 'not-a-url', ' https://example.test/source']) {
    const [group] = groupsFor([task({ requirementId: 'R', requirementSourceUrl })]);
    assert.equal(group.sourceUrl, undefined, requirementSourceUrl); assert.match(group.warnings.join(';'), /来源链接无效/);
  }
  assert.equal(groupsFor([task({ requirementId: 'R', requirementSourceUrl: 'http://example.test/source' })])[0].sourceUrl, 'http://example.test/source');
});

test('source URLs neither establish missing identities nor leak from a different/nested requirement', () => {
  const sourceUrl = 'https://example.test/requirements/R';
  const groups = groupsFor([task({ requirementSourceUrl: sourceUrl }), task({ id: 'T-2', requirementId: 'R' }), task({ id: 'R', executor: 'E-2', requirementId: 'OTHER', requirementSourceUrl: sourceUrl })]);
  assert.equal(groups.find(group => group.requirementId === undefined)!.sourceUrl, undefined);
  assert.equal(groups.find(group => group.requirementId === 'R')!.sourceUrl, undefined);
});
