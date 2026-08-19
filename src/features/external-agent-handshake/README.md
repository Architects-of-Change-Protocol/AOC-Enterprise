# Soberanía External Agent Handshake

Recognition Runtime answers "can this action be recognized?" Authority Graph
answers "where did the authority behind this action come from?" Approval
Runtime answers "who can approve this, and did they?" None of them answer the
question that matters the moment an actor from *outside* the trust domain
shows up:

**When an external agent wants to enter a trust domain, how does it present
itself, prove identity, request limited recognition, prove authority, receive
a bounded visa, and become eligible for recognized action without bypassing
local governance?**

That is External Agent Handshake's job -- the border-control layer for Soberanía
trust domains. Its core thesis:

- **Recognition Runtime** recognizes local actors and actions.
- **Authority Graph** proves chains of authority.
- **Approval Runtime** governs human approval.
- **External Agent Handshake** governs entry across trust boundaries.

No valid handshake, no local standing. No local standing, no recognized
action. This module is not a generic networking protocol, not OAuth, not
DID/VC cryptography, not a blockchain, not an API gateway, and it does not use
LLMs to decide external agent standing -- every decision is a pure function of
typed records, an injected clock and an injected ID generator.

## Why Recognition Runtime alone is not enough for external agents

Recognition Runtime's `RogueActorPolicy` treats `actor.type === 'external'` as
unconditionally untrusted -- and it should, because Recognition Runtime has no
model for foreign issuers, foreign passports, cross-boundary capability
scoping, or data-boundary rules. An external agent is not "an actor Recognition
Runtime hasn't met yet"; it is an actor from a jurisdiction Recognition Runtime
was never designed to vet. External Agent Handshake is that missing model: it
validates the issuer, the passport, the requested scope and the risk *before*
Recognition Runtime is ever asked to treat the actor as anything but rogue.

## Why Authority Graph is needed for authority presentation

