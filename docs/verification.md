# v0.1.0 verification record

The meeting/material/prototype source extension remains untagged at package version 0.1.0. Historical results below apply only to the earlier implementation and must not be read as verification of the extension.

## Current extension checks

- The synthetic fixture was checked directly with all nine managed-record validators across 2026-09-28, 2026-10-01, 2026-10-04, 2027-01-01, and 2028-02-29; all records passed with no knowledge-reference warnings
- Each fixture contains four material-version records (three versions of one prototype and one document), two meetings, an explicit adoption of v0.2, and a task that remains pinned to v0.2 while v0.3 is incoming
- A direct adoption simulation across the same five dates confirmed that adopting v0.3 changes the selected adoption but preserves the task’s v0.2 pin and all immutable material records
- Demo source URLs use example.com only; local source references do not create or host any prototype assets
- `npm run check` passes strict TypeScript, 105 core/security/native-contract tests, and a production build
- `npm audit` reports 0 vulnerabilities; fflate is pinned to patched 0.8.3
- `npm run package` produces the installable assets; `npm run preview:build` and discovery of 24 browser cases pass
- Browser execution of the extension and real-host verification are still pending at this snapshot

The fixture checks are focused source-level checks, not Obsidian or browser tests.

## Historical baseline: before the extension

Checked on 2026-10-01 in a Linux build container, Node.js 24.19.0.

### Passed locally (historical)

- `npm run check`: strict TypeScript checking, 45 automated tests and production build
- `npm audit`: 0 vulnerabilities after a targeted development-only Moment 2.31.0 override
- `npm run package`: installable ZIP, standalone `main.js`, `manifest.json`, `styles.css` and SHA-256 checksums
- `npm run preview:build`: reusable five-tab UI compiles as a browser test harness
- GitHub Actions on commit `c7e8149`: all 16 desktop/mobile browser cases passed
- Synthetic-data and authored-code privacy review: no real company/person data, credentials, analytics or runtime network calls found
- Independent review of capacity, baseline, imports and data-preservation semantics; identified defects fixed and covered by regressions

Tests include actual calendar days/exceptions, partial-period allocations, completed allocation retention, zero/unknown capacity, closure criteria, cancelled tasks, dependency cycles, frozen weekly scope, malformed CSV/JSON, duplicate IDs, rule extraction, stale approvals, malformed Vault properties, and Chinese source-backed summaries.

Seven tests bundle the actual plugin/store code against a minimal **mock** Obsidian/DOM host. They verify explicit confirmation/cancel, field clearing, blank effort rejection, immutable import previews, preservation of custom fields/body/original dates, baseline collision protection, progress preflight and partial-commit reporting. These are contract tests, not an actual Obsidian application or YAML-engine test.

### Browser verification (historical)

The GitHub Actions `browser-harness` job is configured to install Playwright Chromium on an Ubuntu runner, exercise the shared renderer at 1440px and 390px, and upload screenshots/traces under `browser-harness-results`.

All 16 browser cases passed on the Ubuntu CI runner for commit `c7e8149`, after the concise-panel revision. The revision removes decorative slogans, repeated explanations and metric footnotes while retaining accessible controls, sources, uncertainty and visible capacity/risk warnings. Calculation explanations and secondary details are available on demand. Tests cover the five views, 1440px/390px layouts, filters, empty states, task drill-in and close, keyboard focus, unknown capacity and uncaught JavaScript errors. The runtime assets produced by CI were compared byte-for-byte with the local build. All ten desktop/mobile screenshots were visually inspected; the captured viewports have readable text and no clipping or overlapping content. Selected screenshots are saved under `docs/screenshots/`.

The local browser connection could not reach the container's loopback address, and local Chromium could not create a required OS socket. Browser evidence comes from GitHub Actions, not those failed local attempts. See the [Actions history](https://github.com/LiuYi217/obsidian-engineering-workbench/actions) and always check the exact published commit.

The harness uses synthetic data and mocked actions for native Vault operations. Even a passing browser run does not establish native Obsidian host compatibility.

## Not yet verified for the current extension

- Actual desktop Obsidian application loading, enable/disable, real `processFrontMatter` serialization and interactions
- Six-view navigation, project sub-tabs, meeting/material modals, and native prototype intake/opening in a real Obsidian host
- Desktop Electron external-browser behavior and the mobile local-file unsupported state
- Actual Obsidian mobile/iOS/Android host behavior
- Every third-party theme and accessibility assistive technology
- Acceptance into the official Obsidian community plugin directory

Install into a test Vault first and keep a backup before using real project records. No external synchronization or LLM integration is implemented.
