import test from 'node:test';
import assert from 'node:assert/strict';
import { previewImport } from '../src/importer';
import { validateManagedRecord } from '../src/record-policy';
import { calculateLoad, detectExceptions, compareBaseline, generateBaseline, taskExecutors, type Task } from '../src/domain';

const unscheduled: Task = { id:'synthetic-story-123', title:'未排期需求', project:'synthetic-project', module:'synthetic-module', executor:'person-a', executors:['person-a','person-b'], status:'in-progress', originalStart:'', originalDue:'', forecastDue:'', remainingHours:null, allocations:[], dependencies:[], nextAction:'', source:'TAPD', lastUpdated:'2026-10-01' };
test('TAPD unknown schedule/effort is preserved and never creates dates or zero effort',()=>{
 const preview=previewImport(JSON.stringify([unscheduled]),'json');
 assert.deepEqual(preview.errors,[]); assert.deepEqual(preview.tasks,[unscheduled]);
 assert.deepEqual(validateManagedRecord('task',unscheduled as unknown as Record<string,unknown>),[]);
 assert.deepEqual(taskExecutors(unscheduled),['person-a','person-b']);
 const period={start:'2026-10-01',end:'2026-10-07'};
 assert.equal(calculateLoad([unscheduled],'person-a',period).allocatedHours,0);
 assert.deepEqual(calculateLoad([unscheduled],'person-a',period).taskIds,[]);
 assert.equal(detectExceptions([unscheduled],{today:'2026-10-01',period}).filter(x=>x.kind==='overdue').length,0);
 const baseline=generateBaseline([unscheduled],{id:'b1',name:'snapshot',createdAt:'2026-10-01'});
 const diff=compareBaseline(baseline,[{...unscheduled,forecastDue:'2026-10-07'}]);
 assert.equal(diff.slipped,0); assert.equal(diff.changes[0].slipDays,undefined);
});
test('malformed nonempty dates, negative effort, and invalid co-assignees remain errors',()=>{
 for (const change of [{originalDue:'2026-02-30'},{remainingHours:-1},{executors:['bad/id']}])
  assert.ok(previewImport(JSON.stringify([{...unscheduled,...change}]),'json').errors.length>0);
});
test('shared assignees do not duplicate the primary executor allocation',()=>{
 const scheduled={...unscheduled,originalStart:'2026-10-01',originalDue:'2026-10-07',forecastDue:'2026-10-07',remainingHours:8,allocations:[{periodStart:'2026-10-01',periodEnd:'2026-10-07',hours:8}]};
 const period={start:'2026-10-01',end:'2026-10-07'};
 assert.equal(calculateLoad([scheduled],'person-a',period).allocatedHours,8);
 assert.equal(calculateLoad([scheduled],'person-b',period).allocatedHours,0);
 assert.deepEqual(calculateLoad([scheduled],'person-b',period).taskIds,[scheduled.id]);
});
