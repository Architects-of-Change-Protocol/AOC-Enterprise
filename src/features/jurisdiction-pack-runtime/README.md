# AOC Jurisdiction Pack Runtime v1

The Policy Pack Foundation (`src/features/policy-pack-foundation/`) answers
"what is a policy pack, structurally, and how do packs compose, validate,
and stay claim-safe?" It deliberately implements no jurisdiction-specific
content. This module answers the next question:

**Given a jurisdiction code, which registered jurisdiction pack applies, and
what does composing it with the rest of AOC's packs require?**

That is the Jurisdiction Pack Runtime's job -- and only its job. It is
infrastructure, not law: this module implements no real jurisdiction's
rules (not Costa Rica, not Panama, not the US, not the EU, not Delaware,
not California, not any other jurisdiction), no sports-event payment
settlement, no smart-contract legal validity, and no legal advice,
interpretation, or compliance certification.

## It consumes the Foundation -- it does not reinvent it

This module defines exactly one new concept: a `JurisdictionCode` (an opaque
lookup key, never a real ISO country/state/province code in this repo) and
a `JurisdictionPackRegistration` pairing that code with a
`PolicyPackManifest`. Everything else comes directly from
`policy-pack-foundation`:

| Concern | Comes from `policy-pack-foundation`, unchanged |
| --- | --- |
| What a jurisdiction pack *is* | `PolicyPackManifest` (`kind: 'jurisdiction_pack'`, `domain: 'jurisdiction'`) |
| Trust level | `PolicyPackValidationStatus`, `satisfiesPolicyPackValidationStatus` |
| Safe framing | `PolicyPackSafeFraming`, forced by `createPolicyPackManifest` |
| Composing with other packs | `composePolicyPacks` |
| Claim safety | `evaluatePolicyPackClaimSafety`, `assertNoPolicyPackOverclaim` |
| Approval/evidence/export/Control-Plane references | `createPolicyPackApprovalAdapter`, `createPolicyPackEvidenceAdapter`, `createPolicyPackExportAdapter`, `createPolicyPackControlPlaneAdapter` |

`JurisdictionPackRegistry.register()` validates every manifest with
`validatePolicyPackManifest` and rejects anything whose `kind` is not
`'jurisdiction_pack'`. `JurisdictionPackRuntime.resolve()` does not evaluate
rule content, does not compute validation status, does not scan for
overclaims with its own logic, and does not build its own reference/adapter
mapping -- it wires the Foundation's own functions together.

## Resolution

`resolveJurisdictionPacks(registry, jurisdictionCode)` is a deterministic,
code-based lookup only -- no fuzzy matching, no geographic inference, no
"closest jurisdiction" heuristics:

- **`unresolved`** -- no active pack is registered under that code.
- **`resolved`** -- exactly one active pack is registered; composition
  proceeds.
- **`ambiguous`** -- more than one active pack is registered under the same
  code; the caller must disambiguate with `rootPackId`. This runtime never
  guesses which one "wins."

`expired`, `superseded`, and `disabled` packs are excluded from resolution
candidates entirely (composition-time blocking for a *chosen* pack is still
`composePolicyPacks`'s job; resolution-time filtering keeps stale
registrations from being silently picked as "the" active pack for a code).

`JurisdictionPackRuntime.resolve(input)` then calls `composePolicyPacks`
with the resolved pack as `rootPackId`, combining the registry's own
manifests with any `input.availableManifests` the caller supplies (e.g. a
global baseline pack the jurisdiction pack `extends`, since that pack is not
itself a `jurisdiction_pack` and is therefore never registered in this
registry). The result carries the full `PolicyPackCompositionResult` plus
approval/evidence/export/Control-Plane reference records produced by the
Foundation's own adapters -- never fabricated by this module.

## What comes after this PR

This PR implements no real jurisdiction. `JURISDICTION_CODE_DEMO_ALPHA` and
`JURISDICTION_CODE_DEMO_BETA` in `fixtures/` are fictional, generic codes
used only to exercise registration, resolution, and composition
deterministically. A real jurisdiction pack (e.g.
`aoc.jurisdiction.costa_rica.base.v1`) is expected as a separate, later PR
that registers a manifest with this runtime -- not part of this one.
