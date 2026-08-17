# ADR: The three-enforcement semantic audit — what vocabulary genuinely belongs to AOC Enterprise

- Status: accepted
- Related: `docs/architecture/ADR-TOKENIZE-CAPABILITY.md`,
  `docs/architecture/ADR-COLLATERALIZE-ACTION.md`,
  `docs/architecture/ADR-LICENSE-ACTION.md`
- Scope: `@aoc-enterprise/{tokenization,collateralization,license}-mandate`,
  `src/enterprise/{tokenization,collateralization,license}-governance/`

## Context

AOC Enterprise now governs three concrete exercises of authority over a
governed asset:

```
TOKENIZE       → authorize an external representation of governed rights
COLLATERALIZE  → authorize governed rights to be committed as security
LICENSE        → authorize permission to exercise governed rights
```

Three independent domains is the threshold at which duplicated structure can be
tested against duplicated *meaning*. This ADR records that audit, performed
against the actual source after `LICENSE` was implemented and verified — never
before, and never from architectural aesthetics or matching TypeScript shapes.

The question is not "is there duplication?" There is. It is: **which of it is
semantic identity, and of that, which has earned extraction under the
compatibility rules the repository already operates under?**

## Method

Each concern below was compared across the three contract packages and the
three governance runtimes. A concern counts as **generic** only if its meaning
can be stated without naming any of the three actions, and only if all three
applicable implementations mean the same thing by it — not merely spell it the
same way.

## The three-enforcement semantic matrix

