# Changelog

All notable user-facing changes are documented here. Versions follow semantic versioning while the project remains an early release.

## Unreleased — 0.1.0 source extension

The package version remains 0.1.0. This section does not announce a new release, tag, or published asset.

### Added

- Six primary views: Workbench, Projects, People, Meetings, Materials, and Weekly Plans
- Project detail tabs for Overview, Tasks, People, Meetings, Documents, and Prototypes
- Meeting records with pasted/imported minutes, original links, discussion/confirmed decisions, unresolved items, and task-linked actions with owner and due date
- Immutable document/prototype version records, explicit separate adoption records, source/provider preservation, and exact-version task/meeting references
- Version history and manually entered change/review notes; receiving or adopting a newer version never silently changes existing references
- Guarded HTML, folder, ZIP, and HTTP(S) URL intake with explicit entry selection and original resource structure preserved
- System-browser opening with desktop Electron support for local files and online URL support on mobile
- Compact synthetic meetings and materials: two meetings, three prototype versions, one document version, and an adopted older version still pinned by a task

### Boundaries

- No audio transcription, automated factual decisions, content diff engine, automatic adoption, or inferred successful preview
- No prototype iframe, in-plugin execution, hosting server, background source retrieval, or silent local-server startup
- Archive validation guards paths, size and integrity; it does not certify executable prototype content as safe
- Current extension verification is recorded separately from historical checks in `docs/verification.md`

## 0.1.0 — 2026-10-01 (earlier implementation)

Initial local-first engineering lead workbench for Obsidian.

### Added

- Native workbench views for Home, Projects, People, Coordination, and Weekly Plans
- Shared Markdown records for projects, modules, people, tasks, decisions, and frozen planning baselines
- Explicit development, testing, release, and acceptance states with test-passed as the default closure threshold
- Calendar-aware capacity and period allocations, including leave, meetings, support, buffer, exception dates, and unknown-capacity warnings
- Exception-first planning for blockers, dependencies, overdue work, stale records, coordination, unallocated work, and capacity issues
- CSV/JSON import previews with validation and duplicate detection before confirmed writes
- Offline rule-assisted progress review with explicit confirmation and pending-note handling
- Frozen baseline comparison and deterministic, source-backed weekly meeting reports
- Entirely synthetic, current-week demo data with clear caveats
- Chinese documentation, English overview, MIT license, build and release workflow

### Boundaries

- No external model calls, telemetry, TAPD API integration, or automatic two-way synchronization
- No automatic task approval, performance ranking, guaranteed delivery forecasts, or tamper-proof audit store
- Community-directory acceptance and device-specific validation must not be inferred from this release

### 界面精简

- 五个面板移除标语、重复说明、副标题和指标脚注
- 口径、容量明细和基线详情改为按需展开
- 保留风险原因、未知容量、超量、未排期提示，以及关键字段标签
- 更新桌面和 390px 窄屏 CI 截图；45 项核心测试和 16 项浏览器测试通过

### 会议时区修正

- 会议卡片、确认预览和任务引用使用本地时间，并显示 UTC 偏移
- 按真实时间排序；编辑时间正确往返 ISO UTC，补充 UTC+08 与夏令时边界测试
