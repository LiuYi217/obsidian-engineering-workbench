/** Native integration contract tests with a minimal in-memory Obsidian/DOM host.
 * They exercise shipped modal/store code, but do not replace real Obsidian QA.
 * JSON frontmatter is valid YAML; this mock intentionally does not emulate YAML parsing.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createDemoData } from '../src/demo';
import { generateBaseline, type Task } from '../src/domain';

type Listener = (event: { target: SmokeNode }) => unknown;
class SmokeNode {
  children: SmokeNode[] = [];
  value = ''; textContent = ''; className = ''; type = '';
  disabled = false; hidden = false; checked = false;
  attrs: Record<string, string> = {};
  style: Record<string, string> = {};
  events: Record<string, Listener[]> = {};
  onclick?: () => unknown;
  classList = { add: (..._names: string[]) => {} };
  constructor(public tagName: string) {}
  append(...nodes: SmokeNode[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: SmokeNode[]) { this.children = nodes; }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  addEventListener(name: string, fn: Listener) { (this.events[name] ??= []).push(fn); }
  dispatch(name: string) { for (const fn of this.events[name] ?? []) fn({ target: this }); if (name === 'click') this.onclick?.(); }
}
class FileStub { constructor(public path: string, public content: string) {} }
const notices: string[] = [];
const globals = globalThis as unknown as Record<string, unknown>;
let temporary = '';
let native: any;
let previousDocument: unknown;
const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const frontmatter = (text: string) => {
  if (!text.startsWith('---\n')) return { exists: false, frontmatter: '', contentStart: 0 };
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return { exists: false, frontmatter: '', contentStart: 0 };
  return { exists: true, frontmatter: text.slice(4, end), contentStart: end + 5 };
};
before(async () => {
  previousDocument = globals.document;
  globals.document = { createElement: (tag: string) => new SmokeNode(tag) };
  globals.__elwNativeSmoke = { FileStub, notices, frontmatter };
  temporary = mkdtempSync(path.join(tmpdir(), 'elw-native-smoke-'));
  const mock = `
    const bridge=globalThis.__elwNativeSmoke;
    export class Modal { constructor(app){this.app=app;this.contentEl=document.createElement('div');this.closed=false;} open(){this.onOpen();} close(){this.closed=true;this.onClose();} }
    export class Notice { constructor(text){bridge.notices.push(text);} }
    export class Plugin {} export class App {} export class ItemView {} export class PluginSettingTab {} export class Setting {} export class WorkspaceLeaf {}
    export const TFile=bridge.FileStub;
    export const getFrontMatterInfo=bridge.frontmatter;
    export const normalizePath=value=>value.replace(/\\\\/g,'/');
    export const parseYaml=JSON.parse;
    export const stringifyYaml=value=>JSON.stringify(value)+'\\n';
  `;
  await build({
    stdin: { contents: readFileSync(path.join(root, 'src/main.ts'), 'utf8') + '\nexport {TaskModal, ImportModal, ProgressModal, ConfirmModal, VaultStore};', loader: 'ts', resolveDir: path.join(root, 'src') },
    bundle: true, platform: 'node', format: 'cjs', outfile: path.join(temporary, 'native.cjs'),
    plugins: [{ name: 'native-smoke-host', setup(builder) {
      builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'smoke-host' }));
      builder.onLoad({ filter: /.*/, namespace: 'smoke-host' }, () => ({ contents: mock, loader: 'js' }));
    } }],
  });
  native = require(path.join(temporary, 'native.cjs'));
});
after(() => { if (temporary) rmSync(temporary, { recursive: true, force: true }); globals.document = previousDocument; delete globals.__elwNativeSmoke; });
const flatten = (node: SmokeNode): SmokeNode[] => [node, ...node.children.flatMap(flatten)];
const find = (modal: any, predicate: (node: SmokeNode) => boolean): SmokeNode => {
  const node = flatten(modal.contentEl).find(predicate); assert(node, 'Expected native control'); return node;
};
const control = (modal: any, label: string) => find(modal, node => node.attrs['aria-label'] === label);
const click = (modal: any, label: string) => find(modal, node => node.tagName === 'button' && node.textContent === label).dispatch('click');
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const sample = (id = 'A'): Task => ({ ...createDemoData('2026-10-01').tasks[1], id, status: 'planned', blocker: 'Old blocker', risk: 'Old risk', contact: 'Old contact', coordinationDue: '2026-10-02' });
function host() {
  const files = new Map<string, FileStub>(), folders = new Set<string>();
  const app = { vault: {
    getAbstractFileByPath: (name: string) => files.get(name) ?? (folders.has(name) ? { path: name } : null),
    getMarkdownFiles: () => [...files.values()],
    createFolder: async (name: string) => { folders.add(name); },
    create: async (name: string, text: string) => { if (files.has(name)) throw new Error('File already exists'); const file = new FileStub(name, text); files.set(name, file); return file; },
    read: async (file: FileStub) => file.content,
    cachedRead: async (file: FileStub) => file.content,
  }, fileManager: {
    processFrontMatter: async (file: FileStub, update: (value: Record<string, unknown>) => void) => {
      const info = frontmatter(file.content), value = JSON.parse(info.frontmatter); update(value);
      file.content = `---\n${JSON.stringify(value)}\n---\n${file.content.slice(info.contentStart)}`;
    },
  } };
  return { app, files, store: new native.VaultStore(app, 'Workbench') };
}

