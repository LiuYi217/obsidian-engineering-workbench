import type { Allocation, Task, WorkbenchData } from './domain';

/** Completely synthetic fixture. No real people, projects, calendars, or external IDs. */
export const DEMO_NOTICE = '全部为虚构演示数据，不代表真实项目、人员、工时或绩效';

function localISODate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shift(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('演示日期必须是有效的 YYYY-MM-DD 日期');
  }
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Dates follow the local current week unless an explicit calendar date is provided. */
export function createDemoData(today = localISODate()): WorkbenchData {
  // Validate once, and perform subsequent date arithmetic in UTC to avoid DST shifts.
  shift(today, 0);
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = shift(today, -((day + 6) % 7));
  const friday = shift(monday, 4);
  const sunday = shift(monday, 6);
  const nextFriday = shift(monday, 11);
  const timestamp = `${today}T09:00:00Z`;
  const source = '虚构演示数据（本地生成，无外部系统来源）';
  const allocation = (hours: number): Allocation[] => [{ periodStart: monday, periodEnd: sunday, hours }];
  const task = (id: string, title: string, overrides: Partial<Task>): Task => ({
    id, title: `【虚构】${title}`, project: 'demo-project-starbridge', module: 'demo-module-gateway',
    executor: 'demo-person-jia', status: 'planned', originalStart: monday, originalDue: friday,
    forecastDue: friday, remainingHours: 8, allocations: allocation(8), dependencies: [],
    nextAction: '在例会中确认下一步与验收证据', source, lastUpdated: timestamp,
    facts: [{ text: DEMO_NOTICE, source, recordedAt: timestamp }],
    ...overrides,
  });
  const tasks: Task[] = [
    task('demo-task-001', '网关接口回归', {
      status: 'test-passed', remainingHours: 0, allocations: [],
      nextAction: '准备发布检查，不将测试通过写成已发布',
      facts: [{ text: '虚构测试用例已通过；尚未发布', source, recordedAt: timestamp }],
    }),
    task('demo-task-002', '权限策略开发', {
      status: 'dev-complete', module: 'demo-module-auth', executor: 'demo-person-yi',
      remainingHours: 8, allocations: allocation(8), dependencies: ['demo-task-001'],
      nextAction: '补充边界用例并安排测试',
      forecasts: [{ text: '若测试资源按期到位，预计本周期完成测试；未承诺发布日期', source, recordedAt: timestamp }],
    }),
    task('demo-task-003', '对接协议确认', {
      status: 'blocked', remainingHours: 16, allocations: allocation(16),
      originalStart: shift(monday, -7), originalDue: shift(today, -1), forecastDue: nextFriday, contact: '虚构协作方甲',
      coordinationDue: shift(today, -1), blocker: '虚构协作方尚未确认接口字段',
      risk: '字段未确认会影响接入联调', nextAction: '请虚构协作方甲确认字段清单并给出更新时间',
    }),
    task('demo-task-004', '接入联调', {
      status: 'in-progress', remainingHours: 20, allocations: allocation(20),
      dependencies: ['demo-task-003'], originalDue: friday, forecastDue: nextFriday,
      risk: '依赖任务阻塞；本周期排入负荷高于已知容量',
      nextAction: '先完成可独立验证的适配器；等待协议确认后再联调',
      forecasts: [{ text: '仅在协议及时确认且容量不再减少时，才可能在下周完成', source, recordedAt: timestamp }],
    }),
    task('demo-task-005', '组件说明补齐', {
      module: 'demo-module-auth', executor: 'demo-person-yi', remainingHours: 6,
      allocations: allocation(6), lastUpdated: `${shift(today, -12)}T09:00:00Z`,
      nextAction: '核对停滞记录是否仍有效；确认后再更新状态',
    }),
    task('demo-task-006', '检索索引发布', {
      project: 'demo-project-cloudsail', module: 'demo-module-search', executor: 'demo-person-bing',
      status: 'released', remainingHours: 0, allocations: [],
      nextAction: '收集验收反馈；发布不等于业务验收',
      facts: [{ text: '虚构版本已发布，但业务验收尚未记录', source, recordedAt: timestamp }],
    }),
    task('demo-task-007', '导出模板验收', {
      project: 'demo-project-cloudsail', module: 'demo-module-export', executor: 'demo-person-bing',
      status: 'accepted', remainingHours: 0, allocations: [], nextAction: '整理本地验收记录',
      facts: [{ text: '虚构验收记录已确认', source, recordedAt: timestamp }],
    }),
    task('demo-task-008', '导出异常处理', {
      project: 'demo-project-cloudsail', module: 'demo-module-export', executor: 'demo-person-ding',
      status: 'in-progress', remainingHours: 14, allocations: allocation(14),
      nextAction: '先向成员丁确认容量；不可将缺失容量解释为空闲',
      risk: '容量资料缺失，不能判断能否承诺交付',
    }),
    task('demo-task-009', '本周新增检索筛选', {
      project: 'demo-project-cloudsail', module: 'demo-module-search', executor: 'demo-person-bing',
      remainingHours: 12, allocations: allocation(12), nextAction: '确认新增范围与原计划的取舍',
      judgments: [{ text: '虚构判断：新增范围需要显式讨论，不应回写覆盖原基线', source, recordedAt: timestamp }],
    }),
    task('demo-task-010', '尚未排期的审计字段', {
      module: 'demo-module-auth', executor: 'demo-person-yi', remainingHours: 10, allocations: [],
      nextAction: '明确周期排入工时，不能把全部剩余工时自动当成本周负荷',
    }),
  ];

  const frozenTasks = JSON.parse(JSON.stringify(tasks.slice(0, 8))) as Task[];
  for (const frozen of frozenTasks) {
    frozen.lastUpdated = `${shift(monday, -3)}T09:00:00Z`;
    if (frozen.id === 'demo-task-003' || frozen.id === 'demo-task-004') {
      frozen.forecastDue = friday;
      frozen.status = 'planned';
    }
  }

  return {
    schemaVersion: 1,
    projects: [
      { id: 'demo-project-starbridge', name: '虚构·星桥接入', owner: 'demo-person-jia', targetDate: nextFriday, description: DEMO_NOTICE, source, milestones: [{ id: 'demo-milestone-1', title: '【虚构】联调就绪', date: friday, status: 'planned', source }, { id: 'demo-milestone-2', title: '【虚构】发布评审', date: nextFriday, status: 'planned', source }] },
      { id: 'demo-project-cloudsail', name: '虚构·云帆检索', owner: 'demo-person-bing', targetDate: friday, description: DEMO_NOTICE, source, milestones: [{ id: 'demo-milestone-3', title: '【虚构】范围确认', date: monday, status: 'completed', source }, { id: 'demo-milestone-4', title: '【虚构】测试验收', date: friday, status: 'planned', source }] },
    ],
    people: [
      { id: 'demo-person-jia', name: '成员甲', source,
        calendar: { weekdays: [1, 2, 3, 4, 5], exceptions: { [shift(monday, 2)]: false } },
        capacity: { hoursPerDay: 8, leave: allocation(4), meetings: allocation(4), support: allocation(4), buffer: allocation(4) } },
      { id: 'demo-person-yi', name: '成员乙', source,
        calendar: { weekdays: [1, 2, 3, 4, 5], exceptions: { [shift(monday, 5)]: true } },
        capacity: { hoursPerDay: 6, meetings: allocation(4), support: allocation(2), buffer: allocation(4) } },
      { id: 'demo-person-bing', name: '成员丙', source,
        calendar: { weekdays: [1, 2, 3, 4, 5] },
        capacity: { weeklyHours: 30, leave: allocation(6), meetings: allocation(4), buffer: allocation(4) } },
      { id: 'demo-person-ding', name: '成员丁', source },
    ],
    modules: [
      { id: 'demo-module-gateway', name: '虚构·网关', project: 'demo-project-starbridge', owner: 'demo-person-jia', source },
      { id: 'demo-module-auth', name: '虚构·权限', project: 'demo-project-starbridge', owner: 'demo-person-yi', source },
      { id: 'demo-module-search', name: '虚构·检索', project: 'demo-project-cloudsail', owner: 'demo-person-bing', source },
      { id: 'demo-module-export', name: '虚构·导出', project: 'demo-project-cloudsail', owner: 'demo-person-ding', source },
    ],
    tasks,
    decisions: [
      { id: 'demo-decision-001', title: '【虚构】确认默认闭环口径', date: monday, owner: 'demo-person-jia',
        decision: '本演示以 test-passed 为默认闭环；开发完成、发布和验收分别保留，不互相冒充',
        source, project: 'demo-project-starbridge', taskIds: ['demo-task-001', 'demo-task-002'] },
      { id: 'demo-decision-002', title: '【虚构】新增范围单独复核', date: today, owner: 'demo-person-bing',
        decision: '将筛选能力标记为新增范围，保留冻结基线；待容量和优先级确认后再承诺日期',
        source, project: 'demo-project-cloudsail', taskIds: ['demo-task-009'] },
    ],
    baselines: [{ id: 'demo-baseline-001', name: '【虚构】本周冻结计划',
      createdAt: `${shift(monday, -3)}T09:00:00Z`, period: { start: monday, end: sunday },
      schemaVersion: 1, tasks: frozenTasks }],
  };
}
