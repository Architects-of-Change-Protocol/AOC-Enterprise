# AOC Kernel Integration Guide

How a future consumer (Enterprise Runtime HTTP API, an SDK, PMFreak, Agent Passport, JAPI) is expected to call
`AocKernel`. This PR does not add an HTTP surface -- it documents the shape a future one would use, and adds only
the compilation-proving integration test described in §7.

## 1. Initialization

`AocKernel` requires exactly one real dependency: a `RecognitionProvider`. In production this is the same bridge
already used by every real caller of `AocGuard` today -- a concrete Recognition Runtime instance (itself wired to
Authority Graph, Approval Runtime, and External Agent Handshake), adapted through a structural
`EnforcementRecognitionIntegration`. Nothing about this changes for the kernel; see
`bridgeRecognitionRuntime()` in `src/features/action-enforcement/fixtures/datasys-enforcement.fixture.ts` for the
canonical shape.

```ts
import { createAocKernel } from '@aoc-enterprise/runtime/kernel';
import { createAocRecognitionRuntime } from '<path-to>/recognition-runtime/runtime/aoc-recognition-runtime.js';
// ... construct authorityRuntime, approvalRuntime, handshakeRuntime, recognitionRuntime as your application does today ...

const kernel = createAocKernel({
  recognitionProvider: bridgeRecognitionRuntime(recognitionRuntime), // required
  policyPackProvider: myDomainPolicyPackIntegration,                 // optional
  // clock/idGenerator: omit in production (defaults to real time / crypto.randomUUID());
  // supply deterministic equivalents only in tests -- see §9.
});
```

## 2. Dependency injection

`AocKernelOptions` only exposes ports with real, direct backing at the kernel's own composition boundary:
`recognitionProvider` (required), `policyPackProvider`, `clock`, `idGenerator`, `emergencyDeny`,
`allowIdempotencyRetryAfterFailure`, `policies`, `adapters`. Authority Graph, Approval Runtime, and evidence checking
are not separate kernel ports -- they are reached transitively inside whatever `recognitionProvider` you inject,
exactly as in the pre-extraction engine. See `docs/kernel/AOC_KERNEL_INVARIANTS_V1.md` for why those ports are
intentionally not introduced at this layer.

If any request you evaluate names a `target.adapterId`, register that adapter -- either via `adapters` at
construction time or `kernel.registerAdapter(...)` afterward -- so `AdapterPermissionPolicy` can actually enforce
its allow/deny lists. Without a registered adapter, that policy finds nothing to check and passes with
`NO_ADAPTER_REGISTERED`, which is more permissive than a directly-configured `ActionEnforcementRuntime` would be.

## 3. Request construction

```ts
const request: KernelEvaluationRequest = {
  requestId: crypto.randomUUID(),
  actor: { id: 'actor-pmfreak-closure-agent', principalId: 'actor-victor-valverde', trustDomainId: 'trust-domain-datasys' },
  action: {
    type: 'draft_closure_email',
    resourceScope: 'project:HMP-14665',
    capability: 'project_closure.drafting',
    riskLevel: 'medium',
    sideEffectType: 'write',
  },
  target: { type: 'api_handler', name: 'draft_closure_email' },
  context: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-drafting', evidence: [{ type: 'email_thread', reference: 'thread:HMP-14665' }] },
  requestedAt: new Date().toISOString(),
};
```

`context` is where anything the wrapped engine's structural bridge reads off `metadata` belongs (e.g.
`passportId`/`capabilityTokenId`/`evidence`, exactly as `bridgeRecognitionRuntime` expects today). `action.domain`/
`jurisdiction`/`country`/`industry`/`customerId`/`amount`/`currency`/`counterpartyId`/`dataDomains`/`evidenceIds`
are forwarded to an optional Domain Policy Pack Runtime integration when one is configured, and are simply ignored
otherwise.

## 4. Evaluation