test('native confirmation requires an explicit click; Cancel never applies', async () => {
  let applied = 0;
  const cancelled = new native.ConfirmModal({}, 'Review', 'Preview', 'Apply', async () => { applied++; });
  cancelled.onOpen(); assert.equal(applied, 0); click(cancelled, '取消'); await flush(); assert.equal(applied, 0);
  const confirmed = new native.ConfirmModal({}, 'Review', 'Preview', 'Apply', async () => { applied++; });
  confirmed.onOpen(); click(confirmed, 'Apply'); await flush(); assert.equal(applied, 1); assert(confirmed.closed);
});

test('native task form clears optional fields explicitly and rejects a blank effort estimate', async () => {
  const updates: Partial<Task>[] = [];
  const plugin = { app: {}, data: { tasks: [sample()], projects: [] }, period: { start: '2026-09-28', end: '2026-10-04' }, store: { updateTask: async (_task: Task, changes: Partial<Task>) => { updates.push(changes); } }, reload: async () => {} };
  const modal = new native.TaskModal(plugin, sample()); modal.onOpen();
  for (const label of ['阻塞事实', '风险判断（未验证的判断）', '跟进 / 对接人', '跟进到期日']) control(modal, label).value = '';
  click(modal, '确认更新共享记录'); await flush();
  assert.equal(updates.length, 1);
  for (const key of ['blocker', 'risk', 'contact', 'coordinationDue'] as const) { assert(Object.prototype.hasOwnProperty.call(updates[0], key)); assert.equal(updates[0][key], undefined); }
  const blank = new native.TaskModal(plugin, sample()); blank.onOpen(); control(blank, '剩余工作量（小时）').value = '';
  click(blank, '确认更新共享记录'); await flush(); assert.equal(updates.length, 1); assert.match(find(blank, n => n.className === 'elw-error').textContent, /remainingHours/);
});

test('native import commits the reviewed snapshot, never later unpreviewed input', async () => {
  let resolveReload!: () => void;
  let reloadCount = 0;
  const writes: string[] = [];
  const plugin = { app: {}, data: { tasks: [] }, store: { create: async (_kind: string, task: Task) => { writes.push(task.id); } }, reload: () => ++reloadCount === 1 ? new Promise<void>(resolve => { resolveReload = resolve; }) : Promise.resolve() };
  const modal = new native.ImportModal(plugin); modal.onOpen();
  const input = control(modal, '导入内容'); control(modal, '导入格式').value = 'json'; input.value = JSON.stringify([sample('A')]);
  click(modal, '校验并预览'); assert.equal(writes.length, 0); click(modal, '确认导入新增记录'); assert(input.disabled);
  input.value = JSON.stringify([sample('B')]); input.dispatch('input'); resolveReload(); await flush();
  assert.deepEqual(writes, ['A']); assert(modal.closed);
});

