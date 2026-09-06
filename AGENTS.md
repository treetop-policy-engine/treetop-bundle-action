# Repository guidelines

Prioritize correctness and one strict project contract over compatibility in early
releases. Use Bundle CLI for validation; do not copy Cedar or label application
logic into the action. Document breaking syntax, format, and default changes.

Keep action inputs and runtime defaults aligned. Preserve bounded downloads and
CLI output, exact checksum verification, strict warning handling, and escaped
GitHub workflow commands. Pin Actions and candidate sources to reviewed SHAs.

Run `npm ci`, `npm run lint`, `npm run test:coverage`, and actionlint. Keep all
native runner scenarios and the real installer/download/extraction checks enabled.
Verify candidate binaries from immutable sources before prerequisite releases exist.
Use signed commits. Do not merge, tag, or publish before user approval.
