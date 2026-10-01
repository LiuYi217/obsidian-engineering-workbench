# Contributing

感谢你帮助改进研发负责人工作台！

## Local development

1. Use Node.js 22 or later and run `npm ci`
2. Run `npm run check` (strict TypeScript, unit tests and production build)
3. For continuous builds, run `npm run dev`
4. Copy `main.js`, `styles.css` and `manifest.json` to a **test Vault** under `.obsidian/plugins/engineering-lead-workbench/`
5. Reload the plugin and follow `docs/release-checklist.md`

No credentials or external services are needed. Please never commit a real Vault, customer data, employee information, credentials or secrets. Use the synthetic demo and fixtures.

## Data safety requirements

- Keep facts, forecasts and judgments distinct and traceable
- Do not overwrite original dates or existing baseline snapshots
- Preserve arbitrary user frontmatter and Markdown bodies
- Preview and explicitly confirm writes; stale previews must fail safely
- Unknown capacity must never become zero or "available"
- Keep period allocation separate from backlog and performance evaluation
- Any future external AI or sync requires an explicit opt-in design and privacy review

Use small, focused pull requests and add regression tests for fixes. Record precisely which checks passed; a browser harness is not a real Obsidian smoke test.

## Releases

Tags must match `manifest.json` exactly, for example `0.1.0` (no `v` prefix). The release workflow checks, packages, and creates a **draft** GitHub release. Review its assets and verification notes before publishing. GitHub publication is separate from acceptance into Obsidian's community directory.