```ts
const result = await kernel.evaluate(request);
```

`evaluate()` never invokes anything -- it is the pure evaluation operation (`AocGuard.preflight()` underneath).

## 5. Handling the result

```ts
switch (result.status) {
  case 'allowed':
    // proceed -- or, to also invoke the caller's own adapter, use kernel.enforce() instead (§7).
    break;
  case 'denied':
    // result.reasonCodes[0], result.summary
    break;
  case 'approval_required':
    // result.approval.status ('pending' | 'granted' | 'not_applicable'), result.reasonCodes
    break;
  case 'indeterminate':
    // a configured dependency (recognitionProvider) failed unexpectedly -- retry or alert, do not treat as a governance denial.
    break;
}
```

### Handling allowed
`result.status === 'allowed'` covers `execute_allowed` and `dry_run_allowed` from the wrapped engine -- see
`docs/kernel/AOC_KERNEL_INVARIANTS_V1.md` for the exact mapping and its rationale.

### Handling denied
`result.reasonCodes` carries the stable taxonomy (`docs/kernel/AOC_KERNEL_CURRENT_EXECUTION_MODEL.md` §10,
`src/kernel/reason-codes/reason-codes.ts`); `result.policies` carries every policy that actually ran, in order.
`denied` also covers `duplicate_suppressed` (an idempotency replay the wrapped engine refuses to run again) --
check for `ACTION_DUPLICATE_SUPPRESSED` in `reasonCodes` to distinguish it from a genuine governance denial; do
not re-attempt the side effect yourself in either case.

### Handling approval required
`result.approval.status` distinguishes `pending` from `granted`; `result.evidence` distinguishes an evidence-gated
outcome from an approval-gated one via `reasonCode`.

### Handling indeterminate
This status only ever arises from an unhandled exception in a configured provider -- see
`AOC_KERNEL_CURRENT_EXECUTION_MODEL.md` §14. It is not a governance outcome and should not be logged/audited as one.

### Consuming the trace
`result.trace.steps` is ordered (`recognition` -> `authority` -> `approval` -> each action-enforcement policy that
ran). Pass `{ traceLevel: 'full' }` in `KernelEvaluationOptions` to include each policy step's own `metadata`.

## 6. Future persistence hooks

Nothing in this PR persists a `KernelEvaluationResult` anywhere durable -- the wrapped engine's `EnforcementStore`
remains in-memory, scoped to the `ActionEnforcementRuntime` instance the kernel constructs. A future HTTP adapter
PR is expected to persist the returned `KernelEvaluationResult` (and, for `enforce()`, the `KernelExecutionOutcome`)
against a real store; the kernel deliberately does not decide what that store is.

## 7. Executing an already-authorized adapter

```ts
const outcome = await kernel.enforce(request, async () => {
  return sendEmail(/* ... */); // only ever invoked if evaluation allows it
});

if (outcome.execution.executed) {
  // outcome.execution.value
} else if (outcome.execution.status === 'failed') {
  // outcome.execution.errorMessage -- the adapter threw; the engine does not rethrow.
}
```

This exercises the real, extracted kernel end-to-end and is the "one real integration path" proven in
`src/kernel/__tests__/kernel-enforce-integration.test.ts`.

## 8. Deterministic testing

```ts
import { AocKernel } from '@aoc-enterprise/runtime/kernel';

const kernel = new AocKernel({
  recognitionProvider,
  clock: { now: () => '2026-01-01T00:00:00.000Z' },
  idGenerator: (() => { let n = 1; return { nextId: (prefix) => `${prefix}-${String(n++).padStart(6, '0')}` }; })(),
});
```

Any object matching `{ now(): string }` / `{ nextId(prefix: string): string }` works -- these are the same shapes
the wrapped engine's own `EnforcementRuntimeContext` already uses in every test in this repository
(`createManualEnforcementClock`, `createSequentialEnforcementIdGenerator`).
