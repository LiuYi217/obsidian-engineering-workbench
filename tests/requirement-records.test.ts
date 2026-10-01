import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkbenchFixture } from './fixtures/workbench';
import { CSV_COLUMNS, previewImport, validateTaskRecord } from '../src/importer';
import { validateManagedRecord, assertFreshTaskFields, MUTABLE_TASK_FIELDS } from '../src/record-policy';
import { compareBaseline, generateBaseline } from '../src/domain';
const task=()=>({...makeWorkbenchFixture('2026-10-01').tasks[1],id:'fixture-child',requirementId:'fixture-parent',requirementTitle:'合成父需求',requirementSourceUrl:'https://example.com/requirements/fixture-parent'});
test('verified external requirement identity, title and source survive JSON and CSV import',()=>{
 const row=task();assert.deepEqual(validateTaskRecord(row).task,row);assert.deepEqual(validateManagedRecord('task',row),[]);
 const cell=(v:unknown)=>'"'+String(Array.isArray(v)?JSON.stringify(v):v??'').replace(/"/g,'""')+'"';
 const csv=CSV_COLUMNS.join(',')+'\n'+CSV_COLUMNS.map(k=>cell(row[k as keyof typeof row])).join(',');const imported=previewImport(csv,'csv');assert.deepEqual(imported.errors,[]);assert.equal(imported.tasks[0].requirementId,row.requirementId);assert.equal(imported.tasks[0].requirementTitle,row.requirementTitle);assert.equal(imported.tasks[0].requirementSourceUrl,row.requirementSourceUrl);
});
test('requirement metadata needs a valid ID; title-only, unsafe URLs and malformed canonical records fail',()=>{
 for(const patch of [{requirementId:'bad/id'},{requirementId:undefined},{requirementId:5},{requirementTitle:{}},{requirementSourceUrl:'javascript:alert(1)'},{requirementSourceUrl:'https://name:secret@example.com'},{requirementSourceUrl:'file:///tmp/item'}])assert(validateTaskRecord({...task(),...patch}).errors.length>0);
 assert(validateManagedRecord('task',{...task(),requirementId:' fixture-parent '}).length>0);
 const legacy=task();delete (legacy as Partial<typeof legacy>).requirementId;delete (legacy as Partial<typeof legacy>).requirementTitle;delete (legacy as Partial<typeof legacy>).requirementSourceUrl;assert.deepEqual(validateManagedRecord('task',legacy),[]);
});
test('group metadata changes are explicit import conflicts, immutable baseline changes and stale-write checks',()=>{
 const before=task(),after={...before,requirementId:'fixture-other'};assert.equal(previewImport(JSON.stringify([after]),'json',[before]).canApply,false);
 const baseline=generateBaseline([before],{id:'fixture-baseline',name:'fixture',createdAt:'2026-10-01'});const comparison=compareBaseline(baseline,[after]);assert(comparison.changes[0].fields.some(x=>x.field==='requirementId'));assert.equal(baseline.tasks[0].requirementId,'fixture-parent');
 for(const field of ['requirementId','requirementTitle','requirementSourceUrl']){assert(MUTABLE_TASK_FIELDS.has(field));assert.throws(()=>assertFreshTaskFields({...before,[field]:'changed'},before,{[field]:undefined}),/已在别处更新/);}
});
