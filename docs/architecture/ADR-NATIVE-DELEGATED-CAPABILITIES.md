# ADR: Native delegated capabilities and derived authority

**Status:** Accepted
**Supersedes:** nothing
**Extends:** `ADR-HOLDER-BOUND-REPRESENTATIVE-AUTHORITY.md`
**Companion doc:** `docs/enterprise/AOC_DELEGATED_CAPABILITIES_DERIVED_AUTHORITY.md`

## Context: the gap the holder-bound foundation left

The previous foundation closed the question *why may this requester exercise
**that** holder's authority?*. It left a question one level below it untouched:

> WHY DOES THIS REQUESTER HAVE THE CAPABILITY TO ACT AT ALL,
> AND IS THE CHAIN THAT GAVE IT TO THEM STILL VALID NOW?

`DelegationGrant` and `DelegatedCapability` both already existed, both already
recorded a parent, and both already looked like answers. Neither was one.

## The measurement

Not assumed — measured against the real runtimes before anything was written.

### Authority Graph

`DelegationService.createDelegationGrant` refused every widening at creation.
Every one of those refusals was worth exactly as much as the assumption that
creation is the only way a record reaches the store, and it is not:
`AuthorityGraphStore` exposes `importGrant`/`importDelegation`, and a restore, a
migration or a second writer are equally routes around the service. Records
written straight into the store and then evaluated:

```
delegation naming a source that does not exist    -> authority_valid
delegation reached from itself (a cycle)          -> authority_valid
delegation whose delegator never held the source  -> authority_valid
delegation carrying an action its source lacks    -> authority_valid
```

Resource expansion, revocation, suspension, expiry, depth and redelegability
were already refused at evaluation, by policies that assume the chain they are
handed *is* a chain. That assumption is what the first three exploit: a chain
with a dangling ancestor simply has fewer records in it, and every remaining
record looks fine.

### Runtime host

`DelegatedCapabilityPayload` carries `parentDelegationId` and `parentGrantId`.
Nothing read them. Against a fully composed `createAocEnterpriseRuntime`:

```
child broadening resource, action and scope vs its parent  -> issued, then allowed
parent delegated capability revoked, child re-evaluated    -> allowed
child naming a parentDelegationId that never existed       -> issued, then allowed
child rooted in a revoked ExecutionGrant                   -> allowed
six-hop chain with no ceiling                              -> issued
```

## Decision

**Enforce derived-authority lineage as an evaluation-time projection over the
records that already exist, on both surfaces. Add no new durable record, no new
store, no new Kernel port, and no new public API.**

### 1. Authority Graph: a lineage projection and one more policy

`DelegationLineageVerifier` walks a resolved chain against current store state
and reports one typed breach: `source_missing`, `cycle`,
`delegator_not_source_holder`, or `action_expanded`. `AuthorityChainVerifier`
resolves it once and hands it to the policies on `AuthorityPolicyContext`,
exactly as it already resolves `rootIssuerAccepted`. `DelegationLineagePolicy`
consumes it.

It sits after revocation and expiry and before scope, so an ancestor an operator
revoked reports the revocation rather than its structural consequence, and a
chain that never terminated anywhere is refused before its narrowing is
discussed.

It deliberately re-derives nothing. Resource containment, depth, redelegability,
revocation, suspension, expiry, non-delegable actions, self-issuance and
trust-domain crossing each already have a policy.

### 2. Runtime host: `parentDelegationId` becomes load-bearing

`resolveDelegationLineage` walks a capability's ancestry using only ports the
`RuntimeContext` already carries, and is called from **both**
`issueDelegatedCapability` and `evaluateDelegatedAccess`.

Issuance refuses; evaluation denies. Both matter, and the second is the security
property — this runtime's stores are host-supplied, so a record can arrive in
front of an evaluation without ever having passed an issuance.

### 3. Zero Kernel change

Recognition Runtime already consults the Authority Graph through
`verifyAuthority`, and `AocKernel` already consults Recognition. Adding a policy
to `createDefaultAuthorityPolicyChain()` therefore reaches the Kernel with no
Kernel code, no new port, and no API-freeze impact.

### Four further holes, found in review

The first implementation of the above closed the four measured gaps and left
four more, each on an axis this ADR claims. All four were reproduced before
being fixed:

```
delegation derived from a canDelegate:false grant           -> authority_valid
chain deeper than the root grant's maxDelegationDepth       -> authority_valid
grant with a dangling parentGrantId, untrusted issuer       -> authority_valid
capability broadening the ExecutionGrant it derives from    -> lineage valid
```

They share one shape: a check that exists, but not over the record that can
actually be forged.

- `DelegationDepthPolicy` compares a delegation's depth against the ceiling
  **that same record declares**, and reads `canRedelegate` on delegation parents
  only. The root of a one-hop chain is a grant, so `AuthorityGrant.canDelegate`
  and its `maxDelegationDepth` were never consulted at evaluation at all. The
  lineage walk now reads both from the grant.
