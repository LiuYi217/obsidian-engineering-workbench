import type { Allocation, MaterialVersion, Meeting, Task, WorkbenchData } from '../../src/domain';

/** DEV/TEST ONLY. Never import this module from src/. Completely synthetic fixture. No real people, projects, calendars, or external IDs. */
export const FIXTURE_NOTICE = '全部为虚构演示数据，不代表真实项目、人员、工时或绩效';

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
export function makeWorkbenchFixture(today = localISODate()): WorkbenchData {
  // Validate once, and perform subsequent date arithmetic in UTC to avoid DST shifts.
  shift(today, 0);
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = shift(today, -((day + 6) % 7));
  const friday = shift(monday, 4);
  const sunday = shift(monday, 6);
  const nextFriday = shift(monday, 11);
  const timestamp = `${today}T09:00:00Z`;
  const source = '虚构演示记录';
  const allocation = (hours: number): Allocation[] => [{ periodStart: monday, periodEnd: sunday, hours }];
  const task = (id: string, title: string, overrides: Partial<Task>): Task => ({
    id, title: `【虚构】${title}`, project: 'demo-project-starbridge', module: 'demo-module-gateway',
    executor: 'demo-person-jia', status: 'planned', originalStart: monday, originalDue: friday,
    forecastDue: friday, remainingHours: 8, allocations: allocation(8), dependencies: [],
    nextAction: '确认验收证据', source, lastUpdated: timestamp,
    ...overrides,
  });
  const tasks: Task[] = [
    task('demo-task-001', '网关接口回归', {
      status: 'test-passed', remainingHours: 0, allocations: [],
      nextAction: '准备发布检查',
      facts: [{ text: '回归测试通过，待发布', source, recordedAt: timestamp }],
    }),
    task('demo-task-002', '权限策略开发', {
      status: 'dev-complete', module: 'demo-module-auth', executor: 'demo-person-yi',
      remainingHours: 8, allocations: allocation(8), dependencies: ['demo-task-001'],
      meetingIds: ['demo-meeting-001'], materialVersionIds: ['demo-document-v1'],
      nextAction: '补充边界用例并安排测试',
      forecasts: [{ text: '测试资源到位后，预计本周完成测试', source, recordedAt: timestamp }],
    }),
    task('demo-task-003', '对接协议确认', {
      status: 'blocked', remainingHours: 16, allocations: allocation(16),
      originalStart: shift(monday, -7), originalDue: shift(today, -1), forecastDue: nextFriday, contact: '虚构协作方甲',
      coordinationDue: shift(today, -1), blocker: '协作方尚未确认接口字段',
      risk: '字段未确认会影响接入联调', nextAction: '请虚构协作方甲确认字段清单',
    }),
    task('demo-task-004', '接入联调', {
      status: 'in-progress', remainingHours: 20, allocations: allocation(20),
      dependencies: ['demo-task-003'], originalDue: friday, forecastDue: nextFriday,
      meetingIds: ['demo-meeting-001'], materialVersionIds: ['demo-prototype-v2'],
      risk: '协议未确认，本周容量不足',
      nextAction: '先验证适配器，等待协议确认',
      forecasts: [{ text: '协议按期确认且容量不减少，预计下周完成', source, recordedAt: timestamp }],
    }),
    task('demo-task-005', '组件说明补齐', {
      module: 'demo-module-auth', executor: 'demo-person-yi', remainingHours: 6,
      allocations: allocation(6), lastUpdated: `${shift(today, -12)}T09:00:00Z`,
      nextAction: '向成员乙确认说明稿进度',
    }),
    task('demo-task-006', '检索索引发布', {
      project: 'demo-project-cloudsail', module: 'demo-module-search', executor: 'demo-person-bing',
      status: 'released', remainingHours: 0, allocations: [],
      nextAction: '收集业务验收反馈',
      facts: [{ text: '索引已发布，待业务验收', source, recordedAt: timestamp }],
    }),
    task('demo-task-007', '导出模板验收', {
      project: 'demo-project-cloudsail', module: 'demo-module-export', executor: 'demo-person-bing',
      status: 'accepted', remainingHours: 0, allocations: [], nextAction: '整理本地验收记录',
      facts: [{ text: '虚构验收记录已确认', source, recordedAt: timestamp }],
    }),
    task('demo-task-008', '导出异常处理', {
      project: 'demo-project-cloudsail', module: 'demo-module-export', executor: 'demo-person-ding',
      status: 'in-progress', remainingHours: 14, allocations: allocation(14),
      nextAction: '向成员丁确认本周容量',
      risk: '本周容量待确认',
    }),
    task('demo-task-009', '本周新增检索筛选', {
      project: 'demo-project-cloudsail', module: 'demo-module-search', executor: 'demo-person-bing',
      remainingHours: 12, allocations: allocation(12), nextAction: '确认新增范围与原计划的取舍',
      judgments: [{ text: '建议先确认新增筛选范围的优先级', source, recordedAt: timestamp }],
    }),
    task('demo-task-010', '尚未排期的审计字段', {
      module: 'demo-module-auth', executor: 'demo-person-yi', remainingHours: 10, allocations: [],
      nextAction: '确认审计字段排期',
    }),
  ];
  for(const t of tasks){if(['demo-task-001','demo-task-003','demo-task-004'].includes(t.id)){t.requirementId='demo-requirement-access';t.requirementTitle='【虚构】统一接入需求';t.requirementSourceUrl='https://example.com/requirements/access';}else if(['demo-task-002','demo-task-005'].includes(t.id)){t.requirementId='demo-requirement-permission';t.requirementTitle='【虚构】权限控制需求';}}


  const priorReviewDate = shift(monday, -4);
  const prototype = (id: string, version: string, date: string, overrides: Partial<MaterialVersion>): MaterialVersion => ({
    id, materialId: 'demo-material-prototype', title: '【虚构】星桥接入原型', kind: 'prototype', version,
    project: 'demo-project-starbridge', module: 'demo-module-gateway', iteration: '虚构·接入迭代',
    status: 'incoming', summary: '接入配置与联调入口', source, provider: '成员乙',
    requiresNetwork: 'unknown', requiresLogin: 'unknown', previewStatus: 'unknown', reviewIssues: [],
    createdAt: `${date}T08:00:00Z`, lastUpdated: `${date}T08:00:00Z`, ...overrides,
  });
  const materialVersions: MaterialVersion[] = [
    prototype('demo-prototype-v1', 'v0.1', shift(monday, -14), {
      status: 'archived', sourceFile: '虚构附件/星桥接入-v0.1.html',
      summary: '初版配置页', changeNotes: '新增接入配置页', previewNotes: '仅存本地引用',
    }),
    prototype('demo-prototype-v2', 'v0.2', shift(monday, -5), {
      status: 'reviewed', sourceUrl: 'https://example.com/synthetic/starbridge/v0.2/',
      summary: '配置页与联调反馈', changeNotes: '补齐失败反馈和返回路径',
      requiresNetwork: true, requiresLogin: false, previewStatus: 'pass',
      previewNotes: '虚构走查：配置与返回路径通过',
    }),
    prototype('demo-prototype-v3', 'v0.3', today, {
      sourceFile: '虚构附件/星桥接入-v0.3.zip', summary: '新增登录入口',
      changeNotes: '调整登录入口与空态', reviewIssues: ['旧入口兼容待确认'],
      previewNotes: '待走查入口', runRequirements: '网络与登录要求待确认',
    }),
    { id: 'demo-document-v1', materialId: 'demo-material-protocol', title: '【虚构】接入字段说明',
      kind: 'document', version: 'v1.0', project: 'demo-project-starbridge', module: 'demo-module-auth',
      status: 'reviewed', summary: '鉴权字段与错误码', source, provider: '成员甲',
      sourceUrl: 'https://example.com/synthetic/starbridge/protocol/v1.0',
      requiresNetwork: true, requiresLogin: false, previewStatus: 'unknown', reviewIssues: [],
      createdAt: `${shift(monday, -5)}T08:00:00Z`, lastUpdated: `${shift(monday, -5)}T08:00:00Z` },
  ];
  const meetings: Meeting[] = [
    { id: 'demo-meeting-001', title: '【虚构】接入方案评审', startAt: `${priorReviewDate}T09:00:00Z`,
      project: 'demo-project-starbridge', module: 'demo-module-gateway', iteration: '虚构·接入迭代',
      participants: ['demo-person-jia', 'demo-person-yi'],
      decisions: [{ id: 'demo-meeting-decision-001', text: '采用 v0.2 进行联调', state: 'confirmed', source }],
      unresolved: [], actions: [
        { id: 'demo-meeting-action-001', text: '完成接入联调', taskId: 'demo-task-004', owner: 'demo-person-jia', due: nextFriday, state: 'open' },
        { id: 'demo-meeting-action-002', text: '补齐权限边界用例', taskId: 'demo-task-002', owner: 'demo-person-yi', due: friday, state: 'open' },
      ],
      materialVersionIds: ['demo-prototype-v2', 'demo-document-v1'],
      recordingUrl: 'https://example.com/synthetic/meetings/review/recording',
      transcriptUrl: 'https://example.com/synthetic/meetings/review/transcript',
      transcript: '成员甲：采用 v0.2 进行联调。成员乙：补齐权限边界用例。',
      source, lastUpdated: `${priorReviewDate}T10:00:00Z` },
    { id: 'demo-meeting-002', title: '【虚构】新版入口讨论', startAt: `${today}T08:30:00Z`,
      project: 'demo-project-starbridge', module: 'demo-module-gateway', iteration: '虚构·接入迭代',
      participants: ['demo-person-jia', 'demo-person-yi'],
      decisions: [{ id: 'demo-meeting-decision-002', text: '考虑切换 v0.3 登录入口', state: 'discussion', source }],
      unresolved: ['旧入口是否保留'], actions: [
        { id: 'demo-meeting-action-003', text: '确认入口兼容字段', taskId: 'demo-task-003', owner: 'demo-person-jia', due: friday, state: 'open' },
      ],
      materialVersionIds: ['demo-prototype-v3'],
      recordingUrl: 'https://example.com/synthetic/meetings/entry/recording',
      transcriptUrl: 'https://example.com/synthetic/meetings/entry/transcript',
      transcript: '成员乙：建议考虑 v0.3 登录入口。成员甲：旧入口是否保留尚未确认，先核对兼容字段。',
      source, lastUpdated: timestamp },
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
      { id: 'demo-project-starbridge', name: '虚构·星桥接入', owner: 'demo-person-jia', targetDate: nextFriday, description: '接入协议与权限联调', source, milestones: [{ id: 'demo-milestone-1', title: '【虚构】联调就绪', date: friday, status: 'planned', source }, { id: 'demo-milestone-2', title: '【虚构】发布评审', date: nextFriday, status: 'planned', source }] },
      { id: 'demo-project-cloudsail', name: '虚构·云帆检索', owner: 'demo-person-bing', targetDate: friday, description: '检索与导出改造', source, milestones: [{ id: 'demo-milestone-3', title: '【虚构】范围确认', date: monday, status: 'completed', source }, { id: 'demo-milestone-4', title: '【虚构】测试验收', date: friday, status: 'planned', source }] },
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
    tasks, materialVersions, meetings,
    adoptions: [{ id: 'demo-adoption-001', materialId: 'demo-material-prototype', versionId: 'demo-prototype-v2',
      project: 'demo-project-starbridge', adoptedAt: `${priorReviewDate}T10:00:00Z`, source: '虚构·接入方案评审' }],
    decisions: [
      { id: 'demo-decision-001', title: '【虚构】保留回归窗口', date: monday, owner: 'demo-person-jia',
        decision: '保留网关回归窗口，权限边界用例补齐后进入测试',
        source, project: 'demo-project-starbridge', taskIds: ['demo-task-001', 'demo-task-002'] },
      { id: 'demo-decision-002', title: '【虚构】新增范围单独复核', date: today, owner: 'demo-person-bing',
        decision: '新增筛选范围待容量与优先级确认后排期',
        source, project: 'demo-project-cloudsail', taskIds: ['demo-task-009'] },
    ],
    baselines: [{ id: 'demo-baseline-001', name: '【虚构】本周冻结计划',
      createdAt: `${shift(monday, -3)}T09:00:00Z`, period: { start: monday, end: sunday },
      schemaVersion: 1, tasks: frozenTasks }],
  };
}
