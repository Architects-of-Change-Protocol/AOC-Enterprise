# AOC Kernel Extraction — Implementation Note

Pre-coding analysis required before any extraction work. Written from direct
reading of the current implementation, not from assumption.

## 1. Actual `AocGuard.enforce()` call path

```
AocGuard.enforce(input, execute)                              src/features/action-enforcement/sdk/aoc-guard.ts:87
  -> buildRequest(input, mode)                                 same file:97
  -> runtime.createEnforcementRequest(...)                      action-enforcement-runtime.ts:116
       -> EnforcementRequestService.createEnforcementRequest    services/enforcement-request-service.ts:45
            - allocates EnforcementRequest.id (ctx.ids)
            - plans one SideEffectDescriptor (SideEffectLedger.planSideEffect)
            - records 'enforcement_requested' ledger event
  -> runtime.enforce(request, execute)                          action-enforcement-runtime.ts:130
       -> GuardedExecutionService.run(request, execute)         services/guarded-execution-service.ts:35
            -> preflightService.preflight(request)              services/enforcement-preflight-service.ts:41
                 -> recognitionIntegration.verifyAction(...)     domain/enforcement-context.ts (structural port)
                      => in practice: bridgeRecognitionRuntime() -> AocRecognitionRuntime.submitActionRequest
                         -> RecognitionVerifier.verifyAction     features/recognition-runtime/services/recognition-verifier.ts:38
                              - loads actor/trustDomain/passport/capabilityToken/principalActor
                              - RevocationEngine.checkRevocation
                              - ExternalAgentHandshakeRuntime.verifyExternalStanding (only actor.type === 'external')
                              - PolicyEvaluator.evaluatePolicies (recognition-runtime's own 10-policy chain)
                              - AuthorityGraphRuntime.verifyAuthority (only if recognized + requiresAuthorityChain)
                              - ApprovalRuntime.verifyApprovalForAction (only if decisionType === 'require_human_approval')
                              - EvidenceLedger.recordAuditEvent
                 -> decisionService.mapRecognitionResult(...)    services/enforcement-decision-service.ts:70 (default-deny map)
                 -> adapterRegistry.getAdapter(target.adapterId)
                 -> idempotencyService.check(...)
                 -> policyPackService.evaluatePolicyPackForRequest(...)   optional Domain Policy Pack Runtime integration
                 -> policyEvaluator.evaluate(...)                services/enforcement-policy-evaluator.ts:26
                      (action-enforcement's own 13-policy chain, first-failure-wins, see chain below)
                 -> decisionService.createDecision(...)          persists EnforcementDecision, sets allowedToExecute
                 -> ledger events (policy_pack_evaluated/blocked/warning, preflight_passed/failed)
                 -> violation recorded on any non-allow terminal decision
            -> if !decision.allowedToExecute: mark side effects (skipped/blocked), record ledger event,
               build ExecutionResult via EnforcementResultService (skipped/duplicate/not_executed),
               create EnforcementProof (hash-chained), return EnforcementOutcome. execute() is NEVER called.
            -> if decision.allowedToExecute: mark request 'executing', record 'execution_started',
               await execute() inside try/catch,
                 success -> mark side effects executed, ExecutionResult 'executed', idempotency success record,
                            request 'executed', 'execution_succeeded' event, EnforcementProof, return outcome
                 failure -> mark side effects failed, ExecutionResult 'failed' (error captured, NOT rethrown),
                            idempotency failure record, request 'failed', 'execution_failed' event,
                            EnforcementProof, return outcome
```

Full detail with types, tests, and a sequence diagram: `docs/kernel/AOC_KERNEL_CURRENT_EXECUTION_MODEL.md`.

## 2. Existing runtime dependencies

`ActionEnforcementRuntime` (src/features/action-enforcement/runtime/action-enforcement-runtime.ts) is composed from,
in constructor order: `EnforcementStore`, `EnforcementLedger`, `SideEffectLedger`, `EnforcementRequestService`,
`EnforcementDecisionService`, `EnforcementPolicyEvaluator`, `AdapterRegistry`, `IdempotencyService`,
`EnforcementResultService`, `EnforcementProofService`, `PolicyPackEnforcementService`, `EnforcementPreflightService`,
`GuardedExecutionService`. All are constructed with an injected `EnforcementRuntimeContext` (`clock` + `ids`), which
is already fully deterministic in tests (`createManualEnforcementClock`, `createSequentialEnforcementIdGenerator`).

