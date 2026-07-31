/**
 * Canonical model of AOC Runtime Authority v1 -- the external governance and
 * enforcement layer that decides whether an agent runtime may act, what it
 * may do, for how long, and under which authority.
 *
 * Core principle (see `docs/architecture/ADR-RUNTIME-AUTHORITY.md`): the
 * runtime is never the source of truth for its own authorization. It may
 * request authority; it cannot grant, extend, restore, or revoke it. Every
 * protected action is decided by `gateway.ts` -- outside the agent process --
 * against a short-lived, Ed25519-signed `AuthorityLeasePayload` and the
 * live `GovernedRuntime` state. `AgentPassport` (`../passport/`) remains the
 * canonical *identity/provenance* record for an agent as an entity; a
 * `GovernedAgent` here is deliberately narrower -- the authority-facing
 * projection of an agent (status, owning authority, signing key) that the
 * Gateway can check on every single action without touching the Passport's
 * full event-sourced history. A `GovernedAgent` MAY reference a
 * `passportId`; it never duplicates Passport lifecycle semantics.
 */

export const AOC_RUNTIME_AUTHORITY_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Governed Agent
// ---------------------------------------------------------------------------

export type GovernedAgentStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface GovernedAgent {
  readonly agentId: string;
  readonly tenantId: string;
  readonly displayName: string;
  readonly agentType: string;
  readonly ownerAuthorityId: string;
  readonly status: GovernedAgentStatus;
  /** Ed25519 public key (SPKI, base64), when the agent itself holds a key used elsewhere (e.g. handshake). Never a private key. */
  readonly publicKey?: string;
  /** Optional cross-reference to the canonical identity/provenance record. Never duplicated -- see `../passport/contracts.ts`. */
  readonly passportId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly suspendedReason?: string;
  readonly revokedReason?: string;
}

// ---------------------------------------------------------------------------
// Governed Runtime -- the state machine
// ---------------------------------------------------------------------------

export type GovernedRuntimeState =
  | 'CREATED'
  | 'AUTHORIZED'
  | 'RUNNING'
  | 'PAUSED'
  | 'ISOLATED'
  | 'QUARANTINED'
  | 'TERMINATED';

/**
 * The explicit transition matrix (mission section 3.2). `TERMINATED` has no
 * outgoing edges -- irreversible by construction, not by convention.
 * `state-machine.ts` is the only place this table is consulted.
 */
export const GOVERNED_RUNTIME_TRANSITIONS: Readonly<Record<GovernedRuntimeState, readonly GovernedRuntimeState[]>> = {
  CREATED: ['AUTHORIZED'],
  AUTHORIZED: ['RUNNING'],
  RUNNING: ['PAUSED', 'ISOLATED', 'QUARANTINED', 'TERMINATED'],
  PAUSED: ['RUNNING', 'ISOLATED', 'TERMINATED'],
  ISOLATED: ['QUARANTINED', 'TERMINATED'],
  QUARANTINED: ['TERMINATED'],
  TERMINATED: [],
};

export const GOVERNED_RUNTIME_TERMINAL_STATES: readonly GovernedRuntimeState[] = ['TERMINATED'];

/** States in which the Gateway may authorize a protected action. Every other state fails closed. */
export const GOVERNED_RUNTIME_ACTIONABLE_STATES: readonly GovernedRuntimeState[] = ['RUNNING'];

export interface GovernedRuntime {
  readonly runtimeId: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly environmentId: string;
  readonly state: GovernedRuntimeState;
  readonly policyVersion: string;
  readonly riskScore: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly terminatedAt?: string;
  /** Denormalized for the control UI/dashboard -- who last issued a control action and why. Never authoritative; the evidence chain is authoritative. */
  readonly lastControlAction?: {
    readonly action: string;
    readonly actorId: string;
    readonly reason: string;
    readonly severity: RuntimeControlSeverity;
    readonly occurredAt: string;
  };
  readonly lastLeaseIssuedBy?: string;
}

// ---------------------------------------------------------------------------
// Capability Grant
// ---------------------------------------------------------------------------

export type CapabilityGrantStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface RuntimeCapabilityGrant {
  readonly grantId: string;
  readonly tenantId: string;
  readonly runtimeId: string;
  readonly agentId: string;
  readonly capability: string;
  readonly resourceScope: Readonly<Record<string, unknown>>;
  readonly constraints: Readonly<Record<string, unknown>>;
  readonly issuedBy: string;
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
  readonly revokedBy?: string;
  readonly revokedReason?: string;
  readonly status: CapabilityGrantStatus;
}

/**
 * Capabilities that must never be grantable through this vertical slice
 * (mission section 8). The Gateway's policy step (`POLICY_DENIED`) rejects
 * these unconditionally, independent of any grant a caller manages to
 * construct -- defense in depth against a mis-issued grant.
 */
export const PROHIBITED_CAPABILITIES: readonly string[] = [
  'project.delete',
  'task.delete',
  'database.raw_query',
  'shell.execute',
  'internet.unrestricted',
  'credential.read',
  'deployment.write',
  'billing.write',
  'user.invite',
];

// ---------------------------------------------------------------------------
// Authority Lease
// ---------------------------------------------------------------------------

/** Default MVP lease duration (mission section 3.4). */
export const DEFAULT_LEASE_TTL_SECONDS = 30;

export interface AuthorityLeasePayload {
  readonly leaseId: string;
  readonly tenantId: string;
  readonly runtimeId: string;
  readonly agentId: string;
  readonly capabilities: readonly string[];
  readonly policyVersion: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly nonce: string;
  readonly keyId: string;
}

