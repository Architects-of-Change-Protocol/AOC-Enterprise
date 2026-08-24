# ADR — Frontera ships as a self-contained runtime artifact

**Status:** Accepted (P0-PKG-03)
**Supersedes:** the blocking finding recorded by P0-PKG-02 in
[`../release/FRONTERA_CANDIDATE_EVIDENCE_1.0.0.md`](../release/FRONTERA_CANDIDATE_EVIDENCE_1.0.0.md)

This ADR authorizes no publication, tag, release or merge. It records a packaging decision only.

## Problem

P0-PKG-02 packed `@aoc-enterprise/runtime@1.0.0` and installed it, together with the frozen
`@aoc/protocol@0.2.0-rc.0` candidate, into a throwaway package outside this repository. Seven of the
ten declared exports loaded. Three did not:

```text
@aoc-enterprise/runtime/kernel        Cannot find module '@aoc-enterprise/governed-authority'
@aoc-enterprise/runtime/enterprise    Cannot find module '@aoc-enterprise/governed-authority'
@aoc-enterprise/runtime/kernel-host   Cannot find module '@aoc-enterprise/governed-authority'
```

Two shipped declarations failed to typecheck for the same class of reason:

```text
dist/src/kernel/contracts/ports.d.ts          TS2307: @aoc-enterprise/governed-authority
dist/src/kernel/contracts/kernel-request.d.ts TS2307: @aoc-enterprise/governed-authorization
```

The artifact was reproducible, its Protocol compatibility was proven, and its public surface was
unchanged — but it was **not self-contained**, so it did not satisfy its own declared public
contract. A consumer that installed it got a package whose exports map promised ten entry points and
whose bytes delivered seven.

## Measured dependency graph

P0-PKG-02 reported "13 `@aoc-enterprise/*` workspace packages required at runtime". That figure came
from grepping every `require()` string in the whole of `dist/`, which includes modules that no public
export reaches — feature code and compiled tests. It overstated the problem.

The graph was re-measured two ways, from the ten public export entry points only:

- **Runtime closure** — `Module._load` instrumented while loading all ten exports:
  **2 packages** (`governed-authority`, `scoped-access`).
- **Declaration closure** — walking `.d.ts` from the ten `types` entries, following relative
  specifiers and package entry declarations: **4 packages**
  (`governed-authority`, `governed-authorization`, `identity`, `scoped-access`), plus `@aoc/protocol`.

The union is **four private workspace packages**, two of which (`identity`, `scoped-access`) were
already declared dependencies. This agrees exactly with what the clean-room typecheck observed: two
unresolved modules, not eleven.

| Package | Version | Private | Role | Relation |
| --- | --- | --- | --- | --- |
| `@aoc-enterprise/governed-authority` | `0.1.0` | yes | runtime + declaration | direct |
| `@aoc-enterprise/governed-authorization` | `0.1.0` | yes | declaration | transitive (via `governed-authority`) |
| `@aoc-enterprise/identity` | `0.1.0` | yes | declaration | direct |
| `@aoc-enterprise/scoped-access` | `0.1.0` | yes | runtime + declaration | direct |

All four declare `files: ["dist"]`. `governed-authority` depends on `governed-authorization` through
`file:../governed-authorization`, a specifier that resolves only inside this monorepo.

## Options considered

**Option A — npm `bundleDependencies`.** Tested empirically, not from documentation: the four
packages were added to `dependencies` and to `bundleDependencies`, then packed, then installed into a
clean external package alongside only the Protocol candidate.

- npm honoured each bundled package's own `files: ["dist"]` — `src/`, `__tests__/`, `dist-test/`,
  `tsconfig*.json` and build info were all excluded.
- The bundled packages landed at
  `node_modules/@aoc-enterprise/runtime/node_modules/@aoc-enterprise/*` as real directories, not
  symlinks into the monorepo.
- npm never attempted to resolve them from a registry, and never tried to follow the
  `file:../governed-authorization` specifier: bundled dependencies are already satisfied in place.
- All ten exports loaded; `tsc` with `skipLibCheck: false` reported zero errors.
- Cost: +59,319 bytes and +86 files (3,244,268 → 3,303,587; 6,212 → 6,298).