Upstream, it depends structurally (never by hard import) on a caller-supplied `EnforcementRecognitionIntegration`
(`verifyAction`). In every real wiring found in this repository, that integration is
`bridgeRecognitionRuntime()` over `AocRecognitionRuntime`, which is itself composed from Authority Graph,
Approval Runtime and External Agent Handshake. This composition is realized in
`src/features/action-enforcement/fixtures/datasys-enforcement.fixture.ts` (`buildDatasysEnforcementFixture`) — the
canonical, fully-wired "Datasys Agent Republic" world reused by essentially every action-enforcement test.

Optionally, an `EnforcementPolicyPackIntegration` (Domain Policy Pack Runtime) may be supplied; when absent, the
`domain_policy_pack` policy step always passes with `policy_not_applicable`, so behavior is byte-identical to a
runtime with no policy pack at all.

## 3. Existing decision object(s)

Three decision-shaped objects exist at different layers, and the kernel must not collapse or hide any of them:

- `RecognitionDecision` (recognition-runtime) — carries the recognition/authority/approval verdict plus upstream ids.
- `EnforcementPolicyPackEvaluationResult` (action-enforcement, optional) — the Domain Policy Pack verdict.
- `EnforcementDecision` (action-enforcement) — the terminal decision object returned by `preflight()`, `type: EnforcementDecisionType`
  (11 variants), `allowedToExecute: boolean`, `reasonCode`/`reason`, full `policyResults` trace array, and references
  into every upstream decision id it consumed.
- `EnforcementOutcome<T>` — `{ request, decision, result, proof }`, returned by `enforce()`, only produced after
  `GuardedExecutionService.run` has (or has not) invoked `execute()`.

## 4. Existing failure semantics

- Governance denial is never a thrown exception. Every preflight outcome — blocked, approval/evidence pending,
  external handshake required, adapter/emergency denied, expired, invalid, dry-run, duplicate — is returned as an
  `EnforcementDecision` with `allowedToExecute: false` plus a reason code/reason.
  `EnforcementPolicyEvaluator.evaluate` stops at the first failing policy in a fixed, ordered chain
  (`createDefaultEnforcementPolicyChain`); recognition-runtime's own chain (`createDefaultPolicyChain`) does the same.
- A caller-supplied `execute()` throwing is caught inside `GuardedExecutionService.run` and turned into
  `ExecutionResult.status = 'failed'` with `errorMessage` — also never rethrown to the caller.
- The only paths that can throw today are programming/infrastructure faults: `PostExecutionRecordMissingError`
  (post-execution invariant violation) in `guarded-execution-service.ts:195`, and any *uncaught* throw from a
  caller-supplied `EnforcementRecognitionIntegration.verifyAction` (no try/catch wraps that call in
  `enforcement-preflight-service.ts`) — this is a real gap the kernel's error model must account for rather than
  silently paper over.
- Domain Policy Pack Runtime integration failures are the one upstream layer that is *already* fail-closed inside
  action-enforcement (`PolicyPackEnforcementService.evaluatePolicyPackForRequest` catches, validates shape,
  and fails to `policy_denied` — see `services/policy-pack-enforcement-service.ts:226`).

## 5. Existing side effects

- `EnforcementStore` (in-memory) persists requests, decisions, results, proofs, violations, side effects.
- `SideEffectLedger` transitions exactly one planned `SideEffectDescriptor` per request through
  planned -> blocked/skipped/executed/failed.
- `EnforcementLedger` appends an append-only, hash-chained `EnforcementEvent` audit trail
  (`preflight_started`, `preflight_passed/failed`, `policy_pack_evaluated/blocked/warning_recorded`,
  `execution_started/succeeded/failed`, `duplicate_suppressed`, `enforcement_violation_recorded`,
  `enforcement_proof_created`, ...).
- `EnforcementProofService` creates a SHA-256, previous-hash-chained `EnforcementProof` for every terminal outcome
  (allowed or not) — this is the closest existing analog to an "evidence bundle", but it is not the full
  AOC Evidence Bundle referenced in the mission brief.
- `IdempotencyService` records success/failure against the caller-supplied idempotency key.
- Recognition Runtime's own `EvidenceLedger` records a parallel `recognition_decision` audit event.

All of the above is in-memory per-runtime-instance state; nothing here touches SQLite, Supabase, Next.js, or any
UI/browser API.

## 6. Existing public consumers

- `src/features/action-enforcement/sdk/*`: `AocGuard`, `ToolCallGuard`, `ApiHandlerGuard`, `WorkflowStepGuard`,
  `WebhookGuard` — all thin wrappers that build an `EnforcementRequest` and delegate to
  `ActionEnforcementRuntime.preflight`/`enforce`.
