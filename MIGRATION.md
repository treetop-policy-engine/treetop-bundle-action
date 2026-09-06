# Breaking action v2 migration

Action v2 defaults to Bundle CLI 0.1.0 and the coordinated Core 0.1.0 contract.
Upgrade Core, Bundle, REST, and downstream consumers together. Early releases
prioritize correctness and uniform contracts over compatibility.

Use a reviewed immutable action commit in protected workflows. `@v2` identifies
the new major release; `@v2.0.0` identifies this exact version.

## Labels and archives

Replace label rules with declared targets:

```json
{
  "target": {"resource_type": "App::Host", "attribute": "labels"},
  "field": "name",
  "patterns": [{"name": "prod", "regex": "^prod"}]
}
```

Each exact resource type and attribute tuple has one owner. Different types may
reuse attribute names. Core enforces scope during both application and sanitation;
policies must constrain resource types before trusting labels. Set bundle/module
manifests to format 2, rebuild archives, and re-sign. Old syntax and format 1 fail
validation clearly. Do not use old archives with the new CLI.

Checksum manifests now require flat, exact asset filenames. Path-prefixed legacy
aliases are rejected. Duplicate entries, checksum mismatches, unsupported runners,
and malformed CLI responses remain errors; warning policy is unchanged.

## Release verification

CI builds the immutable Bundle 0.1.0 release revision on Linux x64/ARM64, macOS
ARM64, and Windows x64. It runs validation/build scenarios and verifies native
archive packaging through the production installer using a local HTTP fixture.
A separate matrix downloads the actual published CLI assets, verifies checksums,
executes validation, and checks reuse of the installed binary on every platform.
For local development, build the same release source and supply `binary-path`.

Publish Core and Bundle 0.1.0 before action v2.
