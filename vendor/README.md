# `vendor/`

Contains a single tracked artifact: `aoc-protocol-0.1.0.tgz`, a reproducible `npm pack` build of
`@aoc/protocol` from the Soberanía Protocol repository at the commit pinned in
[`protocol-consumer.lock.json`](../protocol-consumer.lock.json).

This is the canonical interim dependency mechanism while `@aoc/protocol` remains unpublished (see
`docs/integration/PROTOCOL_PACKAGE_CONSUMPTION.md`, "Registry transition"). `package.json` installs
it via `devDependencies["@aoc/protocol"] = "file:./vendor/aoc-protocol-0.1.0.tgz"`.

Do not hand-edit this file. Rebuild it with:

```bash
AOC_PROTOCOL_REPO=<path-or-url> AOC_PROTOCOL_REF=<full 40-character commit SHA> \
  AOC_PROTOCOL_TARBALL_OUT=./vendor \
  node scripts/protocol/build-protocol-tarball.mjs
```

then update `protocol-consumer.lock.json` (`commit`, `tarball.filename`, `tarball.sha256`,
`tarball.sizeBytes`) to match, and run `node scripts/protocol/check-compatibility-lock.mjs` to
confirm the lock file is internally consistent. Once `@aoc/protocol` is published to a real
registry, this directory and the `file:` dependency should be removed in favor of an ordinary
registry-resolved version.
