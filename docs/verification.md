# v0.1.0 verification record

Checked on 2026-10-01 in a Linux build container, Node.js 24.19.0.

## Passed locally

- `npm run check`: strict TypeScript checking, 45 automated tests and production build
- `npm audit`: 0 vulnerabilities after a targeted development-only Moment 2.31.0 override
- `npm run package`: installable ZIP, standalone `main.js`, `manifest.json`, `styles.css` and SHA-256 checksums
- `npm run preview:build`: reusable five-tab UI compiles as a browser test harness
- GitHub Actions on commit `230277b0562e921f00379c1f57746ef19913a2ef`: all 16 desktop/mobile browser cases passed (6.9 seconds)
- Synthetic-data and authored-code privacy review: no real company/person data, credentials, analytics or runtime network calls found
- Independent review of capacity, baseline, imports and data-preservation semantics; identified defects fixed and covered by regressions

Tests include actual calendar days/exceptions, partial-period allocations, completed allocation retention, zero/unknown capacity, closure criteria, cancelled tasks, dependency cycles, frozen weekly scope, malformed CSV/JSON, duplicate IDs, rule extraction, stale approvals, malformed Vault properties, and Chinese source-backed summaries.

Seven tests bundle the actual plugin/store code against a minimal **mock** Obsidian/DOM host. They verify explicit confirmation/cancel, field clearing, blank effort rejection, immutable import previews, preservation of custom fields/body/original dates, baseline collision protection, progress preflight and partial-commit reporting. These are contract tests, not an actual Obsidian application or YAML-engine test.

## Browser verification

The GitHub Actions `browser-harness` job is configured to install Playwright Chromium on an Ubuntu runner, exercise the shared renderer at 1440px and 390px, and upload screenshots/traces under `browser-harness-results`.

All 16 browser cases passed on the Ubuntu CI runner for commit `230277b0562e921f00379c1f57746ef19913a2ef`, after fixing the accessible name of tab buttons. Tests cover the five views, 1440px/390px layouts, filters, empty states, task drill-in and close, keyboard focus, unknown capacity and uncaught JavaScript errors. The runtime assets produced by CI were compared byte-for-byte with the local build. All ten desktop/mobile screenshots were visually inspected; the captured viewports have readable text and no clipping or overlapping content. Selected screenshots are saved under `docs/screenshots/`.

The local browser connection could not reach the container's loopback address, and local Chromium could not create a required OS socket. Browser evidence comes from GitHub Actions, not those failed local attempts. See the [Actions history](https://github.com/LiuYi217/obsidian-engineering-workbench/actions) and always check the exact published commit.

The harness uses synthetic data and mocked actions for native Vault operations. Even a passing browser run does not establish native Obsidian host compatibility.

## Not yet verified

- Actual desktop Obsidian application loading, enable/disable, real `processFrontMatter` serialization and interactions
- Actual Obsidian mobile/iOS/Android host behavior
- Every third-party theme and accessibility assistive technology
- Acceptance into the official Obsidian community plugin directory

Install into a test Vault first and keep a backup before using real project records. No external synchronization or LLM integration is implemented.
