# 数据模型与 frontmatter

本文是 v0.1.0 的记录契约。字段以 `src/domain.ts` 为准，实际计算以纯函数和测试为准。下面所有名称、记录和工时均为虚构示例；日期只是格式示范，请按实际工作周期修改。

## 1. 一份事实，多种视图

默认数据目录是 `Engineering Workbench/`，可以在设置中改为 Vault 内其他普通目录。加载器只从配置目录及子目录读取 Markdown，不把全 Vault 的普通任务清单自动变成结构化任务。

记录的 YAML frontmatter 通过两个字段识别：

- `workbench`：`task`、`project`、`module`、`person`、`decision`、`baseline`、`meeting`、`material-version` 或 `adoption`
- `id`：非空、稳定的字符串；同类记录中必须唯一

项目、模块、执行人、依赖、关联任务使用 ID，而不是名称。改名不必重写所有引用。`path` 是加载器给出的当前文件路径，不需手工写入。

正文可放完整背景、会议纪要、截图、链接和证据。插件确认更新任务时只修改涉及的属性，保留其他自定义属性与正文；YAML 的排版或键顺序可能由 Obsidian 重写，不应依赖字节级保留。

## 2. 任务 Task

一个完整任务示例：

```yaml
---
workbench: task
id: demo-task-001
title: "【虚构】网关边界用例验证"
project: demo-project-001
module: demo-module-001
executor: demo-person-001
status: dev-complete
originalStart: "2026-09-28"
originalDue: "2026-10-02"
forecastDue: "2026-10-05"
remainingHours: 8
allocations:
  - periodStart: "2026-09-28"
    periodEnd: "2026-10-04"
    hours: 6
  - periodStart: "2026-10-05"
    periodEnd: "2026-10-11"
    hours: 2
dependencies: []
nextAction: "请成员乙补充测试证据后再确认测试状态"
source: "Engineering Workbench/Inbox/虚构例会记录"
lastUpdated: "2026-10-01T08:00:00Z"
risk: "测试资源尚待确认"
blocker: ""
contact: "虚构协作方甲"
coordinationDue: "2026-10-02"
facts:
  - text: "开发实现已完成；测试尚未通过"
    source: "Engineering Workbench/Inbox/虚构例会记录"
    recordedAt: "2026-10-01T08:00:00Z"
forecasts:
  - text: "若本周测试资源到位，预计 10 月 5 日完成；否则需重排"
    source: "Engineering Workbench/Inbox/虚构例会记录"
    recordedAt: "2026-10-01T08:00:00Z"
judgments:
  - text: "建议优先保障回归窗口，再接受新增范围"
    source: "Engineering Workbench/Inbox/虚构例会记录"
    recordedAt: "2026-10-01T08:00:00Z"
---
```

### 字段语义

| 字段 | 语义 |
| --- | --- |
| `id` | 稳定任务身份；导入更新/去重和依赖引用据此匹配 |
| `title` | 人可读任务名 |
| `project` / `module` / `executor` | 对应记录的 ID；`executor` 为主执行人，模块应归属同一项目 |
| `executors` | 可选共同执行人 ID 数组；显示时与主执行人取去重并集，不复制任务或工时 |
| `requirementId` | 可选的稳定所属需求 ID；按项目隔离分组，可指向外部父需求，不要求创建对应任务 |
| `requirementTitle` | 可选所属需求名称，必须伴随 ID；标题本身不能建立关联 |
| `requirementSourceUrl` | 可选已核实 HTTP(S) 来源，必须伴随 ID；禁止凭据、脚本或文件协议 |
| `status` | 当前结构化状态，见下一节 |
| `originalStart` / `originalDue` | 原定起止日期，未知用空字符串；不随着预测变化覆盖 |
| `forecastDue` | 当前预测日期，未知用空字符串；需要结合条件与来源理解 |
| `remainingHours` | 剩余工作量估计；非负数为已知工时，`null` 为未知，不能用 `0` 代替未知 |
| `allocations` | 明确排入一个或多个周期的工时，而非完成工时 |
| `dependencies` | 前置任务 ID 数组 |
| `nextAction` | 可执行的下一步，不要只写“推进中” |
| `source` | 来源说明或可打开的 Vault 路径/链接 |
| `lastUpdated` | 记录更新时刻；推荐 ISO 8601 带时区格式 |
| `risk` / `blocker` | 风险和当前阻塞的简短描述 |
| `contact` / `coordinationDue` | 协调对象与需要跟进的日期 |
| `facts` / `forecasts` / `judgments` | 分开的事实、预测、人工判断记录 |
| `meetingIds` | 相关会议的稳定 ID；可选字符串数组 |
| `materialVersionIds` | 精确资料版本 ID；可选字符串数组，不指向“最新版本” |

