# AOC Action Enforcement Gateway & SDK

Recognition Runtime decides whether an action can be recognized. Authority Graph
proves where the authority behind it came from. Approval Runtime governs human
approval. External Agent Handshake governs trust-boundary entry. None of them
touch the real world -- they only ever produce decisions.

**Action Enforcement Gateway is the execution boundary.** It is the only place
in this repo where a real, application-supplied `execute()` callback is ever
invoked, and it invokes that callback exactly once, and only when every
upstream AOC layer has already said yes.

> No allow decision, no execution. No valid recognition, no execution. No
> valid authority, no execution. No valid approval, no execution. No valid
> external standing, no execution.

## Why Recognition Runtime alone is not enough

Recognition Runtime answers "can this action be recognized?" and returns a
`RecognitionDecision`. That decision is data. Nothing stops an application
from calling a real side-effecting function regardless of what the decision
says -- recognition is a governance signal, not a runtime guarantee. Action
Enforcement closes that gap: it is a gateway an application's real
side-effecting code must pass *through*, not a report it can choose to read.

## Why Authority Graph, Approval Runtime and External Agent Handshake remain upstream

This feature does not re-implement authority lineage, approval quorum/
segregation-of-duties, or handshake/visa issuance. Those stay exactly where
they are. Action Enforcement's core thesis is:

```
Action Enforcement Gateway -> Recognition Runtime -> optional AOC integrations
                                                      already wired into
                                                      Recognition Runtime
```

Recognition Runtime is consulted through a local structural interface,
[`EnforcementRecognitionIntegration`](./domain/enforcement-context.ts)
(`verifyAction(input): result`), so this feature never imports Recognition
Runtime's domain types directly and Recognition Runtime never imports this
feature at all. Authority Graph, Approval Runtime and External Agent
Handshake are consulted *by Recognition Runtime itself*, exactly as before --
Action Enforcement never duplicates their business logic. It only decides
whether the resulting recognition outcome is allowed to authorize a real side
effect.

## Decision vs. enforcement

A `RecognitionDecision` (or an `EnforcementDecision`) is a statement about
what *should* happen. Enforcement is the mechanism that makes sure what
*actually* happens matches it. `EnforcementDecision.allowedToExecute` is the
single boolean every other piece of this feature is built to protect: it is
`true` if and only if the decision type is `execute_allowed`. Every other
decision type -- `approval_required`, `evidence_required`,
`external_handshake_required`, `dry_run_allowed`, `duplicate_suppressed`,
`emergency_denied`, `adapter_denied`, `expired`, `execution_blocked`,
`invalid_request` -- means the executor must never run.

## Preflight vs. execution

- **Preflight** (`aocGuard.preflight(input)` / `ActionEnforcementRuntime.preflight`)
  runs the full recognition + policy pipeline and returns an
  `EnforcementDecision`. It never touches an executor, never creates an
  `ExecutionResult`, and is always safe to call speculatively.
- **Execution** (`aocGuard.enforce(...)` / `verifyAndExecute(...)`) runs the
  same preflight pipeline and then -- only if it allowed -- invokes the
  caller's `execute()` exactly once, producing an `ExecutionResult` and an
  `EnforcementProof` regardless of whether the outcome was allowed, blocked,
  skipped or duplicated.

## Dry-run vs. execute mode

`EnforcementRequest.mode` is one of `'preflight' | 'execute' | 'dry_run'`.
Dry run runs the identical pipeline as execute mode -- same recognition call,
same policy chain -- but even when every policy would otherwise allow it, the
final decision type is forced to `dry_run_allowed` and `allowedToExecute` is
`false`. The executor is never invoked, and the request's side effect is
marked `skipped`, never `executed`. Dry run answers "would this be allowed?"
without spending any real side effect.

## How `enforce()` works

```ts
await aocGuard.enforce(actionRequest, async () => {
  return executeRealAction();
});
```

Under the hood: `AocGuard.enforce` builds an `EnforcementRequest` (target,
`ExecutionIntent`, planned `SideEffectDescriptor`), then hands it and the
callback to `GuardedExecutionService.run`, which:

1. Calls `EnforcementPreflightService.preflight` -- which calls the injected
   `EnforcementRecognitionIntegration`, maps the result through
   `EnforcementDecisionService`, and evaluates the fixed
   `EnforcementPolicyEvaluator` chain (emergency deny -> recognition required
   -> allow decision required -> approval pending -> evidence required ->
   external standing -> adapter permission -> idempotency -> execution
   timeout -> side-effect boundary -> dry run -> post-execution record).
