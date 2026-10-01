import { test,expect } from '@playwright/test';
const tabs=['工作台','项目','人员','会议','资料','周计划'];
for(const tab of tabs)test(`${tab}: shared data renders without overflow`,async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await page.getByRole('tab',{name:tab,exact:true}).click();
 await expect(page.getByRole('heading',{name:tab,exact:true,level:1})).toBeVisible();
 await expect(page.getByRole('tab',{name:tab,exact:true})).toHaveAttribute('aria-selected','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
 expect(errors).toEqual([]);
 await expect(page.getByText('CLARITY BEFORE VELOCITY',{exact:true})).toHaveCount(0);
 await expect(page.locator('.elw-help')).not.toHaveAttribute('open','');
 await page.screenshot({path:testInfo.outputPath(`${testInfo.project.name}-${tab}.png`),fullPage:true});
});
test('project/search filters, empty state, task drill-in and close',async({page})=>{
 await page.goto('/?tab=projects');
 await page.getByRole('combobox',{name:'项目筛选'}).selectOption('demo-project-cloudsail');
 await expect(page.getByRole('button',{name:'【虚构】检索索引发布',exact:true})).toBeVisible();
 const search=page.getByRole('searchbox',{name:'搜索任务'});await search.fill('不存在的演示任务');await search.press('Enter');
 await expect(page.getByRole('heading',{name:'暂无匹配任务'})).toBeVisible();
 await page.getByRole('searchbox',{name:'搜索任务'}).fill('');await page.getByRole('searchbox',{name:'搜索任务'}).press('Enter');
 const task=page.getByRole('button',{name:'【虚构】检索索引发布',exact:true});await task.click();
 await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('keyboard tab navigation restores focus after rerender',async({page})=>{
 await page.goto('/');const home=page.getByRole('tab',{name:'工作台',exact:true});await home.focus();await home.press('ArrowRight');
 await expect(page.getByRole('tab',{name:'项目',exact:true})).toBeFocused();
 await page.getByRole('tab',{name:'项目',exact:true}).press('End');await expect(page.getByRole('tab',{name:'周计划',exact:true})).toBeFocused();
});
test('people show unknown capacity and cross-project workload caveat',async({page})=>{
 await page.goto('/?tab=people');await expect(page.getByText('容量未知',{exact:true})).toBeVisible();
 await expect(page.getByText('跨项目',{exact:true})).toBeVisible();
 await expect(page.getByText('所有人员负荷跨项目汇总',{exact:false})).not.toBeVisible();
 await page.locator('.elw-help summary').click();
 await expect(page.getByText('所有人员负荷跨项目汇总',{exact:false})).toBeVisible();
});

test('project details reuse tasks, people, meetings and exact material versions',async({page})=>{
 await page.goto('/?tab=projects');await page.getByRole('button',{name:'详情 →',exact:true}).first().click();
 const tabs=page.getByRole('navigation',{name:'项目详情'});
 for(const label of ['概览','任务','人员','会议','文档','原型']){await tabs.getByRole('button',{name:label,exact:true}).click();await expect(tabs.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');}
 await expect(page.locator('.elw-table')).toBeVisible();await page.getByRole('button',{name:'← 全部项目',exact:true}).click();await expect(tabs).toHaveCount(0);
});
test('meeting decisions and actions precede collapsed transcript',async({page})=>{
 await page.goto('/?tab=meetings');await expect(page.locator('.elw-meeting').first()).toBeVisible();
 const meeting=page.locator('.elw-meeting').filter({has:page.getByRole('heading',{name:'已确认',exact:true})}).first();
 await expect(meeting.getByRole('heading',{name:'已确认',exact:true})).toBeVisible();
 const transcript=meeting.locator('.elw-transcript');await expect(transcript).not.toBeVisible();await meeting.locator('summary').filter({hasText:'原文 / 录音'}).click();await expect(transcript).toBeVisible();
});
test('material list keeps old adopted and incoming versions distinct',async({page})=>{
 await page.goto('/?tab=materials');const table=page.locator('.elw-table');await expect(table.getByRole('columnheader',{name:'版本',exact:true})).toBeVisible();
 await expect(table.getByText('已采纳',{exact:true})).toBeVisible();await expect(table.getByText('待确认',{exact:true}).first()).toBeVisible();
 const names=table.locator('tbody tr td:first-child button');await names.first().click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();
});