test('native store preserves body/custom fields/original dates and refuses stale edits', async () => {
  const { store, files } = host(); const body = '# Personal notes\n\nKeep this body exactly.\n';
  const file = await store.create('task', { ...sample(), customTeamField: { keep: true } }, body);
  let task = (await store.load()).tasks[0];
  await store.updateTask(task, { status: 'in-progress', originalDue: '2028-01-01', blocker: undefined });
  const fm = JSON.parse(frontmatter(file.content).frontmatter);
  assert.equal(fm.status, 'in-progress'); assert.deepEqual(fm.customTeamField, { keep: true });
  assert.equal(fm.originalDue, task.originalDue); assert.equal(fm.blocker, undefined); assert(file.content.endsWith(body));
  task = (await store.load()).tasks[0];
  const manual = JSON.parse(frontmatter(file.content).frontmatter); manual.status = 'blocked';
  file.content = `---\n${JSON.stringify(manual)}\n---\n\n${body}`;
  await assert.rejects(store.updateTask(task, { status: 'released' }), /status/);
  assert.equal(JSON.parse(frontmatter(file.content).frontmatter).status, 'blocked'); assert.equal(files.size, 1);
});

test('native frozen baseline is independent and colliding creation never overwrites it', async () => {
  const { store, files } = host(); const task = sample();
  const baseline = generateBaseline([task], { id: 'baseline-A', name: 'Week', createdAt: '2026-10-01T12:00:00Z', period: { start: '2026-09-28', end: '2026-10-04' } });
  const file = await store.createBaseline(baseline), original = file.content;
  task.title = 'Changed afterward';
  await assert.rejects(store.createBaseline(baseline), /已存在/);
  assert.equal(file.content, original); assert.equal(files.size, 1);
  assert.notEqual((await store.load()).baselines[0].tasks[0].title, task.title);
});

test('native progress defaults unchecked and preflights every task before any write', async () => {
  const tasks = [sample('A'), sample('B')], writes: string[] = [], preflight: string[] = [];
  const plugin = { app: {}, data: { tasks }, store: {
    preflightTask: async (task: Task) => { preflight.push(task.id); if (task.id === 'B') throw new Error('B changed elsewhere'); },
    updateTask: async (task: Task) => { writes.push(task.id); },
  }, reload: async () => {} };
  const modal = new native.ProgressModal(plugin); modal.onOpen();
  control(modal, '本次进展原文').value = 'A status: test-passed\nB status: test-passed'; click(modal, '生成待确认建议');
  const checkboxes = flatten(modal.contentEl).filter(n => n.type === 'checkbox');
  assert.equal(checkboxes.length, 3); assert(checkboxes.every(n => !n.checked)); assert.equal(writes.length, 0);
  for (const box of checkboxes.slice(0, 2)) { box.checked = true; box.dispatch('change'); }
  click(modal, '确认写入所选建议'); await flush();
  assert.deepEqual(preflight, ['A', 'B']); assert.deepEqual(writes, []);
  assert.match(find(modal, n => n.className === 'elw-error').textContent, /已更新 0 条.*B changed elsewhere/);
});

test('native progress reports partial committed IDs and removes stale review on failure', async () => {
  const writes: string[] = [];
  const plugin = { app: {}, data: { tasks: [sample('A'), sample('B')] }, store: {
    preflightTask: async () => {},
    updateTask: async (task: Task) => { if (task.id === 'B') throw new Error('Late conflict'); writes.push(task.id); },
  }, reload: async () => {} };
  const modal = new native.ProgressModal(plugin); modal.onOpen();
  control(modal, '本次进展原文').value = 'A status: test-passed\nB status: test-passed'; click(modal, '生成待确认建议');
  for (const box of flatten(modal.contentEl).filter(n => n.type === 'checkbox').slice(0, 2)) { box.checked = true; box.dispatch('change'); }
  click(modal, '确认写入所选建议'); await flush();
  assert.deepEqual(writes, ['A']); assert.match(find(modal, n => n.className === 'elw-error').textContent, /已更新 1 条（A）.*Late conflict/);
  assert(!flatten(modal.contentEl).some(n => n.textContent === '确认写入所选建议'));
});
