import type { KernelDecisionStatus } from '../../kernel/index.js';

/**
 * Canonical model of the Soberanía Enterprise Agent Passport Runtime v1 (PR-006).
 * An Agent Passport is the governed identity, authority, status, provenance,
 * and evidence-reference record of an autonomous or semi-autonomous agent
 * operating within an organization.
 *
 * Core principle: the Passport does not decide. `AocKernel`
 * (`src/kernel/`) decides. The Governance Store (`../governance-store/`)
 * remembers. Evidence Bundles (`../evidence/`) demonstrate. The Passport
 * identifies and contextualizes the agent across time -- it *references*
 * Governance Records and Evidence Bundles, it never copies their content.
 *
 * See `docs/enterprise/AOC_AGENT_PASSPORT_RUNTIME.md` and
 * `docs/enterprise/AOC_AGENT_PASSPORT_MODEL.md`.
 */

export const AOC_AGENT_PASSPORT_RUNTIME_VERSION = '1.0.0';

export const AGENT_PASSPORT_SCHEMA_VERSION = 'aoc.agent-passport.schema.v1';

export const AGENT_PASSPORT_CONTRACT_IDS = {
  passport: 'aoc.agent-passport.v1',
  event: 'aoc.agent-passport-event.v1',
  view: 'aoc.agent-passport-view.v1',
  claim: 'aoc.agent-passport-claim.v1',
  verification: 'aoc.agent-passport-verification.v1',
} as const;

// ---------------------------------------------------------------------------
// Subject / organization binding
// ---------------------------------------------------------------------------

export type AgentPassportSubjectType =
  | 'autonomous_agent'
  | 'assistant_agent'
  | 'workflow_agent'
  | 'decision_agent'
  | 'service_agent'
  | 'external_agent';

/**
 * Who/what the Passport identifies. `modelProvider`/`modelFamily` are
 * deliberately optional -- an agent may be model-agnostic. Never carries
 * system prompts, model credentials, or other secrets (mission section 46).
 */
export interface AgentPassportSubject {
  readonly agentId: string;
  readonly agentType: AgentPassportSubjectType;

  readonly displayName?: string;
  readonly description?: string;

  readonly modelProvider?: string;
  readonly modelFamily?: string;

  readonly systemOwnerId?: string;
  readonly operationalOwnerId?: string;
}

/**
 * A Passport is bound to exactly one trust domain (organization). Trust is
 * domain-bound: a Passport must never be treated as globally trusted merely
 * because one organization issued it.
 */
export interface AgentPassportOrganizationBinding {
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly departmentId?: string;

  readonly recognizedBy: string;
  readonly recognitionReference?: string;

  readonly boundAt: string;
}

// ---------------------------------------------------------------------------
// Status / lifecycle
// ---------------------------------------------------------------------------

export type AgentPassportStatus = 'draft' | 'active' | 'suspended' | 'revoked' | 'expired' | 'retired';

/** Terminal statuses never accept a further lifecycle transition in v1 (mission section 5). */
export const AGENT_PASSPORT_TERMINAL_STATUSES: readonly AgentPassportStatus[] = ['revoked', 'expired', 'retired'];

/** Bounded lifecycle bookkeeping -- who/when for the Passport's current state, derived from its event history. */
export interface AgentPassportLifecycle {
  readonly status: AgentPassportStatus;
  readonly enteredAt: string;

  readonly activatedAt?: string;
  readonly suspendedAt?: string;
  readonly suspendedReason?: string;
  readonly suspendedBy?: string;
  readonly expectedReviewAt?: string;

  readonly revokedAt?: string;
  readonly revokedReason?: string;
  readonly revokedReasonCode?: string;
  readonly revokedBy?: string;

  readonly expiredAt?: string;
  readonly retiredAt?: string;
  readonly retiredReason?: string;
  readonly retiredBy?: string;

  readonly validFrom?: string;
  readonly validUntil?: string;
}

/** Identity descriptor carried on the Passport -- a narrower restatement of `AgentPassportSubject` for read consumers that only need identity, not the full subject record. */
export interface AgentIdentityDescriptor {
  readonly agentId: string;
  readonly agentType: AgentPassportSubjectType;
  readonly displayName?: string;
}