2. If the resulting decision does not allow execution, it marks the side
   effect(s) `blocked`/`skipped`, creates a `not_executed`/`skipped`/
   `duplicate` `ExecutionResult`, and returns -- **the callback is never
   called.**
3. If it does allow execution, it marks the request `executing`, invokes
   `execute()` exactly once inside a `try/catch`, marks the side effect(s)
   `executed` or `failed` accordingly, and creates the matching
   `ExecutionResult`.
4. Either way, it creates a deterministic, hash-chained `EnforcementProof` and
   returns an `EnforcementOutcome<T>` (`{ request, decision, result, proof }`).

## Why executor callbacks must never run unless allowed

This is the product's entire reason for existing. `GuardedExecutionService`
is the *only* code path in this feature that invokes a caller-supplied
`execute()`. It always calls `preflightService.preflight()` first and
branches on `decision.allowedToExecute` before it will even consider calling
`execute`. There is no code path that reaches `execute()` without first
producing an allow decision -- blocked, pending, dry-run and duplicate
outcomes all return from a separate branch that never references the
callback at all.

## How side effects are modeled

`SideEffectDescriptor` tracks the lifecycle of the side effect a real
`execute()` would cause: `planned` (recorded the moment the
`EnforcementRequest` is created, before any decision is even made) ->
`blocked` | `executed` | `failed` | `skipped` (never both `executed` *and*
originating from a blocked/dry-run/duplicate decision). `SideEffectLedger`
owns these transitions and mirrors every one of them into
`EnforcementLedger` as `side_effect_planned` / `side_effect_blocked` /
`side_effect_executed` events.

## How idempotency prevents duplicate side effects

`IdempotencyService` tracks one `IdempotencyRecord` per idempotency key. The
first request under a new key is `new` and proceeds normally; the runtime
records success/failure against that key once the executor settles. Any
later request presenting the *same* key while a prior attempt already
**succeeded** is `duplicate_success` -- the `idempotency` policy turns that
into a `duplicate_suppressed` decision, and `GuardedExecutionService` never
calls the executor a second time. A prior **failed** attempt may retry
(`duplicate_retry`) when `allowIdempotencyRetryAfterFailure` (default `true`)
permits it.

## How adapters work

An `EnforcementAdapter` is a declarative permission boundary a specific
integration point (`tool_call` | `api_handler` | `workflow_step` | `webhook` |
...) is registered under. Deny lists always win; an allow list, when present,
is a closed set. Adapter denial can override an *upstream allow* --
Recognition Runtime saying "allow" never forces enforcement to execute if the
adapter registered for that target says no. See `adapters/` for typed
constructors (`createToolCallAdapter`, `createApiHandlerAdapter`, ...) that
build an `EnforcementAdapter` record to hand to
`ActionEnforcementRuntime.registerAdapter`.

## SDK guards

### Tool call

```ts
const toolCallGuard = new ToolCallGuard(aocGuard);

const outcome = await toolCallGuard.execute({
  actorId,
  trustDomainId,
  toolName: 'send_email',
  action: 'send_client_follow_up',
  resourceScope: 'project:HMP-14665',
  capability: 'client_communication',
  execute: async () => sendEmail(/* ... */),
});
```

### API handler

```ts
const apiHandlerGuard = new ApiHandlerGuard(aocGuard);

export const POST = apiHandlerGuard.wrap({
  action: 'send_client_follow_up',
  capability: 'client_communication',
  resourceScopeFromRequest: (req) => `project:${req.params.projectId}`,
  actorFromRequest: (req) => req.user.actorId,
  handler: async (req) => { /* ... */ },
});
```

`wrap` is deliberately framework-agnostic: it returns
`{ blocked: false, value, outcome } | { blocked: true, outcome }` rather than
assuming any particular Request/Response shape, so the caller adapts it to
Next.js/Express/etc. in one line. Pass `throwOnBlocked: true` to throw
`ApiHandlerBlockedError` instead.

### Workflow step

```ts
const workflowStepGuard = new WorkflowStepGuard(aocGuard);

await workflowStepGuard.runStep({
  stepId: 'send-client-follow-up',
  actorId,
  trustDomainId,
  action,
  resourceScope,
  execute: async () => step.run(),
});
```

