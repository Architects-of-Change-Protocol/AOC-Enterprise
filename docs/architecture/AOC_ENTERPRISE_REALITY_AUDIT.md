# AOC Enterprise Repository Reality Audit v1.0

**Audit type:** Architecture-to-Code Reconciliation (not a code review, not a feature review)
**Scope:** `architects-of-change-protocol/aoc-enterprise` @ `claude/aoc-enterprise-audit-9qou6f`
**Method:** Seven independent deep-read passes across the repository (runtime core, canonical objects, `src/features` halves A/B, PMFreak/passport track, `apps/agent-passport-web`, tests/dead-code/docs), cross-corroborated, evidence cited by file:line. No claim below is inferred from documentation, UI, or test presence alone — each is traced to executable logic, its actual consumers, and (where possible) an actual test run.

---

## 1. Executive Verdict

**Current maturity: Early Prototype, with one Beta/near-Production subsystem embedded inside it.**

The repository contains two very different things wearing one name. Underneath `src/features/*` is a genuinely real, deterministic, heavily-tested governance **simulation engine** — `recognition-runtime`, `authority-graph`, `approval-runtime`, `domain-policy-pack-runtime`, `evidence-source-runtime`, `external-agent-handshake`, and `action-enforcement` are cross-wired, produce real branching decisions, hash-chain their own audit trails, and pass 100% of ~1,100+ real `node:test` assertions with zero mocking library used anywhere in the repo. Separately, `apps/agent-passport-web` is a real, shipped commercial SaaS product — Stripe-billed passport issuance and an organization registry, backed by a genuine SQLite database (20 tables), real password/session auth, and 30 working API routes.

Neither of these is the thing the Blueprint describes. The Blueprint's **Enterprise Runtime** — a unified Identity → Authority → Policy → Jurisdiction → Decision → Evidence → Passport → Audit pipeline reachable from outside the process — does not exist. `src/runtime` (the package literally named `@aoc-enterprise/runtime`, exported at the workspace root) is the closest architectural match to the Blueprint's shape, and it is a 3-step stub (identity resolve → AND four booleans → emit audit) with **zero production consumers** — only an example host and a test fixture import it. The real governance logic lives one directory over, under different names, was never wired into `src/runtime`, and is never exposed through any API. No single call chain in this repository takes an externally-supplied request through all of Identity, Authority, Policy, Jurisdiction, Risk, Constitutional, Decision, Evidence, Passport, Execution, and Audit resolution.

**Confidence: High.** Findings are cross-corroborated across independently-run investigations (e.g., three separate passes independently confirmed `src/runtime` has zero external consumers; two independently confirmed the protocol-primitive packages are empty; two independently traced the PMFreak pipeline and agreed it stops at the intake validator).

**Major architectural strengths**
- A real, tested, side-effect-free governance decision cluster (7 feature modules, ~1,100 tests, 0 TODO/stub markers in non-test source, 0 mocking-library usage) that is more architecturally mature than its own documentation admits.
- A shipped, revenue-generating product (`agent-passport-web`) proving the passport primitive works end-to-end with real persistence and real payment integration.
- `authority-graph`'s delegation/ancestor-revocation propagation and `domain-policy-pack-runtime`'s condition/precedence engine are genuinely sophisticated, not decorative.
- Disciplined determinism culture: no `Date.now()`/`Math.random()` in decision paths, explicit hash-chained proofs per module.

**Major architectural risks**
- The Blueprint-shaped orchestration layer (`src/runtime`, the 8 named Runtimes, the 13-stage Decision Lifecycle, the 14 canonical objects) is almost entirely fictional relative to code — it exists as documentation and as scattered, differently-named, differently-shaped analogs that were never unified.
- The five "Protocol primitive" packages the repo's own foundation doc calls foundational (`identity`, `consent-engine`, `capability-tokens`, `scoped-access`, `audit-sdk`) are **100% empty** (`.gitkeep` only).
- No externally-reachable governance API exists anywhere. The only production HTTP surface in the repo is commerce/passport-CRUD, not decisioning.
- No schema validation library (zod/ajv/io-ts) is used anywhere — all "validation" is hand-rolled, and nothing prevents type/validator drift.
- No database beyond one SQLite file backs any governance state; everything else is in-process `Map`s that vanish on restart. Multi-tenant isolation, RLS, and sovereign-deployment claims in `foundation.md` have no implementation.
- The team's own `CURRENT_STATE_*.md` docs self-report failing builds/tests and — read together — narrate a decision to deprioritize `src/runtime` in favor of product work, which is an internal admission that the Blueprint's core deliverable is not presently the active target.

---

## 2. Blueprint-to-Code Traceability Matrix

