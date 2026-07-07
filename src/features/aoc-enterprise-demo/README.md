# AOC Enterprise Demo Scenario Pack

Recognition Runtime, Authority Graph, Approval Runtime, External Agent
Handshake and Action Enforcement make AOC **decidable**. The Control Plane
makes it **auditable and operable**. This module makes it **demonstrable**:
a curated set of deterministic, runtime-backed scenarios that show an
enterprise buyer, an internal tester, an investor or a protocol reviewer
exactly how AOC behaves -- not a description of how it behaves.

It answers one question: **how do we prove, end to end, that AOC recognizes,
governs, approves, trusts and enforces autonomous action -- using the real
runtime, not a story about it?**

## Why demo scenarios, and why after the Control Plane

Once the Control Plane exists, a human can inspect any single decision AOC
made. What it cannot do on its own is walk someone through a *narrative*: "an
agent tried to act, here is why it was allowed," "an agent tried to act, here
is why it was blocked, and here is how a human unlocks it." Enterprise sales
conversations, internal validation and investor demos all need that
narrative layer -- curated scenarios with a beginning, a real governance
outcome, and an explanation -- without which "AOC is decidable and auditable"
stays an engineering claim instead of something anyone can watch happen.

## Real runtime-backed scenarios vs. fake demos

This is the one rule every file in this module follows:

**No scenario ever fabricates a decision, proof, event, approval, handshake
or enforcement outcome.** Every `DemoScenarioOutcome` this module produces is
built exclusively from a real `EnforcementOutcome` returned by
`AocGuard.enforce()` -- the same SDK entry point Action Enforcement's own
tests use. A scenario's `execute*Scenario` function:

1. Builds a fresh `EnterpriseDemoWorld` (real Recognition, Authority,
   Approval, Handshake and Enforcement runtime instances, wired together
   exactly like `action-enforcement/fixtures/datasys-enforcement.fixture.ts`).
2. Drives one or more real calls through that world -- `aocGuard.enforce()`,
   `approvalRuntime.approve()`, `handshakeRuntime.decideHandshake()`,
   `enforcementRuntime.registerAdapter()`, `enforcementRuntime.setEmergencyDeny()`
   -- using a real callback executor that records whether it ran.
3. Reports exactly what those calls returned: `executorRan` is `true` only
   if `ExecutionResult.executed` was `true`; `outcome.status` is derived from
   `EnforcementDecision.type`, never asserted independently.

If a scenario's story says "blocked," that is because the real enforcement
decision was not `execute_allowed` and the executor callback was never
invoked. If it says "executed," the callback ran exactly once and
`ExecutionResult.executed` was `true`. Nothing here is inferred, staged, or
hand-written into a fixture as a finished state.

## Module layout

```
domain/      Pure types: DemoScenario, DemoStepDefinition/DemoStepRun,
             DemoScenarioOutcome, DemoAssertionDefinition/Result,
             DemoProofChain, DemoControlPlaneSnapshot, DemoScript,
             DemoExportArtifact, DemoPersona, DemoNarrative(Message).
fixtures/    The real, composed enterprise demo world (built on top of
             action-enforcement's datasys-enforcement fixture), the
             persona roster, and a descriptive action catalog.
scenarios/   One file per scenario: a pure DemoScenario definition plus a
             ScenarioExecutor that drives real runtime calls and a
             ScenarioAssertionEvaluator that checks the real result.
services/    DemoScenarioRegistry, DemoFixtureOrchestrator,
             DemoScenarioRunner, DemoStepRunner, DemoAssertionService,
             DemoScriptService, DemoNarrativeService,
             DemoControlPlaneSnapshotService, DemoProofChainService,
             DemoExportService, DemoResetService, DemoReportService.
components/  Feature-local React components; AocEnterpriseDemoPage is the
             mount point.
hooks/       useAocEnterpriseDemo / useDemoScenarioSelection /
             useDemoScenarioRunner / useDemoExport.
tests/       Service tests, one test file per scenario, and SSR-rendered
             component tests, mirroring aoc-control-plane's conventions.
```

## How scenarios are registered

Each `scenarios/*.scenario.ts` file exports three things:

- `<NAME>_SCENARIO: DemoScenario` -- pure, serializable data: title,
  narrative fields (`summary`, `buyerPain`, `aocValue`, `enterpriseMessage`),
  `steps: DemoStepDefinition[]`, and `expectedAssertions: DemoAssertionDefinition[]`.