| Concern | TOKENIZE | COLLATERALIZE | LICENSE | Semantic conclusion | Extraction decision |
| --- | --- | --- | --- | --- | --- |
| Governed asset | `ResourceRef` identity only | `ResourceRef` identity only | `ResourceRef` identity only | **Identical.** Already a shared Protocol primitive; no asset is ever copied into a mandate. | Already generic — nothing to extract |
| Governed rights | 5-value closed union | same 5 values | same 5 values | **Identical.** The vocabulary names which right of the *asset* is engaged — a property of the rights, not of the action. | GENERIC PROVEN · EXTRACTION DEFERRED |
| Numeric rights scope (type) | `proportional \| unitized`, **required** | `proportional \| unitized`, **required** | `proportional \| unitized`, **optional** | **Type identical; requiredness is not.** Representing/encumbering is inherently "how much"; permitting is not. | GENERIC PROVEN (as an optional primitive) · EXTRACTION DEFERRED |
| Rights-scope accumulation | none (issuance ceiling) | **cumulative** (`scopeSum`) | none | **Not generic.** Accumulation follows from encumbering a finite right, which only collateral does. | KEEP ACTION-SPECIFIC |
| Action-specific permission scope | none | none | `permittedUses` · `permittedContexts` · `exclusivity` · term ceiling · unit ceiling | **A second, distinct kind of scope that only LICENSE has.** | KEEP ACTION-SPECIFIC |
| Beneficiary / counterparty | **none** | `securedPartyRef` (benefits from security) | `licenseeRef` (receives permission) | **Not generic.** Absent in one; and the two present are different relations, not one concept. | KEEP ACTION-SPECIFIC |
| Third-party reference that is not a party | none | `securedObligationRef` (what is secured) | none | **Not generic.** Unique to collateral. | KEEP ACTION-SPECIFIC |
| Executor | `executorRef` **required** | `executorRef` **required** | `executorRef` **optional** | **Refuted as universal.** Licensing has no necessary external performer. | REJECT AS FALSE ABSTRACTION (as a required primitive) |
| Bound-identity-must-match pattern | executor | executor · secured party · secured obligation | licensee · executor (when bound) | **The pattern is generic; the roles are not.** | KEEP ACTION-SPECIFIC (pattern documented, not typed) |
| Authority path | Recognition → Authority Graph → Kernel | identical | identical | **Identical.** | Already generic (shared runtime) |
| Approvals | Approval Runtime | identical | identical | **Identical.** | Already generic (shared runtime) |
| Obligations | Enterprise obligations | identical | identical | **Identical.** | Already generic (shared runtime) |
| Decision refs | `decisionRef` + `evaluationRef?` | identical | identical | **Identical.** | GENERIC PROVEN · EXTRACTION DEFERRED |
| Mandate identity | `id` · `requestRef` · `requestedBy` · `correlationId` | identical | identical | **Identical.** | GENERIC PROVEN · EXTRACTION DEFERRED |
| Validity period | `effectiveFrom` / `expiresAt`, both required | identical | identical, **plus** a separate external-term ceiling | **Mandate window identical.** LICENSE adds a second, distinct duration. | GENERIC PROVEN · EXTRACTION DEFERRED |
| Revocation status | `active \| revoked` | `active \| revoked` | `active \| revoked` | **Identical**, with identical two-state rationale. | GENERIC PROVEN · EXTRACTION DEFERRED |
| Revocation record | 10 fields + `executionsAtRevocation` | same 10 + `executionsAtRevocation` + `committedScopeAtRevocation` | same 10 + `executionsAtRevocation` | **11 fields identical**, one action-specific addition. | GENERIC PROVEN · EXTRACTION DEFERRED |
| External execution envelope | `id` · `mandateRef` · `executedAt` · `correlationId` · `externalSystem?` · `externalTransactionReference?` · `evidenceRefs?` | identical | identical | **Envelope identical; payloads share nothing.** | GENERIC PROVEN · EXTRACTION DEFERRED |
| Execution payload | issued scope, units, network, token standard, contract ref | committed scope, secured amount, registry, filing ref, jurisdiction, priority rank | granted uses, exclusivity, contexts, licence term, licensed units, agreement/acceptance refs | **Nothing in common beyond the envelope.** | KEEP ACTION-SPECIFIC |
| Lifecycle evidence | **none** | release / discharge / satisfied / terminated | expired / terminated / cancelled / surrendered / superseded | **2 of 3.** Same shape and same observation-only posture, but tokenization has no analogue. | NEEDS FOURTH ENFORCEMENT |
| Durable store | own tables, WAL, digest, version guard | identical conventions | identical conventions | **Conventions identical; schemas domain-specific.** | Already generic (conventions), KEEP ACTION-SPECIFIC (schemas) |
| `authorization_artifact` | mandate → reference | identical | identical | **Identical.** | Already generic (Governance Store) |
| Reference integrity | store-sealed | identical | identical | **Identical.** | Already generic (Governance Store) |
| Tenant isolation | context + scope helpers | identical | identical | **Identical** (helpers differ only by error code). | GENERIC PROVEN · EXTRACTION DEFERRED |
| Idempotency | `request_ref UNIQUE`, Kernel replay | identical | identical | **Identical.** | GENERIC PROVEN · EXTRACTION DEFERRED |
| Corruption behavior | digest + canonical revalidation, fail closed | identical | identical | **Identical.** | GENERIC PROVEN · EXTRACTION DEFERRED |

## Generic primitive candidates

### Candidate 1 — `GovernedRightsScope` (rights + proportional/unitized scope)

- **TOKENIZE**: rights being *represented*; scope required; ceiling not summed.
- **COLLATERALIZE**: rights being *encumbered*; scope required; **summed** across executions.
- **LICENSE**: rights being *permitted for use*; scope **optional**; not summed.
- **Semantically identical?** *Partial.* The right *selection* is identical
  across all three. The scope *type* is byte-identical. But requiredness and
  accumulation are not: `LICENSE` proves a permission can be fully specified
  with no fraction at all, and only collateral accumulates.
- **Decision: the right vocabulary and the scope type are GENERIC SEMANTIC
  PROVEN, EXTRACTION DEFERRED FOR COMPATIBILITY. Requiredness and accumulation
  are KEEP ACTION-SPECIFIC.**