同项目内，任务 ID 与其他任务的 `requirementId` 完全相同的记录可以成为父需求；显式的自身分组优先。不解析事实正文中的标题、序号或 URL 来猜父级。人员分组使用当前闭环标准区分当前与历史；取消工作始终是历史。多人任务在各自人员下可见，但不会复制记录或分配工时。

组内资料仅来自该需求成员/父级任务的精确版本引用、明确的会议 ID 或会议行动关联；会议引用的资料标注为会议资料，不会变成任务的固定版本。跨项目、重复或缺失的关联提示核对，不自动替换成最新版本。未分组任务只共享本人的相关资料，避免把无关同事工作混到一起。

每个 `EvidenceNote` 都包含 `text`、`source`、`recordedAt`。来源字段不证明内容真实；负责人仍要核对原始记录。正文建议包含完整条件、待确认项和相关会议链接。

### 状态与闭环

| 状态 | 含义 | 默认 test-passed 口径下闭环 |
| --- | --- | --- |
| `planned` | 已计划 | 否 |
| `in-progress` | 执行中 | 否 |
| `blocked` | 阻塞 | 否 |
| `dev-complete` | 开发完成，后续测试/发布待确认 | 否 |
| `test-passed` | 测试通过 | 是 |
| `released` | 已发布 | 是 |
| `accepted` | 已验收 | 是 |
| `cancelled` | 已取消 | 单列，不计作完成 |

可以在设置选择 `dev-complete`、`test-passed`、`released`、`accepted` 为闭环阈值。报告必须保留该口径；更改阈值会改变计算结果，不能拿不同口径的完成率直接比较。状态字段是明确记录，不从叙述中无确认地推断。

## 3. 人员 Person 与容量

```yaml
---
workbench: person
id: demo-person-001
name: 成员甲
source: "虚构容量计划，人工确认"
calendar:
  weekdays: [1, 2, 3, 4, 5]
  exceptions:
    "2026-09-30": false
    "2026-10-03": true
capacity:
  hoursPerDay: 8
  leave:
    - periodStart: "2026-09-28"
      periodEnd: "2026-10-04"
      hours: 4
  meetings:
    - periodStart: "2026-09-28"
      periodEnd: "2026-10-04"
      hours: 5
  support:
    - periodStart: "2026-09-28"
      periodEnd: "2026-10-04"
      hours: 4
  buffer:
    - periodStart: "2026-09-28"
      periodEnd: "2026-10-04"
      hours: 3
---
```

`calendar` 可省略，使用全局默认日历。`weekdays` 中 0 是周日、1 是周一，依此类推。`exceptions` 的 `true` 表示该日期工作，`false` 表示不工作，会覆盖常规星期配置。演示例外不代表任何地区真实节假日。

容量允许以下两种基准：

- `hoursPerDay`：每个工作日的毛容量
- `weeklyHours`：常规一周毛容量，按该日历的常规工作日数换算日容量

两者都存在时，`hoursPerDay` 优先。建议只保留团队采用的一种，以免读者误解。`0` 是明确记录的零容量，缺失是未知，两者不能互换。

### 分摊规则

`Allocation` 在任务排期及四类扣减中复用：

```yaml
periodStart: "2026-09-28"
periodEnd: "2026-10-04"
hours: 12
```