- `execute<Name>Scenario: ScenarioExecutor` -- the function that actually
  drives the real runtime calls for this scenario and returns a
  `ScenarioExecutionResult` (the real outcome, the produced step timeline,
  and the raw `EnforcementOutcome`s).
- `evaluate<Name>Assertions: ScenarioAssertionEvaluator` -- checks the real
  result against each declared assertion.

`scenarios/index.ts` assembles all ten into `ALL_DEMO_SCENARIOS`,
`SCENARIO_EXECUTORS` and `SCENARIO_ASSERTION_EVALUATORS`.
`DemoScenarioRegistry` (`services/demo-scenario-registry.ts`) wraps
`ALL_DEMO_SCENARIOS`: it validates every scenario has a title, summary,
enterprise message, buyer pain, steps and assertions, rejects duplicate ids,
and exposes `getScenario`, `listScenarios`, `listByCategory`, `listByTag`.
An unknown scenario id returns `undefined` -- it never throws.

## How scenarios are run

`DemoScenarioRunner.runScenario(scenarioId)`:

1. Looks up the scenario definition in the registry.
2. Builds a **fresh** `EnterpriseDemoWorld` via `DemoFixtureOrchestrator`
   (see Determinism below -- this is what keeps runs isolated).
3. Calls that scenario's real `ScenarioExecutor` against the fresh world.
4. `DemoStepRunner` reconciles the step timeline the executor produced
   against the scenario's declared steps (same ids, same order, same
   kinds) -- it never re-runs or reinterprets a runtime call itself.
5. `DemoAssertionService` evaluates the scenario's own assertion evaluator
   against the real result.
6. `DemoProofChainService` extracts the real proof chain from the final
   `EnforcementOutcome`.
7. `DemoControlPlaneSnapshotService` builds a scenario-scoped Control Plane
   snapshot from the same world.
8. `DemoExportService` renders the five export artifacts.
9. Returns a `DemoScenarioRun` with `status: 'passed' | 'failed'` -- `passed`
   only if every assertion passed.

Because step 2 builds a brand-new world every call, running scenario A then
scenario B never lets A's idempotency keys, revocations or emergency-deny
flag leak into B. `DemoResetService` documents and exposes this same
"build fresh, don't mutate" pattern for any other caller.

## How deterministic fixtures work

`fixtures/enterprise-demo-world.fixture.ts` calls
`action-enforcement/fixtures/datasys-enforcement.fixture.ts`'s
`buildDatasysEnforcementFixture()` -- the same shared, real, five-runtime
fixture Action Enforcement's own tests and the Control Plane's demo fixture
already depend on. It adds one more recognized actor (the Finance Approver
persona) and exposes the two project scopes (`project:HMP-14665`,
`project:GCH-15992`). Nothing in this file invents governance state; it only
composes runtime constructors that already exist.

## How Control Plane snapshots are created

`DemoControlPlaneSnapshotService` does not rebuild the full
`AocControlPlaneReadModel` (that would duplicate `aoc-control-plane`'s own
read-model service). Instead it:

- Calls `aoc-control-plane`'s own exported `buildTimeline()` pure function,
  fed with the real event trails (`getAuditTrail`, `getAuthorityEvents`,
  `getApprovalTrail`, `getHandshakeTrail`, `store.getEvents`) this scenario's
  world actually recorded.
- Highlights rows using ids that are genuinely present on the scenario's
  final `EnforcementOutcome` (recognition decision id, authority proof id,
  approval request id, visa id, enforcement proof id) -- falling back to a
  real store lookup (e.g. `approvalRuntime.store.getRequestsByTrustDomain`)
  only when a decision object predates a request the scenario created for it
  after the fact.
- Lists which panels (`recognition`, `authority`, `approvals`,
  `external_agents`, `enforcement`, `proofs`) are relevant to this scenario.

## How proof chains are extracted

`DemoProofChainService` walks the final `EnforcementProof`'s own reference
fields (`recognitionDecisionId`, `authorityProofId`, `approvalProofId`,
`handshakeProofId`) and resolves each one against its owning runtime's real
store or audit trail (`authorityRuntime.proofService.getAllProofs()`,
`approvalRuntime.store.getProofsByRequestId()`,
`handshakeRuntime.store.getHandshakeProof()`,
`recognitionRuntime.getAuditTrail()`). A source only appears in
`DemoProofChain.sources` if the decision actually depended on it; it only
appears in `missingSources` if the decision referenced it but the runtime
could not resolve it. `complete` is `true` only when `missingSources` is
empty.

