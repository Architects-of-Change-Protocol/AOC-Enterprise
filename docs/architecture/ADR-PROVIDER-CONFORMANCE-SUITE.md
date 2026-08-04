# ADR: Provider Conformance Suite (R005.D)

- Status: Accepted
- Deciders: AOC Enterprise architecture
- Sequence: R005.D, AOC Architectural Consolidation Program
- Repository: `architects-of-change-protocol/aoc-enterprise` (AOC Enterprise)
- Branch: `claude/provider-conformance-suite-67t084`
- Related: `ADR-ACCESS-LIFECYCLE.md` (R005.0, frozen input), `ADR-PROVIDER-ADAPTER-CONTRACT.md`
  (R005.A, frozen input), `ADR-PROVIDER-TRANSLATION-MODEL.md` (R005.B, frozen
  input), `ADR-PINATA-PROVIDER-ADAPTER.md` (R005.C, frozen input — consumed
  read-only by this sequence's reference execution, never modified)

## Role of this document

This ADR records the design of `@aoc-enterprise/provider-conformance-suite`
(`packages/provider-conformance-suite`): the canonical, provider-neutral
**Provider Conformance Suite** — the official compliance tests every future
Provider Adapter implementation must pass. `ADR-ACCESS-LIFECYCLE.md`
(R005.0), `ADR-PROVIDER-ADAPTER-CONTRACT.md` (R005.A),
`ADR-PROVIDER-TRANSLATION-MODEL.md` (R005.B), and
`ADR-PINATA-PROVIDER-ADAPTER.md` (R005.C) are treated as frozen architecture
throughout: nothing in any of those documents, or in any contract they
freeze or define, is redesigned, renamed, or modified by this change.

This package is not a provider. It is not an adapter. It is not a test for
Pinata. It defines only the provider-neutral verification rules every
future Provider Adapter (Pinata, S3, Azure Blob, Google Drive, SharePoint,
Dropbox, or any other) is certified against.

---

## Phase 1 — Repository Validation

| Check | Result |
|---|---|
| Repository | `architects-of-change-protocol/aoc-enterprise` |
| Branch | `claude/provider-conformance-suite-67t084` (pre-existing, checked out) |
| Working tree | Clean at time of writing (no untracked/modified files) before this change |
| HEAD SHA (base) | `83dcfb8d7acf17908c251843d3774ffb63a57dc0` (merge of PR #89, `feat(access-governance): add Pinata Provider Adapter (R005.C)`) |

The designated branch already existed and is the one this sequence commits
to. `ADR-ACCESS-LIFECYCLE.md` (R005.0), `ADR-PROVIDER-ADAPTER-CONTRACT.md`
(R005.A), `ADR-PROVIDER-TRANSLATION-MODEL.md` (R005.B), and
`ADR-PINATA-PROVIDER-ADAPTER.md` (R005.C) are present, merged, and treated
as canonical, frozen input for this sequence.

---

## Phase 2 — Architecture Review: identifying invariants

Every invariant this sequence turns into a canonical test was already
established, not invented, by R005.0/R005.A/R005.B/R005.C:

| Invariant | Source | Becomes |
|---|---|---|
| A translation-consuming adapter accepts `unknown` and validates internally, mirroring `validateEnterpriseProviderTranslation`'s own convention. | R005.C Phase 3 (`executePinataProviderTranslation(candidate: unknown, ...)`) | `EnterpriseProviderConformanceHarness.execute(candidate: unknown)`; "malformed translation rejected" check. |
| A capability an adapter has not declared must never be faked as supported. | R005.C Phase 4 ("Unsupported capabilities... never faked") | Capability validation category. |
| A closed, six-value `EnterpriseProviderFailureReason` vocabulary is the only way a provider-side failure is reported — never an HTTP status, SDK exception, or provider object. | R005.A Phase 7; R005.C Phase 7 | Failure normalization category. |
| No Enterprise contract or other adapter may import a provider SDK; only the adapter's own declared file(s) may. | R005.C Phase 8 (`scripts/check-pinata-boundary.mjs`) | `evaluateEnterpriseProviderConformanceBoundary`; boundary validation category. |
| An execution intent's declared `capability` must equal what `enterpriseProviderTranslationRequiredCapability` requires. | R005.B Phase 6 ("capability consistency") | Dependency validation category. |
| Every translation and capability declaration must survive `serialize -> JSON round-trip -> deserialize` unchanged. | R005.A/R005.B Phase 7 ("Serialization") | Serialization consistency category. |
| `providerSystem` is always free text, mirroring `EnterpriseResourceEnvelope.location.system` — never a closed provider enum. | R005.0 Phase 5; R005.A Phase 5 | Provider neutrality category. |
| An adapter declaring `SupportsExpiration` must refuse to translate/honor an expired grant. | R005.A Phase 5 (`SupportsExpiration`) | "Expired grant rejected" check (conditional on the capability being declared). |
| Provider Execution's own output is deliberately unmodeled ("provider-specific by construction"). | R005.A Phase 6; R005.B Phase 5 | The suite's own additive `EnterpriseProviderConformanceExecutionResult` envelope — necessary for "execution normalization" to be checkable at all, without redefining or widening R005.A/R005.B's frozen scope (see Phase 3 below). |

No invariant in this table was newly invented for this sequence; each one
already existed in prose, in a compile-time proof, or in a per-adapter
script (`check-pinata-boundary.mjs`). This sequence's contribution is
making every one of them *reusable and provider-neutral*, rather than
re-derived per adapter.

---

## Phase 3 — The one genuinely new artifact: the canonical execution-result envelope

R005.A Phase 6 and R005.B Phase 5 both state, explicitly, that Provider
Execution's *output* is unmodeled: *"No Provider Translation output type,
and no Provider Execution type, is defined anywhere in this package"*
(R005.A); *"Provider Execution... is entirely outside this model"* (R005.B).
A conformance suite whose task explicitly requires "Execution normalization"
and "Metadata normalization" categories cannot certify a shape that does not
exist. This sequence therefore defines exactly one new, additive artifact —
`EnterpriseProviderConformanceExecutionResult`
(`EnterpriseProviderConformanceExecutionSuccess |
EnterpriseProviderConformanceExecutionFailure`) — as this suite's own,
`schemaVersion`-carried certification envelope. This is not a redesign or a
widening of R005.A/R005.B's frozen scope:

- It is not written back into, or referenced by, any of the seven R004
  contracts, `EnterpriseProviderCapabilityDeclaration`, or
  `EnterpriseProviderTranslation`.
- It is deliberately close to, but independent of,
  `PinataProviderExecutionResult` (`@aoc-enterprise/pinata-adapter`) — the
  one existing reference implementation had already converged on
  structurally the same shape (`outcome`/`translationId`/`grantRef`/
  `correlationId`/`executionIntent`/`providerSystem` plus either
  `detail`/`executedAt` or `failureReason`/`message`/`failedAt`) before this
  suite existed. This sequence formalizes an already-converged-on pattern,
  not an invented one.
- `detail` is typed `unknown` at the type level (validated at runtime by
  `isEnterpriseProviderConformanceExecutionDetail`) precisely because
  Provider Execution's own output is legitimately different per provider —
  the suite's job is to validate its *shape* (JSON-safe, no raw SDK object),
  never to fix its *contents*.

---

## Phase 4 — Boundary Tests

Proven, not merely asserted:

- **`src/` (the suite's own production code) never imports a provider.**
  `scripts/check-provider-conformance-boundary.mjs` scans `src/` for both a
  known provider SDK import (`pinata`, `aws-sdk`, `@aws-sdk/*`, `@azure/*`,
  `googleapis`, `dropbox`) and any concrete Provider Adapter package import
  (`@aoc-enterprise/*-adapter`, exempting only the frozen `provider-adapter`
  *contract* package by its own naming collision) and fails on any match.
  Zero matches exist.
- **Providers never modify Enterprise.** This sequence adds one new
  package and one new tsconfig reference; it touches zero files under
  `packages/pinata-adapter`, `packages/provider-adapter`,
  `packages/provider-translation`, or any other existing package.
- **Provider SDKs never leak.** `evaluateEnterpriseProviderConformanceBoundary`
  is the reusable, pure comparison function any adapter's own filesystem
  scan (mirroring `check-pinata-boundary.mjs`) can call. This suite performs
  no filesystem access itself.
- **No provider objects cross the boundary.** `isEnterpriseProviderConformanceExecutionDetail`
  requires a plain, JSON-safe object with a `kind` discriminant — a proxy
  proven to reject class instances, functions, and deeply-nested structures
  a raw provider SDK response would carry (`__tests__/enterprise-provider-conformance-suite.test.ts`,
  "rejects nested functions or deeply-nested objects").
- **The one documented, provable exception.** Exactly one file,
  `__tests__/reference-pinata-conformance.test.ts`, is permitted to import a
  concrete adapter package (`@aoc-enterprise/pinata-adapter`, a
  `devDependency`) — the Phase 10 reference execution. The same boundary
  script asserts this is the *only* test file that does so; any other test
  file importing a concrete adapter package fails the check.

---

## Phase 5 — Capability Tests

`runEnterpriseProviderConformanceSuite` verifies, for every harness:

- The adapter's own `EnterpriseProviderCapabilityDeclaration` validates
  against the closed, reused `EnterpriseProviderCapability` vocabulary
  (`validateEnterpriseProviderCapabilityDeclaration`, never redefined).
- Every declared capability is a member of that closed vocabulary — "no fake
  capability declarations" restated as a provider-neutrality check.
- For every execution intent whose required capability is declared: the
  adapter accepts and executes the translation.
- For every execution intent whose required capability is **not** declared:
  the adapter returns a normalized failure with `failureReason:
  'capability-unsupported'` — never a fabricated success, and never a leaky
  or malformed failure result (the same field-set/vocabulary checks run
  regardless of whether the capability was declared — see Phase 8 below).

---

## Phase 6 — Translation Tests

| Verified | How |
|---|---|
| Translation accepted | A canonical, valid translation (built by the suite itself, using the closed `EnterpriseProviderTranslationExecutionIntent` vocabulary) is accepted — `execute()` resolves rather than throws — whether or not its capability is declared. |
| Invalid translation rejected | `execute()` is called with a structurally invalid candidate (missing required fields); the adapter must reject it (throw), never silently accept and fabricate a result. |
| Malformed translation rejected | Same mechanism — `validateEnterpriseProviderTranslation` is the frozen arbiter of "malformed"; every fixture translation the suite itself constructs is asserted valid against it before being handed to the adapter. |
| Missing capability rejected | See Phase 5 — a translation whose required capability is undeclared must fail with `capability-unsupported`. |
| Expired grant rejected | Conditional on `SupportsExpiration` being declared (`EnterpriseProviderTranslation` itself carries no `expiresAt`, by R005.B's own design — R005.B Phase 5 explicitly reserves that field to `EnterpriseAccessGrant` alone). When declared, the harness's own `translateExpiredGrant` hook must report `failureReason: 'grant-expired'`; when not declared (as with Pinata — see Phase 10), the check is reported `'skipped'`, never `'failed'`. |

---

## Phase 7 — Failure Tests

Every failure result, regardless of which code path produced it
(capability-unsupported or a genuine execution-time failure — Phase 8),
is checked against the closed, reused `EnterpriseProviderFailureReason`
vocabulary (`@aoc-enterprise/provider-adapter`, never redefined), a plain
non-empty string `message`, and an exact canonical field set — no
`httpStatus`, no `stack`, no SDK exception object, no provider response.
`__tests__/enterprise-provider-conformance-suite.test.ts` proves the suite
itself catches a deliberately leaky fake harness (`httpStatus: 500` appended
to an otherwise-canonical failure) — a negative test of the suite's own
logic, not of any real provider.

---

## Phase 8 — Execution Tests

Verified against the suite's own canonical `EnterpriseProviderConformanceExecutionResult`
envelope (Phase 3) — never against any provider's own internals:

- Every result (success or failure) echoes the originating translation's own
  `translationId`/`grantRef`/`correlationId`/`executionIntent`/`providerSystem`.
- A success result carries exactly the canonical success field set, and its
  `detail` is JSON-safe and provider-neutral (Phase 4).
- A failure result carries exactly the canonical failure field set.

These checks run identically whether the underlying execution intent's
capability was declared or not — a capability-unsupported failure is held to
the same normalization standard as any other failure, closing a gap an
earlier iteration of this suite's own test-driven development caught (see
`__tests__/enterprise-provider-conformance-suite.test.ts`, "fails
failure-normalization when a failure result leaks non-canonical fields").

---

## Phase 9 — Documentation

Full design rationale, the certification harness shape, the conformance
category table, the boundary-validation wiring instructions, the "how
adapters become compliant" walkthrough, the Phase 10 reference-execution
result, and the future-compatibility table are recorded in
`packages/provider-conformance-suite/README.md`, matching the documentation
convention every R004/R005 package already establishes (a package README
for developer-facing detail, an ADR for the architectural record).

**Purpose:** the official certification mechanism validating that a Provider
Adapter implementation produces well-formed `EnterpriseProviderTranslation`
records and normalized execution results before Provider Execution is
trusted — the gap R005.B Phase 13 named and left open on purpose.

**Responsibilities / non-responsibilities:** Phase 2/3 (this document) /
README "Explicit non-responsibilities".

**How adapters become compliant:** README "How adapters become compliant" —
build a harness around already-implemented capability declaration/execute
functions; no adapter-specific suite code is required.

**How future providers reuse the suite:** README "Future compatibility" — a
per-provider table (S3, Azure Blob, Google Drive, SharePoint, Dropbox, an
alternate IPFS implementation) showing the identical harness shape and
identical checks apply, with zero suite-side changes.

**Certification philosophy:** README "Certification philosophy" — *"Future
providers do not define compliance. They prove compliance against this
suite."*

---

## Phase 10 — Reference Execution

Run against: **the Pinata Provider Adapter** (`@aoc-enterprise/pinata-adapter`,
R005.C), consumed read-only as a `devDependency` of this package, via its
already-published public exports (`createPinataProviderCapabilityDeclaration`,
`executePinataProviderTranslation`, `PINATA_PROVIDER_SYSTEM`) plus a fake
`PinataProviderClient` — the identical fake-client pattern
`packages/pinata-adapter`'s own tests already use, so no test in this
package contacts a real Pinata endpoint or requires a real credential. Zero
files under `packages/pinata-adapter` are modified by this sequence.

### Result: **PASS**

`__tests__/reference-pinata-conformance.test.ts`, `npm test --workspace
@aoc-enterprise/provider-conformance-suite`: every applicable check passes
(`report.passed === true`; zero `'failed'` checks). Detailed reasoning:

| Category | Outcome for Pinata | Why |
|---|---|---|
| Translation acceptance | Passed (every intent) | `ProvideTemporaryAccess`/`ProvideReadOnlyAccess`/`ProvideMetadata`/`InvalidateGrant` all execute cleanly; `RegisterUsage` is correctly rejected with `capability-unsupported` (below) rather than accepted; a malformed candidate is rejected via `PinataAdapterInputError`. |
| Capability validation | Passed | `createPinataProviderCapabilityDeclaration`'s declaration validates; the one execution intent whose required capability Pinata does not declare (`RegisterUsage`, requiring `SupportsUsageReporting`) is correctly rejected with `failureReason: 'capability-unsupported'`, never faked. |
| Failure normalization | Passed | The `RegisterUsage` failure carries exactly the canonical failure fields, a closed `failureReason`, and a plain string `message` — matches `packages/pinata-adapter/README.md`'s own documented "no raw error/HTTP-status/stack-trace ever returned" guarantee. |
| Execution normalization | Passed | Every result echoes the fixture translation's own identity fields; success results carry exactly the canonical field set. |
| Metadata normalization | Passed | `detail` for `temporary-access` (`accessUrl`, `expiresAt`), `metadata` (a flat `Record<string, primitive>`), and `grant-invalidated` (`providerResourceStatus`) are each JSON-safe with a `kind` discriminant. |
| Boundary validation | **Skipped** | No `boundaryEvaluation` is supplied by the reference harness. The real filesystem SDK-import scan already runs, and passes, independently as part of `packages/pinata-adapter`'s own `npm test` (`scripts/check-pinata-boundary.mjs`) — re-scanning here would duplicate, not strengthen, an already-passing proof. |
| Dependency validation | Passed (with one documented skip) | Every execution intent's `capability` matches what `enterpriseProviderTranslationRequiredCapability` requires. `expired-grant-rejected` is **skipped**: Pinata does not declare `SupportsExpiration` (`packages/pinata-adapter/README.md`, "Unsupported capabilities") — it consumes only `EnterpriseProviderTranslation`, which carries no `expiresAt` by R005.B's own design, so this check is correctly not applicable rather than failed. |
| Serialization consistency | Passed | Every fixture translation and the capability declaration itself round-trip through `serialize -> JSON -> deserialize` unchanged. |
| Provider neutrality | Passed | `capabilityDeclaration.providerSystem === 'pinata' === harness.providerSystem`; every declared capability is a member of the closed vocabulary. |

Exactly two checks are `'skipped'` (`expired-grant-rejected`,
`provider-sdk-import-boundary`), both asserted explicitly by the reference
test and both documented above as legitimate non-applicability, never a
suite gap or a silently-lowered bar.

---

## Phase 11 — Future Compatibility

No code in this suite changes to add a new provider. See the README's
"Future compatibility" table for the full per-provider mapping (S3, Azure
Blob, Google Drive, SharePoint, Dropbox, an alternate IPFS implementation).
Each future adapter:

1. Implements its own capability declaration and translation-consuming
   `execute` function (R005.A/R005.B/R005.C's own established pattern —
   unchanged by this sequence).
2. Builds an `EnterpriseProviderConformanceHarness` around them.
3. Calls `runEnterpriseProviderConformanceSuite(harness)` from its own test
   suite, against a fake client.
4. Wires a real filesystem SDK-import scan into `harness.boundaryEvaluation`
   via its own boundary script, reusing `evaluateEnterpriseProviderConformanceBoundary`.

No future provider requires a change to `packages/provider-conformance-suite/src`.
If one genuinely does, that is architectural drift to be reported as a new
sequence proposing a change to this ADR — never an implementation detail
smuggled into the suite to make one provider pass.

---

## Phase 12 — Validation

| Command | Result |
|---|---|
| `npm install` | Linked the new workspace package (`@aoc-enterprise/provider-conformance-suite`), its `file:`-referenced dependencies (`@aoc-enterprise/provider-adapter`, `@aoc-enterprise/provider-translation`), and its `devDependency` (`@aoc-enterprise/pinata-adapter`). Passed. |
| `npx tsc -b --pretty false` (root project references, including the new package added to `tsconfig.json`'s `references`) | Passed with no output (clean). |
| `npm run build --workspace @aoc-enterprise/provider-conformance-suite` | Compiled the package. Passed. |
| `npm run build --workspace @aoc-enterprise/pinata-adapter` | Compiled (dependency of the reference-execution test's `tsc -p tsconfig.test.json`). Passed. |
| `npm test --workspace @aoc-enterprise/provider-conformance-suite` | Compiled `__tests__` under `tsconfig.test.json` and ran `node --test` against the compiled output (**19/19 tests passed, 0 failed**, across 5 suites, including the Phase 10 reference execution against Pinata), then ran `scripts/check-provider-conformance-boundary.mjs` (passed). |
| `npm run typecheck` (root, `tsc -b --pretty false`) | Passed with no output (clean). |
| `npm run lint` (root: `check-node16-imports.mjs` + `lint-architecture.mjs` + `lint-public-surface.mjs`) | `Node16 import and boundary checks passed` / `Architecture lint passed` / `Public surface lint passed`. |
| `node scripts/check-aoc-boundaries.mjs` | `AOC boundary check passed`. |
| `node scripts/check-duplicate-semantic-contracts.mjs` | Reports the same three pre-existing violations already documented as pre-existing by `ADR-PROVIDER-TRANSLATION-MODEL.md` Phase 14 and `ADR-PINATA-PROVIDER-ADAPTER.md` Phase 11 (`EnterpriseResourceEnvelope`/`SerializedEnterpriseResourceEnvelope` in `access-decision` vs. `resource-envelope`; `AgentPassport` in `agent-governance` vs. `enterprise-host-sdk`) — none introduced by `packages/provider-conformance-suite`. |
| `node scripts/validate-publishability.mjs` | `Publishability validation completed successfully` (1413 shipped JS artifacts scanned, none import `@aoc/protocol` at runtime). |
| `npm test --workspaces --if-present` (every workspace, including the new package) | Exit code 0 across all workspaces; no failures. |
| `npm test` (root, full suite: root build + root tests + all workspace tests) | 268/268 root tests passed; all workspace `test` scripts, including `@aoc-enterprise/provider-conformance-suite`, passed. |

---

## Acceptance Criteria

- [x] Provider-neutral (`src/` imports no provider SDK, no concrete adapter package — `scripts/check-provider-conformance-boundary.mjs`)
- [x] No SDK (Phase 4)
- [x] No providers (Phase 4; the one reference-execution exception is a
      test-only, read-only, boundary-enforced consumption of Pinata's already
      -published public API)
- [x] Canonical tests (Phase 5–8, nine conformance categories)
- [x] Boundary validation (Phase 4, `evaluateEnterpriseProviderConformanceBoundary`)
- [x] Capability validation (Phase 5)
- [x] Translation validation (Phase 6)
- [x] Failure validation (Phase 7)
- [x] Execution validation (Phase 8)
- [x] Pinata passes (Phase 10 — PASS, two documented skips)
- [x] Tests pass (Phase 12 — 19/19 package tests, 268/268 root tests, all workspaces green)
- [x] Documentation updated (Phase 9, package README)
- [x] One Pull Request

---

## Most important rule, restated

The Conformance Suite becomes the official certification mechanism for
Provider Adapters. Future providers do not define compliance — they prove
compliance against this suite. It must never become a provider, an adapter,
an SDK wrapper, an execution engine, a governance engine, or an
authorization engine, and it must never depend on a concrete provider
package outside its own single, boundary-enforced Phase 10 reference-
execution test file. If a future change to this package starts to
accumulate any of those responsibilities, that is architectural drift to be
reported and reverted — never an incremental improvement to build on. **The
suite must remain provider-neutral forever.**

---

## Final Verdict

**R005.D COMPLETE — PROVIDER CONFORMANCE SUITE IMPLEMENTED**