/** The wire form of a lease: canonical payload plus its Ed25519 signature (base64, raw 64-byte Ed25519 signature). */
export interface SignedAuthorityLease {
  readonly payload: AuthorityLeasePayload;
  readonly signature: string;
}

export type LeaseStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'SUPERSEDED';

/**
 * What the Lease Store actually persists. Per mission section 3.4 ("token
 * hashes, not raw sensitive tokens, should be persisted when possible") this
 * keeps the payload (non-secret, needed to answer "was leaseId X ever valid
 * for runtime Y") plus a digest of the full signed lease for integrity
 * cross-checks -- it never stores the caller's copy of the signature as a
 * reusable bearer credential.
 */
export interface LeaseRecord {
  readonly leaseId: string;
  readonly payload: AuthorityLeasePayload;
  readonly leaseDigest: string;
  status: LeaseStatus;
  readonly issuedBy: string;
  readonly consumedNonces: Set<string>;
  revokedAt?: string;
  revokedBy?: string;
  revokedReason?: string;
  supersededBy?: string;
}

// ---------------------------------------------------------------------------
// Emergency control plane
// ---------------------------------------------------------------------------

export type RuntimeControlSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RuntimeControlRequest {
  readonly reason: string;
  readonly requestedBy: string;
  readonly severity: RuntimeControlSeverity;
  readonly correlationId?: string;
}

// ---------------------------------------------------------------------------
// Enforcement Gateway
// ---------------------------------------------------------------------------

export interface ProtectedActionRequest {
  readonly tenantId: string;
  readonly runtimeId: string;
  readonly agentId: string;
  readonly capability: string;
  readonly resource: Readonly<Record<string, unknown>>;
  readonly lease: SignedAuthorityLease;
  /** Anti-replay: unique per logical action attempt. Reusing one against the same lease is a replay. */
  readonly requestNonce: string;
  readonly correlationId: string;
}

/**
 * Typed, machine-readable denial codes (mission section 4). Deliberately
 * SCREAMING_SNAKE_CASE and namespaced only within this module -- these are
 * the exact strings the mission specifies as the Gateway's wire vocabulary,
 * distinct from (and not a replacement for) the lowercase reason codes in
 * `@aoc-enterprise/canonical-runtime-contracts`, which govern the
 * request-scoped Kernel/authorization pipeline this Gateway sits in front
 * of, not runtime-lifecycle authority.
 */
export const GATEWAY_DENIAL_CODES = [
  'RUNTIME_NOT_FOUND',
  'RUNTIME_NOT_RUNNING',
  'RUNTIME_PAUSED',
  'RUNTIME_ISOLATED',
  'RUNTIME_QUARANTINED',
  'RUNTIME_TERMINATED',
  'AGENT_NOT_FOUND',
  'AGENT_SUSPENDED',
  'AGENT_REVOKED',
  'LEASE_INVALID',
  'LEASE_EXPIRED',
  'LEASE_REVOKED',
  'LEASE_REPLAYED',
  'LEASE_RUNTIME_MISMATCH',
  'LEASE_AGENT_MISMATCH',
  'LEASE_TENANT_MISMATCH',
  'CAPABILITY_NOT_GRANTED',
  'CAPABILITY_REVOKED',
  'RESOURCE_OUT_OF_SCOPE',
  'POLICY_DENIED',
  'EMERGENCY_DENIED',
  'AUTHORITY_SERVICE_UNAVAILABLE',
] as const;

export type GatewayDenialCode = (typeof GATEWAY_DENIAL_CODES)[number];

export interface GatewayDecision {
  readonly decision: 'ALLOW' | 'DENY';
  readonly code?: GatewayDenialCode;
  readonly reason: string;
  readonly correlationId: string;
  readonly evidenceEventId: string;
  readonly checkedAt: string;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const RUNTIME_EVIDENCE_EVENT_TYPES = [
  'AGENT_REGISTERED',
  'AGENT_SUSPENDED',
  'AGENT_REVOKED',
  'RUNTIME_CREATED',
  'RUNTIME_AUTHORIZED',
  'RUNTIME_STARTED',
  'RUNTIME_PAUSED',
  'RUNTIME_RESUMED',
  'RUNTIME_ISOLATED',
  'RUNTIME_QUARANTINED',
  'RUNTIME_TERMINATED',
  'CAPABILITY_GRANTED',
  'CAPABILITY_REVOKED',
  'LEASE_ISSUED',
  'LEASE_RENEWED',
  'LEASE_EXPIRED',
  'LEASE_REVOKED',
  'ACTION_REQUESTED',
  'ACTION_AUTHORIZED',
  'ACTION_DENIED',
  'ACTION_EXECUTION_STARTED',
  'ACTION_EXECUTED',
  'ACTION_FAILED',
  'POLICY_EVALUATED',
  'ANOMALY_DETECTED',
] as const;

export type RuntimeEvidenceEventType = (typeof RUNTIME_EVIDENCE_EVENT_TYPES)[number];

export type RuntimeEvidenceActorType = 'HUMAN' | 'POLICY' | 'SYSTEM' | 'AGENT';

export interface RuntimeEvidenceEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly runtimeId: string;
  readonly agentId?: string;
  readonly eventType: RuntimeEvidenceEventType;
  readonly actorType: RuntimeEvidenceActorType;
  readonly actorId: string;
  readonly capability?: string;
  readonly resource?: Readonly<Record<string, unknown>>;
  readonly decision?: 'ALLOW' | 'DENY';
  readonly reason?: string;
  readonly policyVersion?: string;
  readonly leaseId?: string;
  readonly correlationId: string;
  readonly previousHash?: string;
  readonly eventHash: string;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