## How assertions verify scenario truth

Each scenario's `evaluate<Name>Assertions` function inspects the real
`ScenarioExecutionResult` -- `outcome.status`, `outcome.executorRan`,
`enforcementOutcomes[i].result.executed`, `enforcementOutcomes[i].decision.type`
-- and produces one `DemoAssertionResult` per declared
`DemoAssertionDefinition`, in the same order. `executorSafetyAssertion`
(`scenarios/assertion-helpers.ts`) is the shared, safety-critical check every
scenario uses: it compares an *expected* executor-run count against the
count of `EnforcementOutcome`s whose `result.executed` was actually `true`.
`DemoAssertionService.allPassed()` is what `DemoScenarioRunner` uses to
decide `run.status`.

## How demo scripts are generated

`DemoScriptService.buildScript(scenario, outcome, audience)` produces a
`DemoScript` for one of four audiences (`executive`, `technical`,
`operator`, `investor`) using per-audience framing from
`fixtures/enterprise-demo-scripts.fixture.ts`. The talk track is built
directly from the scenario's own declared steps (`title`,
`operatorNarration`, `description`) and the closing line states the real
`outcome.status`/`outcome.reasonCode` -- a script can never claim an outcome
the run did not actually produce.

## How exports work

`DemoExportService.buildArtifacts(scenario, outcome, assertions, proofChain, now)`
renders five artifact types purely in memory (`DemoExportArtifact.content` is
a string) -- there is no filesystem write anywhere in this module:

- `json_summary` -- scenario id, outcome, assertion pass/fail summary, proof chain.
- `markdown_script` -- buyer pain, AOC value, numbered talk track.
- `operator_walkthrough` -- outcome, executor/side-effect facts, steps, proof chain completeness.
- `technical_trace` -- every real id (`enforcementRequestId`, `enforcementDecisionId`, `recognitionDecisionId`, `authorityProofId`, `approvalProofId`, `handshakeProofId`, `proofHash`) plus per-assertion pass/fail.
- `sales_one_pager` -- summary, buyer pain, AOC value, enterprise message, demonstrated outcome.

## The 10 scenarios

| # | Scenario id | Category | Expected outcome |
|---|---|---|---|
| 1 | `internal-agent-allowed` | enforcement | `executed` |
| 2 | `approval-required-block` | approval | `approval_required` |
| 3 | `approval-unlocks-execution` | approval | `executed` |
| 4 | `evidence-required-block` | recognition | `evidence_required` |
| 5 | `external-agent-limited-visa` | external_agents | `executed` |
| 6 | `expired-visa-block` | external_agents | `blocked` |
| 7 | `adapter-denies-dangerous-action` | enforcement | `blocked` |
| 8 | `idempotency-duplicate-suppressed` | enforcement | `duplicate_suppressed` |
| 9 | `emergency-deny-shutdown` | enforcement | `emergency_denied` |
| 10 | `full-proof-chain-audit` | audit | `executed` |

### 1. Internal Agent Allowed to Draft Closure Email
**Story:** PMFreak Closure Agent is recognized inside the Datasys Agent
Republic, holds authority delegated from Victor, and drafts the closure
email for `project:HMP-14665`.
**Buyer pain:** enterprises don't trust an autonomous agent to act without
proof identity, authority and scope were actually checked.
**AOC value:** AOC only allows execution once Recognition and Authority
independently agree the action is in scope, and the real executor runs
exactly once.
**Expected runtime behavior:** `execute_allowed`; executor runs once;
`EnforcementProof` created with a real `authorityProofId`.
**Show in Control Plane:** Enforcement panel (allowed/executed row),
Proofs / Audit (enforcement -> authority chain).

### 2. Agent Blocked Because Human Approval Is Missing
**Story:** PMFreak attempts `send_client_follow_up` before Victor approves it.
**Buyer pain:** fear of an autonomous agent emailing a client with no human
ever reviewing the message.
**AOC value:** Recognition itself requires human approval for this
capability, and enforcement blocks execution until it exists.
**Expected runtime behavior:** `approval_required`; executor never runs; a
real `ApprovalRequest` is created and left pending.
**Show in Control Plane:** Approvals panel (pending request), Enforcement
panel (blocked decision).