// ---------------------------------------------------------------------------
// References (never copies)
// ---------------------------------------------------------------------------

export type AgentReferenceStatus = 'active' | 'expired' | 'revoked';

export interface AgentCapabilityReference {
  readonly capabilityId: string;
  readonly capabilityType: string;

  readonly scope?: Readonly<Record<string, unknown>>;

  readonly validFrom?: string;
  readonly validUntil?: string;

  readonly authoritySource?: string;
  readonly evidenceBundleId?: string;

  readonly status: AgentReferenceStatus;
}

export interface AgentAuthorityReference {
  readonly authorityId: string;
  readonly authorityType: string;

  readonly scope?: Readonly<Record<string, unknown>>;

  readonly issuedBy: string;
  readonly issuedAt: string;

  readonly validUntil?: string;

  readonly evidenceBundleId?: string;

  readonly status: 'active' | 'suspended' | 'revoked' | 'expired';
}

export interface AgentDelegationReference {
  readonly delegationId: string;

  readonly delegatorId: string;
  readonly delegateId: string;

  readonly scope: Readonly<Record<string, unknown>>;

  readonly validFrom: string;
  readonly validUntil?: string;

  readonly revocationReference?: string;
  readonly evidenceBundleId?: string;

  readonly status: string;
}

/** A reference from the Passport to a committed Governance Store evaluation aggregate -- never a copy of the aggregate itself. */
export interface PassportGovernanceReference {
  readonly evaluationId: string;
  readonly decisionId: string;
  readonly requestId: string;

  readonly status: KernelDecisionStatus;

  readonly occurredAt: string;

  readonly governanceRecordDigest: string;
}

/** A reference from the Passport to a stored Evidence Bundle -- never an embedding of the Bundle's content. */
export interface PassportEvidenceReference {
  readonly bundleId: string;
  readonly bundleVersion: string;
  readonly bundleDigest: string;

  readonly disclosurePolicy: string;

  readonly subjectType: string;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Provenance / integrity
// ---------------------------------------------------------------------------

export interface AgentPassportProvenance {
  readonly createdBy: string;
  readonly issuerOrganizationId: string;
  readonly createdAt: string;

  readonly activatedEventId?: string;

  readonly enterpriseVersion: string;
  readonly passportRuntimeVersion: string;

  readonly sourceIdentityRecord?: string;

  readonly reconstructedThroughEventId: string;
  readonly reconstructedThroughSequence: number;
}

/**
 * Integrity metadata for the reconstructed Passport state. SHA-256 over
 * `aoc.canonical-json.v1` serialization (reused verbatim from the
 * Governance Store, `../governance-store/digest.ts`) -- this detects
 * post-append tampering of the event chain; it is NOT a digital signature
 * and NOT non-repudiation (mission section 7 / Known Limitations).
 */
export interface AgentPassportIntegrity {
  readonly algorithm: 'sha256';
  readonly canonicalizationVersion: string;

  readonly latestEventDigest: string;
  readonly chainPosition: number;
}

// ---------------------------------------------------------------------------
// The Passport itself -- a reconstructed read model
// ---------------------------------------------------------------------------

/**
 * The full Agent Passport: a *reconstructed* aggregate derived by folding
 * ordered `AgentPassportEvent`s (see `events.ts`, `reconstruction.ts`).
 * There is deliberately no `updatePassport`/`deletePassport` -- every
 * change is an appended event.
 */
export interface AgentPassport {
  readonly passportId: string;
  readonly passportVersion: string;

  readonly subject: AgentPassportSubject;
  readonly organization: AgentPassportOrganizationBinding;

  readonly status: AgentPassportStatus;
  readonly lifecycle: AgentPassportLifecycle;

  readonly identity: AgentIdentityDescriptor;

  readonly capabilities: readonly AgentCapabilityReference[];
  readonly authorities: readonly AgentAuthorityReference[];
  readonly delegations: readonly AgentDelegationReference[];

  readonly governanceReferences: readonly PassportGovernanceReference[];
  readonly evidenceReferences: readonly PassportEvidenceReference[];

  readonly provenance: AgentPassportProvenance;
  readonly integrity: AgentPassportIntegrity;

