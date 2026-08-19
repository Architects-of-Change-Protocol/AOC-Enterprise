# Soberanía Runtime Guard Lite

## What Runtime Guard Lite Is

Runtime Guard Lite is the first enforceable runtime layer in the Soberanía Agent Governance stack. It consumes an Agent Passport (produced by Agent Passport Core) and answers one question before a governed agent performs a real-world action:

> **Is this agent allowed to execute this requested action under its Soberanía Passport, Runtime Seal, Policy Manifest, and current passport status?**

Runtime Guard Lite converts Soberanía Agent Passport from a verifiable identity artifact into a runtime-enforceable control point.

Every governed execution passes through:

```
Runtime Seal → Passport Verification → Policy Manifest Evaluation → Runtime Decision → Audit Event
```

If the passport is missing, invalid, tampered with, suspended, revoked, expired, or not active, governed execution must fail.

---

## What Runtime Guard Lite Is Not

- It does **not** control the model's internal reasoning. It controls whether a governed action is allowed to become real-world execution.
- It does **not** implement a full human approval workflow. It produces `AgentRuntimeHumanApprovalRequest` contracts — routing and fulfillment are left to the runtime host.
- It does **not** implement rate limiting, quota enforcement, or network-level controls. Those belong to a future Runtime Guard full version.
- It does **not** build UI, landing pages, or database migrations.
- It does **not** perform blockchain anchoring.

---

## How It Consumes Agent Passport Core

Runtime Guard Lite is built directly on top of Agent Passport Core (`packages/agent-governance`):

| Passport Core Component | How Runtime Guard Uses It |
|---|---|
| `AgentPassport` | Identity anchor — all decisions are scoped to a passport |
| `AgentRuntimeSeal` | Tamper-evidence check before any policy evaluation |
| `AgentPolicyManifest` | Source of truth for allowed/prohibited actions, tool access, data access |
| `verifyAgentRuntimeSeal()` | Called as step 1 of every guard evaluation |
| `verifyAgentPassport()` | Called as step 2 of every guard evaluation |
| `AgentPassportSignerPort` | Injected into the guard for both seal and passport verification |

Outside a governed runtime, Soberanía Passport remains tamper-evident. Inside a governed runtime, Runtime Guard Lite makes the passport enforceable.

---

## Runtime Decision Flow

```
evaluateAgentRuntimeGuard(input, deps)
  │
  ├── 1. requireRuntimeSeal?
  │       └── No seal → DENY (missing_runtime_seal)
  │       └── Tampered seal → DENY (invalid_runtime_seal)
  │
  ├── 2. verifyAgentPassport()
  │       └── Invalid → DENY (invalid_passport / passport_revoked / passport_expired)
  │
  ├── 3. Passport status active?
  │       └── Suspended / not active → DENY (passport_not_active)
  │       └── Revoked → DENY (passport_revoked)
  │       └── Expired → DENY (passport_expired)
  │
  ├── 4. Policy manifest hash matches passport?
  │       └── Mismatch → DENY (policy_manifest_mismatch)
  │
  ├── 5. Action in prohibitedActions?
  │       └── Yes → DENY (action_prohibited)
  │
  ├── 6. Tool in toolAccess (strictToolAccess)?
  │       └── Not allowed → DENY (tool_not_allowed)
  │
  ├── 7. Data categories in dataAccess (strictDataAccess)?
  │       └── Not allowed → DENY (data_access_not_allowed)
  │
  ├── 8. Risk tier in humanApprovalRiskTiers?
  │       └── Yes → REQUIRE_HUMAN_APPROVAL (high_risk_requires_approval)
  │
  ├── 9. Action in humanApprovalRequiredFor?
  │       └── Yes → REQUIRE_HUMAN_APPROVAL
  │
  ├── 10. Action unknown (actionCategory === 'unknown')?
  │       └── unknownActionMode = 'deny' → DENY (action_unknown)
  │       └── unknownActionMode = 'require_human_approval' → REQUIRE_HUMAN_APPROVAL
  │
  └── 11. All checks passed → ALLOW
```

---

## Outcome Semantics

| Outcome | `allowed` | `blocked` | `requiresHumanApproval` | Meaning |
|---|---|---|---|---|
| `allow` | `true` | `false` | `false` | Governed execution may proceed |
| `deny` | `false` | `true` | `false` | Execution is blocked |
| `require_human_approval` | `false` | `true` | `true` | Execution is paused pending human review |

`deny` and `require_human_approval` both block autonomous execution. The difference is intent: `deny` is a policy violation, `require_human_approval` is a governance gate that can be cleared by an authorised human.

---

## Why This Makes Soberanía Passport Enforceable

A signed passport without a runtime layer is only tamper-evident — it proves identity but cannot prevent action. Runtime Guard Lite closes this gap:

1. **The Runtime Seal** binds the passport hash, constitution hash, and policy manifest hash into a cryptographically signed record. Any modification to any of these documents makes the seal invalid.
2. **Passport verification** ensures the passport has not been tampered with and the signature is valid.
3. **Policy manifest evaluation** enforces machine-readable rules declared at enrollment time.
4. **Audit events** create an immutable record of every governed execution decision.

The result is that each policy rule declared during enrollment (`prohibitedActions`, `toolAccess`, `dataAccess`, `humanApprovalRequiredFor`) becomes a runtime enforcement point, not just a declaration.

---

## Key Contracts

### `AgentRuntimeActionRequest`

The inbound request for a governed action. Contains the passport ID, requested action, action category, optional tool name, optional data categories, risk tier, and request metadata.

### `AgentRuntimeGuardDecision`

The output of `evaluateAgentRuntimeGuard`. Always contains a `decisionId`, `outcome`, and `reasonCodes`. Includes hashes of the policy manifest, constitution, and passport for auditability.

### `AgentRuntimeGuardEnforcementResult`

The output of `enforceAgentRuntimeGuard`. Wraps the decision and exposes `allowed`, `blocked`, and `requiresHumanApproval` as boolean flags for easy consumption.

### `AgentRuntimeHumanApprovalRequest`

A contract representing a pending human approval gate. Created by `createHumanApprovalRequest(decision, request)`. Status: `pending | approved | rejected | expired`. Routing and fulfillment are outside this sprint.

---

## Audit Events

Every evaluation emits at least two events to the optional `eventSink`:

| Event Type | When Emitted |
|---|---|
| `agent_runtime_guard.evaluated` | Always, on every evaluation |
| `agent_runtime_guard.allowed` | When outcome is `allow` |
| `agent_runtime_guard.denied` | When outcome is `deny` |
| `agent_runtime_guard.human_approval_required` | When outcome is `require_human_approval` |
| `agent_runtime_guard.enforced` | On every call to `enforceAgentRuntimeGuard` |

---

## What Remains for Future Runtime Guard Full Version

| Capability | Status |
|---|---|
| Human approval workflow routing | Future sprint |
| Approval fulfillment and audit trail | Future sprint |
| Real-time passport status check against store | Future sprint |
| Rate limiting and quota enforcement | Future sprint |
| Multi-agent trust chain validation | Future sprint |
| Cross-tenant policy federation | Future sprint |
| Runtime Guard SDK (framework integrations) | Future sprint |
| Persistent audit log storage | Future sprint |
| Policy hot-reload without restart | Future sprint |

The next recommended sprint is **Public Passport Page + Enrollment Flow**, which exposes `/enroll-agent`, `/passport/[passportId]`, `/verify/[passportId]`, QR payload rendering, badge copy/download, and a sample governed agent passport.
