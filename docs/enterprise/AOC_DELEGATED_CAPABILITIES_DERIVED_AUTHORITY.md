# AOC Delegated Capabilities & Derived Authority

How AOC Enterprise proves that a requester's **capability to act** was derived
through a bounded, traceable, still-live chain from a source that genuinely had
it — and never became broader along the way.

Companion to `docs/architecture/ADR-NATIVE-DELEGATED-CAPABILITIES.md`, which
records why each decision below was made rather than what it is, and to
`AOC_GOVERNED_REPRESENTATIVE_AUTHORITY.md`, which answers a different question
this layer deliberately does not.

## The four authority questions

The previous foundation established three. This adds a fourth. All four are
independent, and none substitutes for another.

```
A. ACTION AUTHORITY          May requester R invoke action Y on resource X?
   AuthorityGrant / Recognition Runtime / Authority Graph

B. UNDERLYING GOVERNED       Which governed right does holder H control,
   AUTHORITY                 and how much of it?
   GovernedAuthorityPosition

C. REPRESENTATIVE AUTHORITY  May requester R exercise holder H's authority?
   GovernedRepresentativeAuthority

D. DERIVED AUTHORITY         Through what bounded chain does R possess A
   LINEAGE                   at all, and is every link still valid now?
   DelegationGrant lineage / DelegatedCapability lineage
```

**The invariant.** For a governed action reached through delegation, the action
proceeds only when all four hold:

> R's claimed capability is derived from a source that held it, through hops
> that each changed hands legitimately and none of which broadened the envelope,
> with every ancestor live at this instant, **and** R has action authority for
> this action on this resource, **and** R is authorized to represent holder H
> for this right, action and quantity, **and** H holds sufficient governed
> authority over that right.

Where the requester holds direct authority, D is trivially satisfied: there is
no lineage to prove. Where the requester *is* the holder, C does not apply.

## What "delegated" means here, precisely

A delegation confers the **capability to cause a governed action to be
evaluated**, bounded to named actions and resources for a named window. It
confers nothing else. In particular it does **not**:

- transfer, lend, or share the underlying governed right;
- create, credit, or debit any `GovernedAuthorityPosition`;
- reserve any part of the holder's authority;
- confer the ability to represent the holder whose authority is exercised;
- confer the ability to represent any *other* holder the delegator represents.

Creating a delegation moves nothing. Revoking one moves nothing. Only a
completed governed execution moves authority, and it debits the **holder** —
never the delegate, and never an intermediate representative.

## Where derived authority lives

There are two delegation surfaces, and they answer the same question at
different altitudes.

```
Authority Graph                      Runtime Host
DelegationGrant                      DelegatedCapability
in-process governance state          signed envelope, host-supplied stores
reached by AocKernel through         reached by a host through
Recognition Runtime                  evaluateDelegatedAccess
```

Both are now validated the same way, on the same axes, with the same posture:
**re-resolved at every use, never trusted from issuance.**

## Lineage is a projection, not a record

Nothing about an ancestor is copied into a descendant. Rootedness, liveness and
containment are recomputed from current state on every evaluation.

This is what makes revocation work without a cascade: revoking one link disables
its entire subtree immediately, and not a single descendant row is rewritten. It
is the same discipline `createGovernedRepresentationResolver` already applies to
representation chains, and the reason grant lifecycle stays owned by the grant.

```
ROOT AuthorityGrant  ── revoked ──┐
      │                            │  every descendant below is
      ▼                            │  refused at its next use,
  DelegationGrant B                │  with no descendant record
      │                            │  touched
      ▼                            │
  DelegationGrant C  ◄─────────────┘
      │
      ▼
   REQUEST  → DENY
```

## The non-amplification axes

A child may be equal to or narrower than its source on every axis, and broader
on none.

| axis | Authority Graph | Runtime Host |
|---|---|---|
| resource | `resourceScopes` containment | `constraints.resource` identity |
| action | `actions` containment | `constraints.action` identity |
| scope | — | `constraints.scope` subset |
| tenant / trust domain | `trustDomainId` identity | `orgId` identity |
| validity window | ancestor expiry, dynamically | parent `expiresAt` |
| delegation depth | `maxDelegationDepth` | `constraints.maxDelegationDepth`, default 8 |
| redelegation | `canRedelegate` | `constraints.canRedelegate` |
| rootedness | terminates at an `AuthorityGrant` | terminates at a root or an `ExecutionGrant` |
| continuity | delegator held the source | — (envelope-based) |
| cycles | refused by identity | refused by identity |

**Governed right and governed-rights scope are deliberately absent from both
columns.** A capability delegation carries no governed right, so it cannot
narrow or broaden one. That dimension belongs to holder-bound representative
authority, which already enforces holder, right, scope, action and validity
monotonicity across its own chain. Adding it here would create a second source
of truth for the same question — the exact failure this layer exists to prevent.

