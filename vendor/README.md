# `vendor/`

Reproducible `npm pack` builds of `@aoc/protocol` from pinned Soberanía Protocol commits. The
**active** artifact is the one `package.json` installs via
`devDependencies["@aoc/protocol"]`; the others are retained as historical evidence and are
referenced by ADRs, source comments and prior release evidence.

| Artifact | State | Protocol version | Pinned commit |
| --- | --- | --- | --- |
| `aoc-protocol-0.2.0-rc.0.tgz` | **active** | `0.2.0-rc.0` (release candidate) | `dde34517d956156a0c735c18a805763a5e712879` |
| `aoc-protocol-0.1.0.tgz` | superseded, retained | `0.1.0` | `ab2ac6ef573c871a029a67b13d33ba9738cb5939` |

The active artifact's commit, filename and SHA-256 are pinned in
[`protocol-consumer.lock.json`](../protocol-consumer.lock.json). A superseded artifact is never
deleted and never overwritten: rewriting a tarball in place would falsify the evidence that a prior
Enterprise state was validated against it.

This is the canonical interim dependency mechanism while `@aoc/protocol` remains unpublished (see
`docs/integration/PROTOCOL_PACKAGE_CONSUMPTION.md`, "Registry transition").

Do not hand-edit these files. Rebuild with:

```bash
AOC_PROTOCOL_REPO=<path-or-url> AOC_PROTOCOL_REF=<full 40-character commit SHA> \
  AOC_PROTOCOL_TARBALL_OUT=./vendor \
  node scripts/protocol/build-protocol-tarball.mjs
```

then update `protocol-consumer.lock.json` (`commit`, `expectedVersion`, `tarball.*`) to match, and
run `node scripts/protocol/check-compatibility-lock.mjs` to confirm the lock file is internally
consistent. Once `@aoc/protocol` is published to a real registry, this directory and the `file:`
dependency should be removed in favor of an ordinary registry-resolved version.
