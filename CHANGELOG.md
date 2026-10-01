# Changelog

All notable user-facing changes are documented here. Versions follow semantic versioning while the project remains an early release.

## 0.1.0 — 2026-10-01

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
