# 发布与验收检查表

本表是执行步骤，不代表每个检查项已经完成。自动化检查、桌面实机、移动端实机和对外发布应分别记录结果，不得以打勾模板代替证据。

## 构建

- [ ] `manifest.json`、`package.json`、`versions.json` 与 release tag 的版本一致
- [ ] `npm install` 或有锁文件时 `npm ci` 成功
- [ ] `npm run typecheck` 成功
- [ ] `npm test` 成功
- [ ] `npm run build` 生成生产版 `main.js`
- [ ] `npm run package` 输出可解压产物
- [ ] 发行包包含同版本 `main.js`、`manifest.json`、`styles.css`
- [ ] MIT LICENSE 和 README 随源码提供
- [ ] 构建产物不含真实 Vault 数据、令牌、密码或伪造的真实示例

## 全新测试 Vault

- [ ] 手动安装三个运行文件，重启后能启用插件
- [ ] 命令面板“打开研发负责人工作台”能打开原生视图
- [ ] 空数据状态清楚，没有误报零容量或假完成率
- [ ] 六个页面和空态不存在全局说明入口或虚构记录创建入口
- [ ] 命令、设置和生产包不包含虚构数据生成器
- [ ] 更新不删除或修改任何已有记录（包括此前创建的测试记录）
- [ ] 六个入口能使用同一份记录，窄屏/不同主题内容可读
- [ ] 来源入口能打开对应笔记；缺失来源不会无提示地冒充有效证据
- [ ] 修改 Markdown 后刷新结果正确

## 业务语义

- [ ] 默认 test-passed 闭环不把 dev-complete 算为闭环
- [ ] released、accepted 保留独立状态；cancelled 单列
- [ ] 原始计划日期与当前预测日期同时保留
- [ ] 自定义周期包含首尾日，跨月/跨年/闰日不偏移
- [ ] 默认与个人日历、周末例外均生效
- [ ] 请假、会议、支持、缓冲都从毛容量扣除
- [ ] 0 容量和未知容量明确不同
- [ ] 部分重叠安排按适用工作日分摊
- [ ] 未排期任务不会被自动计为本周期已分配工作
- [ ] 循环依赖、缺失依赖、阻塞、过期、长期未更新能提示
- [ ] 容量/负荷无个人优劣排名或绩效措辞

## 导入与确认流程

- [ ] 有效 CSV 和 JSON 都能预览；取消后没有写入
- [ ] 非法状态/日期/工时、缺少关键字段会指出原因
- [ ] 文件内重复 ID 与已有任务 ID 不会静默覆盖
- [ ] 原系统来源保留，没有自动外部写回
- [ ] 规则整理清楚标明离线规则，不宣称使用 LLM
- [ ] 原文、候选匹配和变更能在确认前检查
- [ ] 否定/预测/歧义不会未经确认直接成为已完成事实
- [ ] 未匹配或未确认内容不会自动改变事实、完成率或负荷
- [ ] 取消、关闭、重复操作、切换视图后再次确认的行为安全
- [ ] 已被外部修改的任务要求刷新，不覆盖新内容
- [ ] 自定义 YAML 属性和正文保留

## 基线与报告

- [ ] 冻结快照先确认，取消无文件副作用
- [ ] 后续任务修改没有回写旧基线
- [ ] 新增范围与原范围偏差分开呈现
- [ ] 周会摘要显式显示周期与完成口径
- [ ] 事实、预测、人工判断、未知信息和来源可追溯
- [ ] 报告生成没有改变任务状态或对外发送内容
- [ ] 同名报告保存不覆盖已有文件

## 兼容、停用与发布

- [ ] 插件停用后视图与监听释放，没有残留报错
- [ ] 重复打开/关闭不产生重复视图或重复处理
- [ ] 实测过的系统、Obsidian 版本和主题被记录；未实测项明确标注
- [ ] 若发布移动兼容说明，完成移动端实测或清楚标注未验证
- [ ] 只在真实 GitHub 仓库和 release 可访问后提供 BRAT 地址
- [ ] 社区目录尚未接受时，没有“已上架”的宣传
- [ ] 对外发布前确认无商业机密和真实个人资料

## 结果记录模板

```text
Version / commit:
Date:
Environment:
Automated checks:
Desktop smoke test:
Mobile smoke test:
Import/confirmation checks:
Known limitations:
Release assets:
Not tested:
```

## Official release guidance

- [Obsidian: Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Obsidian manifest reference](https://docs.obsidian.md/Reference/Manifest)
- [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
