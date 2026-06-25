# AOC Agent Passport Core

## What it is

AOC Agent Passport Core is the identity anchor for AI agents operating under the AOC governance framework. It establishes a verifiable, tamper-evident identity spine from enrollment through runtime execution.

Every governed agent must carry a verifiable AOC Passport. If the passport is missing, invalid, expired, suspended, revoked, or tampered with, future runtime enforcement must be able to refuse governed execution.

## What it is not

- It is **not** the landing page or enrollment UI.
- It is **not** the full Runtime Guard enforcement layer.
- It is **not** a blockchain anchor or cryptographic ledger entry.
- It is **not** a PMFreak feature.
- It does **not** render QR images — it produces the QR payload string.

---

## Identity Spine

```
Agent Enrollment Input
        ↓
  Agent Constitution  ──── constitutionHash
        ↓
  Policy Manifest     ──── policyManifestHash
        ↓
  Passport ID + Core Fields
        ↓
  Passport Hash  ──── signed ──── AgentPassportSignature
        ↓
  AgentPassport (status: issued)
        ↓
  Runtime Seal  ──── sealHash ──── AgentPassportSignature
        ↓
  Public Verification Payload + QR Payload + Verification URL
```

Each layer hashes the layer above it. Tampering with any layer invalidates all downstream hashes and signatures.

---

## Passport ID Format

```
AOC-AGT-{YEAR}-{REGION}-{ENTROPY}
```

Example: `AOC-AGT-2026-EU-7K4F9Q`

- `AOC-AGT` — fixed prefix, identifies this as an AOC Agent Governance Passport
- `YEAR` — 4-digit UTC year derived from `issuedAt`
- `REGION` — jurisdiction segment, defaults to `GLOBAL`
- `ENTROPY` — 6-character uppercase alphanumeric random or deterministic segment

---

## Passport Status Lifecycle

```
draft → issued → active → suspended ⇄ active
                        ↘
                  revoked (terminal)
                          
active → expired (terminal)
issued → revoked (terminal)
```

| Status | Description |
|--------|-------------|
| `draft` | Passport is being assembled but not yet issued |
| `issued` | Passport is issued but not yet runtime-activated |
| `active` | Passport is active and valid for runtime use |
| `suspended` | Passport is temporarily suspended; may be reactivated |
| `revoked` | Passport is permanently revoked; terminal state |
| `expired` | Passport has expired; terminal unless a renewal model is introduced |

Revoked and expired are terminal: no further transitions are permitted.

---

## Governance Levels

| Level | Meaning |
|-------|---------|
| `registered` | Agent is enrolled in the AOC registry |
| `constitutional` | Agent has a signed constitution and policy manifest |
| `observed` | Agent activity is observed by the governance layer (future) |
| `governed` | Agent is subject to real-time policy enforcement (future) |
| `enforced` | Agent is under strict enforcement with hard blocks (future) |
| `certified` | Agent has passed a formal certification audit (future) |

This sprint issues passports at `constitutional` level. Higher levels require future runtime enforcement layers.

---

## Agent Constitution

The constitution is a machine-readable governance document generated from enrollment input. It contains eight canonical articles:

| Article | Title |
|---------|-------|
| I | Identity and Purpose |
| II | Scope of Authority |
| III | Data Boundaries |
| IV | Tool and Action Boundaries |
| V | Human Oversight |
| VI | Escalation Rules |
| VII | Auditability |
| VIII | Suspension, Revocation, and Termination |

The constitution is serialized with deterministic canonical JSON and hashed. The hash is embedded in the passport and runtime seal.

---

## Policy Manifest

The policy manifest is a machine-enforceable runtime document that specifies:

- `allowedActions` / `prohibitedActions` — what the agent may and may not do
- `dataAccess` / `toolAccess` — resources the agent is permitted to use
- `humanApprovalRequiredFor` — actions that require human approval before execution
- `riskTier` / `autonomyLevel` — risk classification
- `audit` — audit level, retention days, and whether auditing is mandatory

This manifest is the intended future input to **AOC Runtime Guard**.

---

## Runtime Seal

The runtime seal is a compact cryptographic envelope designed to be embedded within a governed agent runtime. It contains:

- Passport ID and hashes (passport, constitution, policy manifest)
- Issuer identity and status check URL
- A signature over the canonical seal content

Verification logic checks:
1. Passport ID match
2. All three hashes match the live passport
3. Signature is valid
4. Passport status is `active` (or `issued` if `allowIssued: true`)

This allows a runtime to verify the agent's governance status without needing to call a remote service on every request. It is tamper-evident: any modification to the seal, passport, constitution, or manifest will fail verification.

---

## Verification URL and QR Payload

Every passport is assigned a verification URL:

```
https://aocprotocol.org/verify/{passportId}
```

The QR payload is this URL. Future versions may render a QR image or embed a structured verification token. For this sprint, the string is produced and embedded in the passport for use by UI layers.

The base URL is configurable at issuance time. The default is `https://aocprotocol.org/verify`.

---

## Tamper Evidence and Enforcement

**Outside governed runtimes:**

The passport is tamper-*evident*. Changing any field in the passport, constitution, or policy manifest will cause hash mismatches that any verifier can detect. The signature prevents undetected modification of the passport hash itself.

**Inside governed runtimes:**

The runtime seal creates a local enforcement anchor. A governed runtime that embeds `AgentRuntimeSeal` can reject execution without a live network call:

> Removing the passport does not destroy the agent, but it destroys the agent's AOC-governed verification status. In governed runtimes, missing or invalid passports must cause governed execution to fail.

---

## Hashing

All hashes use deterministic canonical JSON serialization (recursive alphabetical key sort) followed by SHA-256 and formatted as `sha256:<hex>`. Node.js built-in `node:crypto` is used. No external hashing packages are introduced.

---

## Reason Codes

| Code | Meaning |
|------|---------|
| `passport.valid` | Passport verified successfully |
| `passport.invalid_signature` | Signature check failed |
| `passport.invalid_hash` | Passport hash mismatch (tampered) |
| `passport.status_not_active` | Status is not active or issued |
| `passport.revoked` | Passport has been revoked |
| `passport.expired` | Passport has expired |
| `passport.missing_constitution_hash` | Constitution hash field is missing |
| `passport.missing_policy_manifest_hash` | Policy manifest hash field is missing |
| `runtime_seal.valid` | Runtime seal verified successfully |
| `runtime_seal.passport_mismatch` | Seal passport ID does not match passport |
| `runtime_seal.hash_mismatch` | One or more seal hashes do not match passport |
| `runtime_seal.invalid_signature` | Seal signature check failed |

---

## Suggested Next Sprints

1. **Public Passport Page + Enrollment Flow** — UI for enrolling an agent and viewing the issued passport. Requires a front-end form and a server-side issuance endpoint backed by the functions in this package.

2. **Runtime Guard Lite** — A lightweight runtime enforcement middleware that accepts `AgentRuntimeSeal`, calls `verifyAgentRuntimeSeal`, and blocks governed execution if verification fails. This is the first step toward making passports enforceable inside governed runtimes.