### 3. Human Approval Unlocks a Previously Blocked Action
**Story:** The same follow-up is routed to Victor, who approves it; PMFreak
retries with the resulting `ApprovalProof`.
**Buyer pain:** a governance system that only blocks, with no path forward,
is unusable for real work.
**AOC value:** a real `ApprovalProof` id, presented on the retried request,
is what changes enforcement's decision -- not a UI toggle.
**Expected runtime behavior:** first attempt `approval_required`, executor
0 runs; second attempt `execute_allowed`, executor exactly 1 run; final
`EnforcementProof.approvalProofId` set.
**Show in Control Plane:** Approvals panel (approved decision + proof),
Enforcement panel (executed request).

### 4. Invoice Support Blocked Because Evidence Is Missing
**Story:** PMFreak attempts `prepare_invoice_support` without the
`invoice_backup` evidence its capability token requires.
**Buyer pain:** need proof an agent had the right supporting documentation
before touching invoicing.
**AOC value:** the evidence requirement is enforced before Enforcement is
even reached.
**Expected runtime behavior:** `evidence_required`; executor never runs.
**Show in Control Plane:** Enforcement panel (evidence_required reason code).

### 5. Trusted External Agent Receives Limited Visa
**Story:** Trusted Partner Research Agent completes External Agent
Handshake and receives a scope-limited visa and ingress grant to read the
project summary.
**Buyer pain:** need to collaborate with partner-run agents without
granting unbounded internal access.
**AOC value:** a completed handshake produces a real, scope-limited
`AgentVisa`/`IngressGrant` that enforcement checks on every request.
**Expected runtime behavior:** handshake `accepted`; `execute_allowed`;
executor runs once.
**Show in Control Plane:** External Agents panel (active visa + ingress
grant), Enforcement panel (executed request).

### 6. External Agent Blocked After Visa Expiration
**Story:** The same agent retries the same read after its visa expires.
**Buyer pain:** external access needs to expire automatically, not rely on
someone remembering to revoke it.
**AOC value:** Handshake Runtime marks the visa expired, and every
subsequent standing check denies it.
**Expected runtime behavior:** visa `expired`; enforcement decision not
`allowedToExecute`; executor never runs.
**Show in Control Plane:** External Agents panel (expired visa), Enforcement
panel (blocked decision).

### 7. Adapter Blocks Dangerous Action Even If Upstream Context Exists
**Story:** PMFreak attempts `approve_payment`; the Payments Workflow adapter
denies the action outright even though Recognition/Authority would allow it.
**Buyer pain:** need a last line of defense at the execution boundary, not
just trust in upstream policy checks.
**AOC value:** a registered `EnforcementAdapter` deny always wins over an
upstream allow.
**Expected runtime behavior:** `adapter_denied`; executor never runs.
**Show in Control Plane:** Enforcement panel (adapter_denied reason code).

### 8. Duplicate Side Effect Suppressed by Idempotency
**Story:** The approved follow-up executes once with an idempotency key;
the identical request and key are submitted again.
**Buyer pain:** fear of a retried webhook or looping agent sending the same
client email twice.
**AOC value:** a presented idempotency key ties a repeat submission to the
prior result; the real executor never runs twice.
**Expected runtime behavior:** first `execute_allowed` (executor runs once);
second `duplicate_suppressed` (executor 0 runs); both requests carry the
same `idempotencyKey`.
**Show in Control Plane:** Enforcement panel (two requests, one idempotency
key, one executed + one suppressed).

### 9. Emergency Deny Blocks All Execution
**Story:** Emergency deny is activated; PMFreak then attempts the same
draft-closure-email action that would otherwise be allowed.
**Buyer pain:** need one lever that stops every autonomous action
immediately during an incident.
**AOC value:** Action Enforcement checks a single emergency-deny flag before
every other policy, so it overrides an otherwise fully valid request.
**Expected runtime behavior:** `emergency_denied`; executor never runs;
`enforcementRuntime.isEmergencyDenyActive()` is `true`.
**Show in Control Plane:** Overview health banner (emergency active),
Enforcement panel (emergency_denied decision).