- **Rationale.** The original hypothesis — that "rights + scope" is one generic
  primitive — is **half right, and the half it gets wrong matters more.** A
  generic `GovernedRightsScope` that is mandatory would corrupt `LICENSE`; one
  that accumulates would corrupt `TOKENIZE` and `LICENSE`. What is genuinely
  generic is narrower than the name suggests: a right-category vocabulary, and
  an optional quantity expressed as an exact integer.

### Candidate 2 — Mandate reference / metadata skeleton

- **Evidence, all three, field for field:** `schemaVersion` · `id` · `status` ·
  `asset` · `terms` · `requestRef` · `requestedBy` · `decisionRef` ·
  `effectiveFrom` · `expiresAt` · `correlationId` · `evaluationRef?` ·
  `issuerRef?` · `approvalRefs?` · `obligationRefs?` · `evidenceRefs?` ·
  `auditRefs?`.
- **Semantically identical?** **Yes — the strongest result in this audit.**
  Three independently-motivated domains produced the same 17 fields with the
  same meanings, the same optionality, and the same "reference what is owned
  elsewhere, never embed it" discipline. It is definable without naming any
  action: *the identity of a durable authorization artifact, its linkage to the
  governance decision that produced it, its validity window, and its revocation
  state.*
- **Decision: GENERIC SEMANTIC PROVEN, BUT EXTRACTION DEFERRED FOR
  COMPATIBILITY.**
- **Rationale.** Extraction fails rubric criterion 5, not criteria 1–4. The
  three contract packages are frozen, compile to `dist`, and each declares
  exactly one dependency (`@aoc-enterprise/resource-envelope`). Extracting the
  skeleton requires either a new compiled contract package that two *already
  frozen* packages must take as a new dependency, or placing it in
  `@aoc-enterprise/canonical-runtime-contracts`, which exports raw `src` and so
  uses an incompatible packaging model. Meanwhile the benefit is purely
  declarative: each package must keep its own validator, its own ~24-code error
  union, and its own serializer regardless, and a shared base would need three
  type parameters (`terms`, `schemaVersion`, `status`) to serve all three —
  eroding the very clarity extraction is meant to buy.
- **Migration path when it is taken.** A `GovernedAuthorizationArtifact<TTerms>`
  base interface that each mandate `extends`. This is structurally compatible:
  no consumer, serializer, validator or stored byte changes. It should be done
  when a fourth enforcement lands, or when one of these packages needs a
  breaking version for an unrelated reason — whichever comes first.

### Candidate 3 — Authorized executor / authorized party binding

- **TOKENIZE**: `executorRef`, required — someone must mint the token.
- **COLLATERALIZE**: `executorRef`, required — someone must create the security
  interest. Plus `securedPartyRef` (benefits) and `securedObligationRef` (not a
  party at all).
- **LICENSE**: `executorRef` **optional** — a licensor may grant directly. Plus
  `licenseeRef` (receives), which is required.
- **Semantically identical?** **No.**
- **Decision: REJECT AS FALSE ABSTRACTION** for `AuthorizedExecutor` as a
  required primitive; **KEEP ACTION-SPECIFIC** for a general
  `AuthorizedPartyBinding` type.
- **Rationale.** This is the hypothesis `LICENSE` was best placed to test, and
  it **falsified it.** Two of three actions require an executor only because
  representing and encumbering are *acts someone must perform externally*.
  Permission is not such an act: it can be granted by the licensor directly.
  Requiring one would have forced every direct license to invent a party, and
  an invented binding protects nothing.

  The tempting salvage — "the generic thing is an *authorized party binding*,
  and executor/secured-party/licensee are instances" — is precisely the false
  abstraction the audit rubric warns about. Those three roles contain identity
  fields and nothing else in common:

  ```
  executorRef      may PERFORM the external act        (binds who acts)
  securedPartyRef  BENEFITS from the arrangement       (binds who gains)
  licenseeRef      RECEIVES the permission             (binds who may exercise)
  ```

  They differ in what substituting them *means*, in whether they are optional,
  and in what may relax them (only `licenseeRef` can be relaxed, and only by an
  assignment disposition). A type unifying them would be a bag of
  `CanonicalId`s with a comment — which is what the domain already has, more
  honestly, as three named fields. **A licensee is not an executor, and a
  secured party is not an executor.**

