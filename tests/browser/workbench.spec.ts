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
 await expect(page.locator('.elw-help')).toHaveCount(0);
 await expect(page.getByText('口径',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/创建.*示例/})).toHaveCount(0);
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
test('people retain unknown capacity and cross-project scope without global help',async({page})=>{
 await page.goto('/?tab=people');await expect(page.getByText('容量未知',{exact:true})).toBeVisible();
 await expect(page.getByText('跨项目',{exact:true})).toBeVisible();
 await expect(page.locator('.elw-help')).toHaveCount(0);
});

test('project details reuse tasks, people, meetings and exact material versions',async({page})=>{
 await page.goto('/?tab=projects');await page.getByRole('button',{name:'详情 →',exact:true}).first().click();
 const tabs=page.getByRole('navigation',{name:'项目详情'});
 for(const label of ['概览','任务','人员','会议','文档','原型']){await tabs.getByRole('button',{name:label,exact:true}).click();await expect(tabs.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');}
 await expect(page.locator('.elw-table')).toBeVisible();await page.getByRole('button',{name:'← 全部项目',exact:true}).click();await expect(tabs).toHaveCount(0);
});
test('meeting decisions and actions precede collapsed transcript',async({page})=>{
 await page.goto('/?tab=meetings');await expect(page.getByLabel('开始日期',{exact:true})).toHaveCount(0);await expect(page.locator('.elw-meeting').first()).toBeVisible();
 const meeting=page.locator('.elw-meeting').filter({has:page.getByRole('heading',{name:'已确认',exact:true})}).first();
 await expect(meeting.getByRole('heading',{name:'已确认',exact:true})).toBeVisible();
 const transcript=meeting.locator('.elw-transcript');await expect(transcript).not.toBeVisible();await meeting.locator('summary').filter({hasText:'原文 / 录音'}).click();await expect(transcript).toBeVisible();
});
test('material list keeps old adopted and incoming versions distinct',async({page})=>{
 await page.goto('/?tab=materials');await expect(page.getByLabel('开始日期',{exact:true})).toHaveCount(0);const table=page.locator('.elw-table');if((page.viewportSize()?.width||0)>600)await expect(table.getByRole('columnheader',{name:'版本',exact:true})).toBeVisible();else{await expect(table.locator('td[data-label=版本]').first()).toBeVisible();expect(await table.locator('td[data-label=状态]').first().evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('nowrap');}
 await expect(table.getByText('已采纳',{exact:true})).toBeVisible();await expect(table.getByText('待确认',{exact:true}).first()).toBeVisible();
 const names=table.locator('tbody tr td:first-child button');await names.first().click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();
});

test('meeting time uses local UTC+08 and exposes the timezone',async({page})=>{
 await page.goto('/?tab=meetings');
 await expect(page.locator('.elw-meeting .elw-date').filter({hasText:'2026-10-01 16:30 UTC+08:00'})).toBeVisible();
 await expect(page.locator('.elw-meeting .elw-date').filter({hasText:'2026-09-24 17:00 UTC+08:00'})).toBeVisible();
});

test('empty workbench offers only real task/import actions, with no fictional creator',async({page},testInfo)=>{
 await page.goto('/?empty=1');await expect(page.getByRole('heading',{name:'暂无任务',exact:true})).toBeVisible();
 const empty=page.locator('.elw-empty');await expect(empty.getByRole('button',{name:'新建任务',exact:true})).toBeVisible();await expect(empty.getByRole('button',{name:'导入 CSV / JSON',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/创建.*示例|创建虚构/})).toHaveCount(0);await expect(page.getByText('口径',{exact:true})).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath(`${testInfo.project.name}-empty.png`),fullPage:true});
});

test('project scope has no blank or scaffold block and preserves real content',async({page})=>{
 for(const scope of ['empty','placeholder']){await page.goto(`/?tab=projects&scope=${scope}`);await expect(page.locator('.elw-project-grid summary').filter({hasText:'范围'})).toHaveCount(0);await expect(page.getByText('请填写范围、目标和验收边界',{exact:true})).toHaveCount(0);}
 await page.goto('/?tab=projects&scope=real');await page.locator('.elw-project-grid summary').filter({hasText:'范围'}).click();await expect(page.getByText('真实范围：只交付接入模块；验收：边界用例通过。',{exact:true})).toBeVisible();
});


test('unknown imported work stays visible without inventing dates, effort or spare capacity',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/?tab=projects&unknown=1');const row=page.locator('.elw-table tbody tr');
 await expect(row).toHaveCount(1);await expect(row.getByText('虚构甲、虚构乙',{exact:true})).toBeVisible();await expect(row.getByText('未知',{exact:true})).toBeVisible();await expect(row.getByText('未评估',{exact:true})).toBeVisible();
 await page.getByRole('searchbox',{name:'搜索任务'}).fill('fixture-b');await page.getByRole('searchbox',{name:'搜索任务'}).press('Enter');await expect(page.getByRole('button',{name:'【虚构】未知排期任务',exact:true})).toBeVisible();
 await page.goto('/?tab=people&unknown=1');await expect(page.locator('.elw-person')).toHaveCount(2);await expect(page.getByText('1 项投入待确认，余量未知',{exact:true})).toHaveCount(2);await expect(page.getByText(/预计余量/)).toHaveCount(0);
 await page.goto('/?tab=projects&unknown=1');await page.getByRole('button',{name:'详情 →',exact:true}).first().click();await page.getByRole('navigation',{name:'项目详情'}).getByRole('button',{name:'人员',exact:true}).click();await expect(page.getByText('余量待确认',{exact:true})).toHaveCount(2);
 await page.goto('/?tab=meetings&unknown=1');const action=page.locator('.elw-meeting-action');await expect(action).toContainText('虚构甲、虚构乙');await expect(action).toContainText('未定日期');await expect(action).not.toContainText('2099-12-31');await expect(action).not.toContainText('old-owner');expect(errors).toEqual([]);
});