### Webhook

```ts
const webhookGuard = new WebhookGuard(aocGuard);

await webhookGuard.handle({
  webhookId: 'webhook-partner-status-update',
  actorId: externalAgentId,
  trustDomainId,
  action,
  resourceScope,
  visaId,
  ingressGrantId,
  handshakeProofId,
  execute: async () => applyUpdate(),
});
```

## How enforcement proofs are generated

`EnforcementProofService` produces a deterministic, hash-chained
`EnforcementProof` for *every* enforcement attempt -- allowed, blocked,
dry-run or duplicate. The `proofHash` is `sha256` over a stably-sorted JSON
serialization of the decision, execution result, side effect IDs, upstream
proof references and idempotency key, chained to the previous proof's hash
(mirrors `AuthorityProofService`/Recognition Runtime's own proof scheme).
Identical inputs always produce an identical hash; any change to the
decision, result or side effects changes it.

## How enforcement events are recorded

`EnforcementLedger` records a hash-chained `EnforcementEvent` for every step
of the pipeline: `enforcement_requested`, `preflight_started`,
`preflight_passed`/`preflight_failed`, `execution_blocked`,
`execution_started`, `execution_succeeded`/`execution_failed`/
`execution_skipped`, `duplicate_suppressed`, `side_effect_planned`/
`side_effect_blocked`/`side_effect_executed`, `enforcement_proof_created`,
`enforcement_violation_recorded`. Query by request, trust domain, actor,
decision or proof via `EnforcementLedger`/`ActionEnforcementRuntime`.

## How blocked execution is audited

Whenever preflight resolves to a non-allow decision, `EnforcementPreflightService`
records an `EnforcementViolation` (with a severity and a type drawn from the
decision -- `recognition_denied`, `request_expired`, `adapter_denied`,
`emergency_denied`, `idempotency_violation`, `external_standing_missing`) and
emits `enforcement_violation_recorded`. The blocked attempt still gets an
`ExecutionResult` (`not_executed`) and an `EnforcementProof`, so a blocked
action is exactly as auditable as an allowed one.

## How external agent standing flows through Recognition Runtime

Action Enforcement never talks to External Agent Handshake directly. An
`EnforcementRequest` can carry `visaId` / `ingressGrantId` / `handshakeProofId`
(set by `WebhookGuard`/`AocGuard` from what the caller already presented);
these are forwarded into `RecognitionVerificationInput` and it is Recognition
Runtime's own (optional) `ExternalAgentStandingIntegration` that resolves
them into an ordinary `RecognitionDecisionType` (`revoked`, `expired`,
`unrecognized_actor`, `policy_violation`, ...). Enforcement's own
`external-standing-policy` only confirms that a request declaring standing
resolved through a decision path Recognition Runtime would only reach after
validating it -- it never re-derives or overrides that validation.

## Demo scenario

PMFreak Closure Agent drafts the project closure email:

```ts
const fixture = buildDatasysEnforcementFixture();
const outcome = await fixture.aocGuard.enforce(buildDraftClosureEmailGuardInput(), async () => {
  return saveDraft(/* ... */);
});
// outcome.decision.type === 'execute_allowed'
// outcome.result.status === 'executed'
// outcome.proof is a deterministic EnforcementProof
```

See `fixtures/` for the full "Datasys Agent Republic" world (Victor Valverde,
PMFreak Closure Agent, Trusted Partner Research Agent, Unknown External
Agent) wired across Recognition Runtime, Authority Graph, Approval Runtime
and External Agent Handshake, and `tests/demo-scenarios.test.ts` for all ten
canonical scenarios (allowed, approval-required, evidence-required, denied,
external-agent-allowed, external-agent-denied, idempotent duplicate,
dry-run, adapter-denied, emergency-denied).

## Determinism

- **Injected clock**: `EnforcementRuntimeContext.clock` (a manual clock in
  tests/fixtures) -- no `Date.now()` anywhere in this feature.
- **Injected ID generator**: `EnforcementRuntimeContext.ids` (a sequential
  generator in tests/fixtures) -- no random IDs.
- **Deterministic hashing**: `stableStringify`/`createDigest` (recursive
  key-sorted JSON + `sha256`) for both events and proofs -- no
  non-deterministic serialization.
- **No LLMs**: every enforcement decision is produced by the fixed,
  ordered policy chain in `policies/`. There is no model call anywhere in
  this feature's decision path.
