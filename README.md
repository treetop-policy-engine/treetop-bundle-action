# treetop-bundle-action

Validate Cedar permissions, schemas, labels, module manifests, and complete
Treetop bundles in GitHub Actions. Diagnostics become file annotations and a
job summary; successful checks can optionally produce a deterministic unsigned
bundle for a later deployment job.

The action is a small, dependency-free Node.js adapter around the
[`treetop-bundle`](https://github.com/treetop-policy-engine/treetop-bundle) CLI.
It downloads an exact CLI release, limits downloads to 128 MiB, verifies the
archive against that release's `SHA256SUMS`, and invokes the CLI without a
shell.

## Validate a bundle on pull requests

```yaml
name: Policy

on:
  pull_request:

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: treetop-policy-engine/treetop-bundle-action@v1
        with:
          manifest: treetop-bundle.toml
          deny-warnings: true
```

Use an immutable full commit SHA instead of `v1` in protected workflows. A
major-version tag is shown above for readability.

The default target is inferred from `treetop-bundle.toml`,
`treetop-module.toml`, or a `.cedar` filename. An explicit target supports less
conventional names:

```yaml
- uses: treetop-policy-engine/treetop-bundle-action@v1
  with:
    target: policy
    manifest: permissions/read.cedar
    schema: schema/application.cedarschema
    labels: labels/resources.json
```

For multiple independently owned bundles, use a job matrix so each policy
project gets its own check result:

```yaml
strategy:
  matrix:
    policy: [identity, billing, infrastructure]
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: treetop-policy-engine/treetop-bundle-action@v1
    with:
      working-directory: policy/${{ matrix.policy }}
      deny-warnings: true
```

## Build an unsigned artifact

Setting `build-output` changes the bundle operation from `check` to `build`.
The same validation is performed before anything is written.

```yaml
- id: bundle
  uses: treetop-policy-engine/treetop-bundle-action@v1
  with:
    manifest: treetop-bundle.toml
    build-output: dist/policy-bundle.tar.gz
    deny-warnings: true

- uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
  with:
    name: policy-bundle
    path: ${{ steps.bundle.outputs.archive-path }}
```

Signing should happen in a separate trusted push or deployment job rather than
in a pull-request validation job. This action intentionally does not accept a
private signing key.

## Inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `manifest` | `treetop-bundle.toml` | Bundle manifest, module manifest, or policy file |
| `target` | `auto` | `auto`, `bundle`, `module`, or `policy` |
| `schema` | | Schema for a standalone policy check |
| `labels` | | Labels for a standalone policy check |
| `working-directory` | `.` | Base directory for policy paths |
| `deny-warnings` | `false` | Treat warnings as validation failures |
| `build-output` | | Build an unsigned archive at this path |
| `binary-version` | `0.0.4` | Exact CLI release, without a leading `v` |
| `binary-path` | | Use an existing CLI instead of downloading one |
| `github-token` | | Optional token for release downloads |

`binary-version` never accepts `latest` or a moving major version. Release
`0.0.4` provides native binaries for Linux x86-64 and ARM64, Apple-silicon
macOS, and Windows x86-64.

## Outputs

| Output | Purpose |
| --- | --- |
| `valid` | `true` when the configured validation policy passed |
| `diagnostics-json` | Complete structured diagnostic array |
| `archive-path` | Absolute path produced by `build-output` |
| `archive-sha256` | SHA-256 of the built archive |
| `binary-path` | Exact CLI executable used by the action |
| `binary-version` | Exact requested version or `custom` |

## Development

The unit suite covers platform resolution, strict inputs, command construction,
workflow-command escaping, diagnostic annotations, summaries, download limits,
checksum parsing, checksum failures, installation, and cache reuse:

```sh
npm ci
npm run lint
npm test
npm run test:coverage
```

CI additionally compiles the pinned Rust CLI on native Linux x86-64 and ARM64,
Apple-silicon macOS, and Windows x86-64 runners. Every runner checks valid and
invalid bundles, standalone policy and module modes, warning handling,
multi-module imports, paths with spaces, deterministic builds, output hashes,
and use of a preinstalled executable. A second four-platform matrix exercises
real release downloads, archive extraction, checksum verification, and CLI
execution on every supported native runner.
