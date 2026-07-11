# AOC Agent Passport Model (PR-006)

Canonical contracts live in `src/enterprise/passport/contracts.ts`. This
document is the field-level reference; the source file is authoritative.

`AOC_AGENT_PASSPORT_RUNTIME_VERSION = '1.0.0'`. Contract ids:
`aoc.agent-passport.v1`, `aoc.agent-passport-event.v1`,
`aoc.agent-passport-view.v1`, `aoc.agent-passport-claim.v1`,
`aoc.agent-passport-verification.v1`.

## `AgentPassport` — the reconstructed aggregate

```ts
interface AgentPassport {
  passportId; passportVersion;
  subject: AgentPassportSubject;
  organization: AgentPassportOrganizationBinding;
  status: AgentPassportStatus;
  lifecycle: AgentPassportLifecycle;
  identity: AgentIdentityDescriptor;
  capabilities: readonly AgentCapabilityReference[];
  authorities: readonly AgentAuthorityReference[];
  delegations: readonly AgentDelegationReference[];
  governanceReferences: readonly PassportGovernanceReference[];
  evidenceReferences: readonly PassportEvidenceReference[];
  provenance: AgentPassportProvenance;
  integrity: AgentPassportIntegrity;
  createdAt; updatedThroughEventId;
}
```

A read model, never a stored row — see `reconstruction.ts`. There is no
`updatePassport()`/`deletePassport()` anywhere in the module, and none may
be added.

## Subject

```ts
type AgentPassportSubjectType =
  | 'autonomous_agent' | 'assistant_agent' | 'workflow_agent'
  | 'decision_agent' | 'service_agent' | 'external_agent';

interface AgentPassportSubject {
  agentId; agentType: AgentPassportSubjectType;
  displayName?; description?;
  modelProvider?; modelFamily?;      // optional -- an agent may be model-agnostic
  systemOwnerId?; operationalOwnerId?;
}
```

Never carries system prompts, model credentials, or secrets.

## Organization binding

```ts
interface AgentPassportOrganizationBinding {
  organizationId; workspaceId?; departmentId?;
  recognizedBy; recognitionReference?;
  boundAt;
}
```

Trust is domain-bound: a Passport is never treated as globally trusted
merely because one organization issued it.

## Status and lifecycle

See `AOC_AGENT_PASSPORT_LIFECYCLE.md` for the full transition table.

```ts
type AgentPassportStatus = 'draft' | 'active' | 'suspended' | 'revoked' | 'expired' | 'retired';
```

`AgentPassportLifecycle` carries bounded, typed bookkeeping for the
current status only (`enteredAt`, and status-specific fields like
`suspendedReason`/`revokedReasonCode`) — the full history of *why* a
status changed lives in the event stream, not duplicated onto every
reconstructed Passport.

## References (never copies)

```ts
interface AgentCapabilityReference {
  capabilityId; capabilityType; scope?;
  validFrom?; validUntil?; authoritySource?; evidenceBundleId?;
  status: 'active' | 'expired' | 'revoked';
}

interface AgentAuthorityReference {
  authorityId; authorityType; scope?;
  issuedBy; issuedAt; validUntil?; evidenceBundleId?;
  status: 'active' | 'suspended' | 'revoked' | 'expired';
}

interface AgentDelegationReference {
  delegationId; delegatorId; delegateId; scope;
  validFrom; validUntil?; revocationReference?; evidenceBundleId?;
  status: string;
}
```

Passport visibility of a capability/authority reference is not
authorization — the Kernel/Authority Runtime alone decides whether a
capability authorizes an action.

```ts
interface PassportGovernanceReference {
  evaluationId; decisionId; requestId;
  status: KernelDecisionStatus;
  occurredAt; governanceRecordDigest;
}

interface PassportEvidenceReference {
  bundleId; bundleVersion; bundleDigest;
  disclosurePolicy; subjectType; createdAt;
}
```

Both carry identifiers, status, and a digest only — never the underlying
request/result payload or Bundle content. Linking (`service.ts`'s
`linkGovernanceRecord`/`linkEvidenceBundle`) validates the reference
against the real Governance Store/Evidence Bundle Store before appending
it: existence, tenant match, and digest match.

## Provenance and integrity

```ts
interface AgentPassportProvenance {
  createdBy; issuerOrganizationId; createdAt;
  activatedEventId?; enterpriseVersion; passportRuntimeVersion;
  sourceIdentityRecord?;
  reconstructedThroughEventId; reconstructedThroughSequence;
}

interface AgentPassportIntegrity {
  algorithm: 'sha256'; canonicalizationVersion;
  latestEventDigest; chainPosition;
}
```

## Claims and history summary

```ts
interface AgentPassportClaim {
  claimType; value; issuedAt; validUntil?;
  evidenceBundleId?; governanceRecordId?;
  status: 'active' | 'expired' | 'revoked';
}
```

v1 claim types: `passport.active`, `passport.not-revoked`,
`organization.bound`, `capability.referenced`, `authority.referenced`,
`evidence.verified-reference`, `governance.history-present`. Every claim
is reconstructable from the Passport's own events and references — never
a subjective judgement.

```ts
interface AgentPassportHistorySummary {
  governanceEvaluationsReferenced; evidenceBundlesReferenced;
  allowedDecisionsReferenced; deniedDecisionsReferenced; approvalRequiredReferenced;
  suspensions; revocations;
  lastGovernedActivityAt?;
}
```

No `trustScore` field exists, and none may be added without a governed,
documented, explainable methodology — see "Why no trust score" in
`AOC_AGENT_PASSPORT_RUNTIME.md`.

## Events

See `AOC_AGENT_PASSPORT_LIFECYCLE.md` for the event catalog and
`events.ts` for the digest-chain mechanics.

## Views

See `AOC_AGENT_PASSPORT_DISCLOSURE.md`.

## Verification result

```ts
interface AgentPassportVerificationResult {
  passportId; valid; status: AgentPassportStatus;
  mode: 'STRUCTURAL' | 'REFERENTIAL' | 'FULL_INTERNAL';
  checks: {
    eventChain; lifecycle; identityBinding; organizationBinding;
    capabilities; authorities; delegations;
    governanceReferences; evidenceReferences; version;
  };
  failures: readonly PassportVerificationFailure[];
  verifiedAt;
}
```

## Access, idempotency, health

```ts
interface PassportAccessContext { organizationId?; actorId?; system: boolean; }
```

Identical shape to `GovernanceStoreAccessContext` — the Passport Runtime
does not authenticate anyone; Enterprise resolves and hands it this
context.

```ts
interface PassportIdempotencyContext { idempotencyKey; scope; }
interface PassportIdempotencyProbe { idempotency: PassportIdempotencyContext; subjectDigest; }
type PassportIdempotencyResolution =
  | { kind: 'new' } | { kind: 'replay'; passportId } | { kind: 'conflict' };

interface AgentPassportStoreHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  readable; writable; schemaVersion; migrationState; checkedAt;
}
```