### Candidate 4 — Authorization artifact metadata / `UniversalMandate`

- **Semantically identical?** The *envelope* is (see Candidate 2). The
  `terms` are not: tokenization terms, collateralization terms and license
  terms share no field beyond `rights`.
- **Decision: REJECT `UniversalMandate`. The envelope is Candidate 2.**
- **Rationale.** A single mandate type would either erase the domain
  distinctions (weakening validation — rubric criterion 4) or become a union
  that every consumer must narrow, which is worse than three named types.

### Candidate 5 — External execution evidence envelope

- **Evidence, all three:** `id` · `mandateRef` · `executedAt` ·
  `correlationId` · `externalSystem?` · `externalTransactionReference?` ·
  `evidenceRefs?`, plus the identical observation-only posture — recording
  evidence never re-authorizes anything.
- **Semantically identical?** **Yes for the envelope. Emphatically no for the
  payload.**
- **Decision: GENERIC SEMANTIC PROVEN (envelope only), EXTRACTION DEFERRED FOR
  COMPATIBILITY. Payloads KEEP ACTION-SPECIFIC.**
- **Rationale.** Same compatibility bar as Candidate 2, and a smaller prize: a
  seven-field envelope. The payloads share nothing — issued scope and token
  standards, committed scope and priority rank, granted uses and exclusivity —
  and unifying them would produce a type where almost every field is optional,
  which is how a contract stops constraining anything.

### Candidate 6 — Mandate validity / revocation metadata

- **Evidence:** `active | revoked` in all three, with the same recorded
  rationale for refusing a third state; `effectiveFrom`/`expiresAt` required in
  all three; a revocation record sharing 10 identical fields plus
  `executionsAtRevocation`; and in all three the same principle that revocation
  withdraws *future* authority and asserts nothing about what already happened
  externally.
- **Semantically identical?** **Yes.**
- **Decision: GENERIC SEMANTIC PROVEN, EXTRACTION DEFERRED FOR COMPATIBILITY.**
- **Rationale.** Folds naturally into Candidate 2 and should be extracted with
  it, not separately. `LICENSE` adds an external-term ceiling that is a
  *different* duration and must not be folded in.

### Candidate 7 — Lifecycle evidence

- **TOKENIZE**: none. **COLLATERALIZE**: release/discharge/satisfied/terminated.
  **LICENSE**: expired/terminated/cancelled/surrendered/superseded.
- **Semantically identical?** The two that exist are structurally and
  posturally identical (append-only, references a specific execution,
  observation-only, never a status, never restores capacity). But only two of
  three have one.
- **Decision: NEEDS FOURTH ENFORCEMENT.**
- **Rationale.** Two cases is exactly the evidence strength this audit exists to
  distrust — and the second was written with the first in view. Whether "an
  external arrangement ends" is a universal governed-action concern or a
  property of arrangements that *persist* (unlike a minted token) is genuinely
  open. A fourth action would settle it.

### Candidate 8 — Tenant scoping and strict-UTC helpers (runtime layer)

- **Evidence:** `canAccess*Organization`, `require*TenantScope`,
  `require*AccessToOrganization` and the strict-UTC predicate are byte-identical
  across the three governance runtimes, differing only in which typed error they
  throw.
- **Semantically identical?** **Yes**, but they are *utilities*, not governance
  vocabulary.
- **Decision: KEEP ACTION-SPECIFIC (for now).**
- **Rationale.** Rubric criterion 3 requires extraction to reduce *semantic*
  duplication rather than line count. A UTC regex has no domain content, and a
  shared version would need an injected error factory to preserve each module's
  typed error taxonomy — trading duplication for indirection at the exact point
  where fail-closed behaviour must stay obvious. This is a legitimate future
  tidy-up, not a finding about Enterprise's vocabulary.

## Extractions actually performed

**None.**

