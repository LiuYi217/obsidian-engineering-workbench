# Security and privacy

This plugin runs locally inside the Vault and currently makes no network requests. It contains no analytics, external AI integration, remote synchronization, or credential storage.

If you discover a vulnerability, avoid including private Vault contents, passwords, tokens or other sensitive information in a public issue. Submit a minimal synthetic reproduction and describe the affected version. For a sensitive exploit, contact the repository owner through a private channel listed on their public profile before disclosing exploit details.

Community plugins run with the permissions of Obsidian. Review code before installing and keep backups of important Vaults. Frontmatter edits use the supported Obsidian API; text and formatting inside YAML may be normalized by Obsidian even though values outside approved fields and the Markdown body are preserved.

The development-only Obsidian API typing package pins an older Moment version. A targeted npm override uses Moment 2.31.0 to address [GHSA-4p3w-j4w9-5jqw](https://github.com/advisories/GHSA-4p3w-j4w9-5jqw). The plugin does not import Moment, and `obsidian` is externalized rather than bundled. Run `npm audit` when updating dependencies.