- ~100 tests under `src/features/action-enforcement/tests/**` exercising the runtime, guards, and every upstream
  integration (recognition, authority, approval, evidence, external handshake, domain policy pack, adapter registry).
- `src/features/aoc-enterprise-demo/scenarios/*` and `src/features/aoc-enterprise-pilot-template/pilots/*` build
  end-to-end scenarios on top of `AocGuard`.
- Critically, **none of `src/features/action-enforcement` is re-exported from the package's public entrypoint**
  (`src/index.ts` only re-exports the separate, partially-implemented `src/runtime/*` scaffold — verified by
  reading `src/index.ts` directly). The mature engine is currently an internal-only feature module with no
  npm-visible public surface at all. This is the gap the kernel package closes.

## 7. Extraction strategy

Build `src/kernel/` as a new, additive package boundary that **wraps** the existing, untouched
`src/features/action-enforcement` engine (recognition/authority/approval/evidence/handshake/domain-policy-pack
all reached transitively through it) rather than copying or rewriting any of its logic. Direction chosen:

```
AocKernel.evaluate() / AocKernel.enforce()
        v
Existing ActionEnforcementRuntime / AocGuard (unmodified)
```

This is the direction the mission brief explicitly allows ("minimizes behavioral change and duplication") and is
strictly safer than routing `AocGuard` through a new kernel, since dozens of existing tests and the SDK guards
already depend on `AocGuard`'s exact current shape. `src/features/action-enforcement` is not modified by this PR.

## 8. Compatibility strategy

- Zero changes to `src/features/action-enforcement/**`, `recognition-runtime`, `authority-graph`,
  `approval-runtime`, `evidence-source-runtime`, `external-agent-handshake`, `domain-policy-pack-runtime`.
  All existing tests continue to run unmodified against unmodified code.
- The kernel's canonical `evaluate()` maps onto `AocGuard.preflight()` / `ActionEnforcementRuntime.preflight()`,
  since that is the operation that only ever evaluates and never invokes a caller's executor — this matches the
  spec's requested `evaluate()` vs `enforce()` split precisely, and required no renaming of anything in the
  existing engine.
- The kernel's `enforce()` maps onto `AocGuard.enforce()` / `ActionEnforcementRuntime.enforce()` (preflight, then
  conditionally invoke the caller's adapter) and is documented as a compatibility/higher-level alias, not the
  canonical operation.
- The kernel package is optional and additive: nothing currently importing `action-enforcement` needs to change.

## 9. Risks

- **Reason-code normalization drift**: mapping ~30 existing, already-meaningful reason codes onto the kernel's
  smaller stable taxonomy could lose precision. Mitigated by keeping the original `reasonCode`/`reason` in the
  kernel trace/`metadata`, never discarding them.
- **Silent recognition-integration exceptions**: as noted in §4, an unhandled throw from a recognition integration
  currently propagates as a raw exception out of `AocGuard.preflight/enforce`. The kernel wraps this at its own
  boundary (`indeterminate` status + `KernelDependencyError` surfaced in `trace`) without changing what
  `AocGuard` itself does — this is new kernel-boundary behavior, not a change to existing engine behavior.
- **`exactOptionalPropertyTypes`/`Node16` module strictness**: the whole repo compiles under very strict
  TypeScript settings (no explicit `any`, `.js` extensions on relative ESM imports, no wildcard exports outside
  `src/runtime`). The kernel package must follow the same conventions or `npm run typecheck`/`lint` will fail.
- **Scope creep**: the mission explicitly forbids implementing Jurisdiction/Constitutional Runtime, a new policy
  language, or new domain policy packs. The kernel intentionally leaves these as documented gaps rather than
  stubbing them out.

## 10. Files expected to change

- New: `docs/kernel/AOC_KERNEL_IMPLEMENTATION_NOTE.md` (this file)
- New: `docs/kernel/AOC_KERNEL_CURRENT_EXECUTION_MODEL.md`
- New: `docs/kernel/AOC_KERNEL_INVARIANTS_V1.md`
- New: `docs/kernel/AOC_KERNEL_INTEGRATION_GUIDE.md`
- New: `src/kernel/**` (contracts, orchestration, errors, events/trace, reason codes, `AocKernel`, `index.ts`)
- New: `src/kernel/__tests__/characterization/**`
- Modified: `package.json` (add a `./kernel` export subpath), `tsconfig.src.json` if a project reference is needed
- Not modified: anything under `src/features/**`, `src/runtime/**`, `packages/**`, `apps/**`
