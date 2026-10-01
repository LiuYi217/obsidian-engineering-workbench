import { App, TFile, getFrontMatterInfo, normalizePath, parseYaml, stringifyYaml } from 'obsidian';
import { validateManagedRecord, assertFreshTaskFields, MUTABLE_TASK_FIELDS, safeFileName } from './record-policy';
import { emptyWorkbenchData, type WorkbenchData, type Task, type Baseline } from './domain';

export type RecordKind = 'task' | 'project' | 'person' | 'module' | 'decision' | 'baseline';
export type StoredRecord = { id: string; path?: string; [key: string]: unknown };
const collection = { task: 'tasks', project: 'projects', person: 'people', module: 'modules', decision: 'decisions', baseline: 'baselines' } as const;
const folders = { task: 'Tasks', project: 'Projects', person: 'People', module: 'Modules', decision: 'Decisions', baseline: 'Baselines' };
export const safeRoot = (value: string): string => {
  const root = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!root || root.split('/').some(p => p === '.' || p === '..' || p.startsWith('.')) || /[\x00-\x1f:*?"<>|]/.test(root)) throw new Error('数据目录需为 Vault 内的普通文件夹，不能含 .、..、隐藏目录或特殊字符');
  return normalizePath(root);
};


export class VaultStore {
  warnings: string[] = [];
  constructor(private app: App, private root: string) { this.root = safeRoot(root); }
  setRoot(root: string) { this.root = safeRoot(root); }
  async ensureFolder(path: string): Promise<void> {
    const parts = normalizePath(path).split('/');
    for (let i = 1; i <= parts.length; i++) {
      const current = parts.slice(0, i).join('/');
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
  async load(): Promise<WorkbenchData> {
    const result = emptyWorkbenchData(); this.warnings = [];
    for (const file of this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(`${this.root}/`))) {
      try {
        const text = await this.app.vault.cachedRead(file);
        const info = getFrontMatterInfo(text);
        if (!info.exists) continue;
        const fm = parseYaml(info.frontmatter) as Record<string, unknown> | undefined;
        if (!fm || typeof fm !== 'object') continue;
        const kind = fm.workbench as RecordKind;
        if (!(kind in collection)) continue;
        if (typeof fm.id !== 'string' || !fm.id.trim()) { this.warnings.push(`${file.path}：缺少字符串 id`); continue; }
        const records = result[collection[kind]] as unknown as StoredRecord[];
        if (records.some(record => record.id === fm.id)) { this.warnings.push(`${file.path}：重复 ${kind} ID ${fm.id}，请合并重复记录；当前不读取此文件`); continue; }
        const record = { ...fm, path: file.path } as StoredRecord; delete record.workbench;
        const errors = validateManagedRecord(kind, record);
        if (errors.length) throw new Error(errors.join('; '));
        records.push(record);
      } catch (error) { this.warnings.push(`${file.path}：${error instanceof Error ? error.message : String(error)}`); }
    }
    return result;
  }
  async create(kind: RecordKind, record: object, body = ''): Promise<TFile> {
    const value = { ...record } as StoredRecord; delete value.path;
    const errors = validateManagedRecord(kind, value); if (errors.length) throw new Error(errors.join('; '));
    const folder = `${this.root}/${folders[kind]}`; await this.ensureFolder(folder);
    const path = `${folder}/${safeFileName(value.id)}.md`;
    if (this.app.vault.getAbstractFileByPath(path)) throw new Error(`${value.id} 已存在，未覆盖原文件`);
    return this.app.vault.create(path, `---\n${stringifyYaml({ workbench: kind, ...value })}---\n\n${body || `# ${String(value.title || value.name || value.id)}\n\n在此保留你的正文、会议记录与上下文。工作台只更新已确认的属性。\n`}`);
  }
  async preflightTask(task: Task, changes: Partial<Task>): Promise<void> {
    if (!task.path || !task.path.startsWith(`${this.root}/`)) throw new Error('任务来源不在当前目录中');
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) throw new Error('原文件已移动或不存在');
    const info = getFrontMatterInfo(await this.app.vault.read(file));
    const fm = parseYaml(info.frontmatter) as Record<string, unknown>;
    if (fm.id !== task.id || fm.workbench !== 'task' || fm.lastUpdated !== task.lastUpdated) throw new Error('任务已在别处修改，请刷新后再确认');
    assertFreshTaskFields(fm, task as unknown as Record<string, unknown>, changes as Record<string, unknown>);
  }
  async updateTask(task: Task, changes: Partial<Task>): Promise<void> {
    const path = (task as Task & { path?: string }).path;
    if (!path || !path.startsWith(`${this.root}/`)) throw new Error('任务来源不在当前工作台目录中');
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error('原文件已移动或不存在，请刷新');
    await this.app.fileManager.processFrontMatter(file, fm => {
      if (fm.id !== task.id || fm.workbench !== 'task') throw new Error('文件身份已变化，请刷新');
      if (fm.lastUpdated !== task.lastUpdated) throw new Error('任务已在别处更新，请刷新后再确认');
      assertFreshTaskFields(fm, task as unknown as Record<string, unknown>, changes as Record<string, unknown>);
      for (const [key, value] of Object.entries(changes)) {
        if (!MUTABLE_TASK_FIELDS.has(key)) continue;
        if (value === undefined) delete fm[key]; else fm[key] = value;
      }
      fm.lastUpdated = new Date().toISOString();
    });
  }
  async createBaseline(baseline: Baseline): Promise<TFile> { return this.create('baseline', baseline, '# 冻结的周计划基线\n\n此文件由用户确认后创建。工作台不会修改此基线；后续变化显示为新增或偏差。\n'); }
  async saveReport(title: string, markdown: string): Promise<TFile> {
    const folder = `${this.root}/Reports`; await this.ensureFolder(folder);
    let path = `${folder}/${title}.md`; let n = 2;
    while (this.app.vault.getAbstractFileByPath(path)) path = `${folder}/${title}-${n++}.md`;
    return this.app.vault.create(path, markdown);
  }
  async writeInbox(text: string): Promise<TFile> {
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const folder = `${this.root}/Inbox`; await this.ensureFolder(folder);
    return this.app.vault.create(`${folder}/${date}.md`, `---\nworkbench: inbox\ncreatedAt: ${new Date().toISOString()}\nsource: manual-progress-review\n---\n\n# 待确认的进展\n\n未自动匹配或未确认的内容，不计入事实、负荷或完成率。\n\n${text}\n`);
  }
}
