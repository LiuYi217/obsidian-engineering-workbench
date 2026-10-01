import { calculateCapacity, calculateLoad, taskExecutors, type Task, type MaterialVersion } from './domain';
import { buildPersonWorkGroups, type PersonWorkGroup } from './people-work';
import type { UIState, UIActions } from './ui';
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text?:string)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const button=(text:string,action:()=>void,cls='elw-text-button')=>{const b=el('button',cls,text);b.type='button';b.addEventListener('click',action);return b;};
const hours=(value:number|null)=>value===null?'未知':`${Math.round(value*10)/10}h`;
const badge=(text:string,cls='')=>el('span',`elw-badge ${cls}`,text);

export function renderPeopleWork(parent:HTMLElement,s:UIState,a:UIActions,statusLabels:Record<string,string>):void{
 const data=s.data,people=[...data.people];for(const task of data.tasks)for(const id of taskExecutors(task))if(!people.some(p=>p.id===id))people.push({id,name:id||'未分配'});
 const row=el('div','elw-section-title');row.append(el('h2','','当前工作'),badge('跨项目'),button('+ 人员',()=>a.createRecord('person')));parent.append(row);
 const list=el('div','elw-people-work-list');let count=0;
 const query=s.search.trim().toLocaleLowerCase();
 for(const person of people){
  const allGroups=buildPersonWorkGroups(data,person.id,s.settings.closureStatus);
  const matchesPerson=[person.id,person.name].join(' ').toLocaleLowerCase().includes(query);
  const groups=allGroups.filter(g=>!s.project||g.project===s.project).map(group=>{
   const matchesGroup=[group.title,group.requirementId,group.project].join(' ').toLocaleLowerCase().includes(query);
   const match=(task:Task)=>!query||matchesPerson||matchesGroup||[task.id,task.title,task.module,task.nextAction,task.risk,task.blocker,...taskExecutors(task)].join(' ').toLocaleLowerCase().includes(query);
   return {...group,currentTasks:group.currentTasks.filter(match),closedTasks:group.closedTasks.filter(match)};
  }).filter(g=>g.currentTasks.length||g.closedTasks.length);
  if((s.project||query)&&!groups.length&&!(query&&matchesPerson&&!s.project))continue;
  count++;
  const current=groups.flatMap(g=>g.currentTasks),closed=groups.flatMap(g=>g.closedTasks);
  const cap=calculateCapacity(person,s.period,s.settings.calendar),load=calculateLoad(data.tasks,person.id,s.period,person.calendar||s.settings.calendar,s.settings.closureStatus);
  const card=el('article','elw-panel elw-person elw-person-work');card.setAttribute('aria-label',`${person.name}的工作`);
  const head=el('div','elw-person-head'),identity=el('div','elw-person-identity');identity.append(el('h3','',person.name),el('span','elw-muted',`${current.length} 项当前工作`));head.append(el('div','elw-avatar',person.name.slice(-1)),identity);
  if(cap.availableHours===null)head.append(badge('容量未知'));else if(load.allocatedHours>cap.availableHours)head.append(badge('超出容量','is-alert'));
  card.append(head);
  if(current.length)for(const group of groups.filter(g=>g.currentTasks.length))renderGroup(card,group,group.currentTasks,s,a,statusLabels);
  else card.append(el('p','elw-no-current',s.project||query?'暂无匹配当前工作':'暂无当前工作'));
  if(closed.length){const history=el('details','elw-work-history');history.append(el('summary','',`已闭环 / 已取消 ${closed.length}`));for(const group of groups.filter(g=>g.closedTasks.length))renderGroup(history,group,group.closedTasks,s,a,statusLabels);card.append(history);}
  const capacity=el('details','elw-person-capacity');capacity.append(el('summary','',`本期容量 · 已排 ${hours(load.allocatedHours)} / 可用 ${hours(cap.availableHours)}`));
  let availability:string;
  if(load.uncertainTaskIds.length)availability=`${load.uncertainTaskIds.length} 项投入待确认，余量未知`;
  else if(load.unallocatedTaskIds.length)availability=`${load.unallocatedTaskIds.length} 项未分配本期投入，余量待确认`;
  else if(cap.availableHours===null)availability='可接新任务时间未知';
  else availability=cap.availableHours>load.allocatedHours?`预计余量 ${hours(cap.availableHours-load.allocatedHours)}`:'本期无余量';
  const attention=load.uncertainTaskIds.length||load.unallocatedTaskIds.length||cap.availableHours===null;
  if(attention)card.append(el('p','elw-capacity-status elw-danger',availability));else capacity.append(el('p','elw-capacity-status',availability));
  capacity.append(el('p','elw-muted',`${s.period.start} → ${s.period.end} · ${cap.workingDays} 个工作日`));
  if(cap.availableHours!==null)capacity.append(el('p','elw-muted',`基础 ${hours(cap.grossHours)} · 请假 ${hours(cap.leaveHours)} · 会议 ${hours(cap.meetingsHours)} · 支持 ${hours(cap.supportHours)} · 缓冲 ${hours(cap.bufferHours)}`));
  cap.warnings.forEach(w=>capacity.append(el('p','elw-danger',w)));
  const owns=data.modules.filter(m=>m.owner===person.id);if(owns.length)capacity.append(el('p','elw-muted',`负责 ${owns.map(m=>m.name).join('、')}`));
  if(person.path)capacity.append(button(cap.status==='unknown'?'补充容量 ↗':'编辑容量 ↗',()=>a.open(person.path)));
  card.append(capacity);list.append(card);
 }
 if(!count)list.append(el('div','elw-empty','暂无匹配人员或工作项'));
 parent.append(list);
}
function renderGroup(parent:HTMLElement,group:PersonWorkGroup,tasks:Task[],s:UIState,a:UIActions,statusLabels:Record<string,string>):void{
 const box=el('section','elw-work-group');box.dataset.requirement=group.requirementId||'';box.dataset.project=group.project;
 const heading=el('div','elw-work-group-heading'),project=s.data.projects.find(p=>p.id===group.project)?.name||group.project||'未归属';
 const title=el('h4');if(group.parentTask)title.append(button(group.title,()=>a.task(group.parentTask!)));else title.textContent=group.title;
 heading.append(title,el('span','elw-group-project',project));if(group.sourceUrl){const source=button('来源 ↗',()=>a.source(group.sourceUrl!));source.setAttribute('aria-label',`打开需求来源 ${group.title}`);heading.append(source);}box.append(heading);
 const links=el('div','elw-group-links');
 for(const meeting of group.meetings)links.append(button(`会议 · ${meeting.title}`,()=>a.meeting(meeting),'elw-link-chip'));
 const versions=new Set<string>();
 const addVersion=(v:MaterialVersion,context=false)=>{if(versions.has(v.id))return;versions.add(v.id);const item=el('span','elw-version-chip');const label=`${context?'会议资料 · ':''}${v.kind==='prototype'?'原型':'文档'} · ${v.title} · ${v.version}`;item.append(button(label,()=>a.material(v),'elw-link-chip'));const open=button('↗',()=>a.openMaterial(v),'elw-link-open');open.setAttribute('aria-label',`打开 ${v.title} ${v.version}`);item.append(open);links.append(item);};
 group.materialVersions.forEach(v=>addVersion(v));
 group.meetingMaterialVersions.forEach(item=>addVersion(item.version,true));
 if(links.childElementCount)box.append(links);
 const rows=el('div','elw-work-items');for(const task of tasks){const line=el('div','elw-person-task'),title=button(task.title,()=>a.task(task));title.title=`${task.id}\n来源：${task.source}\n更新：${task.lastUpdated}`;line.append(title,badge(statusLabels[task.status]||task.status,`is-${task.status}`));const meta=el('span','elw-work-task-meta',`${task.forecastDue||'未排期'} · ${task.remainingHours===null?'工时未知':hours(task.remainingHours)}`);line.append(meta);if(task.blocker)line.append(el('span','elw-work-blocker',task.blocker));rows.append(line);}box.append(rows);
 if(group.warnings.length){const warning=el('details','elw-group-warning');warning.append(el('summary','',`${group.warnings.length} 处关联待核对`));group.warnings.forEach(w=>warning.append(el('p','',w)));box.append(warning);}
 parent.append(box);
}
