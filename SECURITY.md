# Security policy

Please report suspected vulnerabilities privately through GitHub's security
advisory interface for this repository. Do not open a public issue containing
exploit details, credentials, signing keys, or private policy data.

The action downloads only an exact semantic version from the
`treetop-policy-engine/treetop-bundle` GitHub releases, limits each download to
128 MiB, and verifies the selected archive using the release checksum manifest
before extraction. Consumers should pin this action itself to a full commit SHA
in protected workflows.