区间含首尾日期。与所选周期部分重叠时，按适用日历中“重叠工作日数 ÷ 此 Allocation 区间工作日数”分摊该条工时。它表示区间内均匀分布的计划，无法替代逐日详细排班。若某天集中发生大量支持或请假，请用更短区间记录。

```text
毛容量 = 日容量 × 所选周期工作日数
可用容量 = max(0, 毛容量 − 请假 − 会议 − 支持 − 缓冲)
```

扣减相互独立；不要在多个类别重复记录同一小时。超过毛容量的扣减应触发复核，不可据此制造负容量。遇到无工作日、非法日期、负工时、缺失基准等情况，先修复原始记录再做承诺。

日期字段必须存在，值为规范 `YYYY-MM-DD` 或 `""`；未知剩余工时存为 `null`，CSV 的空单元格会转换为该未知值。非法的非空日期、负工时和错误类型仍会阻止导入。多人字段可用 JSON 数组，CSV 也支持分号分隔。

任务负荷来自 `allocations`，不是 `remainingHours`。已有任务的分配工时归 `executor` 主执行人，共同执行人不会重复计入；没有主执行人的分配保留在“未分配”类别。排期不完整、所选周期的估算未知或共同执行人尚无本人投入时，余量保持待确认。这些未知工作不会自动排入本周，也不会计成零工作。这些工时是计划分配，不是自动采集的工时跟踪。没有容量资料时，工作台显示未知并提示确认；没有排期的任务仍可能存在工作，不能把显示的已排入工时当作全部需求。

容量及负荷为协作提供背景，不应生成个人绩效排名、工时利用率考核或优劣判断。

## 4. 项目 Project

```yaml
---
workbench: project
id: demo-project-001
name: 虚构·星桥接入
owner: demo-person-001
targetDate: "2026-10-09"
description: "完全虚构，仅用于演示多模块联调"
source: "Engineering Workbench/Inbox/虚构项目说明"
---
```

`owner` 是项目负责人，任务的 `executor` 是执行人；不要因为任务属于某项目就把所有任务算在负责人名下。

## 5. 模块 Module

```yaml
---
workbench: module
id: demo-module-001
name: 虚构·网关
project: demo-project-001
owner: demo-person-001
source: "Engineering Workbench/Inbox/虚构模块划分"
---
```

模块属于项目；任务同时引用项目和模块。模块负责人可以与任务执行人不同。

## 6. 决策 Decision

```yaml
---
workbench: decision
id: demo-decision-001
title: "【虚构】保留测试窗口"
date: "2026-10-01"
owner: demo-person-001
project: demo-project-001
taskIds: [demo-task-001]
decision: "保持回归测试窗口；新增任务先确认范围取舍，再作排期承诺"
source: "Engineering Workbench/Inbox/虚构例会记录"
---
```

请记录“做出了什么决定、谁负责、何时、依据在哪里”。任务状态和决策不是同一字段；决定要测试，不代表测试已通过。

## 7. 冻结基线 Baseline

`baseline` 记录包含 `id`、`name`、`createdAt`、`period`、`schemaVersion: 1`、`tasks`。`tasks` 是确认时完整任务对象的独立快照，而不是指向当前任务的动态查询。

```yaml
---
workbench: baseline
id: demo-baseline-001
name: "【虚构】第一个周期冻结计划"
createdAt: "2026-09-28T08:00:00Z"
schemaVersion: 1
period:
  start: "2026-09-28"
  end: "2026-10-04"
tasks:
  - id: demo-task-001
    title: "【虚构】网关边界用例验证"
    project: demo-project-001
    module: demo-module-001
    executor: demo-person-001
    status: planned
    originalStart: "2026-09-28"
    originalDue: "2026-10-02"
    forecastDue: "2026-10-02"
    remainingHours: 8
    allocations:
      - periodStart: "2026-09-28"
        periodEnd: "2026-10-04"
        hours: 8
    dependencies: []
    nextAction: "开始准备测试用例"
    source: "Engineering Workbench/Inbox/虚构计划会议"
    lastUpdated: "2026-09-28T08:00:00Z"
---
```

