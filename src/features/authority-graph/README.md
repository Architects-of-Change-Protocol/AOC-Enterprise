# AOC Authority Graph & Delegation Runtime

The Recognition Runtime answers "can this action be recognized?" -- it proves
a capability token exists, is valid, in scope, and not revoked. It does not
prove where that capability came from. Authority Graph is the layer that
answers the harder question:

**Where did the authority behind this action come from?**

A capability token is a claim. Authority Graph is what makes that claim
provable: a deterministic, replayable chain from an organization, through a
human role, through a delegation, down to the agent exercising it. No
recognized authority chain, no recognized autonomous action.

This module is not a generic graph database, not a legal system, and not an
AI agent framework. Every decision it produces is a pure function of typed
records and an injected clock -- no model call, no prompt, no sampling.

## Why Recognition Runtime alone is not enough

Recognition Runtime's `RecognitionCapabilityToken` can grant PMFreak Closure
Agent the actions `draft_closure_email` and `summarize_project_status` over
`project:HMP-14665`. That proves the token is well-formed, unexpired, and
unrevoked. It does not prove that whoever issued the token actually held that
authority themselves, that the human behind the agent still holds their own
role, or that the delegation which produced the token has not since been
revoked upstream. Authority Graph closes that gap by modeling authority as a
graph of grants and delegations with real lineage, and by re-deriving that
lineage -- structurally, from scratch -- every time an action is verified.

## AuthorityGrant vs. DelegationGrant

- **AuthorityGrant** is direct authority: an organization or a role grants an
  actor a bounded set of actions and resource scopes, optionally with the
  right to delegate a bounded number of hops further. Example: Datasys grants
  Victor Project Manager authority over `project:HMP-14665`.
- **DelegationGrant** is derived authority: an actor who already holds
  authority passes a narrower slice of it to another actor -- typically a
  human handing scoped authority to an agent. Example: Victor delegates
  `draft_closure_email` authority to PMFreak Closure Agent.

A DelegationGrant can never grant more than its `sourceAuthorityGrantId`
(an AuthorityGrant, or -- for a re-delegation -- another DelegationGrant)
itself holds: not more actions, not wider resource scopes, not deeper
redelegation than its source permits.

## Direct authority vs. delegated authority

Direct authority means the actor requesting the action is the same actor an
AuthorityGrant names as its subject -- a human acting on their own granted
authority. Delegated authority means the actor requesting the action is not
the grant's subject, but holds a DelegationGrant tracing back to one --
an agent acting because a human handed it a scoped slice of their own
authority. `AuthorityResolver` tries direct authority first; if none exists
for the requested action, it looks for a delegation instead.

## How authority chains are resolved

`AuthorityResolver.resolveAuthorityChain` takes an `AuthorityChainRequest`
(actor, trust domain, action, resource scope) and walks the graph
structurally -- it does not check status or expiry at this stage, only
"does an edge exist":