| Blueprint Component | Exists | Status | Evidence | Notes | Recommended Action |
|---|---|---|---|---|---|
| **Identity Runtime** | Partial (scattered) | **Stub/Missing** | `packages/identity/src` = `.gitkeep` only. `src/adapters/protocol-adapters.ts:29-31` defines `IdentityResolverAdapter.resolveIdentity()` as an interface; only implementation is `examples/enterprise-runtime-host/mock-ports.ts`. | Identity verification is fragmented into `recognition-runtime` (passport/capability-token checks) and `agent-governance` (passport claims) — no unified module. | Build a real `IdentityResolverAdapter` impl backed by the passport primitives already proven in `agent-governance`. |
| **Authority Runtime** | Yes, under a different name | **Beta Real, orphaned** | `src/features/authority-graph/services/authority-resolver.ts:15-84` — real ancestry traversal, 50-hop cycle guard, 9-policy verification chain. | Not consumed by `src/runtime`; `src/runtime/authorization/evaluators/authorization-evaluator.ts:54-73` uses a separate, thinner capability/delegation check instead. | Wire `authority-graph` into `src/runtime`, or promote it as the canonical Authority Runtime. |
| **Policy Runtime** | Split | **Stub (named package) / Production Real (actual logic)** | `packages/policy-runtime/src/contracts.ts` — 44 lines, header admits "placeholders." Real engine: `src/features/domain-policy-pack-runtime/services/*` — condition evaluator (~14 operators), 9-level precedence table, versioned pack lifecycle state machine. | The package literally named "policy-runtime" is empty; the real policy engine lives elsewhere under a different name. | Rename/relocate, or deprecate `packages/policy-runtime` in favor of `domain-policy-pack-runtime`. |
| **Jurisdiction Runtime** | Yes, narrow | **Beta Real, orphaned** | `src/features/domain-policy-pack-runtime/jurisdiction/packs/costa-rica/*` — one full jurisdiction pack (Costa Rica) with real resolution logic and determinism tests. | Only one jurisdiction implemented; no generic cross-jurisdiction resolver; not consumed by `src/runtime`. | Generalize the Costa Rica pack's resolver interface before adding more jurisdictions. |
| **Decision Runtime** | Fragmented | **Partial** | Six independent decision types with no shared parent: `RecognitionDecision`, `AuthorityDecision`, `ApprovalDecision`, `HandshakeDecision`, `EnforcementDecision`, `PolicyPackCompositionDecision`. Closest single decision engine: `packages/agent-governance/src/runtime-guard/runtime-guard.ts:41-207` (real 11-step decision function). | No "Decision Synthesis" stage combines these; each feature decides independently. | Define one canonical `Decision` envelope and have each module emit it, rather than inventing a 6th shape. |
| **Evidence Runtime** | Yes, under a different name | **Beta Real, orphaned** | `src/features/evidence-source-runtime/services/evidence-proof-service.ts:36-121` — real SHA-256 hash-chained `EvidenceProof`, genuine completeness/rejection/expiry logic. | Not wired into `aoc-control-plane` UI (self-admitted gap in its own README); in-memory only. | Wire into Control Plane; add durable storage. |
| **Passport Runtime** | Yes | **Production Real** — the strongest match in the repo | `packages/agent-governance` (issuance, verification, status transitions, hash chains, runtime-guard); actively used in production by `apps/agent-passport-web` with real SQLite persistence and Stripe-tied commercial issuance. | Best-tested, best-wired, and the only Blueprint runtime with a real external consumer (a shipped app). | Use as the template for maturing the other seven runtimes. |
| **Audit Runtime** | Split | **Stub (`src/runtime/audit`) / Production Real (elsewhere, unfederated)** | `src/runtime/audit/emitters/runtime-audit-emitter.ts:3-9` is a bare pass-through with no sink and no production implementer. Real audit trails exist independently: `packages/control-plane/store.ts` (file-backed JSON audit log), `recognition-runtime`'s hash-chained `AuditEvent`/`EvidenceLedger`. | At least 3 independent, non-unified "audit trail" implementations exist. | Pick one (recognition-runtime's hash-chained ledger is strongest) and federate the others onto it. |
| **Decision Lifecycle** (13 stages) | No | **Missing as a pipeline; fragments exist** | `src/runtime/orchestration/pipelines/authorization-orchestrator.ts:22-41` implements exactly 3 of the 13 stages (identity resolve, a 4-way ANDed policy check, audit emit) and has zero production consumers. The PMFreak "Governance Request Intake" gets closer to an end-to-end shape but is a self-asserted-field rule table, not real resolution (§7). | No code path executes Jurisdiction, Risk, Constitutional, Narrative, Passport-Update, or Execution-Authorization stages as part of one pipeline. | See §16 recommended PR — compose the real, already-tested modules into one real pipeline rather than building new stages. |
| **Canonical Governance Object Model** (14 objects) | Mostly no, under Blueprint names | See §6 full table | `IdentityContext`, `AuthorityContext`, `PolicyFinding`, `RiskFinding`, `DecisionNarrative` (as canonical), `DecisionArtifact` (as canonical name), `AuditRecord` (as canonical name) = **zero** exact-name hits repo-wide. Best real analogs exist under different names in different packages (§6). | `PolicyContext` and its result type are independently reinvented 5 times by design (documented anti-coupling choice, not accidental drift). | Do not invent a 6th shape — pick from existing real analogs (§6 recommendation). |
| **Governance Operators** (10 operator types) | No, as named | **Terminology absent; functionally present as services/evaluators** | Zero hits for "Operator" as an architectural term. Functional equivalents: `AuthorityChainVerifier`, `PolicyRuleEvaluator`, `RecognitionVerifier`, `EvidenceProofService`, `ApprovalRuntime`, etc. — each is real, each lives in a different, unfederated module. | The Blueprint's "Operator" abstraction was never adopted as a shared interface/base class. | Low priority — naming exercise only, not a functional gap. |

---

## 3. Current Architecture (as it actually exists, not as intended)

```
                         apps/agent-passport-web  (Next.js 14 — the ONLY real app)
                         ┌──────────────────────────────────────────────┐
                         │ 30 real API routes (account/checkout/        │
   External users ──────▶│ agent-passports/organization-registry/       │
                         │ stripe webhook)                               │
                         │  auth: password+session hash, admin sessions  │
                         │  db:   SQLite (better-sqlite3), 20 tables    │
                         │  billing: live Stripe SDK + webhooks          │
                         └───────────────┬────────────────────────────┘
                                         │ imports
                                         ▼
                         packages/agent-governance  (Passport Runtime — real)
                         issuance / verification / hash chains / runtime-guard
                                         │
                         (NOT reachable from here — separate, disconnected)
                                         │
   ┌─────────────────────────────────────┴─────────────────────────────────┐
   │           src/features/*  — the real governance simulation engine      │
   │                                                                        │
   │  recognition-runtime ──▶ authority-graph ──▶ approval-runtime          │
   │         │                                          │                   │
   │         ▼                                          ▼                   │
   │  external-agent-handshake            domain-policy-pack-runtime        │
   │         │                                (incl. Costa Rica pack)       │
   │         └───────────────┬──────────────────────────┘                  │
   │                         ▼                                              │
   │                 action-enforcement (AocGuard.enforce — the real        │
   │                 single choke point; preflight chain + hash-chained     │
   │                 proof)                                                 │
   │                         │                                              │
   │                         ▼                                              │
   │              evidence-source-runtime ──▶ verifiable-export-package     │
   │                         │                        (DecisionPacket,      │
   │                         ▼                         AuditBundle)         │
   │                aoc-control-plane (read-model / command forwarder,      │
   │                no own persistence, no own decisions)                  │
   │                                                                        │
   │  All state = in-memory Map stores. Nothing survives process restart.  │
   │  Zero consumers from apps/*. Only reachable via demo scenarios in     │
   │  aoc-enterprise-demo and test files.                                  │
   └────────────────────────────────────────────────────────────────────┘

   src/runtime  (@aoc-enterprise/runtime — the package literally shaped like
   the Blueprint's "Enterprise Runtime")
   ┌────────────────────────────────────────────────────────────────────┐
   │ authorization-orchestrator: identity.resolveIdentity → 4-way AND    │
   │ policy check → audit emit.  vault/ = string-concat "fingerprints",  │
   │ no real crypto.  federation/ = local validation, no transport.      │
   │ ZERO test files. ZERO production consumers — only                   │
   │ examples/enterprise-runtime-host and a test fixture import it.      │
   └────────────────────────────────────────────────────────────────────┘

   src/features/aoc-integrations  (PMFreak Remote Governance Endpoint +
   Governance Request Intake)
   ┌────────────────────────────────────────────────────────────────────┐
   │ Pure function, NOT mounted to any HTTP route (explicit              │
   │ `implemented: false` placeholder). Default mode evaluates a flat    │
   │ if/else table over fields the caller itself asserts — no real       │
   │ identity/authority/policy/jurisdiction/risk resolution happens.     │
   │ Zero consumers anywhere in the repo.                                │
   └────────────────────────────────────────────────────────────────────┘

   apps/agent-gateway, apps/audit-console, apps/dashboard, apps/policy-engine
   → each contains exactly one file: .gitkeep. No code.

   infrastructure/{docker,kubernetes,terraform} → each contains exactly
   one file: .gitkeep. No deployable IaC exists.

   packages/{identity,consent-engine,capability-tokens,scoped-access,audit-sdk}
   → each contains exactly package.json + tsconfig.json + src/.gitkeep.
   No source.
```