由工作台创建基线更不容易遗漏字段。创建后插件不修改该文件；后续新增或变化显示在比较结果。基线不是外部系统的实时镜像，也不是任何形式的密码学防篡改证明。

## 8. 源系统与校验边界

- CSV/JSON 导入先产生预览，不能因一份文件含有任务就自动信任其事实
- 保持任务 ID 稳定，尽量带原系统可核对的来源；不要把访问令牌放入来源 URL
- 同一个 ID 的重复记录需人工处理，不要靠复制任务改变它的身份
- 日期字段用真实 `YYYY-MM-DD` 日历日期；时间戳建议 ISO 8601 带时区
- 任一加载警告都值得检查：损坏记录可能不显示，因此“没有异常卡片”不保证原始数据完整
- 自定义 frontmatter 受保留，但不意味着插件对它计算或校验
- `schemaVersion: 1` 是内存数据与基线的版本标记；本版没有跨系统 schema 自动迁移承诺

### Project.milestones

项目可记录多个里程碑；其完成状态仅来自明确记录，不由任务比例自动推断：

```yaml
milestones:
  - id: milestone-demo-1
    title: 虚构演示联调就绪
    date: 2026-10-09
    status: planned
    source: 虚构演示会议记录
```

`status` 可为 `planned` 或 `completed`。项目视图列出里程碑，周会摘要引用所选周期内的里程碑及来源。

## 9. 会议 Meeting

会议使用 `workbench: meeting`。关键字段：

| 字段 | 含义 |
| --- | --- |
| `id` / `title` / `startAt` | 稳定 ID、名称、带时区的会议时间 |
| `project` / `module` / `iteration` | 所属项目及可选模块、迭代 |
| `participants` | 参与人字符串数组；有人员记录时建议使用稳定 ID |
| `transcript` | 用户粘贴或导入的纪要原文；不由插件转写音频 |
| `recordingUrl` / `transcriptUrl` | 可选的原始录音、转写来源 HTTP(S) URL |
| `decisions` | `{ id, text, state, source? }`；状态为 `discussion`、`suggestion`、`confirmed` |
| `unresolved` | 未决问题的字符串数组 |
| `actions` | `{ id, text, taskId?, owner?, due?, state }`；状态为 `open` 或 `done` |
| `materialVersionIds` | 本次讨论依据的确切版本 ID |
| `source` / `lastUpdated` | 原始来源与更新时间 |

行动项的 `taskId` 可关联已有任务；`owner` 为负责人标识，`due` 是明确的 ISO 日期。关联已有任务时，表单显示该任务当前执行人与预测日期，并在保存前复核；它不会将会议行动反写为任务承诺。未知负责人或期限不能凭原文中含糊指代自动补齐。会议的决定状态和行动状态不会自动更新关联任务状态。

```yaml
---
workbench: meeting
id: demo-meeting-001
title: "【虚构】接入评审"
startAt: "2026-10-01T09:00:00Z"
project: demo-project-001
participants: [demo-person-001]
transcript: "成员甲：按 v0.2 完成联调；新版入口仍待确认。"
decisions:
  - id: demo-meeting-decision-001
    text: "按 v0.2 完成联调"
    state: confirmed
    source: "虚构会议原文"
unresolved: ["新版入口是否保留旧路径"]
actions:
  - id: demo-meeting-action-001
    text: "补齐入口对照"
    taskId: demo-task-001
    owner: demo-person-001
    due: "2026-10-02"
    state: open
materialVersionIds: [demo-prototype-v2]
recordingUrl: "https://example.com/synthetic/meeting-001/recording"
transcriptUrl: "https://example.com/synthetic/meeting-001/transcript"
source: "虚构会议原文"
lastUpdated: "2026-10-01T10:00:00Z"
---
```

所有示例链接只是虚构引用，不含可用录音、真实人物或登录资料。

## 10. 资料版本 MaterialVersion 与采用 Adoption

`MaterialVersion` 保存收到当时的一个版本。`materialId` 是跨版本的资料身份，`id` 是这个版本的唯一身份。不同版本必须使用不同 `id`；重复的版本记录不能覆盖。文档与原型共用此模型，`kind` 分别为 `document`、`prototype`。

