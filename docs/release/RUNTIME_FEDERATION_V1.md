# Runtime Federation Check — Resolution Report (PR-RC Objective 8)

## Symptom

`npm run check:runtime-federation` failed identically on `main` and on the release branch with:

```
Error: reconciliation_failed:rejected
```

while the federation contract suite (`tests/runtime-federation.test.mjs`) passed. PR-008 documented this as an open known issue.

## Root cause

**Tooling defect — an incorrect expectation in the validation script. The runtime is correct.**

`scripts/check-runtime-federation.mjs` constructed its "foreign" envelope by spreading a valid local envelope and renaming **only** `lineage.lineageId`:

```js
{ ...env,
  federationMetadata: { ...env.federationMetadata, federationSequence: 2 },
  lineage: { ...env.lineage, lineageId: `${env.lineage.lineageId}:remote`, ... } }
```

The federation validator (`src/runtime/federation/runtime-federation-validation.ts`) enforces the envelope-internal consistency invariant

```
federationMetadata.continuityLineageId === lineage.lineageId
```

(error code `continuity_lineage_id_mismatch`), and `reconcileRuntimeFederationEnvelopes` (`runtime-federation-reconciliation.ts`) validates the foreign envelope **before** reconciling, mapping any non-replay validation failure to `status: 'rejected'`. The script's foreign envelope violated the invariant, so rejection was the *correct* runtime behavior. The contract test suite constructs its envelopes with both fields consistent (`l:${seq}` in both places), which is why it always passed: the script had drifted from the envelope contract, not the runtime from its specification.

Classification against the objective's taxonomy: **incorrect expectation** (tooling issue). Not an obsolete test, not documentation drift, not an environment issue, not a runtime defect.

## Resolution

Fixed **only the validation script** (`scripts/check-runtime-federation.mjs`): the remote lineage rename now updates `federationMetadata.continuityLineageId` and `lineage.lineageId` together, with a comment stating the invariant. Zero changes to `src/runtime/federation/**`.

With the consistent foreign envelope the scripted scenario proceeds through validation, epoch/sequence ordering, lineage distinctness, and nonce merging, and completes with `status: 'accepted'`:

```
$ npm run check:runtime-federation
runtime federation check passed
```

## Tests

- `tests/runtime-federation.test.mjs` — unchanged, still passing (envelope determinism, validation, stale/lineage-conflict reconciliation, runtime federation hooks).
- `tests/runtime-vault-boundary.test.mjs`, `tests/runtime-persistence.test.mjs`, `tests/runtime-operational-state.test.mjs` — unchanged, still passing.
- `check:runtime-federation` is now part of the consolidated `npm run validate:v1-release` gate, so this scenario can no longer silently rot.

## Compatibility

- No runtime source files modified; no public API, type, or behavior change.
- The reconciliation semantics demonstrated by the fixed script are exactly those pinned by the pre-existing contract tests: internally inconsistent foreign envelopes are rejected (fail closed); consistent, newer, distinct-lineage envelopes are accepted with merged replay-denial nonces.