1. Look for an `AuthorityGrant` where the actor is the subject and the
   action is granted. If found, walk `parentGrantId` upward to collect the
   full ancestry (a non-root issuer's own grant, and so on to the root).
2. Otherwise, look for a `DelegationGrant` where the actor is the delegate
   and the action is granted. If found, walk `sourceAuthorityGrantId`
   upward -- through further delegations for a re-delegation, and through
   `parentGrantId` once an `AuthorityGrant` is reached -- to collect every
   grant and delegation in the lineage.
3. If nothing matches the action but the actor holds *some* authority in
   the trust domain, the chain is `partial`. If the actor holds nothing at
   all, it is `invalid`. Only a full match is `valid`.

The resulting `AuthorityChain` carries every grant and delegation in the
lineage, the resolved `depth` (delegation hop count), the `terminalActorId`
(who is acting) and the `rootIssuerActorId` (who the lineage ultimately
traces back to).

`AuthorityChainVerifier` then runs nine deterministic policies, in a fixed
order, against that chain -- stopping at the first that fails:

1. `authority_chain_required` -- was any chain resolved at all?
2. `self_issuance_denied` -- did anyone issue authority to themselves?
3. `issuer_authority_required` -- did every issuer actually hold what it issued from?
4. `ancestor_revocation_denied` -- is every ancestor still active?
5. `ancestor_expiration_denied` -- has every ancestor not expired?
6. `delegation_scope_contained` -- is the requested resource within scope, all the way up?
7. `delegation_depth_limited` -- is every delegation within its permitted depth?
8. `non_delegable_action_denied` -- was a non-delegable action delegated anyway?
9. `cross_domain_authority_denied` -- does every link stay inside the trust domain?

If every policy passes, the decision is `authority_valid`.

## How delegation scope inheritance works

Every `DelegationGrant.resourceScopes` must be contained in its source
authority's `resourceScopes` -- checked once at creation time by
`DelegationService` (which rejects the attempt outright), and re-checked at
verification time by `delegation-scope-policy` (a defense-in-depth check
against data that never passed through the service, e.g. a forged or
imported record). The same containment check applies to the actual
requested resource against the terminal authority in the chain: PMFreak
holding `project:HMP-14665` authority cannot act on `project:GCH-15992`,
even though both requests otherwise resolve to a chain.

## Why agents cannot self-issue authority

`self-issuance-policy` and `AuthorityGrantService`/`DelegationService`'s own
creation-time checks agree on one rule with no exception: an
`AuthorityGrant` where `issuerActorId === subjectActorId`, or a
`DelegationGrant` where `delegatorActorId === delegateActorId`, is always
rejected. An agent cannot grant itself new authority, upgrade its own
authority, or expand its own scope -- authority can only ever flow from one
actor to a *different* actor.

## How ancestor revocation works

Revoking an `AuthorityGrant` or `DelegationGrant` does not touch the records
derived from it -- it only flips that one record's `status` to `revoked`.
`ancestor-revocation-policy` is what makes the revocation propagate: every
time a chain is resolved and verified, it walks the *entire* lineage and
fails the moment it finds any grant or delegation with `status: 'revoked'`
(or `'suspended'`). Revoking Datasys's grant to Victor therefore invalidates
every action PMFreak tries to take under the delegation Victor derived from
it, immediately, without needing to touch PMFreak's delegation at all.

## How ancestor expiration works

The same mechanism handles time: `ancestor-expiration-policy` checks every
grant and delegation in the resolved chain against the deterministic clock's
`now`, comparing `expiresAt` if present. A delegation issued from authority
that has since expired is invalid the moment `now` passes that expiry --
there is no separate expiry sweep or background job, because the chain is
re-resolved and re-verified on every request.

## AuthorityProof

An `AuthorityProof` is the tamper-evident record of one verification: a
`chainHash` over every grant and delegation actually evaluated (so changing
any field on any of them changes the hash), the ordered `evaluatedGrantIds`
and `evaluatedDelegationIds`, the resulting `decisionType` and `valid` flag,
and a `proofHash` that also chains to the `previousHash` of the proof before
it -- the same hash-chained-ledger pattern Recognition Runtime uses for its
own audit trail. Two runtimes fed the identical inputs always produce the
identical `chainHash` and `proofHash`.

## How AuthorityProof is generated

`AuthorityChainVerifier` calls `AuthorityProofService.createProof` once per
verification, immediately after the policy chain runs, regardless of
whether the decision was valid or not -- an invalid decision still produces
a proof, with `valid: false` and the failing `decisionType`, so a denial is
just as auditable as an allowance. `AuthorityLineageLedger` records three
hash-chained `AuthorityEvent`s alongside it: the chain being resolved, the
chain being marked valid or invalid, and the proof being created.

## How Recognition Runtime integrates with Authority Graph

The integration is optional and additive: `AocRecognitionRuntime` (and
`RecognitionVerifier`) accept an optional `AuthorityGraphIntegration` --
anything shaped like `{ verifyAuthority(request): AuthorityDecisionLike }`,
which `AuthorityGraphRuntime` satisfies structurally. Recognition Runtime
never imports Authority Graph's domain types to stay loosely coupled; the
integration point is a small structural interface defined in
`recognition-runtime/services/authority-graph-integration.ts`.

When wired in, `RecognitionVerifier.verifyAction` runs its own full policy
chain first, exactly as it always has. Only if that chain already reached a
"recognized" outcome (`allow`, `require_human_approval` or
`require_more_evidence`) -- meaning the actor is recognized, not revoked,
and its own passport/capability token check out -- and only if the actor is
an agent or is acting for a different principal, does it ask Authority Graph
to prove the chain behind that token. If Authority Graph says the chain is
invalid, the decision is overridden to the mapped type below; if valid, the
original decision is kept untouched and annotated with `authorityDecisionId`
/ `authorityProofId`.

| AuthorityDecisionType | RecognitionDecisionType |
| --- | --- |
| `authority_missing` | `policy_violation` (or `invalid_capability`) |
| `scope_expansion_detected` | `out_of_scope` |
| `ancestor_revoked` | `revoked` |
| `ancestor_expired` | `expired` |
| `self_issuance_detected` | `policy_violation` |
| `non_delegable_action` | `policy_violation` |
| `cross_domain_authority_denied` | `policy_violation` |
| `issuer_not_authorized` / `delegation_not_allowed` / `delegation_depth_exceeded` | `policy_violation` |

Because the check only ever *overrides an already-viable outcome*, a rogue
or unrecognized actor is rejected by Recognition Runtime's own
`recognized_actor_required` / `rogue_actor_denied` policies well before
Authority Graph is ever consulted -- Authority Graph cannot rescue, and
cannot override, a rogue actor's denial. Likewise an expired or revoked
capability token is rejected by Recognition Runtime's own
`valid_capability_required` policy first, unaffected by Authority Graph
being wired in at all. See `tests/recognition-runtime-integration.test.ts`.

## Demo scenario: Datasys -> Victor -> PMFreak Closure Agent

`fixtures/` builds the same "Datasys Agent Republic" world Recognition
Runtime's fixtures use, plus the authority lineage behind it:

- Datasys is registered as the root issuer of the trust domain.
- Datasys grants Victor Project Manager authority over `project:HMP-14665`,
  delegable to agents one hop deep, with `send_final_invoice`,
  `approve_payment`, `sign_contract` and `change_bank_account` marked
  non-delegable.
- Victor delegates `draft_closure_email`, `summarize_project_status` and
  `prepare_invoice_support` to PMFreak Closure Agent, which cannot
  redelegate.
- An Unknown External Agent has no authority chain at all.

`tests/demo-scenarios.test.ts` and
`tests/recognition-runtime-integration.test.ts` exercise this world end to
end: a valid delegated draft, an out-of-scope project attempt, a
self-issuance attempt, an ancestor revocation, a rejected non-delegable
delegation, and the rogue agent that Authority Graph never gets a chance to
excuse.

## Determinism

- **Injected clock**: every service takes an `AuthorityRuntimeContext` with
  a `clock: { now(): string }`; nothing reads the wall clock directly.
- **Injected ID generator**: every generated id comes from
  `ids.nextId(prefix)`; nothing calls a random UUID generator.
- **Deterministic hashing**: `stableStringify` recursively sorts object keys
  before hashing, so `chainHash`/`proofHash`/`eventHash` never depend on
  insertion order -- identical inputs always produce identical hashes.
- **No LLM authority decisions**: every policy in `policies/` is a plain,
  synchronous function of an `AuthorityChainRequest` and a resolved
  `AuthorityChain`. Authority is proven by structural graph traversal and
  typed-field comparison, never by asking a model.

## Layout

```
domain/     Typed records: AuthorityNode, AuthorityEdge, AuthorityGrant,
            DelegationGrant, RoleAssignment, AuthorityChain(Request),
            AuthorityDecision, AuthorityProof, AuthorityEvent, RevocationLink.
services/   AuthorityGraphStore, AuthorityGrantService, RoleAssignmentService,
            DelegationService, AuthorityResolver, AuthorityChainVerifier,
            AuthorityProofService, AuthorityLineageLedger.
policies/   The nine policies listed above, plus the default evaluation order.
runtime/    AuthorityGraphRuntime facade, injectable clock/id generator,
            error types.
fixtures/   The Datasys Agent Republic authority lineage, plus fixtures for
            invalid delegations and revoked/expired ancestor authority.
tests/      Unit tests per service/policy, the required demo scenarios, and
            the Recognition Runtime integration tests.
```

## Usage

```ts
import { createAuthorityGraphRuntime, createAuthorityRuntimeContext } from './runtime/index.js';

const runtime = createAuthorityGraphRuntime(createAuthorityRuntimeContext('2026-01-01T00:00:00.000Z'));

runtime.registerRootIssuer('trust-domain-datasys', 'actor-datasys');

const victorGrant = runtime.issueAuthorityGrant({
  issuerActorId: 'actor-datasys',
  subjectActorId: 'actor-victor',
  trustDomainId: 'trust-domain-datasys',
  capability: 'project_closure.management',
  actions: ['draft_closure_email'],
  resourceScopes: ['project:HMP-14665'],
  canDelegate: true,
  allowedDelegateActorTypes: ['agent'],
  maxDelegationDepth: 1,
  nonDelegableActions: ['approve_payment'],
});

runtime.createDelegationGrant({
  delegatorActorId: 'actor-victor',
  delegateActorId: 'actor-pmfreak',
  delegateActorType: 'agent',
  trustDomainId: 'trust-domain-datasys',
  sourceAuthorityGrantId: victorGrant.id,
  capability: 'project_closure.drafting',
  actions: ['draft_closure_email'],
  resourceScopes: ['project:HMP-14665'],
  canRedelegate: false,
});

const decision = runtime.verifyAuthority(
  runtime.buildAuthorityChainRequest({
    actorId: 'actor-pmfreak',
    trustDomainId: 'trust-domain-datasys',
    action: 'draft_closure_email',
    resourceScope: 'project:HMP-14665',
  }),
);

console.log(decision.type); // "authority_valid"
console.log(runtime.getAuthorityProof(decision.id)); // the deterministic proof behind it
```