---

## 4. Repository Inventory

| Module | Purpose | Dependencies | Consumers | Status | Complexity | Maintainability | Dead-code risk |
|---|---|---|---|---|---|---|---|
| `src/runtime` (`@aoc-enterprise/runtime`) | Blueprint-shaped orchestration entrypoint | protocol-adapters, `@aoc/protocol` (external repo) | `examples/*`, test fixtures only | Scaffolding/Stub | Medium | Medium | **High** — zero production consumers |
| `src/features/recognition-runtime` | Passport/capability-token verification, 10-policy chain | authority-graph, approval-runtime, external-agent-handshake (structural) | action-enforcement, approval-runtime, verifiable-export-package, aoc-control-plane | Production Real | Medium-High | High (well-tested, deterministic) | Low |
| `src/features/authority-graph` | Delegation/ancestry graph resolution + verification | none (leaf) | recognition-runtime, approval-runtime, aoc-control-plane | Production Real | High | High | Low |
| `src/features/approval-runtime` | Human-approval quorum/SoD workflow | authority-graph (structural) | aoc-control-plane, action-enforcement, recognition-runtime | Production Real | Medium-High | High | Low |
| `src/features/domain-policy-pack-runtime` | Policy pack lifecycle + condition/precedence evaluation | none (leaf), consumed by action-enforcement | action-enforcement, aoc-control-plane | Production Real | High | High | Low |
| `src/features/evidence-source-runtime` | Evidence registration + hash-chained proofs | none (leaf) | verifiable-export-package, aoc-enterprise-pilot-template | Beta Real | Medium | High | Medium (no Control Plane UI wiring) |
| `src/features/external-agent-handshake` | Agent border-control / visa issuance | none (leaf) | action-enforcement, aoc-control-plane, aoc-enterprise-demo | Production Real (deterministic MVP scope) | Medium | High | Low |
| `src/features/action-enforcement` | Single execution choke point (preflight + guarded run) | recognition, authority, approval, evidence, policy-pack (structural) | evidence-source-runtime, aoc-enterprise-pilot-template, aoc-control-plane SDK | Production Real | High | High | Low |
| `src/features/aoc-control-plane` | Read-model/command-forwarder UI layer over 5 runtimes | recognition/authority/approval/handshake/enforcement (direct imports) | aoc-enterprise-pilot-template, policy-pack-foundation | Beta Real / Partial | Medium | Medium (no DOM tests) | Medium |
| `src/features/aoc-integrations` | PMFreak intake/endpoint simulation | passport-runtime (optional), aoc-enterprise-demo resolver | **none** | Scaffolding/Stub | Medium | Medium | **High — confirmed dead** |
| `src/features/policy-pack-foundation` | Manifest/composition/claim-safety standard | none (leaf) | domain-policy-pack-runtime (jurisdiction packs), aoc-enterprise-demo | Production Real (infra-only by design) | Medium | High | Low |
| `src/features/verifiable-export-package` | Hash-chained decision packet/export builder | evidence, authority, policy-pack (adapters) | aoc-enterprise-pilot-template, aoc-enterprise-demo | Beta Real | Medium | High | Low |
| `src/features/aoc-enterprise-demo` | Scenario library driving real cross-runtime calls | recognition/authority/approval/handshake/enforcement | aoc-enterprise-pilot-template, verifiable-export-package | Beta Real (logic) / Orphaned (React UI) | High (257 files) | Medium | Medium (UI layer unmounted) |
| `src/features/aoc-enterprise-pilot-template` | Packages demo + evidence + export into "pilot kits" | aoc-enterprise-demo, evidence, handshake, export-package | **none** | Beta Real, orphaned | Medium | Medium | High (top of stack, no caller) |
| `src/features/recognition-runtime`'s siblings above | — | — | — | — | — | — | — |
| `packages/agent-governance` | Passport issuance/verification/runtime-guard | none (leaf) | apps/agent-passport-web, pmfreak-agent-passport-foundation, aoc-enterprise-demo | Production Real | High | High | Low |
| `packages/pmfreak-agent-passport-foundation` | Wraps agent-governance guard for PMFreak passports | agent-governance | aoc-enterprise-demo scenario runner only | Beta Real | Medium | Medium | Medium (test-only signer, single consumer) |
| `packages/control-plane` | File-backed audit-trail service (unrelated to `aoc-control-plane` feature) | none | `aoc-enterprise-demo/services/*` | Beta Real, minor | Low | Medium | Medium |
| `packages/canonical-runtime-contracts` | Reason codes, envelopes, feature flags, billing entitlements | none (zero deps by design) | **none** | Scaffolding (well-built, unconsumed) | Medium | High | **High — confirmed dead**, and its own README overstates CI enforcement that isn't wired |
| `packages/governance-treaties`, `packages/runtime-negotiation` | Treaty/negotiation state machines | none | **none** | Scaffolding, abandoned | Low | Medium | **High** — unresolvable package names (no `name` field), tests suffixed `.skip.ts` and never run |
| `packages/integration-runtime` | IdP/adapter registration contracts | none | **none** | Missing (32 lines, pure interfaces) | Trivial | N/A | High |
| `packages/{identity,consent-engine,capability-tokens,scoped-access,audit-sdk}` | Blueprint "Protocol primitives" | none | none (empty) | **Missing** | N/A | N/A | N/A (nothing to maintain) |
| `packages/{org-boundary,tenant-governance,control-plane-sdk,enterprise-audit,policy-runtime}` | Enterprise orchestration contracts | none | none/near-none | Scaffolding (interfaces only) | Trivial | N/A | High |
| `apps/agent-passport-web` | Real commercial SaaS (passport issuance + billing) | agent-governance, better-sqlite3, stripe | External users | **Production Real** | High | High | Low |
| `apps/{agent-gateway,audit-console,dashboard,policy-engine}` | Reserved names, never built | none | none | **Missing** | N/A | N/A | N/A |
| `infrastructure/*` | Deployment IaC | none | none | **Missing** (`.gitkeep` only) | N/A | N/A | N/A |
| `examples/enterprise-runtime-host` | Reference host for `src/runtime` | src/runtime | none (example only) | Honest demo (self-labeled "not production durable") | Low | High | Low |

