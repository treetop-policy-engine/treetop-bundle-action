# Changelog

## [Unreleased]

### Breaking changes

- Default to Bundle CLI 0.2.0, Core 0.2.0, and Cedar 4.13.0. Rebuild and re-sign
  archives for consumers requiring these exact generator versions. Manifest
  format 2 and label syntax are unchanged; see [MIGRATION.md](MIGRATION.md).

### Changed

- Refresh Rust toolchain action pins and the artifact-upload example. Verify
  Bundle 0.2.0 source, native archives, and published downloads on all platforms.

## [2.0.0] - 2026-09-06

### Breaking changes

- Default to Bundle CLI 0.1.0, declared resource-type/attribute ownership, and
  format 2 bundles. Migrate label rules, rebuild archives, and re-sign them.
- Reject path-prefixed checksum aliases; require exact flat asset filenames.
- Verify the immutable Bundle 0.1.0 release source, native archive installer, and
  actual published downloads on all four runner platforms. See
  [MIGRATION.md](MIGRATION.md).
