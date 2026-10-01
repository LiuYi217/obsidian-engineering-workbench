import { test,expect } from '@playwright/test';
const tabs=['工作台','项目','人员','协调','周计划'];
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
