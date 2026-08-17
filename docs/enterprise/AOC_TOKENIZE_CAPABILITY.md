# The `TOKENIZE` Governed Capability

- Contracts: `@aoc-enterprise/tokenization-mandate`
- Runtime: `src/enterprise/tokenization-governance/`
- Decision record: `docs/architecture/ADR-TOKENIZE-CAPABILITY.md`

## Definition

`TOKENIZE` is a governed capability of AOC Enterprise.

> **TOKENIZE** — exercising authorized control over specified rights
> associated with an already-governed asset, in order to create an external
> tokenized representation of those rights.

It is evaluated by the same primitives every other capability is evaluated
by. It introduces no second policy engine, no second evidence system, no
second authorization system, and no capability-specific API.

## Boundary

```
AOC Protocol
    │  establishes / anchors: asset identity, authority, attestations,
    │  evidence, sovereignty boundary
    ▼
AOC Enterprise
    │  governs exercise of authority: request, policy, decision,
    │  obligations, approvals, grant, use, revocation, evidence
    ▼
External Tokenization System
       performs issuance
```

**AOC Enterprise authorizes tokenization. AOC Enterprise is not the
tokenization provider.**

It does not mint, issue, transfer, burn, price, custody, or list tokens. It
holds no keys, speaks to no chain, and assumes no token standard. What an
external system does with a mandate is that system's act; AOC records the
authorization and the evidence of the exercise.

## `PROTOCOLIZATION != TOKENIZATION`

```
Protocolization  — establishes a governed/canonical asset representation
                   and its authority/evidence context.

Tokenization     — an optional governed action performed on rights of an
                   already-governed asset.
```

Protocolization can exist without tokenization. Tokenization always
presupposes an already-identified governed asset or right. The two are never
synonyms, and `TOKENIZE` is likewise distinct from `REGISTER`, `TRANSFER`,
`LICENSE`, `DELEGATE`, `COLLATERALIZE` and `COMMERCIALIZE` — recorded as data
in `ENTERPRISE_CAPABILITIES_DISTINCT_FROM_TOKENIZE` and enforced by
`validateEnterpriseTokenizationRequest`, which rejects any request whose
`capability` is not exactly `'tokenize'`.

## Lifecycle

```
Governed asset
      ↓
TOKENIZE request                     EnterpriseTokenizationRequest (validated)
      ↓
authority evaluation                 Authority Graph, via Recognition Runtime
      ↓
policy evaluation                    Action Enforcement chain + Domain Policy Pack
      ↓
required approvals                   Approval Runtime (quorum, SoD, delegation)
      ↓
obligations                          EnterpriseAccessObligation references
      ↓
decision                             AocKernel.evaluate() → KernelEvaluationResult
      ↓
durable proof                        Governance Store aggregate (atomic, integrity-chained)
      ↓
grant / deny                         mandate issued only for `allowed`
      ↓
Tokenization Mandate                 EnterpriseTokenizationMandate
      ↓
external execution                   an external system, outside AOC
      ↓
execution evidence                   EnterpriseTokenizationExecutionEvidence
      ↓
audit trail                          Governance Store references + append-only executions
```

Every box above is an existing AOC primitive except the last three, which are
this capability's own contracts.

## Domain semantics

### Request

A `TOKENIZE` request can never say merely "tokenize asset X". It must express:

| Concept | Field |
|---|---|
| Governed subject | `asset: ResourceRef` (identity only) |
| Requested rights | `terms.rights` — closed vocabulary |
| Scope | `terms.scope` — proportional (basis points) or unitized |
| Authorized executor | `terms.executorRef` |
| Issuance constraints | `terms.constraints` |
| Requester | `requestedBy` (+ `principalActorId` when acting on behalf) |

### Scope

```ts
{ kind: 'proportional', basisPoints: 2000 }                            // 20%
{ kind: 'unitized', units: 500, unitDenomination: 'entitlement-unit' } // 500 units
```

Integer basis points, never floating point — `0.1 + 0.2 !== 0.3`, and an
economically significant share must compare and sum exactly. Proportional and
unitized scopes are never comparable to one another, and unitized scopes must
agree on denomination.