An external agent's request often claims to carry authority from a principal
inside (or trusted by) the local trust domain -- "I act on behalf of Datasys's
approved partner program." That claim is exactly the kind of provable lineage
Authority Graph already models, so `AuthorityPresentationService` defers to
Authority Graph's `verifyAuthority` (via a structural
`HandshakeAuthorityGraphIntegration`) whenever one is configured, and falls
back to accepting a deterministic proof reference at face value otherwise (per
the MVP's no-real-cryptography rule). Either way, authority found valid here
can never expand the request beyond what the local `TrustBoundary` separately
allows.

## Why Approval Runtime is needed for high-risk/unknown-issuer handshakes

Some handshakes are legitimate but risky enough (or from an issuer unproven
enough) that no policy should auto-accept them. `ApprovalRequiredPolicy`
resolves that pending state through a structural
`HandshakeApprovalRuntimeIntegration`: it creates an `ApprovalRequest` the
first time a handshake lands on `requires_approval`, and clears the
requirement only once Approval Runtime reports back a valid, in-scope
`ApprovalProof`. Approval can never override an explicit trust-boundary
denial, a revoked issuer, a revoked visa, or a prohibited capability/action --
it only ever resolves a *pending* approval requirement.

## External agent vs. issuer vs. trust boundary vs. visa vs. ingress grant

- **ExternalAgentDescriptor** is the agent itself -- its claimed identity,
  type, status and (if any) responsible human/organization.
- **ExternalTrustIssuer** is who vouches for that agent -- a foreign
  authority this trust domain has decided to trust, limit, suspend or revoke.
- **TrustBoundary** is the local trust domain's own border policy -- allowed
  issuers/agent types/capabilities/scopes, prohibited capabilities/actions/
  scopes, and data-boundary rules. It is the final authority; nothing
  upstream (passport, authority, approval) can expand past it.
- **AgentVisa** is the bounded, time-limited grant of local standing an
  external agent receives once its handshake is accepted -- what it may do,
  where, and until when.
- **IngressGrant** is the concrete action/scope/capability bundle a visa
  authorizes for actually being checked at verification time; it can never
  exceed its parent visa.

## HandshakeRequest vs. HandshakeSession vs. HandshakeDecision vs. HandshakeProof

- **HandshakeRequest** is the full, immutable snapshot of what was asked:
  the agent descriptor, its passport presentation, its requested
  capabilities/actions/scopes, and (optionally) its authority presentation.
- **HandshakeSession** tracks the live, mutable state of one handshake
  attempt in progress (open, challenged, verifying, accepted, ...).
- **HandshakeDecision** is the outcome: accepted, accepted_limited,
  requires_approval, rejected, quarantined, expired or revoked, with the
  specific allowed/denied capability, action and scope lists.
- **HandshakeProof** is the deterministic, hash-chained record of what a
  decision actually decided and why -- referencing the passport presentation,
  authority presentation, approval proof, visa and ingress grant it produced.

## How passport presentation works in the MVP

`PassportPresentationService.presentPassport` builds an
`ExternalPassportPresentation` and immediately classifies its status
(`valid` / `expired` / `revoked` / `issuer_untrusted` / `invalid`) from
deterministic inputs: an explicit `revoked` flag, an `expiresAt` checked
against the injected clock, and whether its issuer is accepted by this trust
domain. A SHA-256 digest (`presentationHash`, via the same
`stableStringify`/`createDigest` helpers used across every Soberanía runtime) makes
the presentation tamper-evident without any real cryptographic signature
verification.

## How challenge/response works in the MVP

`HandshakeChallengeService.issueChallenge` draws a nonce from the injected
sequential ID generator (never `Math.random`) and privately remembers the
expected response as a digest of `{challengeId, challengeNonce}`. An external
agent "proves control" by echoing that same digest back through
`answerChallenge`; a mismatch, a late answer past `expiresAt`, or an unanswered
challenge all fail `ChallengeResponsePolicy`. This is a deterministic
stand-in for real proof-of-control, not a real cryptographic handshake.

## How capability requests are evaluated

Each `ExternalCapabilityRequest` carries its own explicit `riskLevel`
(mirroring how `ApprovalRequirement.riskLevel` works in Approval Runtime).
`RequestedCapabilityPolicy` and `RequestedScopePolicy` narrow the requested
capabilities/actions/scopes down to whatever the local `TrustBoundary` (and,
for a limited issuer, the issuer's own allow-list) actually permits --
anything prohibited is dropped outright; anything outside a non-empty
allow-list is dropped by omission. `CapabilityRequestService` also computes
the request's aggregate risk as the highest risk among its individual
capability requests.

## How local trust boundary always wins

`LocalTrustBoundaryPolicy` runs first and fails fast if the boundary is
missing, suspended or revoked. Every later policy that narrows access
(`RequestedScopePolicy`, `RequestedCapabilityPolicy`, `DataBoundaryPolicy`)
only ever *intersects* with the boundary's allow/deny lists -- it can never
widen past them. No passport claim, authority presentation, approval, or
prior visa is ever consulted to expand access the boundary itself prohibits.

## How partial acceptance works

`HandshakePolicyEvaluator` is not a pure short-circuit chain like Approval
Runtime's: policies can narrow the working `allowedCapabilities`/
`allowedActions`/`allowedResourceScopes` sets and continue, rather than only
ever passing or hard-failing. If anything was narrowed along the way (and
nothing hard-failed), the decision becomes `accepted_limited` instead of
`accepted`, and `HandshakeDecisionService` issues a visa/ingress grant scoped
to exactly the narrowed sets -- never the original request.

## How approval-required handshakes work

When a policy flags a pending approval requirement (unknown issuer, missing
required authority, high/critical risk), `ApprovalRequiredPolicy` checks the
current `approvalCheck` state: no check yet keeps the handshake at
`requires_approval`; a valid, in-scope `ApprovalProof` clears the requirement
(the request can then resolve to `accepted`/`accepted_limited`); a
hard-blocking approval outcome (revoked, invalid, out-of-scope,
segregation-of-duties) rejects outright. `requires_approval` is deliberately
non-terminal: no `AgentVisa`, `IngressGrant` or `HandshakeProof` exists until
the request is re-decided with a satisfied approval.

## How visas are issued

`AgentVisaService.issueAgentVisa` is only ever called by
`HandshakeDecisionService` on an `accepted`/`accepted_limited` outcome, with
exactly the allowed capability/action/scope lists that outcome computed --
never the raw request. Its TTL is bounded by
`TrustBoundaryService.computeMaxVisaTtlMinutes`, which takes the *stricter* of
the boundary's and the issuer's max TTL.

## How ingress grants are issued

`IngressGrantService.issueIngressGrant` filters its requested
actions/scopes/capabilities down to whatever its parent `AgentVisa` actually
allows -- a grant can claim only a subset of its visa, never more.

## How external standing is verified

`ExternalAgentHandshakeRuntime.verifyVisaForAction` (and its Recognition
Runtime-facing wrapper, `verifyExternalStanding`) resolves, in order: is there
a visa at all (else `handshake_required`/`handshake_pending`/
`approval_required`/`handshake_rejected`/`handshake_quarantined` depending on
the underlying request's status); is that visa still active (else
`visa_expired`/`visa_revoked`); does it cover the requested
capability/action/scope (else `capability_denied`/`scope_denied`); and does an
`IngressGrant` for it still cover the specific action/scope (else
`ingress_denied`). Only when every one of those checks passes does it return
`standing_valid`.

## How revocation works

`HandshakeRevocationService` marks a request, visa or ingress grant as
revoked -- permanently blocking future use -- while leaving every prior
`HandshakeEvent` and `HandshakeProof` in place. Revocation is never
undone by re-deciding a handshake; a fresh handshake is required.

## How expiration works

`HandshakeExpirationService` checks every expirable entity (request,
challenge, session, visa, ingress grant) against the injected clock only --
`expiresAt <= now`, nothing else. `AgentVisaService.verifyAgentVisa` and
`IngressGrantService.verifyIngressGrant` independently re-check this at
verification time, so a stale sweep never lets an expired grant validate.

## How HandshakeProof is generated

`HandshakeProofService.createProof` hashes the decision's core fields
(request/decision IDs, passport/authority presentation IDs, approval proof
ID, visa/ingress grant IDs, decision type, `accepted`, and evidence hashes)
together with the previous proof's hash, using the same
`stableStringify`/`createDigest` pattern as every other Soberanía proof. A rejected
or quarantined decision still produces a proof -- with `accepted: false` and
no visa/ingress grant IDs -- so "nothing was granted, and here is the
tamper-evident record of that" is itself an auditable fact.

## How HandshakeLedger works

`HandshakeLedger` records every `HandshakeEvent` (submitted, challenged,
accepted/accepted_limited/requires_approval/rejected/quarantined/expired/
revoked, visa/ingress issued or revoked, proof created, standing evaluated)
as a hash-chained trail through `HandshakeStore`, queryable by trust domain,
request, external agent, visa, decision or proof.

## How Recognition Runtime integrates with External Agent Handshake

Recognition Runtime's `RogueActorPolicy` unconditionally denies
`actor.type === 'external'` -- unless an optional, structurally-typed
`ExternalAgentStandingIntegration` is configured *and* it reports a currently
valid visa for that actor/action, in which case the actor is let past the
rogue check so the *rest* of the normal chain (passport, capability,
revocation, authority, approval) still applies in full. If the only reason an
action was denied is that blanket rogue-type rule, and External Agent
Handshake was consulted but did not return a valid visa, Recognition Runtime
surfaces the more specific handshake reason (`expired`, `revoked`,
`out_of_scope`, `invalid_capability`, `unrecognized_actor`,
`require_human_approval`, `policy_violation`) instead of the generic
"untrusted actor type" message. Handshake standing never overrides an invalid
passport, a revoked/expired capability, an invalid authority chain, or a
missing approval -- those denials are computed independently and always win.
With no integration configured, Recognition Runtime's behavior is exactly
what it was before this module existed.

## Demo scenario

Trusted Partner Research Agent -> handshake -> visa -> ingress grant ->
recognized action:

1. `buildDatasysHandshakeWorld` registers Trusted Partner Org as a trusted
   issuer, the Datasys Agent Republic's `TrustBoundary` (allowing
   `read_project_summary`/`submit_project_update`/`request_client_follow_up`
   on `project:HMP-14665`, prohibiting financial/legal/bank-related
   capabilities and actions), and the Trusted Partner Research Agent itself.
2. The agent presents a valid passport and requests `read_project_summary`
   on `project:HMP-14665`.
3. `ExternalAgentHandshakeRuntime.decideHandshake` runs the full policy chain
   and accepts the handshake, issuing an `AgentVisa`, an `IngressGrant` and a
   `HandshakeProof`.
4. `verifyVisaForAction`/`verifyExternalStanding` now returns `standing_valid`
   for that agent/action/scope.
5. When Recognition Runtime is configured with this module's
   `ExternalAgentStandingIntegration`, an `ActionRequest` from that same
   actor for that same action is let past `RogueActorPolicy` and evaluated
   normally end to end.

See `fixtures/` and `tests/demo-scenarios.test.ts` for the full set of
scenarios, including out-of-scope requests, unknown/revoked issuers, expired
passports, high-risk approval-required handshakes, and visa
expiration/revocation.

## Determinism

Like every Soberanía runtime, this module never calls `Date.now()`, never generates
a random ID, and never asks an LLM to decide handshake validity:

- **Injected clock** (`HandshakeRuntimeClock`/`ManualHandshakeRuntimeClock`)
  drives every expiration and timestamp check.
- **Injected ID generator** (`HandshakeRuntimeIdGenerator`, sequential and
  prefixed) drives every entity ID and every challenge nonce.
- **Deterministic hashing** (`stableStringify` + SHA-256 `createDigest`,
  identical to Approval Runtime's implementation) drives every proof and
  event hash, with a `previousHash`/`{proofHash,eventHash}` chain.
- **No LLM handshake decisions** -- every `HandshakeDecision` is the pure
  output of the ordered `HandshakePolicy` chain over typed inputs.
