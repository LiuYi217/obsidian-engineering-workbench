import { App, TFile, getFrontMatterInfo, normalizePath, parseYaml, stringifyYaml } from 'obsidian';
import { validateManagedRecord, assertFreshTaskFields, MUTABLE_TASK_FIELDS, safeFileName, stableValue } from './record-policy';
import { createMaterialVersion, createAdoption, getAdoptedVersion, getLatestAdoption, knowledgeWarnings } from './knowledge';
import { inspectPrototypeFiles, validateEntry, validateRelativePath, type PrototypePlan, PROTOTYPE_LIMITS } from './prototype-security';
import { emptyWorkbenchData, type WorkbenchData, type Task, type Baseline, type Meeting, type MaterialVersion, type Adoption } from './domain';

export type RecordKind = 'task' | 'project' | 'person' | 'module' | 'decision' | 'baseline' | 'meeting' | 'material-version' | 'adoption';
export type StoredRecord = { id: string; path?: string; [key: string]: unknown };
const collection = { task: 'tasks', project: 'projects', person: 'people', module: 'modules', decision: 'decisions', baseline: 'baselines', meeting: 'meetings', 'material-version': 'materialVersions', adoption: 'adoptions' } as const;
const folders = { task: 'Tasks', project: 'Projects', person: 'People', module: 'Modules', decision: 'Decisions', baseline: 'Baselines', meeting: 'Meetings', 'material-version': 'Materials', adoption: 'Adoptions' };
export const safeRoot = (value: string): string => {
  const root = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!root || root.split('/').some(p => p === '.' || p === '..' || p.startsWith('.')) || /[\x00-\x1f:*?"<>|]/.test(root)) throw new Error('数据目录需为 Vault 内的普通文件夹，不能含 .、..、隐藏目录或特殊字符');
  return normalizePath(root);
};


export class VaultStore {
  warnings: string[] = [];
  private duplicateRecords=false;
  private writeQueue:Promise<unknown>=Promise.resolve();
  private serial<T>(work:()=>Promise<T>):Promise<T>{const operation=this.writeQueue.then(work);this.writeQueue=operation.catch(()=>undefined);return operation;}
  assetRoot(id:string){return `${this.root}/Assets/${safeFileName(id)}`;}

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
    const result = emptyWorkbenchData(); this.warnings = []; this.duplicateRecords=false;
    for (const file of this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(`${this.root}/`) && !f.path.startsWith(`${this.root}/Assets/`))) {
      try {
        const text = await this.app.vault.cachedRead(file);
        const info = getFrontMatterInfo(text);
        if (!info.exists) continue;
        const fm = parseYaml(info.frontmatter) as Record<string, unknown> | undefined;
        if (!fm || typeof fm !== 'object') continue;
        const kind = fm.workbench as RecordKind;
        if (!Object.prototype.hasOwnProperty.call(collection, kind)) continue;
        if (typeof fm.id !== 'string' || !fm.id.trim()) { this.warnings.push(`${file.path}：缺少字符串 id`); continue; }
        const records = result[collection[kind]] as unknown as StoredRecord[];
        if (records.some(record => record.id === fm.id)) { this.duplicateRecords=true; this.warnings.push(`${file.path}：重复 ${kind} ID ${fm.id}，请合并重复记录；当前不读取此文件`); continue; }
        const record = { ...fm, path: file.path } as StoredRecord; delete record.workbench;
        const errors = validateManagedRecord(kind, record);
        if (errors.length) throw new Error(errors.join('; '));
        records.push(record);
      } catch (error) { this.warnings.push(`${file.path}：${error instanceof Error ? error.message : String(error)}`); }
    }
    this.warnings.push(...knowledgeWarnings(result));
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
  async updateMeeting(meeting: Meeting, changes: Meeting): Promise<void> {
    const errors = validateManagedRecord('meeting', changes as unknown as Record<string, unknown>);
    if (errors.length) throw new Error(errors.join('; '));
    if (!meeting.path || !meeting.path.startsWith(`${this.root}/`) || meeting.path.startsWith(`${this.root}/Assets/`)) throw new Error('会议记录不在当前目录');
    const file = this.app.vault.getAbstractFileByPath(meeting.path);
    if (!(file instanceof TFile)) throw new Error('会议记录已移动，请刷新');
    const keys = ['title','startAt','project','participants','module','iteration','decisions','unresolved','actions','materialVersionIds','recordingUrl','transcriptUrl','transcript','source','lastUpdated'] as const;
    await this.app.fileManager.processFrontMatter(file, fm => {
      if (fm.workbench !== 'meeting' || fm.id !== meeting.id) throw new Error('会议身份已变化');
      for (const key of keys) if (stableValue(fm[key]) !== stableValue(meeting[key])) throw new Error(`会议字段 ${key} 已变化，请重新确认`);
      for (const key of keys) { if (changes[key] === undefined) delete fm[key]; else fm[key] = changes[key]; }
      fm.lastUpdated = new Date().toISOString();
    });
  }
  async adopt(version: MaterialVersion, expectedAdoptionId: string | null): Promise<TFile> {return this.serial(async()=>{
    const data = await this.load();
    const current = getLatestAdoption(data, version.materialId, version.project);
    if(this.duplicateRecords)throw new Error('存在重复记录，请先处理后再采纳');
    if ((current?.id ?? null) !== expectedAdoptionId) throw new Error('当前采纳版本已变化，请重新确认');
    const fresh = data.materialVersions?.find(item => item.id === version.id);
    if (!fresh || stableValue({...fresh, path:undefined}) !== stableValue({...version, path:undefined})) throw new Error('版本记录已变化，请重新确认');
    const adoption: Adoption = createAdoption(data, { id: `adoption-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, materialId: version.materialId, versionId: version.id, project: version.project, adoptedAt: new Date().toISOString(), source: `人工确认采纳 ${version.id}` });
    return this.create('adoption', adoption, '# 版本采纳记录\n\n仅影响默认采纳版本，不修改任何任务或会议的固定引用。\n');
    });
  }
  async createMaterial(version: MaterialVersion, plan?: PrototypePlan, original?: {name:string;bytes:Uint8Array}, entry?: string): Promise<TFile> {
    version=JSON.parse(JSON.stringify(version)) as MaterialVersion;plan=plan?inspectPrototypeFiles(plan.files,plan.directories):undefined;original=original?{name:original.name,bytes:original.bytes.slice()}:undefined;
    return this.serial(async()=>{
    const root = this.root;
    const data = await this.load();
    // Revalidate a copied byte plan at the write boundary; previews never write.
    const checked = plan ? inspectPrototypeFiles(plan.files,plan.directories) : undefined;
    const packagePath = this.assetRoot(version.id);
    const files: {path:string;size:number;sha256:string}[] = [];
    if (checked) for (const file of checked.files) {
      const digest = await crypto.subtle.digest('SHA-256', file.bytes.slice().buffer as ArrayBuffer);
      files.push({path:file.path,size:file.bytes.byteLength,sha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')});
    }
    const selectedEntry = checked && version.kind === 'prototype' ? validateEntry(checked, entry || '') : undefined;
    const originalName = original ? validateRelativePath(original.name) : undefined;
    if (originalName?.includes('/')) throw new Error('原始包文件名不能含目录');
    const candidate: MaterialVersion = {...version, ...(checked ? {packagePath, files, sourceFile: originalName ? `${packagePath}/original/${originalName}` : `${packagePath}/files/${checked.files[0].path}`, ...(selectedEntry ? {entryPath:`${packagePath}/files/${selectedEntry}`} : {})} : {})};
    const snapshot = createMaterialVersion(data, candidate);
    const put = async (path: string, bytes: Uint8Array) => {
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing) {
        if (!(existing instanceof TFile)) throw new Error(`文件路径冲突：${path}`);
        const old = new Uint8Array(await this.app.vault.readBinary(existing));
        if (old.length !== bytes.length || old.some((v,i)=>v!==bytes[i])) throw new Error(`文件内容冲突：${path}，未覆盖`);
        return;
      }
      await this.ensureFolder(path.slice(0,path.lastIndexOf('/')));
      await this.app.vault.createBinary(path, bytes.slice().buffer as ArrayBuffer);
    };
    if(original&&(!/\.zip$/i.test(originalName||'')||original.bytes.byteLength>20*1024*1024))throw new Error('原始ZIP包无效或超过20MB');
    let copied=0;try{
    if(checked)for(const directory of checked.directories)await this.ensureFolder(`${packagePath}/files/${directory}`);
    if (original && originalName) await put(`${packagePath}/original/${originalName}`, original.bytes);
    if (checked) for (const file of checked.files){await put(`${packagePath}/files/${file.path}`, file.bytes);copied++;}
    if (root !== this.root) throw new Error('数据目录在保存期间发生变化；已复制文件保留，请检查后重试');
    createMaterialVersion(await this.load(),candidate);
    return await this.create('material-version', snapshot, '# 资料版本\n\n此记录只新增，不覆盖。采纳记录与任务引用分别保存。\n');
    }catch(error){throw new Error(`保存未完成，已核对/复制 ${copied} 个文件；已有文件保留，重试会核对内容而不覆盖。${error instanceof Error?error.message:String(error)}`);}
    });
  }
  async verifyMaterialAssets(version:MaterialVersion):Promise<string|undefined>{
    const data=await this.load();const current=data.materialVersions?.find(v=>v.id===version.id);
    if(this.duplicateRecords||!current||stableValue({...current,path:undefined})!==stableValue({...version,path:undefined}))throw new Error('版本记录已变化或重复，请刷新后重新确认');
    if(version.sourceUrl)return undefined;
    const root=this.assetRoot(version.id);
    if(version.packagePath!==root||!version.files?.length)throw new Error('文件不在本工作台管理的版本目录内');
    if(version.files.length>PROTOTYPE_LIMITS.maxFiles||version.files.reduce((sum,item)=>sum+item.size,0)>PROTOTYPE_LIMITS.maxTotalBytes||version.files.some(item=>item.size>PROTOTYPE_LIMITS.maxFileBytes))throw new Error('版本文件清单超过安全读取限制');
    for(const item of version.files){const relative=validateRelativePath(item.path),path=`${root}/files/${relative}`;const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw new Error(`文件缺失：${relative}`);if(file.stat&&file.stat.size!==item.size)throw new Error(`文件大小已变化：${relative}`);const bytes=await this.app.vault.readBinary(file);if(bytes.byteLength!==item.size||!item.sha256)throw new Error(`文件发生变化或缺少校验：${relative}`);const digest=await crypto.subtle.digest('SHA-256',bytes);const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');if(hash!==item.sha256)throw new Error(`文件内容已变化：${relative}，请导入为新版本后重新确认`);}
    const path=version.kind==='prototype'?version.entryPath:version.sourceFile;
    if(!path||!version.files.some(item=>path===`${root}/files/${item.path}`))throw new Error('打开入口不属于该版本文件清单');
    return path;
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