  readonly createdAt: string;
  readonly updatedThroughEventId: string;
}

// ---------------------------------------------------------------------------
// Events (append-only)
// ---------------------------------------------------------------------------

export type AgentPassportEventType =
  | 'AgentPassportCreated'
  | 'AgentPassportActivated'
  | 'AgentPassportSuspended'
  | 'AgentPassportReactivated'
  | 'AgentPassportRevoked'
  | 'AgentPassportExpired'
  | 'AgentPassportRetired'
  | 'AgentCapabilityReferenced'
  | 'AgentCapabilityReferenceRemoved'
  | 'AgentAuthorityReferenced'
  | 'AgentAuthorityReferenceRemoved'
  | 'AgentDelegationReferenced'
  | 'AgentDelegationReferenceRemoved'
  | 'GovernanceRecordLinked'
  | 'EvidenceBundleLinked'
  | 'PassportDisclosureViewGenerated'
  | 'PassportVerificationCompleted';

/**
 * One append-only Passport event. Events are never mutated once appended;
 * a Passport's current state is always the fold of its ordered event
 * history (`sequence` 1..N), never a mutable row updated in place.
 * `previousEventDigest`/`eventDigest` form a per-Passport hash chain
 * (mission section 36) -- deliberately scoped to one aggregate, not one
 * global store-wide chain, so verifying one Passport never requires
 * touching another's history.
 */
export interface AgentPassportEvent {
  readonly eventId: string;
  readonly passportId: string;
  readonly organizationId: string;

  readonly eventType: AgentPassportEventType;

  readonly sequence: number;

  readonly payload: Readonly<Record<string, unknown>>;

  readonly actorId: string;
  readonly actorType: string;

  readonly occurredAt: string;
  readonly persistedAt: string;

  readonly enterpriseVersion: string;
  readonly passportRuntimeVersion: string;

  readonly previousEventDigest?: string;
  readonly eventDigest: string;
}

// ---------------------------------------------------------------------------
// Claims / history summary
// ---------------------------------------------------------------------------

/**
 * A Passport claim: an assertion backed by references the Passport can
 * reconstruct from its own event history. Claims stay observable facts
 * (mission section 17/48) -- never a collapsed trust score, and never a
 * subjective judgement ("agent.safe", "agent.trustworthy") that only a
 * future Assurance Runtime could earn the right to make.
 */
export interface AgentPassportClaim {
  readonly claimType: string;
  readonly value: unknown;

  readonly issuedAt: string;
  readonly validUntil?: string;

  readonly evidenceBundleId?: string;
  readonly governanceRecordId?: string;

  readonly status: 'active' | 'expired' | 'revoked';
}

/**
 * Bounded, reference-derived summary metrics (mission section 50).
 * Deliberately never collapsed into one score -- see `docs/enterprise/
 * AOC_AGENT_PASSPORT_MODEL.md`, "No Arbitrary Trust Score".
 */
export interface AgentPassportHistorySummary {
  readonly governanceEvaluationsReferenced: number;
  readonly evidenceBundlesReferenced: number;

  readonly allowedDecisionsReferenced: number;
  readonly deniedDecisionsReferenced: number;
  readonly approvalRequiredReferenced: number;

  readonly suspensions: number;
  readonly revocations: number;

  readonly lastGovernedActivityAt?: string;
}

// ---------------------------------------------------------------------------
// Disclosure views
// ---------------------------------------------------------------------------

export type AgentPassportViewType = 'INTERNAL' | 'AUDITOR' | 'PARTNER' | 'CUSTOMER' | 'PUBLIC';

export interface AgentPassportViewProvenance {
  readonly passportStateDigest: string;
  readonly sourceUpdatedThroughEventId: string;
}

/**
 * Each view carries its own digest, distinct from the Passport's event-chain
 * digest and from the Passport's reconstructed-state digest (mission
 * section 23): `Passport Event Chain Digest ≠ Passport State Digest ≠
 * Passport View Digest`.
 */
export interface AgentPassportViewIntegrity {
  readonly algorithm: 'sha256';
  readonly canonicalizationVersion: string;
  readonly viewDigest: string;
}

/**
 * A derived, minimal-disclosure projection of an `AgentPassport`. Building
 * a view never mutates the Passport -- it is a pure read-side projection,
 * mirroring the Evidence Bundle's `Truth ≠ Disclosure` principle.
 */
export interface AgentPassportView {
  readonly viewId: string;
  readonly passportId: string;
  readonly viewType: AgentPassportViewType;