**Partial tokenization is the normal case.** `TOKENIZE(asset)` is not
tokenization of the entire asset: authorizing 20% of defined economic
participation rights leaves the remaining 80% unrepresented by that
authorization, and the mandate says so explicitly.

### Authority

AOC never infers ownership or authority from the fact that somebody asked. A
`TOKENIZE` request is evaluated against the existing authority model, so
policy can require that the requester holds `TOKENIZE` authority, or was
delegated it, and/or that sovereign/owner approvals are satisfied — expressed
through `AuthorityGrant` / `DelegationGrant` / `RecognitionCapabilityToken`,
not through anything this capability invented.

Where authority is absent or insufficient, the request is **denied** by the
canonical decision path, and no mandate exists.

### Approvals

Approval semantics come from the Approval Runtime's existing quorum,
segregation-of-duties, approver-authority and delegation policies. Nothing
here hard-codes "all owners must approve": single-owner, multi-owner,
corporate-authority, delegated-executor and partial-rights topologies are all
expressible, and which one applies is the policy layer's determination.

A `approval_required` outcome produces **no mandate**. An outstanding
approval is not authorization.

### Obligations

Obligations attach to the decision through the existing generalized
obligation system (`EnterpriseAccessObligation`), referenced from the mandate
by `obligationRefs`. Examples a deployment may express — none of them
hard-coded here as universal rules, and none of them a legal conclusion:

```
only X% may be represented                 (terms.scope)
maximum token supply = N                   (constraints.maximumIssuedUnits)
only provider Y may execute                (terms.executorRef)
only network Z may be used                 (constraints.permittedNetworks)
no additional issuance                     (constraints.additionalIssuanceAllowed: false)
transfer restrictions must be enforced     (constraints.transferRestricted)
tokens represent economic rights only      (terms.rights)
KYC/AML must be performed externally       (obligation record)
issuance evidence must be returned to AOC  (obligation record)
authorization expires at T                 (mandate.expiresAt)
```

Constraint labels (`permittedNetworks`, `permittedTokenStandards`,
`permittedJurisdictions`) are opaque strings AOC stores and compares. AOC
does not resolve them, validate them against any real system, or enforce
them anywhere outside itself.

### Mandate

`EnterpriseTokenizationMandate` is the durable, machine-readable artifact.
From one mandate a reviewer can determine: which asset and rights are
covered, the permitted scope, who requested it, who authorized it (via
`decisionRef`), who may execute it, the applicable constraints, the required
obligations (`obligationRefs`), effective time, expiry, revocation status,
approval references, evidence references, and the Governance Store aggregate
that proves the decision (`evaluationRef`).

Everything except the terms is a reference to a canonical AOC record. The
terms are carried directly because a mandate must be auditable without
dereferencing the request.

### Revocation and expiration

Stored status is `'active' | 'revoked'` only. Expiry and exhaustion are
derived, purely, from `effectiveFrom`/`expiresAt` and from recorded execution
evidence measured against the constraints — never stored as a second source
of truth that could disagree.

The distinction that matters:

```
revocation of authority to perform additional issuance   ← what AOC can do
external treatment of already-issued tokens              ← not AOC's to claim
```

Revoking a mandate blocks new external issuance from that moment. It does not
destroy, freeze, or invalidate tokens an external system already issued, and
AOC does not pretend otherwise. Execution evidence recorded before revocation
is preserved immutably, and the revocation record itself preserves the
execution count at the moment authority was withdrawn.

### Evidence

The complete chain is auditable through existing mechanisms only:

```
asset → authority → request → policy evaluation → approvals → decision
      → obligations → mandate → external execution evidence
```

`getEvidenceLineage()` assembles it from references already stored. The
mandate and each execution record are linked back to their governance
aggregate through the Governance Store's own `appendReference` surface —
there is no tokenization-specific audit log.

A reviewer can answer, from the canonical records alone: *why was this
permitted, what exactly was permitted, who had the authority to permit it,
and was the external execution consistent with the authorization?*

## API

`TOKENIZE` uses the generalized capability-request interface. No
`/api/tokenize` endpoint exists or is needed:

