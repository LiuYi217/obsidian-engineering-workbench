import { TASK_STATUSES, isValidDate, isValidTimestamp, calculateCapacity, workingDays, type Period, type Person } from './domain';
import { validateTaskRecord } from './importer';
import { validateMaterialVersion, validateAdoption, validateMeeting } from './knowledge';
export type RecordKind = 'task'|'project'|'person'|'module'|'decision'|'baseline'|'material-version'|'adoption'|'meeting';
const object=(v:unknown):v is Record<string,unknown> => v!==null&&typeof v==='object'&&!Array.isArray(v);
export function stableValue(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(stableValue).join(',')}]`;
 if(object(value))return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableValue(value[k])}`).join(',')}}`;
 return JSON.stringify(value)??'undefined';
}
export function safeFileName(id:string):string{
 let hash=2166136261;for(const char of id){hash^=char.codePointAt(0)||0;hash=Math.imul(hash,16777619);}
 return `${encodeURIComponent(id).replace(/[!']/g,'_').slice(0,110)}-${(hash>>>0).toString(36)}`;
}
/** Reject malformed managed records at the Vault boundary; unrelated frontmatter is untouched. */
export function validateManagedRecord(kind:RecordKind,record:Record<string,unknown>):string[]{
 if(kind==='material-version')return validateMaterialVersion(record);
 if(kind==='adoption')return validateAdoption(record);
 if(kind==='meeting')return validateMeeting(record);
 const errors:string[]=[];const text=(key:string,required=false)=>{if((required||record[key]!==undefined)&&typeof record[key]!=='string')errors.push(`${key} 必须为字符串`);};
 text('id',true);if(typeof record.id==='string'&&!record.id.trim())errors.push('id 不能为空');
 if(kind==='task'){const issues=validateTaskRecord(record).errors.map(e=>`${e.field}: ${e.message}`);for(const key of ['originalStart','originalDue','forecastDue'])if(record[key]!==''&&!isValidDate(record[key]))issues.push(`${key} 必须为规范 ISO 日期`);if(!isValidTimestamp(record.lastUpdated))issues.push('lastUpdated 必须为规范 ISO 时间');if(!TASK_STATUSES.includes(record.status as never))issues.push('status 必须为规范状态值');if(record.remainingHours!==null&&typeof record.remainingHours!=='number')issues.push('remainingHours 必须为数字或 null（未知）');for(const key of ['meetingIds','materialVersionIds','executors'])if(record[key]!==undefined&&(!Array.isArray(record[key])||(record[key] as unknown[]).some(id=>typeof id!=='string'||id!==id.trim())))issues.push(`${key} 必须为规范 ID 数组`);for(const key of ['requirementId','requirementTitle','requirementSourceUrl'])if(record[key]!==undefined&&(typeof record[key]!=='string'||record[key]!==String(record[key]).trim()||!record[key]))issues.push(`${key} 必须为非空规范字符串`);if(!Array.isArray(record.dependencies))issues.push('dependencies 必须为数组');if(!Array.isArray(record.allocations))issues.push('allocations 必须为数组');else for(const item of record.allocations)if(!object(item)||typeof item.hours!=='number')issues.push('allocation.hours 必须为数字');return issues;}
 if(['project','person','module'].includes(kind))text('name',true);
 for(const key of ['source','owner','description'])text(key);
 if(kind==='project'&&record.targetDate!==undefined&&!isValidDate(record.targetDate))errors.push('targetDate 需为有效 ISO 日期');
 if(kind==='project'&&record.milestones!==undefined){if(!Array.isArray(record.milestones))errors.push('milestones 需为数组');else for(const m of record.milestones)if(!object(m)||typeof m.id!=='string'||typeof m.title!=='string'||!isValidDate(m.date)||(m.status!==undefined&&!['planned','completed'].includes(String(m.status)))||(m.source!==undefined&&typeof m.source!=='string'))errors.push('里程碑必须包含 id、title、date 和可选 planned/completed 状态');}
 if(kind==='module')text('project',true);
 if(kind==='person'){
  try{if(record.calendar!==undefined){if(!object(record.calendar))throw new Error('calendar 需为对象');workingDays('2026-10-01','2026-10-07',record.calendar as unknown as Person['calendar']);}
  if(record.capacity!==undefined){if(!object(record.capacity))throw new Error('capacity 需为对象');const capacity=record.capacity;for(const field of ['hoursPerDay','weeklyHours'])if(capacity[field]!==undefined&&(typeof capacity[field]!=='number'||!Number.isFinite(capacity[field])||Number(capacity[field])<0))throw new Error(`${field} 需为非负有限数字`);for(const field of ['leave','meetings','support','buffer'])if(capacity[field]!==undefined){if(!Array.isArray(capacity[field]))throw new Error(`${field} 需为数组`);for(const allocation of capacity[field]){if(!object(allocation)||!isValidDate(allocation.periodStart)||!isValidDate(allocation.periodEnd)||String(allocation.periodStart)>String(allocation.periodEnd)||typeof allocation.hours!=='number'||!Number.isFinite(allocation.hours)||allocation.hours<0)throw new Error(`${field} 含无效周期扣减`);}}calculateCapacity(record as unknown as Person,{start:'2026-10-01',end:'2026-10-07'});}
  }catch(e){errors.push(e instanceof Error?e.message:String(e));}
 }
 if(kind==='decision'){for(const key of ['title','owner','decision','source'])text(key,true);if(!isValidDate(record.date))errors.push('决策 date 需为有效 ISO 日期');if(record.taskIds!==undefined&&(!Array.isArray(record.taskIds)||record.taskIds.some(x=>typeof x!=='string')))errors.push('taskIds 需为字符串数组');}
 if(kind==='baseline'){
  text('name',true);if(record.schemaVersion!==1)errors.push('基线 schemaVersion 需为 1');if(!isValidTimestamp(record.createdAt))errors.push('基线 createdAt 需为 ISO 时间');
  if(record.period!==undefined){const p=record.period as Period;if(!object(p)||!isValidDate(p.start)||!isValidDate(p.end)||p.start>p.end)errors.push('基线 period 无效');}
  if(!Array.isArray(record.tasks))errors.push('基线 tasks 需为数组');else{const ids=new Set<string>();for(const t of record.tasks){const r=validateTaskRecord(t);errors.push(...(object(t)?validateManagedRecord('task',t):['任务必须为对象']).map(e=>`基线任务 ${e}`));if(r.task){if(ids.has(r.task.id))errors.push(`基线重复任务 ${r.task.id}`);ids.add(r.task.id);}}}
 }
 return errors;
}
export const MUTABLE_TASK_FIELDS=new Set(['title','project','module','executor','status','forecastDue','remainingHours','allocations','dependencies','nextAction','source','risk','blocker','contact','coordinationDue','facts','forecasts','judgments','meetingIds','materialVersionIds','executors','requirementId','requirementTitle','requirementSourceUrl']);
/** Compare every changed field against the preview snapshot, not just user-managed timestamps. */
export function assertFreshTaskFields(current:Record<string,unknown>,snapshot:Record<string,unknown>,changes:Record<string,unknown>):void{
 for(const key of Object.keys(changes)){if(MUTABLE_TASK_FIELDS.has(key)&&stableValue(current[key])!==stableValue(snapshot[key]))throw new Error(`字段 ${key} 已在别处更新，请刷新后重新确认`);}
}
