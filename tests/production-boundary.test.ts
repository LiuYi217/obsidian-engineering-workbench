import {visibleProjectScope} from '../src/ui';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { build } from 'esbuild';

test('production dependency graph and bundle exclude development fixtures and fictional creator',async()=>{
 const result=await build({entryPoints:['src/main.ts'],bundle:true,external:['obsidian'],platform:'browser',format:'cjs',target:'es2020',write:false,metafile:true,logLevel:'silent'});
 assert(Object.keys(result.metafile!.inputs).every(path=>!path.includes('tests/fixtures')&&!path.endsWith('src/demo.ts')));
 const bundle=result.outputFiles[0].text;
 for(const forbidden of ['create-demo','createDemoData','makeWorkbenchFixture','demo-project-starbridge','demo-person-jia'])assert(!bundle.includes(forbidden),forbidden);
 assert(!existsSync('src/demo.ts'));assert(!existsSync('examples/synthetic-tasks.csv'));assert(!existsSync('examples/synthetic-tasks.json'));
});
test('shipped UI has no global help or fictional creation entry points',()=>{
 const ui=readFileSync('src/ui.ts','utf8'),main=readFileSync('src/main.ts','utf8'),styles=readFileSync('styles.css','utf8');
 assert(!ui.includes('pageHelp'));assert(!ui.includes("'口径'"));assert(!ui.includes('a.demo'));assert(!main.includes('create-demo'));assert(!main.includes('async demo('));assert(!styles.includes('.elw-help'));
 assert(ui.includes("s.settings.closureStatus"));assert(main.includes("setName('默认闭环标准')"));
});
test('documentation has no instructions to create fictional records',()=>{
 const readme=readFileSync('README.md','utf8');assert(!readme.includes('运行“创建示例'));assert(!readme.includes('createDemoData'));assert(!readme.includes('examples/'));
});

test('empty and old generated scope hints are not rendered, while real scope text is preserved',()=>{
 assert.equal(visibleProjectScope(undefined),'');assert.equal(visibleProjectScope('  '),'');assert.equal(visibleProjectScope('请填写范围、目标和验收边界'),'');assert.equal(visibleProjectScope('  请填写范围、目标和验收边界  '),'');
 const real='范围：交付模块 A。验收：接口回归通过。';assert.equal(visibleProjectScope(real),real);
 const main=readFileSync('src/main.ts','utf8');assert(main.includes("name:'新项目',description:''"));assert(!main.includes("description:'请填写范围、目标和验收边界'"));
});