**`OPTION_A_RESULT=VIABLE`**

**Option B — deterministic package staging.** Not tested. It exists to work around limitations
Option A did not exhibit, and it would introduce a bespoke artifact-assembly step, generated package
metadata, and a second definition of what "the package" is. Untested because unnecessary.

**Option C — code bundling (esbuild/rollup/tsup).** Not tested, and explicitly the last resort. It
would rewrite emitted JavaScript, put declaration emit and CommonJS semantics at risk, and require
proving runtime behaviour parity — a large blast radius for a problem solved by four lines of package
metadata.

## Decision

**Option A.** `@aoc-enterprise/runtime` declares its four private implementation packages as
`bundleDependencies`, so they travel inside the artifact.

```jsonc
"bundleDependencies": [
  "@aoc-enterprise/governed-authority",
  "@aoc-enterprise/governed-authorization",
  "@aoc-enterprise/identity",
  "@aoc-enterprise/scoped-access"
]
```

### What this preserves

- The distribution unit stays `@aoc-enterprise/runtime`. No new package identity is created.
- The four bundled packages stay `private: true`. None is promoted to an independently published
  product, and the clean-room gate asserts this on every run.
- The public export map is unchanged: ten keys, same targets, same fingerprint
  `2b0ee1e3afee7c02d600615771eac3fa8aeec680c27bf4189041715729a22438`.
- `dist/` is byte-identical to the pre-change build. No source, no runtime behaviour, no serialized
  representation changed.
- `@aoc/protocol` remains **external** — a peer dependency resolved by the consumer, never bundled.
  Protocol source appears nowhere in the artifact.
- `better-sqlite3` remains an ordinary external runtime dependency, installed normally from a
  registry. No native or platform-specific binary is inlined.

### What a consumer sees

```text
npm install <frontera.tgz> <protocol.tgz>

node_modules/
  @aoc/protocol/                       <- external peer, installed by the consumer
  @aoc-enterprise/runtime/
    dist/
    node_modules/@aoc-enterprise/      <- private implementation, carried by the artifact
      governed-authority/ governed-authorization/ identity/ scoped-access/
```

A consumer knows two names: `@aoc-enterprise/runtime` and `@aoc/protocol`. It never learns the names
of the private modules, never resolves them from a registry, and never reconstructs this monorepo's
workspace graph.

## Rejected on purpose

- **Publishing the private workspaces.** That would turn internal implementation modules into public
  products and change the external product architecture — a founder decision, not a packaging fix.
- **Removing `/kernel`, `/enterprise`, `/kernel-host`.** A breaking API change that hides the defect
  instead of fixing it.
- **Letting PMFreak consume only the seven working exports.** The package must satisfy its own
  declared contract before anything downstream depends on it.
- **Installing the private packages in the consumer fixture.** This is the important one. Both
  `check:clean-room-consumer` and `validate:publishability` used to pack `@aoc-enterprise/identity`
  and `@aoc-enterprise/scoped-access` and inject them next to the root package. That proves a
  consumer can rebuild the dependency graph by hand; it does not prove the artifact is
  self-contained, and it is exactly what masked this defect for the two exports that happened to be
  covered. Both gates now install the runtime and Protocol artifacts and nothing else, and the
  clean-room gate fails if any private `@aoc-enterprise/*` package appears alongside the runtime.

## Enforcement

`npm run check:clean-room-consumer` is the acceptance gate. It is wired into `validate:release`,
`validate:v1-release`, and a blocking `clean-room-consumer` CI job. It asserts, on every run:

- the consumer manifest declares only `@aoc-enterprise/runtime` and `@aoc/protocol`;
- no private `@aoc-enterprise/*` package is installed alongside the runtime;
- the artifact carries exactly the four expected private modules, each a real directory and each
  still `private: true`;
- all ten exports load and typecheck with `skipLibCheck: false`;
- Protocol resolves to the pinned candidate, inside the clean room;
- deep and undeclared imports remain unresolvable.

From this increment onward, no Frontera package is release-valid unless a clean external consumer can
load every declared public export.