Every candidate that met the three-domain semantic-identity bar (Candidates 2,
5, 6, and the vocabulary half of 1) failed rubric criterion 5: extraction would
require modifying frozen contract packages whose duplication was already
deliberately recorded, for a benefit that is declarative rather than
behavioural. Every candidate that would have been cheap to extract (Candidate 8)
is a utility rather than vocabulary. Every candidate that looked most like a
framework primitive (Candidate 3) was **falsified** by the third
implementation.

This is a deliberate outcome, not an incomplete one. Per the governing rubric,
"GENERIC SEMANTIC PROVEN BUT EXTRACTION DEFERRED FOR COMPATIBILITY" is a
legitimate result, and contract stability is worth more than removing declared
duplication that is already documented as intentional.

## Does AOC Enterprise need a generic enforcement framework?

**No.** The burden of proof was not met, and after three implementations it is
clearer *why* it will probably never be met by adding more actions.

The behavioural machinery is **already generalized**, and all three actions
consume it unchanged:

```
AocKernel               authority · policy · approvals · obligations · decision
Recognition Runtime     standing
Authority Graph         authority, scoped to the asset
Approval Runtime        quorum, delegation, segregation of duties
Governance Store        aggregates · references · integrity chain
Reference Integrity     store-computed sealing
persistence conventions WAL · digests · version guards · tenant scoping
```

What each action adds is exactly what cannot be generalized: *what was
authorized*, *what was done under it*, and *what was reported afterwards*. An
`EnterpriseEnforcementFramework`, `GenericMandateEngine`,
`UniversalGovernedActionEngine`, `ActionPluginFramework` or `MandateFramework`
would sit between the Kernel and three thin domain modules and mediate nothing
— the orchestration each service performs is ~40 lines of sequencing whose
every branch is a domain decision.

**The remaining question was never orchestration. It was vocabulary — and the
vocabulary that survived three domains is smaller than any of the three
implementations would have suggested on its own.**

## Did `LICENSE` expose any missing shared machinery?

**No.** Every mechanism it needed already existed and was consumed unchanged.
The one thing it needed that no sibling had — a second, non-fractional notion of
scope — is genuinely action-specific, and the audit's most useful negative
result is that it must stay that way.

## Did `LICENSE` expose any need for a Protocol change?

**No.** Nothing in `LICENSE` crosses an independent sovereignty boundary.
Governed permission lineage, license lineage and rights delegation lineage were
each considered and deliberately not implemented in Protocol: none appeared as a
requirement in the implementation, and implementing them speculatively is
exactly what the Protocol boundary rule forbids.

## What the third enforcement proved about Enterprise

```
                    GOVERNED ASSET
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
       TOKENIZE     COLLATERALIZE    LICENSE
           │             │             │
           ▼             ▼             ▼
      Enforcement    Enforcement    Enforcement     ← identical machinery
           │             │             │
           ▼             ▼             ▼
       Mandate         Mandate        Mandate       ← identical envelope,
           │             │             │              different terms
           ▼             ▼             ▼
       External        External       External
     representation   collateral     permission     ← nothing in common
           │             │             │
           ▼             ▼             ▼
        Evidence       Evidence       Evidence      ← identical envelope,
                                                      different payloads
```

AOC Enterprise is not a tokenization platform, a collateral platform, or a
licensing platform. It is a generalized governance and enforcement machine, and
after three enforcements the smallest reusable semantic vocabulary that
genuinely belongs to it is:

1. a **governed asset reference** (already Protocol's `ResourceRef`);
2. a **governed-right vocabulary** — which right of the asset is engaged;
3. an **optional exact quantity** over those rights;
4. an **authorization artifact envelope** — identity, decision linkage,
   validity window, revocation state, and reference lists;
5. an **execution evidence envelope** — identity, mandate linkage, instant,
   external system, correlation.

Everything else — beneficiaries, executors, uses, contexts, exclusivity,
accumulation, lifecycle — belongs to the action, and three independent domains
were required to find that out.