## An absent constraint bounds nothing

In the runtime host, `constraints` is an open bag and a missing key means **no
constraint on that axis**, not a wildcard.

- Parent constrains `resource: asset:A` → child must name `asset:A`. Naming
  another resource, or naming none, is a widening and is refused.
- Parent constrains nothing → a child that names a resource is *narrower*, and
  is accepted.

The asymmetry is the point: dropping a constraint you inherited is how a narrow
grant would be laundered into a broad one.

## A derived capability's default lifetime is its parent's

When a child is issued without an explicit `expiresAt`, it inherits its
parent's rather than taking a fresh default window. Without this, a child issued
a millisecond after its parent would take a later default expiry and be refused
as outliving it. An explicitly supplied `expiresAt` is never widened — it still
has to be inside the parent's.

## Request time and use time

These are different questions and both are asked.

```
REQUEST TIME   May this request produce an authorization?
               AocKernel: recognition, action authority, derived lineage,
               representation, holder authority, policy, approvals, obligations.

USE TIME       Is this authority artifact still valid, and still within scope,
               at this use?
               Delegation lineage re-walked on every evaluation.
               Execution grants: single atomic consumption, revocation, expiry.
```

**Frozen at issuance:** the constraint envelope a delegation records, and the
terms of a mandate once issued.

**Dynamic at every use:** ancestor existence, ancestor status, revocation,
expiry, suspension, containment across every hop, delegation depth, tenant and
trust-domain compatibility, the holder's current position, and the
representative binding.

### An issued mandate is its own authorization artifact

Revoking a delegation stops **new** requests. It does not reach backwards into a
mandate AOC has already issued. This matches the decision the holder-bound
foundation made for representative authority, and it is asserted rather than
assumed — see scenario 20 in
`src/enterprise/__tests__/delegated-authority-scenario.test.ts`.

If a deployment needs mandate invalidation on upstream revocation, that is a
mandate-lifecycle question, not a delegation-lineage one, and it is not
implemented here.

## Revocation source of truth

There is one coherent answer per surface, and neither is duplicated.

- **Authority Graph**: the `status` field on the `AuthorityGrant` /
  `DelegationGrant` record in `AuthorityGraphStore`, read live at each
  evaluation. That store is **in-memory and per-process**; grants and
  delegations have no SQLite backing today. A deployment that needs delegation
  state to survive a restart must supply that durability itself. This is a real
  limitation and is stated rather than papered over.
- **Runtime host**: the host-supplied `DelegationStorePort.isDelegationRevoked`
  and `ExecutionGrantStorePort.isGrantRevoked`, whose durability is whatever the
  host provides.

## Max-use semantics

**Deferred at the delegation layer. Supported at the execution-grant layer.**

No `maxUses` or `remainingUses` field exists on `AuthorityGrant`,
`DelegationGrant`, `RecognitionCapabilityToken` or `DelegatedCapability`, and
none was invented. Bounded use already exists where an execution is actually
authorized: `ExecutionGrantStorePort.markGrantConsumed` is contractually atomic
and single-shot, so an execution grant is consumable exactly once.

Adding a usage counter to delegations would require conservation semantics
across siblings — whether two children of a 10-use parent may each be given 8 —
and that is authority reservation, which this architecture has deliberately
deferred. See "Deferred" below.

## No self-minted authority

No actor can assert its way into a delegation.

- `DelegationService.createDelegationGrant` refuses self-delegation, refuses a
  delegator that does not hold the named source, refuses a source that is not
  active or not delegable, and refuses every widening.
- `issueDelegatedCapability` refuses a claimed parent that is unknown, revoked,
  expired, non-redelegable, in another organization, or narrower than the child.
- Granting a representation and bootstrapping a position both require
  `context.system` and are unreachable from any request handler or HTTP route.

Creation-time refusal is a convenience, not the security property. Every axis
above is re-checked at use, because a record can reach a store by restore,
migration, a second writer, or the store's own documented `import*` escape
hatches.

## What this does not claim

Not legal delegation. Not power of attorney. Not ownership delegation. Not
portable across deployments. The bounded claim is exactly:

> AOC Enterprise can recognize and enforce authority derived through a typed,
> bounded, traceable delegation lineage **within this deployment's governance
> state**.

## Deferred

- **Authority reservation.** A ceiling is not a reservation; delegating debits
  nothing. Conservation across concurrent siblings remains unsolved and is a
  foundation of its own.
- **Durable Authority Graph state.** Grants and delegations are in-memory.
- **Cross-deployment delegation portability.** Proving to another sovereign
  deployment that an actor holds delegated authority originating elsewhere would
  be Protocol work. Nothing here requires it.
- **A `DELEGATE` governed action.** Not implemented — see the ADR.