---

## 5. Runtime Gap Analysis

| Runtime | Blueprint Expects | Repo Implements | Gap | Est. Effort | Risk |
|---|---|---|---|---|---|
| Identity | Unified principal resolution across IdPs, claims normalization, trust context | Empty `packages/identity`; a bare adapter interface with no production impl; identity checks smeared across recognition-runtime and passport claims | No canonical `IdentityContext`, no real resolver | 2–3 weeks (build resolver over existing passport claims) | Medium — everything downstream currently trusts caller-asserted identity |
| Authority | Resolve who may approve/decide, with delegation | `authority-graph` — already real and sophisticated | Not wired to `src/runtime`; no canonical `AuthorityContext` | 1 week (wiring, not new logic) | Low — logic exists, just needs composition |
| Policy | Central policy decisioning w/ pluggable engines | `domain-policy-pack-runtime` — real, but named-package `policy-runtime` is empty | Naming/location mismatch; no external policy-engine adapters (OPA/Cedar) exist at all | 1 week rename/relocate; 4+ weeks for external adapters | Low (rename) / Medium (adapters) |
| Jurisdiction | Cross-jurisdiction resolution | One real pack (Costa Rica) with generic scaffolding | Need N more packs + a generalized resolver contract | 2 weeks per additional jurisdiction | Medium — legal correctness risk if packs are incomplete |
| Decision | Unified Decision Synthesis stage | 6 independent, non-composing decision types | No `Decision` envelope unifies outputs; nothing "synthesizes" | 3–4 weeks | High — this is the structural gap blocking a real pipeline |
| Evidence | Evidence generation w/ integrity | `evidence-source-runtime` — real, hash-chained | Not durable (in-memory), not wired to Control Plane UI | 1–2 weeks | Low |
| Passport | Passport issuance/verification/lifecycle | `agent-governance` — real, production-proven in a shipped app | Test-only signer used by the PMFreak wrapper; no cryptographic (non-hash) signing anywhere | 2 weeks (real signer/KMS integration) | Medium — currently non-repudiable only within this codebase's own trust boundary |
| Audit | Immutable, correlated, multi-sink audit trail | 3+ independent, non-federated implementations (`src/runtime/audit` stub, `packages/control-plane`'s JSON file, `recognition-runtime`'s hash-chained ledger) | No single `AuditRecord`, no multi-sink publishing, no SIEM/export integration | 3 weeks to federate onto the strongest existing ledger | Medium — audit fragmentation undermines the "auditability as protocol concern" principle the docs claim |

---

## 6. Canonical Object Audit

*(Full per-object table and schema-drift findings — reproduced from the dedicated canonical-object investigation, condensed here; see §2 for the abbreviated blueprint-matrix version.)*

Zero-hit-under-exact-name objects: `IdentityContext`, `AuthorityContext`, `PolicyFinding`, `RiskFinding`, `DecisionNarrative` (as a canonical type), `DecisionArtifact` (as a canonical type name), `AuditRecord` (as a canonical type name).

Best real analogs to promote, in order of maturity:
1. **`AgentPassportEvent`** (`packages/agent-governance/src/events/passport-events.ts:15`) → canonical `PassportEvent`. Clean, singly-defined, no divergence — the cleanest match in the whole audit.
2. **`DecisionPacket`** (`src/features/verifiable-export-package/domain/decision-packet.ts:14`) → canonical `DecisionArtifact`. Persisted, hash-verified, retrievable.
3. **`AuditEvent`** (`src/features/recognition-runtime/domain/audit-event.ts:13`, hash-chained) + **`AuditBundle`** (`verifiable-export-package/domain/audit-bundle.ts:19`) → canonical `AuditRecord`.
4. **`AuthorityDecision`/`AuthorityChain`** → canonical `AuthorityContext` (result-shaped, not input-context-shaped — needs adaptation).