test('people show current work grouped by requirement with direct exact source links and retained history',async({page},testInfo)=>{
 await page.goto('/?tab=people');
 const member=page.locator('.elw-person').filter({has:page.getByRole('heading',{name:'成员甲',exact:true})});
 const group=member.locator(':scope > .elw-work-group[data-requirement="demo-requirement-access"]');
 await expect(group.getByRole('heading',{name:'【虚构】统一接入需求',exact:true})).toBeVisible();
 await expect(group.getByRole('button',{name:'【虚构】对接协议确认',exact:true})).toBeVisible();await expect(group.getByRole('button',{name:'【虚构】接入联调',exact:true})).toBeVisible();
 await expect(member.getByRole('button',{name:'【虚构】网关接口回归',exact:true})).not.toBeVisible();
 const prototype=group.getByRole('button',{name:'原型 · 【虚构】星桥接入原型 · v0.2',exact:true});await expect(prototype).toBeVisible();await expect(group.getByRole('button',{name:/v0.3/})).toHaveCount(0);
 await prototype.click();await expect(page.getByRole('dialog')).toContainText('demo-prototype-v2');await page.getByRole('button',{name:'关闭',exact:true}).click();
 await group.getByRole('button',{name:/^会议 ·/}).first().click();await expect(page.getByRole('dialog')).toContainText('demo-meeting-001');await page.getByRole('button',{name:'关闭',exact:true}).click();
 await group.getByRole('button',{name:'打开需求来源 【虚构】统一接入需求',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('https://example.com/requirements/access');await page.getByRole('button',{name:'关闭',exact:true}).click();
 await group.getByRole('button',{name:'【虚构】接入联调',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('demo-task-004');await page.getByRole('button',{name:'关闭',exact:true}).click();
 await member.locator('.elw-work-history > summary').click();await expect(member.getByRole('button',{name:'【虚构】网关接口回归',exact:true})).toBeVisible();await member.locator('.elw-work-history > summary').click();
 await expect(page.getByRole('button',{name:'【虚构】权限策略开发',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();await page.screenshot({path:testInfo.outputPath(`${testInfo.project.name}-person-work-groups.png`),fullPage:true});
});
test('people filters find people and requirement groups without losing ungrouped tasks',async({page})=>{
 await page.goto('/?tab=people');const search=()=>page.getByRole('searchbox',{name:'搜索人员或工作项'});
 await search().fill('成员甲');await search().press('Enter');await expect(page.locator('.elw-person')).toHaveCount(1);await expect(page.getByRole('button',{name:'【虚构】接入联调',exact:true})).toBeVisible();
 await search().fill('权限控制需求');await search().press('Enter');await expect(page.getByRole('heading',{name:'【虚构】权限控制需求',exact:true})).toBeVisible();
 await search().fill('');await search().press('Enter');await page.getByRole('combobox',{name:'项目筛选'}).selectOption('demo-project-cloudsail');await expect(page.locator('.elw-person')).toHaveCount(2);await expect(page.getByRole('button',{name:'【虚构】导出异常处理',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'未分组',exact:true}).first()).toBeVisible();
 await search().fill('no-such-person-or-work');await search().press('Enter');await expect(page.getByText('暂无匹配人员或工作项',{exact:true})).toBeVisible();
});