  readonly generatedAt: string;
  readonly generatedBy: string;

  readonly subject: Readonly<Record<string, unknown>>;
  readonly status: string;

  readonly claims: readonly AgentPassportClaim[];

  readonly evidenceReferences: readonly PassportEvidenceReference[];

  readonly provenance: AgentPassportViewProvenance;
  readonly integrity: AgentPassportViewIntegrity;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verification depth (mission section 45). `STRUCTURAL` checks only the
 * Passport's own event chain and lifecycle; `REFERENTIAL` additionally
 * confirms referenced Governance Records/Evidence Bundles exist;
 * `FULL_INTERNAL` additionally verifies referenced integrity where
 * accessible. None of these is "legal verification" -- see Known
 * Limitations.
 */
export type AgentPassportVerificationMode = 'STRUCTURAL' | 'REFERENTIAL' | 'FULL_INTERNAL';

export interface PassportVerificationFailure {
  readonly check: string;
  readonly message: string;
}

export interface AgentPassportVerificationResult {
  readonly passportId: string;
  readonly valid: boolean;

  readonly status: AgentPassportStatus;

  readonly mode: AgentPassportVerificationMode;

  readonly checks: {
    readonly eventChain: boolean;
    readonly lifecycle: boolean;
    readonly identityBinding: boolean;
    readonly organizationBinding: boolean;
    readonly capabilities: boolean;
    readonly authorities: boolean;
    readonly delegations: boolean;
    readonly governanceReferences: boolean;
    readonly evidenceReferences: boolean;
    readonly version: boolean;
  };

  readonly failures: readonly PassportVerificationFailure[];

  readonly verifiedAt: string;
}

// ---------------------------------------------------------------------------
// Access, idempotency, append, health
// ---------------------------------------------------------------------------

/**
 * The authorization scope the Enterprise Host resolved for a Passport Store
 * call. The Passport Runtime does not authenticate anyone (mission section
 * 31) -- Enterprise resolves and hands it this context, exactly the same
 * shape and enforcement model as `GovernanceStoreAccessContext`.
 */
export interface PassportAccessContext {
  readonly organizationId?: string;
  readonly actorId?: string;
  readonly system: boolean;
}

export interface AppendPassportEventInput {
  readonly passportId: string;
  readonly organizationId: string;
  readonly eventType: AgentPassportEventType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly actorId: string;
  readonly actorType: string;
  readonly occurredAt?: string;
  /** Present only on the `AgentPassportCreated` event of a new Passport (mission section 29): the Store records this idempotency claim atomically with the append. */
  readonly idempotency?: PassportIdempotencyContext;
}

export interface AppendPassportEventResult {
  readonly event: AgentPassportEvent;
  readonly passport: AgentPassport;
}

/** Structured reconstruction result -- complete, or explicitly incomplete/corrupted with the missing pieces named, mirroring `GovernanceRecordLoadResult`. */
export interface AgentPassportLoadResult {
  readonly status: 'complete' | 'incomplete' | 'corrupted';
  readonly passport?: AgentPassport;
  readonly missingComponents: readonly string[];
  readonly integrityFailures: readonly string[];
}

export interface AgentPassportStoreHealth {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';

  readonly readable: boolean;
  readonly writable: boolean;

  readonly schemaVersion: string;
  readonly migrationState: string;

  readonly checkedAt: string;
}

/** Caller-supplied idempotency key plus the tenant scope it is unique within, mirroring `GovernanceIdempotencyContext`. */
export interface PassportIdempotencyContext {
  readonly idempotencyKey: string;
  readonly scope: string;
}

/** Pre-append idempotency resolution input (mission section 29). `subjectDigest` is a canonical digest of the issuance subject, so a replayed key with a different subject is detected as a conflict rather than silently returning the wrong Passport. */
export interface PassportIdempotencyProbe {
  readonly idempotency: PassportIdempotencyContext;
  readonly subjectDigest: string;
}

export type PassportIdempotencyResolution =
  | { readonly kind: 'new' }
  | { readonly kind: 'replay'; readonly passportId: string }
  | { readonly kind: 'conflict' };
