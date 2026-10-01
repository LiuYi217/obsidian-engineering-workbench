# v0.1.0 verification record

## Unknown task-data compatibility

Empty task dates and null remaining effort are accepted without fabricated values. Co-assignees are retained without duplicating primary allocations. Incomplete schedules/estimates prevent a spare-capacity claim, including project People and weekly summaries. Regression tests cover raw Vault validation, native edit preservation and stale conflicts, JSON/CSV round trips, immutable baselines, and linked meeting dates. The local aggregate passes **137 tests**, strict TypeScript and production build. The browser suite now has **32 cases**; new compatibility cases require the exact-commit CI run. No external work records are included in fixtures.

## Verified removal runtime

The global tab help, fictional-record creation feature and empty project-scope scaffold have been removed. Production dependency-graph tests prove fixture data is not bundled; native command-registration and existing-note preservation tests pass. Existing Vault notes are not deleted or migrated. Empty and legacy-placeholder scope blocks are hidden without changing stored text; real scope content remains visible.

The six-view meeting/material/prototype extension remains at package version 0.1.0 with no release tag created by this task.

## Passed

Verified on 2026-10-01. Runtime commit: `1a786d835b25ea78a3edc6440245357fdeb30ec2`.

- Strict TypeScript, production build and packaging pass
- **117 tests pass**, including calendar/capacity/baseline/import compatibility, immutable exact version pins, meeting evidence, ZIP security and native interaction contracts
- **30 Playwright cases pass** on GitHub Actions Ubuntu at desktop 1440px and mobile 390px: all six views, project detail tabs, meeting summary/transcript separation, material version states, responsive layout, filters, task details, keyboard navigation, removed-help/creator absence, empty state, and project-scope preservation
- **0 dependency vulnerabilities** from npm audit; runtime archive helper uses pinned fflate 0.8.3 and includes its MIT license
- Meeting timestamps are rendered in the host local timezone with an explicit UTC offset. Tests cover UTC+08 round-trip input, offset-equivalent timestamps, midnight rollover, instant ordering, and DST-gap rejection. Browser CI uses Asia/Shanghai and verifies the displayed UTC+08 values
- CI `main.js`, `manifest.json` and `styles.css` match local artifacts byte-for-byte
- Fourteen genuine CI screenshots were captured. Pixel review checked all six tabs at both viewport sizes and both empty-state views: no removed help or fictional-creator entry remains; mobile materials use labeled compact cards, with status/action text kept intact. Inapplicable date filters are absent from meeting/material history views

Selected current screenshots are under `docs/screenshots/`. They show the shared browser renderer and synthetic data, not a live Obsidian application.

## Safety and data coverage

- Old schemaVersion 1 records need no migration; optional meeting/version references remain optional
- New arrivals do not automatically become adopted; immutable version records and adoption events preserve previous versions and exact task/meeting pins
- Native-contract tests exercise adoption ABA tokens, serialized concurrent confirmations, duplicate identities arriving during asynchronous copy, partial-copy failures and safe retries, stale meeting edits, custom frontmatter and body preservation
- External local opening checks the managed Assets/version subtree, manifest entry, all asset sizes/hashes, and stale metadata before and after confirmation; tests reject tampering and symlink escape
- ZIP tests reject traversal, absolute/Windows paths, Unicode/case aliases, symlinks, special files, malformed headers, bad CRCs, oversized output and zip bombs; ZIP64 and encrypted archives fail closed. Original bytes and empty directories are preserved
- Raw meeting text and suggestions do not become confirmed decisions automatically. Linking actions creates no duplicate tasks
- Synthetic fixtures validate across weekday/weekend, year boundary and leap-day dates. Example URLs use example.com only

Native-contract tests bundle the actual store/modal code against a minimal in-memory Obsidian/DOM mock. They do not establish actual Obsidian YAML-engine or operating-system integration compatibility. Browser-harness actions for native file writes are mocked separately.

## Not yet verified / boundaries

- Actual desktop Obsidian loading, file picker behavior, real processFrontMatter formatting and native Electron external-app dispatch
- Actual Obsidian iOS/Android host behavior, all third-party themes, or every assistive technology
- Local external file opening on mobile: deliberately unsupported, with a clear message; HTTP(S) source URLs can be opened externally
- Transcription, external AI, TAPD/WBS writeback, automatic prototype execution, iframe embedding or a prototype hosting server: not implemented
- Legacy Office `.doc`, `.xls`, `.ppt` formats are not supported by the document file picker/open action. Modern `.docx`, `.xlsx`, `.pptx`, plus PDF/Markdown/text/CSV/JSON are supported as source files; no content conversion is performed
- No acceptance into Obsidian's official community plugin directory is claimed

An archive-integrity check is not a malicious-code audit. Open only trusted content and test in a backup Vault first. Online URLs remain maintained by their external provider; a frozen reference does not freeze that website's remote bytes.

[Verified runtime CI run](https://github.com/LiuYi217/obsidian-engineering-workbench/actions/runs/36874816163) · [GitHub Actions history](https://github.com/LiuYi217/obsidian-engineering-workbench/actions)