```jsonc
POST /api/governance/evaluate
{
  "actor":  { "id": "actor-asset-steward", "trustDomainId": "trust-domain-aurelia" },
  "action": {
    "type": "tokenize",
    "capability": "tokenize",
    "resourceScope": "asset:building-a",
    "sideEffectType": "external_api_call",
    "riskLevel": "critical",
    "parameters": { /* serialized EnterpriseTokenizationRequest */ }
  },
  "organization": { "id": "org-aurelia-holdings" }
}
```

The response is the ordinary governance response — `allowed`,
`approval_required`, `denied`, or `indeterminate`, with the Kernel's own
reason codes and the committed `governanceRecord`.

`createTokenizationGovernanceService()` is the in-process orchestration that
performs this evaluation *and* issues the mandate on an allowed decision. It
is the path an embedding host uses; it does not replace or bypass the HTTP
surface.

## Security invariants

Each is covered by a test in `src/enterprise/__tests__/tokenization-governance.test.ts`:

| Invariant | Mechanism |
|---|---|
| One tenant cannot tokenize another tenant's asset | `TOKENIZATION_ASSET_TENANT_MISMATCH`, checked before the Kernel is consulted |
| One tenant cannot read/revoke another tenant's mandate | `TOKENIZATION_ACCESS_SCOPE_VIOLATION` on every store read and write |
| A non-system caller must name its organization | `TOKENIZATION_TENANT_SCOPE_REQUIRED` |
| An unauthorized actor cannot grant itself `TOKENIZE` | the Kernel denies; no mandate is created, however many times it asks |
| Request creation ≠ approval | `approval_required` yields no mandate |
| Mandate creation cannot bypass the decision path | `decisionRef` is required by the canonical contract; the service issues only after `appendEvaluation` commits |
| Expired/revoked authority cannot authorize new issuance | derived by `enterpriseTokenizationMandateAuthorizes` |
| Partial scope cannot silently become full scope | terms copied verbatim; `assertNoScopeEscalation` re-asserted at the store boundary |
| Executor restrictions are enforced | `EXECUTOR_NOT_AUTHORIZED` |
| Replaying a request cannot accumulate authorization | an idempotent replay returns the original mandate; the store refuses a second mandate for a `requestRef` it already issued against |
| Reusing one request id for a different request is refused | `TOKENIZATION_REQUEST_CONFLICT` (the Governance Store's own idempotency conflict, surfaced distinctly from an infrastructure failure) |
| Replaying an execution cannot create additional issuance authorization | `TOKENIZATION_EXECUTION_ALREADY_RECORDED`; counters never double-advance |
| An unreadable exercise instant cannot authorize | `INVALID_EXERCISE_INSTANT` — refused rather than compared against `NaN` |
| Evidence is append-only | no update/delete path for execution records; Governance Store is append-only by construction |

## Reference scenario

A governed asset represents a building. Its authority is held by a steward
recognized in the asset's trust domain. The steward authorizes tokenization
of **20% of specified economic participation rights** — not the asset, and
not all of its rights.

AOC evaluates authority and policy; the decision is `allowed`; the evaluation
is committed to the Governance Store; a mandate is issued permitting exactly
one named executor to issue at most N external units representing only those
rights, on a named network, under a named standard, with transfer
restrictions declared, prohibiting additional issuance, expiring at a defined
time.

The executor later performs issuance externally. The returned execution
evidence is recorded and correlated back to the mandate, and therefore to the
decision, approvals, obligations, authority and asset.

A delegated tokenization desk making the same request instead receives
`approval_required` — its capability token requires the steward's approval —
and no mandate is created until that approval is satisfied.

The model is deliberately asset-agnostic: real estate, art, financial and
contractual rights, physical goods, intellectual property, and digital-native
assets are all expressible, wherever the governing model permits.

## Deferred work

Explicitly outside this capability, and deliberately not implied by it:

- blockchain execution adapters and any provider-specific integration
- actual minting, issuance, transfer, or burn
- token standards (no ERC-20/721/1400/3643 assumption anywhere)
- custody, wallets, key management, marketplaces, exchanges, valuation
- KYC/AML, investor onboarding, transfer-agent or securities logic
- a SQLite `TokenizationMandateStore` (the port exists; only the in-memory
  implementation ships, mirroring how `AccessGrantStore` gained SQLite in a
  later slice)
- a barrel export from `src/enterprise/index.ts` (blocked by the same
  publishability constraint documented there for Access Governance)
- Protocol changes: none were required
