# Changelog

## [2.0.0] - 2026-09-06

### Breaking changes

- Default to Bundle CLI 0.1.0, declared resource-type/attribute ownership, and
  format 2 bundles. Migrate label rules, rebuild archives, and re-sign them.
- Reject path-prefixed checksum aliases; require exact flat asset filenames.
- Verify the immutable candidate and its native archive installer on all four
  runner platforms before publication. See [MIGRATION.md](MIGRATION.md).