| 字段 | 含义 |
| --- | --- |
| `id` / `materialId` / `version` | 精确版本 ID、资料系列 ID、人类可读版本号 |
| `title` / `kind` / `project` | 名称、文档或原型、所属项目 |
| `module` / `iteration` | 可选模块、迭代 |
| `status` | `incoming`、`reviewed`、`archived`；不是是否采用 |
| `summary` / `changeNotes` / `reviewIssues` | 摘要、相对之前的人工变更说明、评审问题 |
| `source` / `provider` | 原始来源与提供者，不能只保留摘要而丢弃原出处 |
| `sourceUrl` / `sourceFile` | 可选的来源 URL、原始文件引用 |
| `packagePath` / `entryPath` / `files` | Vault 内资源包目录、完整入口路径、文件清单；每项含相对 `path`、`size`、可选 `sha256` |
| `requiresNetwork` / `requiresLogin` / `runRequirements` | 运行依赖声明，可为 `true`、`false`、`unknown`；不自动证明网页安全或可离线运行 |
| `previewStatus` / `previewNotes` | `unknown`、`pass`、`fail` 及人工预览记录 |
| `createdAt` / `lastUpdated` | 此次版本记录的创建和记录时间 |

记录类型为 `workbench: material-version`，文件位于 `Materials/`；采用记录位于 `Adoptions/`。

源 URL 保留收到时的链接，但远端内容仍可能改变；不可变的是本地版本记录及已保存文件，不是来源站点。

资料记录创建后只追加，不通过更新旧版本改变来源、评审或采用结果。发现错误、需要补充评审或收到修订时，应创建新的版本记录，保留旧记录与来源。`readonly` 和追加式工作流不能阻止 Vault 文件被其他程序手改，因此不构成密码学防篡改保证。

采用以独立的 `workbench: adoption` 记录保存，不改写资料版本：

```yaml
---
workbench: adoption
id: demo-adoption-001
materialId: demo-prototype
versionId: demo-prototype-v2
project: demo-project-001
adoptedAt: "2026-10-01T10:00:00Z"
source: "虚构接入评审中确认采用 v0.2"
---
```

该条采用明确关联 `versionId`，并核对同一个资料身份与项目。再次采用应新增采用记录，保留以前的采用决定。新收到的 v0.3 不会自动变成已采用版本；采用 v0.3 也不会改写任务/会议原本固定的 v0.2 引用。记录不存在、项目不匹配或引用失效时，应先处理校验提醒，不回退到看似相近的版本。

`WorkbenchData.materialVersions`、`adoptions`、`meetings` 及任务中的引用数组是可选字段，保留 `schemaVersion: 1` 旧记录兼容性。旧记录缺少这些集合不等于损坏；不能为了填满新界面制造会议、决定或来源。

## 11. 本地原型资源

一个资料版本可以引用单 HTML、带相对资源的文件夹、ZIP 导入包或 HTTP(S) URL。资源保存位置与入口写在该版本上，任务只引用版本 ID，不直接跟随一个可被新版替换的“最新”文件。

实际保存结构为 `Assets/<安全版本文件名>/files/<原始相对路径>`；原始 ZIP 单独保留于该版本的 `original/<原始 ZIP 文件名>`。单 HTML 与文件夹的原始文件字节保存在 `files/`，不额外生成一个改写过的原型。

导入保留相对目录结构，`entryPath` 必须指向 `packagePath/files/` 下文件清单中的有效 HTML；`files[].path` 保留输入的相对路径。归档在写入前检查不安全路径和条目；不允许路径穿越或用外部绝对路径写出目标目录。检查成功不代表脚本可信或浏览器行为安全。原型不在插件的 DOM/iframe 内执行，也不由插件启动本地服务。

本地文件通过桌面 Electron 适配器交给系统浏览器；移动端不支持本地外部打开，线上 HTTP(S) 链接仍可用。需要服务器、网络或登录的原型要如实记录运行要求；本插件不会静默补起服务或代为登录。
