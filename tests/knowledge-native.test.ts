/** Real store/modal regression tests in an in-memory Obsidian host.
 * JSON frontmatter is valid YAML; actual Obsidian parsing/rendering remains separate manual QA.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { type MaterialVersion, type Adoption, type Meeting, type WorkbenchData } from '../src/domain';
import { getLatestAdoption } from '../src/knowledge';
import { inspectPrototypeFiles } from '../src/prototype-security';

class NodeStub {
  children: NodeStub[] = []; parent?: NodeStub;
  value = ''; textContent = ''; className = ''; type = ''; accept = ''; placeholder = '';
  disabled = false; hidden = false; checked = false; multiple = false;
  files: unknown[] = [];
  attrs: Record<string, string> = {}; events: Record<string, (() => unknown)[]> = {};
  classList = { add: (..._names: string[]) => {} };
  constructor(public tagName: string) {}
  append(...nodes: NodeStub[]) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes: NodeStub[]) { this.children = []; this.append(...nodes); }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  removeAttribute(key: string) { delete this.attrs[key]; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  addEventListener(name: string, action: () => unknown) { (this.events[name] ??= []).push(action); }
  dispatch(name: string) { if (name === 'click' && this.disabled) return; for (const action of this.events[name] ?? []) action(); }
}
class FileStub { constructor(public path: string, public content = '', public bytes?: Uint8Array) {} }
class AdapterStub { getBasePath() { return '/test-vault'; } getFullPath(name: string) { return `/test-vault/${name}`; } }
const frontmatter = (text: string) => {
  const end = text.indexOf('\n---\n', 4);
  return text.startsWith('---\n') && end >= 0 ? { exists: true, frontmatter: text.slice(4, end), contentStart: end + 5 } : { exists: false, frontmatter: '', contentStart: 0 };
};
const notices: string[] = [], opened: any[] = [], externalPaths: string[] = [];
const realpaths = new Map<string, string>();
const globals = globalThis as unknown as Record<string, unknown>;
let native: any, temporary = '', oldDocument: unknown, oldWindow: unknown;
const root = process.cwd(), require = createRequire(path.join(root, 'package.json'));
before(async () => {
  oldDocument = globals.document; oldWindow = globals.window;
  globals.document = { createElement: (tag: string) => new NodeStub(tag) };
  globals.window = { require: (name: string) => name === 'node:fs' ? { promises: { realpath: async (value: string) => realpaths.get(value) ?? value } } : name === 'node:path' ? path : ({ shell: { openPath: async (name: string) => { externalPaths.push(name); return ''; }, openExternal: async () => {} } }), open: () => {} };
  globals.__knowledgeNative = { FileStub, AdapterStub, frontmatter, notices, opened };
  temporary = mkdtempSync(path.join(tmpdir(), 'elw-knowledge-native-'));
  const mock = `
    const bridge=globalThis.__knowledgeNative;
    export class Modal { constructor(app){this.app=app;this.contentEl=document.createElement('div');this.closed=false;} open(){bridge.opened.push(this);this.onOpen();} close(){this.closed=true;this.onClose?.();} }
    export class Notice { constructor(text){bridge.notices.push(text);} }
    export class App {} export const Platform={isDesktopApp:true};
    export const FileSystemAdapter=bridge.AdapterStub, TFile=bridge.FileStub;
    export const getFrontMatterInfo=bridge.frontmatter, parseYaml=JSON.parse;
    export const normalizePath=value=>value.replace(/\\\\/g,'/');
    export const stringifyYaml=value=>JSON.stringify(value)+'\\n';
  `;
  await build({ stdin: { contents: "export { VaultStore } from './store'; export { MeetingModal, MaterialModal, MaterialDetailsModal, KnowledgeConfirmModal, openMaterialSource } from './knowledge-modals';", loader: 'ts', resolveDir: path.join(root, 'src') }, bundle: true, platform: 'node', format: 'cjs', outfile: path.join(temporary, 'native.cjs'), plugins: [{ name: 'knowledge-native-host', setup(builder) { builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' })); builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: mock, loader: 'js' })); } }] });
  native = require(path.join(temporary, 'native.cjs'));
});
after(() => { if (temporary) rmSync(temporary, { recursive: true, force: true }); globals.document = oldDocument; globals.window = oldWindow; delete globals.__knowledgeNative; });
const flatten = (node: NodeStub): NodeStub[] => [node, ...node.children.flatMap(flatten)];
function find(modal: any, predicate: (node: NodeStub) => boolean) { const node = flatten(modal.contentEl).find(predicate); assert(node, 'Expected native control'); return node; }
const control = (modal: any, label: string) => find(modal, node => node.attrs['aria-label'] === label);
const click = (modal: any, label: string) => find(modal, node => node.tagName === 'button' && node.textContent === label).dispatch('click');
const errorText = (modal: any) => find(modal, node => node.className === 'elw-error').textContent;
async function until(predicate: () => boolean) { for (let i = 0; i < 200 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 2)); assert(predicate(), 'Native async action did not reach expected state'); }
const bytes = (text: string) => new TextEncoder().encode(text);
const plan = () => inspectPrototypeFiles([{ path: 'index.html', bytes: bytes('<html>review</html>') }, { path: 'assets/style.css', bytes: bytes('body { color: red }') }]);
function version(values: Partial<MaterialVersion> = {}): MaterialVersion { return { id: 'V-1', materialId: 'MAT-1', title: 'Prototype', kind: 'prototype', version: 'v1', project: 'P-1', status: 'incoming', summary: 'Frozen source', source: 'Reviewed delivery', provider: 'Designer', sourceUrl: 'https://example.test/v1', requiresNetwork: 'unknown', requiresLogin: 'unknown', previewStatus: 'unknown', reviewIssues: [], createdAt: '2020-01-01T09:00:00Z', lastUpdated: '2020-01-01T09:00:00Z', ...values }; }
function adoption(values: Partial<Adoption> = {}): Adoption { return { id: 'A-1', materialId: 'MAT-1', versionId: 'V-1', project: 'P-1', adoptedAt: '2020-01-02T10:00:00Z', source: 'Explicit reviewed adoption', ...values }; }
function meeting(values: Partial<Meeting> = {}): Meeting { return { id: 'MEET-1', title: 'Review', startAt: '2020-01-01T09:30:00Z', project: 'P-1', participants: ['Designer', 'Engineer'], decisions: [{ id: 'D-1', text: 'Confirmed scope', state: 'confirmed', source: 'Transcript 12:40' }], unresolved: [], actions: [{ id: 'ACT-1', text: 'Validate navigation', owner: 'E-1', due: '2020-01-03', state: 'open' }], materialVersionIds: [], transcript: 'Original words', source: 'Recorded meeting', lastUpdated: '2020-01-01T10:00:00Z', ...values }; }
function mutate(file: FileStub, patch: Record<string, unknown>) { const info = frontmatter(file.content), fm = { ...JSON.parse(info.frontmatter), ...patch }; file.content = `---\n${JSON.stringify(fm)}\n---\n${file.content.slice(info.contentStart)}`; }
function host() {
  const files = new Map<string, FileStub>(), folders = new Set<string>();
  const hooks: { beforeBinary?: (name: string) => Promise<void>; beforeMarkdown?: (name: string) => Promise<void> } = {};
  const binaryWrites: string[] = [], markdownWrites: string[] = [];
  const app = { vault: {
    adapter: new AdapterStub(),
    getAbstractFileByPath: (name: string) => files.get(name) ?? (folders.has(name) ? { path: name } : null),
    getMarkdownFiles: () => [...files.values()].filter(file => file.path.endsWith('.md')),
    createFolder: async (name: string) => { folders.add(name); },
    create: async (name: string, content: string) => { await hooks.beforeMarkdown?.(name); if (files.has(name)) throw new Error('File already exists'); const file = new FileStub(name, content); files.set(name, file); markdownWrites.push(name); return file; },
    createBinary: async (name: string, content: ArrayBuffer) => { await hooks.beforeBinary?.(name); if (files.has(name)) throw new Error('Binary already exists'); const file = new FileStub(name, '', new Uint8Array(content).slice()); files.set(name, file); binaryWrites.push(name); return file; },
    readBinary: async (file: FileStub) => { assert(file.bytes); return file.bytes.slice().buffer; },
    read: async (file: FileStub) => file.content,
    cachedRead: async (file: FileStub) => file.content,
  }, fileManager: { processFrontMatter: async (file: FileStub, action: (value: Record<string, unknown>) => void) => { const info = frontmatter(file.content), fm = JSON.parse(info.frontmatter); action(fm); file.content = `---\n${JSON.stringify(fm)}\n---\n${file.content.slice(info.contentStart)}`; } } };
  const store = new native.VaultStore(app, 'Workbench');
  return { app, store, files, folders, hooks, binaryWrites, markdownWrites };
}
async function knowledgeHost() {
  const environment = host(); await environment.store.create('project', { id: 'P-1', name: 'Test project' });
  const result = { ...environment, data: await environment.store.load() as WorkbenchData, reload: async () => { result.data = await environment.store.load(); }, openFile: () => {}, openTask: () => {} };
  return result;
}
async function captureLocal(environment: ReturnType<typeof host>, patch: Partial<MaterialVersion> = {}) { await environment.store.createMaterial(version({ sourceUrl: undefined, ...patch }), plan(), undefined, 'index.html'); return (await environment.store.load()).materialVersions[0] as MaterialVersion; }

test('native adoption rejects an ABA history change using Adoption identity even when active version returns to A', async () => {
  const h = host(); await h.store.create('material-version', version()); await h.store.create('material-version', version({ id: 'V-2', version: 'v2' })); await h.store.create('adoption', adoption());
  const snapshot = await h.store.load(), target = snapshot.materialVersions.find((item: MaterialVersion) => item.id === 'V-2');
  const token = getLatestAdoption(snapshot, 'MAT-1')!.id;
  await h.store.create('adoption', adoption({ id: 'A-2', versionId: 'V-2', adoptedAt: '2020-01-03' }));
  await h.store.create('adoption', adoption({ id: 'A-3', adoptedAt: '2020-01-04' }));
  await assert.rejects(h.store.adopt(target, token), /已变化/);
  assert.equal((await h.store.load()).adoptions.length, 3);
});
test('native concurrent adoption attempts with the same reviewed token commit exactly once', async () => {
  const h = host(); await h.store.create('material-version', version()); const snapshot = (await h.store.load()).materialVersions[0];
  const results = await Promise.allSettled([h.store.adopt(snapshot, null), h.store.adopt(snapshot, null)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult; assert.match(String(rejected.reason), /已变化/);
  assert.equal((await h.store.load()).adoptions.length, 1);
});
test('native material copies recheck duplicate version ID after asynchronous binary work', async () => {
  const h = host(), input = version({ sourceUrl: undefined }); let injected = false;
  h.hooks.beforeBinary = async () => { if (!injected) { injected = true; await h.store.create('material-version', { ...input, summary: 'Concurrent authoritative record' }); } };
  await assert.rejects(h.store.createMaterial(input, plan(), undefined, 'index.html'), /已存在|不可覆写/);
  const records = (await h.store.load()).materialVersions; assert.equal(records.length, 1); assert.equal(records[0].summary, 'Concurrent authoritative record');
  assert.equal(h.binaryWrites.length, 2); assert.equal(h.markdownWrites.length, 1);
});
test('native concurrent same-ID imports serialize and cannot overwrite either record or copied bytes', async () => {
  const h = host(), input = version({ sourceUrl: undefined });
  const result = await Promise.allSettled([h.store.createMaterial(input, plan(), undefined, 'index.html'), h.store.createMaterial(input, plan(), undefined, 'index.html')]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await h.store.load()).materialVersions.length, 1); assert.equal(h.binaryWrites.length, 2);
});
test('native partial copy failure creates no version record; retry verifies existing bytes and finishes once', async () => {
  const h = host(), input = version({ sourceUrl: undefined }); let calls = 0;
  h.hooks.beforeBinary = async () => { if (++calls === 2) throw new Error('Injected disk-full failure'); };
  await assert.rejects(h.store.createMaterial(input, plan(), undefined, 'index.html'), /保存未完成.*1 个文件.*disk-full/);
  assert.equal((await h.store.load()).materialVersions.length, 0); assert.equal(h.binaryWrites.length, 1);
  h.hooks.beforeBinary = undefined; await h.store.createMaterial(input, plan(), undefined, 'index.html');
  const captured = (await h.store.load()).materialVersions[0]; assert.equal(h.binaryWrites.length, 2); assert.equal(h.markdownWrites.length, 1);
  assert.equal(await h.store.verifyMaterialAssets(captured), captured.entryPath);
});
test('native partial copy retry refuses changed retained bytes instead of overwriting them', async () => {
  const h = host(), input = version({ sourceUrl: undefined }); let calls = 0;
  h.hooks.beforeBinary = async () => { if (++calls === 2) throw new Error('Stop after first file'); };
  await assert.rejects(h.store.createMaterial(input, plan(), undefined, 'index.html'));
  const first = h.files.get(h.binaryWrites[0])!; first.bytes![0] ^= 1; const changed = first.bytes!.slice(); h.hooks.beforeBinary = undefined;
  await assert.rejects(h.store.createMaterial(input, plan(), undefined, 'index.html'), /文件内容冲突/);
  assert.deepEqual(first.bytes, changed); assert.equal((await h.store.load()).materialVersions.length, 0);
});
test('native import interrupted by a root change leaves assets visible but cannot commit metadata under a different root', async () => {
  const h = host(); h.hooks.beforeBinary = async () => { h.store.setRoot('AnotherWorkbench'); };
  await assert.rejects(h.store.createMaterial(version({ sourceUrl: undefined }), plan(), undefined, 'index.html'), /数据目录.*变化/);
  assert.equal(h.markdownWrites.length, 0); assert(h.binaryWrites.every(name => name.startsWith('Workbench/Assets/')));
});
test('native asset verification refuses same-size hash tampering and missing secondary assets', async () => {
  const h = host(), captured = await captureLocal(h); assert.equal(await h.store.verifyMaterialAssets(captured), captured.entryPath);
  const asset = h.files.get(h.binaryWrites[1])!, original = asset.bytes!.slice(); asset.bytes![0] ^= 1;
  await assert.rejects(h.store.verifyMaterialAssets(captured), /文件内容已变化/); asset.bytes = original;
  h.files.delete(asset.path); await assert.rejects(h.store.verifyMaterialAssets(captured), /文件缺失/);
});
test('native asset verification requires a managed root and the exact immutable version manifest', async () => {
  const h = host(), captured = await captureLocal(h), file = h.files.get(captured.path!)!;
  await assert.rejects(h.store.verifyMaterialAssets({ ...captured, summary: 'Stale preview' }), /记录已变化/);
  const outside = 'AnotherWorkbench/Assets/moved'; mutate(file, { packagePath: outside, sourceFile: `${outside}/files/index.html`, entryPath: `${outside}/files/index.html` });
  const forged = (await h.store.load()).materialVersions[0]; await assert.rejects(h.store.verifyMaterialAssets(forged), /本工作台管理的版本目录/);
});
test('native meeting updates preserve Markdown body/custom fields and reject field-only stale changes', async () => {
  const h = host(), body = '# Personal notes\n\nKeep exactly.\n';
  const file = await h.store.create('meeting', { ...meeting(), customTeamField: { preserve: true } }, body);
  let saved = (await h.store.load()).meetings[0] as Meeting;
  await h.store.updateMeeting(saved, { ...saved, title: 'Reviewed title', unresolved: ['Still pending'] });
  let fm = JSON.parse(frontmatter(file.content).frontmatter); assert.deepEqual(fm.customTeamField, { preserve: true }); assert(file.content.endsWith(body));
  saved = (await h.store.load()).meetings[0]; mutate(file, { source: 'Manual change without timestamp' });
  await assert.rejects(h.store.updateMeeting(saved, { ...saved, title: 'Stale replacement' }), /source.*已变化/);
  fm = JSON.parse(frontmatter(file.content).frontmatter); assert.equal(fm.title, 'Reviewed title'); assert.equal(fm.source, 'Manual change without timestamp'); assert(file.content.endsWith(body));
});
test('native material preview Cancel writes nothing and later confirmation saves the captured snapshot', async () => {
  const h = await knowledgeHost(), modal = new native.MaterialModal(h); modal.open();
  control(modal, '名称').value = 'Reviewed title'; control(modal, '提供方').value = 'Designer'; control(modal, '链接').value = 'https://example.test/document';
  const before = h.markdownWrites.length; click(modal, '预览'); const cancelled = opened.at(-1); assert.notEqual(cancelled, modal); assert.equal(h.markdownWrites.length, before);
  click(cancelled, '取消'); assert.equal(h.markdownWrites.length, before); assert.equal(modal.closed, false);
  click(modal, '预览'); const confirmation = opened.at(-1); control(modal, '名称').value = 'Unreviewed later edit';
  click(confirmation, '保存新版本'); await until(() => confirmation.closed);
  assert.equal(h.data.materialVersions!.length, 1); assert.equal(h.data.materialVersions![0].title, 'Reviewed title'); assert.equal(h.data.adoptions!.length, 0);
});
test('native material confirmation recovers from a failed save and retry never duplicates a committed version', async () => {
  const h = await knowledgeHost(), modal = new native.MaterialModal(h); modal.open();
  control(modal, '名称').value = 'Retry delivery'; control(modal, '提供方').value = 'Designer'; control(modal, '链接').value = 'https://example.test/document';
  click(modal, '预览'); const confirmation = opened.at(-1); let fail = true;
  h.hooks.beforeMarkdown = async name => { if (name.includes('/Materials/') && fail) { fail = false; throw new Error('Injected write error'); } };
  click(confirmation, '保存新版本'); await until(() => errorText(confirmation).includes('Injected write error'));
  assert.equal((await h.store.load()).materialVersions.length, 0); assert.equal(confirmation.closed, false);
  click(confirmation, '保存新版本'); await until(() => confirmation.closed);
  assert.equal((await h.store.load()).materialVersions.length, 1);
});
test('native meeting preview Cancel writes nothing; confirmation preserves the reviewed text and explicit decisions', async () => {
  const h = await knowledgeHost(), modal = new native.MeetingModal(h); modal.open();
  control(modal, '主题').value = 'Reviewed meeting'; control(modal, '决策内容').value = 'Confirmed choice'; control(modal, '讨论（未确认）').value = 'Maybe another layout'; control(modal, '原文').value = 'Original transcript';
  click(modal, '预览'); const cancelled = opened.at(-1); click(cancelled, '取消'); assert.equal((await h.store.load()).meetings.length, 0);
  click(modal, '预览'); const confirmed = opened.at(-1); control(modal, '主题').value = 'Later unreviewed edit'; click(confirmed, '保存会议'); await until(() => confirmed.closed);
  const saved = (await h.store.load()).meetings[0]; assert.equal(saved.title, 'Reviewed meeting'); assert.equal(saved.transcript, 'Original transcript'); assert.deepEqual(saved.decisions.map((item: any) => item.state), ['confirmed', 'discussion']); assert.equal(h.data.tasks.length, 0);
});
test('native external file confirmation rechecks asset hashes before any OS open', async () => {
  const h = await knowledgeHost(), captured = await captureLocal(h); await h.reload(); const before = externalPaths.length;
  const previousOpened = opened.length; native.openMaterialSource(h, captured); await until(() => opened.length > previousOpened); const confirmation = opened.at(-1); assert.equal(externalPaths.length, before);
  const first = h.files.get(h.binaryWrites[0])!; first.bytes![0] ^= 1;
  click(confirmation, '打开文件'); await until(() => !!errorText(confirmation));
  assert.equal(externalPaths.length, before); assert.match(errorText(confirmation), /变化/);
});

test('native adoption rejects source tampering and visible duplicate Markdown IDs before writing history', async () => {
  const h = host(), file = await h.store.create('material-version', version()), snapshot = (await h.store.load()).materialVersions[0];
  mutate(file, { source: 'Changed without lastUpdated' }); await assert.rejects(h.store.adopt(snapshot, null), /版本记录已变化/);
  const fresh = (await h.store.load()).materialVersions[0]; const duplicate = new FileStub('Workbench/Materials/duplicate.md', file.content); h.files.set(duplicate.path, duplicate);
  await assert.rejects(h.store.adopt(fresh, null), /重复/); assert.equal((await h.store.load()).adoptions.length, 0);
});
test('native external-open Cancel executes nothing and approved unmodified content opens the exact checked path', async () => {
  const h = await knowledgeHost(), captured = await captureLocal(h), before = externalPaths.length;
  let count = opened.length; native.openMaterialSource(h, captured); await until(() => opened.length > count); click(opened.at(-1), '取消'); assert.equal(externalPaths.length, before);
  count = opened.length; native.openMaterialSource(h, captured); await until(() => opened.length > count); const confirmation = opened.at(-1); click(confirmation, '打开文件'); await until(() => confirmation.closed);
  assert.deepEqual(externalPaths.slice(before), [`/test-vault/${captured.entryPath}`]);
});
test('native external-open rejects symlinks escaping the Vault, crossing versions, or aliasing the entry', async () => {
  const h = await knowledgeHost(), captured = await captureLocal(h), expected = `/test-vault/${captured.entryPath}`, before = externalPaths.length;
  for (const [target, message] of [['/outside/index.html', /超出 Vault/], ['/test-vault/Workbench/Assets/other/files/index.html', /其他版本目录/], [`/test-vault/${captured.packagePath}/files/aliased.html`, /符号链接|路径别名/]] as const) {
    const count = opened.length; native.openMaterialSource(h, captured); await until(() => opened.length > count); const confirmation = opened.at(-1);
    realpaths.set(expected, target); click(confirmation, '打开文件'); await until(() => !!errorText(confirmation));
    assert.match(errorText(confirmation), message); assert.equal(externalPaths.length, before); realpaths.delete(expected); click(confirmation, '取消');
  }
});
test('native asset bytes and source metadata remain unchanged after read-only verification', async () => {
  const h = host(), captured = await captureLocal(h), metadata = h.files.get(captured.path!)!.content;
  const originalBytes = h.binaryWrites.map(name => [name, h.files.get(name)!.bytes!.slice()] as const);
  await h.store.verifyMaterialAssets(captured); await h.store.verifyMaterialAssets(captured);
  assert.equal(h.files.get(captured.path!)!.content, metadata);
  for (const [name, snapshot] of originalBytes) assert.deepEqual(h.files.get(name)!.bytes, snapshot);
  assert.equal(h.markdownWrites.length, 1); assert.equal(h.binaryWrites.length, 2);
});