- `IssuerAuthorityPolicy` requires the top grant to trace to a registered root
  issuer **only when it names no parent**. A grant whose `parentGrantId` dangles
  satisfies neither branch. The walk now continues through the grant ancestry
  and refuses a dangling link — and therefore runs for chains with no delegation
  in them, which is why it no longer short-circuits on `delegations.length === 0`.
- A lineage longer than `AuthorityResolver`'s `MAX_ANCESTRY_HOPS` was walked to
  64 hops here while the policies saw 51, so this component would report a chain
  rooted whose deeper ancestors nothing had judged for revocation or expiry. The
  constant is now exported and shared, and exceeding it is a breach.
- An `ExecutionGrant` parent was checked for existence, revocation, expiry and
  organization and then accepted, without comparing the child against the access
  the grant actually authorized. Its `input.access` is now projected into the
  same constraint vocabulary and run through the identical containment check.

The lesson is recorded because it generalizes: **a creation-time check and an
evaluation-time check over different records are not the same check**, and the
axis a policy is named for is not necessarily the axis it covers.

## The rejected alternatives

| option | verdict |
|---|---|
| A. reuse `DelegationGrant` as-is | Rejected. It is the thing with the holes. |
| B. extend `DelegationGrant` with lineage fields | Rejected. Copied ancestor state goes stale, and staleness is what makes revocation fail to propagate. |
| C. adjacent typed `DelegatedCapabilityGrant` | Rejected. A second authority universe beside the two that already exist. |
| D. a `DerivedAuthorityBinding` record | Rejected. Duplicates lifecycle already owned by the grant. |
| E. runtime projection over existing grants | **Adopted** for the Authority Graph. |
| F. consolidate the delegated-capabilities runtime | **Adopted** for `src/runtime`. |

## Consequences, stated plainly

### What is now proven

Rootedness, lineage continuity, cycle refusal and action non-amplification, on
every evaluation, on both surfaces — alongside the resource, depth,
redelegation, tenant, trust-domain, revocation, suspension and expiry axes that
were already proven and are re-asserted so they cannot silently regress.

### What is deliberately not proven here

**Governed right and governed-rights-scope monotonicity of a capability chain.**
A capability delegation carries no governed right, so there is nothing to
narrow. That dimension is `GovernedRepresentativeAuthority`'s, which already
enforces holder, right, scope, action and validity containment across its own
redelegation chain. Adding a parallel implementation would create the second
source of truth this ADR exists to prevent.

The consequence is load-bearing and is tested: an agent with a flawless
delegation over an asset still cannot name a holder it does not represent.

### Max-use

**Deferred at the delegation layer; already supported at the execution-grant
layer** via `markGrantConsumed`, which the port contract requires to be atomic
and single-shot. A usage counter on delegations would require conservation
across siblings, which is authority reservation — deferred by the previous
foundation and still deferred.

### Issued mandates

**A mandate remains valid.** Revoking a delegation stops new requests and does
not reach backwards into an authorization already issued. This preserves the
holder-bound foundation's decision unchanged, and is asserted rather than
assumed.

### Supersession

Not separately modelled. The Authority Graph has no supersession state; its
`AuthorityGrantStatus` is `active | expired | suspended | revoked`, and a
superseded grant is expressed by revoking it — which already invalidates the
whole subtree dynamically. No implicit migration was invented.

### The durability limitation

`AuthorityGraphStore` is in-memory and per-process. Grants and delegations have
no SQLite backing, so the revocation source of truth for action-authority
lineage does not survive a restart. Every guarantee above is a guarantee about
the state a running deployment holds. This is a genuine limitation, out of
scope here, and stated rather than caveated away.

### Backward compatibility

A delegation naming no parent is a root and behaves exactly as before. A
resource this deployment holds no governed-authority state for keeps its prior
behaviour, and that boundary is asserted in the scenario suite so a later change
that silently enrolled everything fails there rather than in production.

One existing fixture changed. `recognition-runtime-integration.test.ts` case 6
forged a delegation for `approve_payment` from a grant that did not contain
`approve_payment`, giving the record two defects. It now forges from a grant
that genuinely confers the action and marks it non-delegable, so the denial the
test asserts is attributable to non-delegability and nothing else.

## Protocol boundary

**No Protocol change required.** Every proof is resolved against this
deployment's own governance state. Portable delegation — deployment A proving to
deployment B that actor X holds authority originating from actor Y — would be
Protocol work, is not demonstrated by anything here, and is explicitly out of
scope.

## A `DELEGATE` governed action

**NOT YET.**

The four governed actions each have a governed external effect: an authority
movement, an issuance, a licence, a security interest. Creating a delegation has
none. It configures who may cause an evaluation; it moves no authority, debits
no position, and produces no external artifact — which is precisely what this
ADR spent its length establishing.

The threshold for reconsidering is a delegation lifecycle that acquires a
genuine governed external effect: a mandate, an executor, an evidence
requirement, or an authority movement of its own. Nothing in this work produced
one.