Confirmed schema drift:
- `RuntimeDecisionEnvelope` is **defined twice with incompatible shapes** — once in `packages/canonical-runtime-contracts/src/envelopes/decision.ts:4-8` (orphaned, zero consumers), once in `src/runtime/context.ts:20-25` (the one actually exported and used). They disagree on mutability and on an extra `audit` field.
- `PolicyContext` and its paired result type are **independently reinvented 5 times** (`recognition-runtime`, `approval-runtime`, `external-agent-handshake`, `action-enforcement`, plus `authority-graph`'s own shape) — a *documented, intentional* anti-coupling decision, not accidental drift, but it means no canonical realization exists.
- "Evidence Bundle" is a **naming collision across two unrelated domains**: `RegistryEvidenceBundleExport` (a UI export report in `agent-passport-web`) vs. `AuditBundle` (a hash-verified decision aggregation in `verifiable-export-package`).
- `packages/canonical-runtime-contracts` — a well-organized, 35-file, zero-dependency contracts package — is **entirely unconsumed**. Its own README claims 3 CI scripts enforce contract drift as part of `lint`; the actual `lint` script (`package.json:12`) only runs 3 *different* scripts. The claimed enforcement does not exist.
- **No schema validation library** (zod/ajv/io-ts) appears anywhere in the repository. All validation is hand-rolled imperative checks against bare TypeScript interfaces, with no runtime guarantee that a validator and its type stay in sync.

**Recommendation:** Do not invent a 6th canonical shape. Adopt the four real analogs above as the literal canonical objects, formally deprecate `canonical-runtime-contracts`' unused `RuntimeDecisionEnvelope`/`PolicyDecisionType` (either wire them up or delete them), and make an explicit, documented decision on whether the 5-way `PolicyContext` duplication is a permanent architectural choice (my read: it plausibly should remain siloed per-feature, but this needs to be a written decision, not silent accretion).

---

## 7. Pipeline Reality

**No complete Governance Pipeline exists.** Two disjoint, partial pipelines were found, plus one genuinely-composed-but-unexposed vertical slice:

**Pipeline A — `src/runtime`'s `authorization-orchestrator.ts` (Blueprint-shaped, unused).** Executes exactly 3 of 13 Blueprint stages: identity resolve (stub adapter) → 4-way ANDed authorization check → audit emit (stub, no sink). Zero production consumers.

**Pipeline B — PMFreak "Remote Governance Endpoint" + "Governance Request Intake" (network-shaped, unreachable).** `handleAocPMFreakRemoteGovernanceRequest` is a pure function with method/auth/payload guards, but its HTTP adapter is an explicit `createAocPMFreakRemoteGovernanceHttpAdapterPlaceholder()` returning `implemented: false` — **it is not mounted to any route in the repository.** In its default `deterministic_local` mode, the "evaluator" is a flat if/else table reading fields (`missingEvidenceIds`, `missingApprovalIds`, action status) that the **caller itself asserts** — no independent identity, authority, policy, jurisdiction, risk, or constitutional resolution occurs. An opt-in `passport_runtime` mode calls a real resolver, but only the repo's **demo-fixture** resolver, not the production `pmfreak-agent-passport-foundation` package (a code comment explains this was a deliberate choice to avoid a "brittle import"). Neither mode writes a passport update, issues an execution authorization, or emits an audit record — the intake client's own docstrings state it "never mutates PMFreak data... never writes a decision back."

**Pipeline C — `action-enforcement`'s `AocGuard.enforce()` (the real vertical slice, but in-process only).** This is the closest thing to a working end-to-end flow in the repository: `EnforcementPreflightService` genuinely chains recognition → authority/approval gating → evidence-required checks → domain-policy-pack evaluation → idempotency/timeout/side-effect-boundary checks, before allowing a guarded `execute()` callback to run, and produces a hash-chained `EnforcementProof`. It is exercised end-to-end by `aoc-enterprise-demo`'s 18 real scenarios (all passing). **But it is never exposed via any API or app** — it only runs when a test or demo scenario directly imports and calls it in-process.

Execution diagram (where the real chain stops):

```
[external request] ──X── never reaches any of the below (no route exists)

  Recognition ──▶ Authority/Approval ──▶ Evidence check ──▶ Policy Pack eval ──▶ Action Enforcement
       (real, tested, wired — but only reachable from demo-scenario fixtures / test code, in-process)
                                                                                       │
                                                                                       ▼
                                                                            [no Passport-Update step]
                                                                            [no Execution-Authorization token]
                                                                            [no unified Audit write]
```

---

## 8. Data Model Audit

- **No Supabase, no Postgres, no Prisma/Drizzle, no `.sql` files, no migration directories anywhere in the repository** (confirmed by repo-wide search; the one `supabase` string hit found is an unrelated test-fixture mention). No RLS exists because no RLS-capable database exists.
- **Real persistence exists in exactly one place:** `apps/agent-passport-web/src/lib/db.ts` — SQLite via `better-sqlite3`, WAL mode, foreign keys on, 20 `CREATE TABLE IF NOT EXISTS` tables (purchases, passports, agent_passports, stripe_webhook_events, organization_registries, registry_export_artifacts, registry_admin_sessions, buyer_accounts, buyer_account_sessions, registry_team_invitations, registry_billing_events, issuer_keys, billing_portal_sessions, etc.), with a hand-rolled `ensureColumn` ALTER-TABLE helper standing in for formal migrations.
- **Secondary persistence:** `packages/control-plane` writes a single flat JSON file (`.aoc-control-plane.json`) as an audit log — real, but file-based, single-process, no concurrency control.
- **Everything else — every governance decision, every policy pack evaluation, every authority grant, every evidence proof, every approval, every handshake visa — lives only in in-process `Map` objects and is lost on restart.** This is true of all 7 `src/features` runtime modules without exception.
- **Governance decisions are not stored in the one real database that exists.** `agent-passport-web`'s SQLite schema stores passports, purchases, and billing/team-admin state — it has no table for a `Decision`, `AuditRecord`, or `PolicyFinding`. The app that has a real DB doesn't store governance decisions; the modules that make governance decisions don't have a real DB.
- No soft-delete pattern was found in the audited schema (deletions/revocations are represented as status-field transitions, e.g., `revoked`, which is reasonable but worth confirming intentional across all tables).

---

## 9. API Audit

The **entire repository has exactly one HTTP surface**: `apps/agent-passport-web/src/app/api/**` (Next.js App Router, 32 route files). No Express/Fastify/other server exists anywhere else — repo-wide greps for `app.get(`/`app.post(` patterns outside this app returned zero hits.

| Endpoint group | Auth | Backend | Real/Mocked |
|---|---|---|---|
| `/api/account/*` (signup/login/logout/me/registries/billing) | Password hash + session cookie | SQLite via repository modules | Real |
| `/api/agent-passports*` (create/get/verify) | Registry access token or purchase session (POST); public (GET) | `@aoc-enterprise/agent-governance` + SQLite | Real |
| `/api/checkout/session*`, `/api/stripe/webhook` | Public checkout / Stripe signature verification | Live Stripe SDK + SQLite | Real (requires `STRIPE_SECRET_KEY`) |
| `/api/organization-registry/**` (team, billing, exports, admin-session, recovery) | Admin session / access token, per-route | Multiple SQLite repositories | Real |
| `/api/team-invitations/**` | Session cookie / invitation token | SQLite | Real |

There is **no `/api/governance/*` endpoint, no decision-evaluation endpoint, and no audit-query endpoint anywhere in the repository.** No route in this inventory is deprecated (the app is young); none are unused (all are reachable from the product UI, per the app agent's read). This is a commerce/passport-management API surface, not a governance-decision API surface — the two things the Blueprint conflates are, in this repo, entirely separate and only one of them is exposed.

---

## 10. Security Audit

- **Authentication (agent-passport-web):** Real — password hashing, SHA-256 session tokens, admin sessions with 30-day expiry, Stripe webhook signature verification (`stripe.webhooks.constructEvent`), invitation-token flows. No global `middleware.ts`; each route resolves its own session — functionally fine but means auth coverage is only as good as each route author remembered to add it (not centrally enforced).
- **Tenant isolation:** Not implemented anywhere at the data layer. `foundation.md`'s three isolation modes (logical/strong/sovereign) and `repo-boundaries.md`'s per-tenant policy bundles/key roots are pure documentation — no code implements per-tenant data partitioning; `organization_registries` in SQLite provide row-level *product* multi-tenancy (registries/teams) but not the sovereign/regulated isolation model the docs describe.
- **Privilege escalation surface:** Not deeply penetration-tested by this audit; `authority-graph`'s ancestor-revocation propagation and `approval-runtime`'s segregation-of-duties logic are real defenses against escalation *within the simulation*, but since none of this is exposed via API, real-world escalation risk currently concentrates entirely in `agent-passport-web`'s admin-session/access-token model, which was not adversarially tested here — **recommend a dedicated security review of that app specifically** before it handles more privilege-sensitive operations.
- **RLS:** N/A — no RLS-capable database exists.
- **Secrets:** Environment-variable based (`STRIPE_SECRET_KEY`, DB path) — standard, no hardcoded secrets found in the audited files.
- **Evidence integrity:** Real SHA-256 hash-chaining in `evidence-source-runtime` and `verifiable-export-package` — detects tampering *within this system's own trust boundary* only; there is no asymmetric signing, so nothing here is provable to a third party without trusting this codebase.
- **Audit integrity:** Real hash-chaining in `recognition-runtime`'s `AuditEvent`/`EvidenceLedger`, but fragmented across 3+ non-federated implementations (§5) — an attacker (or a bug) could write to one ledger without the others noticing.
- **Decision integrity:** No cryptographic signing of decisions anywhere; `packages/agent-governance`'s passport signing uses a test/demo signer (`createTestSigner`) at least in the PMFreak wrapper path — **this is the single biggest concrete security gap**: the passport system that is actually in production (`agent-passport-web`) needs its production signer path verified separately, since the test-signer usage was confirmed specifically in the PMFreak foundation package, not necessarily in the app's own issuance path (the app agent didn't flag signer-material explicitly — worth a follow-up check before treating passport signatures as production-grade).
- **Passport integrity:** Real hash chains, real event lifecycle; strongest security-relevant subsystem in the repo.
- **Vault/crypto in `src/runtime`:** Explicitly **fake** — "fingerprints" are plain string concatenation (`fp()` joins fields with `:`), not `crypto.createHash`/HMAC. No real secrets management exists in the Blueprint-shaped runtime layer.

---

## 11. Test Audit

- **371+ test files repo-wide**, overwhelmingly under `src/features/*` (~344 files). All use Node's built-in `node:test`/`node:assert` — **zero** hits for `jest.mock`, `sinon`, `jest.fn`, or `vi.mock` anywhere in the repository. This is a real, mock-free test culture.
- Sampled tests (15+) construct real service classes and assert on real computed outputs — these are genuine unit/integration tests, not decorative property checks. `apps/agent-passport-web/__tests__/billing.test.ts` uses a real SQLite test DB and exercises real repository/enforcement functions.
- **CI actually runs tests**: `.github/workflows/ci.yml` runs `typecheck → build → lint → test` on every PR; `npm test` = `npm run build && node --test`.
- **`src/runtime` — the Blueprint-shaped orchestration package — has zero dedicated tests.** Its only exercise is 4 single-scenario smoke scripts (`scripts/check-runtime-*.mjs`) that are *not* part of `npm test`, several of which self-reportedly failed at the time their own "CURRENT_STATE" docs were written.
- **`packages/governance-treaties` and `packages/runtime-negotiation` have real test files that never run** — suffixed `.test.skip.ts`, which the repo's `*.test.ts` glob never matches. Their logic is completely unverified by CI despite sitting right next to working test code.
- 9 of 14 `packages/*` and 4 of 5 `apps/*` have no tests, mostly because they have no/minimal source.
- No snapshot tests found. A recurring, real pattern is "no-overclaim" tests asserting marketing/demo copy doesn't overstate what a fixture actually proves — a genuinely good practice, narrowly scoped.

**Actual confidence level:** High for the `src/features` governance cluster (real, exercised, CI-gated). Zero for `src/runtime` (untested). Zero for the two skipped-test packages. Untested Runtime components: Identity Runtime (no impl to test), the unified Audit Runtime (doesn't exist to test), `src/runtime` end-to-end.

---

## 12. Dead Code Audit

**Confirmed empty (zero source, `.gitkeep` only):**
- `apps/agent-gateway`, `apps/audit-console`, `apps/dashboard`, `apps/policy-engine`
- `infrastructure/docker`, `infrastructure/kubernetes`, `infrastructure/terraform`
- `packages/identity`, `packages/consent-engine`, `packages/capability-tokens`, `packages/scoped-access`, `packages/audit-sdk`

**Confirmed zero external consumers (recommend deletion or explicit archival, not silent retention):**
- `src/features/aoc-integrations` (PMFreak intake/endpoint) — internally tested but nothing outside its own directory imports it; its one HTTP surface is an explicit unimplemented placeholder.
- `src/features/aoc-enterprise-pilot-template` — top of the dependency stack, consumes 5 real modules, consumed by nothing.
- `aoc-enterprise-demo`'s React/UI component layer — no app mounts it (the demo *logic* is real and consumed elsewhere; the UI is dead).
- `packages/canonical-runtime-contracts` — substantial, well-built, zero consumers; its README overstates CI enforcement that isn't wired.
- `packages/governance-treaties`, `packages/runtime-negotiation` — unresolvable as workspace packages (no `name` field in `package.json`), tests permanently skipped, last touched a month before the current development arc.
- `packages/integration-runtime` — 32 lines of interfaces, zero implementers, zero consumers.
- `packages/org-boundary`, `packages/control-plane-sdk`, `packages/enterprise-audit`, `packages/policy-runtime` — interface-only stubs, zero consumers.

**Scaffolding retained for a plausible future purpose (lower priority to remove):**
- `examples/enterprise-runtime-host` — honest, self-labeled demo, not dead, useful as a reference.
- `packages/control-plane` — small but real and consumed by `aoc-enterprise-demo`.

**Recommendation:** Delete or clearly archive (e.g. an `/archive` or `/experiments` workspace excluded from `tsc -b`) everything in the two "confirmed zero consumers" buckets above. Their presence inflates the perceived surface area of "Enterprise Runtime" work without contributing to it, and — per §13 — actively misleads documentation claims about what's enforced/consumed.

---

## 13. Documentation Audit

- `docs/architecture/foundation.md` and `repo-boundaries.md` describe an idealized 3-layer architecture (Protocol → Enterprise → Applications) with 5 named "protocol primitive" packages. **All 5 are empty.** The documented architecture cannot execute as described anywhere in this repository today.
- `docs/architecture/runtime-flow.md` describes a 9-step access-request flow through `capability-tokens`, `scoped-access`, `consent-engine`, `policy-runtime` — **all four of those packages are either empty or interface-only stubs.** This is the clearest single instance of documentation asserting a capability that has zero corresponding code.
- `docs/architecture/canonical-runtime-contracts.md` claims 3 CI scripts enforce contract-drift as part of the `lint` pipeline. **They are not wired into `lint`, `validate:release`, or any GitHub Actions workflow.** This is a concrete, checkable overstatement, not a matter of interpretation.
- The five `CURRENT_STATE_*.md` docs are auto-generated changelog artifacts (uniform template: Branch/Starting commit/Files changed/Validations executed/...). Several **self-report failing builds/tests at time of writing** (`CURRENT_STATE_RUNTIME_OPERATIONAL_STATE.md` and `CURRENT_STATE_SOVEREIGN_RUNTIME_VAULT_BOUNDARY.md` both note `typecheck`/`build`/`test` failures). `CURRENT_STATE_RUNTIME_FEDERATION.md` contains **literal unexpanded shell template syntax** (`$(git rev-parse --abbrev-ref HEAD)`) never interpolated — no human verified this doc's own metadata before it was committed.
- Read together, the `CURRENT_STATE_*` sequence's final recommendation is to **stop deep `src/runtime` infrastructure work and shift toward PMFreak productization** — which is a candid, useful signal, but it means the repo's own documentation already concedes that the Blueprint's central deliverable (a unified Enterprise Runtime) was deprioritized before this audit, not discovered by it.
- Feature-level READMEs (`policy-pack-foundation`, `verifiable-export-package`, etc.) are, by contrast, **unusually honest** — several explicitly enumerate what they do *not* do, and those disclaimers were independently verified as accurate by the research agents. This is a meaningfully different documentation quality tier from the architecture-level docs.

**Verdict:** Architecture-level documentation (`foundation.md`, `repo-boundaries.md`, `runtime-flow.md`, `canonical-runtime-contracts.md`) is substantially aspirational and should be marked as such (e.g., a banner: "target-state, not current-state") until the empty packages it describes have code. Feature-level documentation is largely trustworthy.

---

## 14. Technical Debt (ranked)

**Critical**
- No externally-reachable governance decision API exists at all — the entire value proposition of "Enterprise Runtime" is unreachable from outside a test process. (Effort: 2–3 weeks — composition of existing real modules, not new logic; see §16.)
- Protocol-primitive packages (`identity`, `consent-engine`, `capability-tokens`, `scoped-access`, `audit-sdk`) are empty, but downstream docs and even some feature code assume their existence conceptually. (Effort: 4–6 weeks for a minimal real version of each, prioritized by §17.)
- `canonical-runtime-contracts`' claimed CI enforcement doesn't exist — silent drift risk grows every sprint it stays unwired. (Effort: 2–3 days to wire the 3 existing scripts into `lint`.)

**High**
- `src/runtime` (the Blueprint-shaped package) is fully orphaned and untested; either wire it to the real `src/features` engine or deprecate it to stop it misleading readers about where the "real" runtime lives. (Effort: 2 weeks wiring, or 2 days to mark deprecated.)
- Governance decisions are made entirely in-memory with no durable persistence anywhere; a process restart silently discards all decision/evidence/authority state. (Effort: 2–3 weeks to add a real persistence adapter, reusing `agent-passport-web`'s SQLite pattern.)
- Audit trail is fragmented across 3+ non-federated implementations. (Effort: 3 weeks to consolidate onto `recognition-runtime`'s hash-chained ledger.)
- No schema validation library anywhere — every "validator" can silently drift from its type. (Effort: 1–2 weeks to introduce zod at the API boundary, incrementally.)

**Medium**
- `governance-treaties`/`runtime-negotiation` have real, currently-inert logic and skipped tests — either finish wiring them (unclear scope) or delete them. (Effort: 1 day to decide + delete, or 1–2 weeks to properly integrate.)
- `aoc-integrations` (PMFreak intake/endpoint) duplicates logic that already exists correctly elsewhere (`pmfreak-agent-passport-foundation`) via a documented workaround to avoid a "brittle import" — resolve the underlying coupling issue instead of maintaining two parallel PMFreak pipelines. (Effort: 1–2 weeks.)
- Five independently-defined `PolicyContext` shapes need an explicit, written architectural ruling (keep siloed vs. unify). (Effort: 1 day to decide, more if unification is chosen.)

**Low**
- Empty `apps/*` and `infrastructure/*` scaffolds add directory noise without cost; low urgency to remove, but should not be treated as "existing" work in future status reporting.
- Architecture-level docs need a "target-state" banner (§13). (Effort: <1 day.)

---

## 15. Vertical Slice Readiness

**The Finance Agent → GovernanceRequest → Identity → Authority → Policy → Jurisdiction → Risk → Constitution → Decision → Evidence → Passport → Execution → Audit flow cannot currently execute, from outside the process, at all.**

The closest real approximation — `action-enforcement`'s `AocGuard.enforce()` chain (§7, Pipeline C) — genuinely composes Recognition → Authority/Approval → Evidence → Policy-Pack → Enforcement into one real, tested, hash-proofed call, and this is a meaningfully complete *subset* of the Blueprint's stages. But:
1. It has no Jurisdiction, Risk-as-a-distinct-stage, Constitutional-evaluation, Narrative-generation, or Passport-update step in its own chain today (though the ingredients for several — the Costa Rica jurisdiction pack, evidence-based risk classification, agent-governance's passport lifecycle — exist as separate, real modules that simply aren't threaded through this specific call path).
2. It is **only reachable from in-process test/demo code** — there is no API, no CLI, no app that lets an actual external "Finance Agent" submit a request into this chain.
3. Nothing it produces is written to the one real database in the repo.

**Where execution stops, precisely:** at the boundary between "a real request exists as a TypeScript object inside a test file or demo scenario fixture" and "a real request arrives from outside the process." No route, queue, CLI, or scheduled job constructs a `GovernanceRequest` from external input and hands it to `AocGuard.enforce()` (or to any other real decision chain). This is a wiring gap, not a logic gap — which is the single most important, most actionable finding of this audit.

---

## 16. Recommended Next PR

**Build one real, externally-reachable governance-evaluation endpoint that composes the already-real modules — do not write new decision logic.**

Concretely: add `POST /api/governance/evaluate` to `apps/agent-passport-web` (the only app with a working server, real auth, and a real database). The handler should:
1. Accept an external request, validate it against a genuine schema (introducing zod here, scoped to this one route, as the first real schema-validation usage in the repo).
2. Resolve identity from the caller's existing passport (reuse `agent-governance`'s verified passport primitives — already production-proven in this same app).
3. Call `AocGuard.enforce()` from `action-enforcement`, which already genuinely chains Recognition → Authority/Approval → Evidence → Policy-Pack (including the real Costa Rica jurisdiction pack where applicable) → Enforcement.
4. Persist the resulting decision, evidence references, and hash-chained proof to new SQLite tables in the app's existing database (extending `db.ts`'s schema, following its existing `ensureColumn` pattern) — the first durable governance-decision storage in the repository.
5. Return a real `DecisionPacket`/`AuditBundle`-shaped response (§6) instead of inventing a new response shape.

This is deliberately **not** a UI task, not documentation, not a new runtime module — it is the single highest-leverage act of *composition* available: every ingredient it needs already exists, is already tested, and is already real. It converts the repository's best asset (a real, tested governance simulation engine) from "provably works in a test file" into "provably works for an external caller with durable evidence," which is the one thing currently missing to justify calling any of this an "Enterprise Runtime" rather than a well-built simulation.

---

## 17. 30-Day Execution Plan

**Week 1 — Expose the real engine (directly enables §16's PR)**
- Task: Build `POST /api/governance/evaluate` per §16. *Dependencies:* none — all consumed modules already exist and pass their own tests. *Complexity:* Medium (mostly wiring + one new schema-validated boundary). *Impact:* Highest in this plan — first externally-reachable governance decision in the repo's history. *Risk:* Low (no new decision logic; risk is confined to persistence-schema design).
- Task: Extend `agent-passport-web`'s SQLite schema with `decisions`, `decision_evidence`, `decision_audit_events` tables. *Dependencies:* Week 1 endpoint task. *Complexity:* Low. *Impact:* High — first durable governance storage. *Risk:* Low.

**Week 2 — Close the biggest fragmentation gaps**
- Task: Federate `src/runtime/audit`, `packages/control-plane`'s file log, and `recognition-runtime`'s hash-chained ledger onto one audit sink (the hash-chained ledger, per §5/§6 recommendation), writing to the new `decision_audit_events` table. *Dependencies:* Week 1 schema. *Complexity:* Medium. *Impact:* High — resolves the Audit Runtime's 3-way split (§2, §5). *Risk:* Medium (touches 3 modules' output contracts).
- Task: Wire `canonical-runtime-contracts`' 3 drift-check scripts into the actual `lint` pipeline, or delete the package if it's judged not worth maintaining. *Dependencies:* none. *Complexity:* Trivial. *Impact:* Medium (stops a documented-but-false enforcement claim). *Risk:* Low.

**Week 3 — Identity and Passport hardening**
- Task: Build a real `IdentityResolverAdapter` implementation backed by `agent-governance`'s passport claims (replacing the mock-only implementation). *Dependencies:* none new. *Complexity:* Medium. *Impact:* High — closes the Identity Runtime gap (§5), the single largest "Missing" item in §2. *Risk:* Medium.
- Task: Verify and, if needed, replace the test-only signer path flagged in §10 with a real signing mechanism (KMS-backed or equivalent) for any passport issuance reachable from production traffic. *Dependencies:* none. *Complexity:* Medium-High (key management). *Impact:* Critical for production trustworthiness. *Risk:* High if skipped — this is the audit's clearest concrete security finding.

**Week 4 — Cleanup and decision consolidation**
- Task: Delete or explicitly archive the confirmed-dead modules from §12 (`aoc-integrations`, `aoc-enterprise-pilot-template`, `canonical-runtime-contracts` if not revived in Week 2, `governance-treaties`, `runtime-negotiation`, `integration-runtime`). *Dependencies:* sign-off that nothing in flight needs them. *Complexity:* Low. *Impact:* Medium (reduces false surface-area, improves future audits' signal-to-noise). *Risk:* Low.
- Task: Write an explicit, committed architectural decision on the 5-way `PolicyContext` duplication (§6) — keep siloed (document why) or unify (scope the migration). *Dependencies:* none. *Complexity:* Low (decision) to High (if unification chosen). *Impact:* Medium. *Risk:* Low.
- Task: Add a "target-state, not current-state" banner to `foundation.md`, `repo-boundaries.md`, `runtime-flow.md`, and regenerate `CURRENT_STATE_RUNTIME_FEDERATION.md`'s broken template fields. *Dependencies:* none. *Complexity:* Trivial. *Impact:* Medium (restores documentation trustworthiness). *Risk:* None.

*This plan deliberately sequences composition-of-existing-real-logic (Weeks 1–2) ahead of net-new-capability work (Weeks 3–4), because the audit's central finding is that the repository's biggest problem is wiring and exposure, not a shortage of real governance logic.*