### 10. Operator Inspects Full Proof Chain in Control Plane
**Story:** After the approve-then-execute flow from scenario 3, an operator
opens the Control Plane and traces the chain from the enforcement proof back
through the approval proof, recognition decision and authority proof.
**Buyer pain:** won't trust an autonomous decision that cannot be traced
back to its evidence after the fact.
**AOC value:** every enforcement proof carries the ids of the upstream
proofs that produced it, so the full chain is always reconstructible.
**Expected runtime behavior:** `execute_allowed`; proof chain includes
enforcement, recognition, authority and approval sources and is `complete`.
**Show in Control Plane:** Proofs / Audit panel (full chain walk), Enforcement
panel, Approvals panel.

## Known limitations

- Component tests are SSR-only (`react-dom/server`'s `renderToStaticMarkup`),
  matching `aoc-control-plane`'s own convention -- there is no jsdom or
  simulated click/keyboard interaction in this repo.
- `DemoStepRunner` reconciles a scenario's declared steps against the steps
  its executor produced; it does not itself dispatch "step kind -> runtime
  call" generically. Each scenario's own executor is the only code with
  enough context to know which real call satisfies which declared step
  (a single `aocGuard.enforce()` call can satisfy a recognition step, an
  authority step and an enforcement step at once). A fully generic
  per-step dispatcher would either be too narrow to express real scenarios
  or would end up re-implementing governance sequencing itself -- both
  worse than the explicit, scenario-owned executor this module uses.
- `DemoControlPlaneSnapshot`/`DemoProofChain` are scoped to a single
  scenario run's final decision, not the full multi-scenario
  `AocControlPlaneReadModel` `aoc-control-plane` builds. They intentionally
  reuse `aoc-control-plane`'s own pure `buildTimeline()` function rather
  than duplicating its full read-model assembly.
- `useDemoScenarioRunner`/`useAocEnterpriseDemo` drive real, awaited
  `DemoScenarioRunner.runScenario()` calls for interactive use; none of the
  SSR component tests exercise that path (SSR renders synchronously from a
  pre-computed `run` prop, the same way `aoc-control-plane`'s tests
  pre-build a read model before rendering).

## How to add a new scenario

1. Create `scenarios/<name>.scenario.ts` exporting a `DemoScenario` constant,
   an `execute<Name>Scenario: ScenarioExecutor`, and an
   `evaluate<Name>Assertions: ScenarioAssertionEvaluator`.
2. Reuse existing `action-enforcement/fixtures/*.ts` guard-input builders
   where they already model the action you need; only hand-build a
   `GuardActionRequestInput` when no existing builder fits.
3. Use `scenarios/step-helpers.ts` (`completeStep`/`skipStep`) and
   `scenarios/assertion-helpers.ts` (`assertionResult`/`executorSafetyAssertion`)
   to keep step/assertion construction consistent.
4. Add the new `DemoScenarioId` to `domain/demo-scenario.ts`'s union type.
5. Register the scenario, its executor and its evaluator in
   `scenarios/index.ts`.
6. Add `tests/scenarios/<name>.scenario.test.ts` asserting the real,
   runtime-backed outcome, executor safety, and (where applicable) proof
   chain/Control Plane snapshot content.

## How to run tests

From the repository root:

```
npm run build && node --test dist/src/features/aoc-enterprise-demo/**/*.test.js
```

(`npm test` runs the same build-then-test-runner pattern across the whole
repository.)

## Determinism

- Every scenario's clock comes from `scenarios/scenario-runtime-types.ts`'s
  `createTickingClock(startIso)` -- a pure function of a fixed start instant
  plus a call counter. It never reads the wall clock.
- Every underlying runtime (Recognition, Authority, Approval, Handshake,
  Enforcement) is seeded through its own `createXRuntimeContext(initialIso)`
  factory with the same fixed ISO instant every fixture in this repository
  already uses (`2026-01-01T00:00:00.000Z`), and a sequential id generator
  (`prefix-000001`, `prefix-000002`, ...).
- No file in this module calls `Date.now()`, argless `new Date()`, or
  `Math.random()`.
- `DemoFixtureOrchestrator.createWorld()` builds a brand-new set of runtime
  instances on every call, so two runs of the same scenario produce
  byte-identical output, and no scenario run can pollute another.
- No governance decision is ever hardcoded: every `DemoScenarioOutcome`,
  `DemoAssertionResult` and `DemoProofChain` is derived from what the real
  runtime actually returned for that specific run.
