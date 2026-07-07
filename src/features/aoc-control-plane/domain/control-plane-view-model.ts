import type { AocGovernanceSource } from './control-plane-navigation.js';
import type { AocDecisionStatus, AocControlPlaneHealth } from './control-plane-status.js';
import type { AocMetric } from './control-plane-metric.js';
import type { AocTimelineItem } from './control-plane-timeline.js';
import type { ProofChainRow, ProofReferenceRow } from './control-plane-proof-reference.js';

export interface AocDecisionSummary {
  readonly id: string;
  readonly source: AocGovernanceSource;
  readonly type: string;
  readonly status: AocDecisionStatus;
  readonly actorId?: string;
  readonly action?: string;
  readonly resourceScope?: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly proofId?: string;
  readonly proofHash?: string;
  readonly createdAt: string;
}

export interface AocOpenItem {
  readonly id: string;
  readonly source: AocGovernanceSource;
  readonly title: string;
  readonly description: string;
  readonly severity: 'info' | 'warning' | 'danger';
  readonly relatedId?: string;
}

export interface AocOverviewViewModel {
  readonly metrics: readonly AocMetric[];
  readonly health: AocControlPlaneHealth;
  readonly recentDecisions: readonly AocDecisionSummary[];
  readonly openItems: readonly AocOpenItem[];
}

// --- Recognition ---

export interface RecognizedActorRow {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly trustDomainId: string;
  readonly displayName?: string;
  readonly createdAt?: string;
}

export interface PassportRow {
  readonly id: string;
  readonly actorId: string;
  readonly issuerActorId: string;
  readonly trustDomainId: string;
  readonly status: string;
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly passportHash?: string;
}

export interface CapabilityTokenRow {
  readonly id: string;
  readonly subjectActorId: string;
  readonly issuerActorId: string;
  readonly trustDomainId: string;
  readonly status: string;
  readonly allowedActions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly requiresEvidence: boolean;
  readonly requiresHumanApproval: boolean;
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly tokenHash?: string;
}

export interface RecognitionDecisionRow {
  readonly id: string;
  readonly requestId: string;
  readonly type: string;
  readonly recognized: boolean;
  readonly actorId: string;
  readonly trustDomainId: string;
  readonly reasonCode: string;
  /** Recognition Runtime's audit trail persists reasonCode but not the original free-text reason; populated only when recovered from a linked EnforcementDecision. */
  readonly reason?: string;
  readonly evaluatedAt: string;
  readonly auditEventId: string;
}

export interface AuditEventRow {
  readonly id: string;
  readonly eventType: string;
  readonly actorId: string;
  readonly trustDomainId: string;
  readonly timestamp: string;
  readonly eventHash: string;
  readonly previousHash?: string;
}

export interface RecognitionViewModel {
  readonly actors: readonly RecognizedActorRow[];
  readonly passports: readonly PassportRow[];
  readonly capabilityTokens: readonly CapabilityTokenRow[];
  readonly decisions: readonly RecognitionDecisionRow[];
  readonly auditEvents: readonly AuditEventRow[];
}

// --- Authority ---

export interface AuthorityGrantRow {
  readonly id: string;
  readonly issuerActorId: string;
  readonly subjectActorId: string;
  readonly trustDomainId: string;
  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly status: string;
  readonly canDelegate: boolean;
  readonly issuedAt: string;
  readonly expiresAt?: string;
}

export interface DelegationGrantRow {
  readonly id: string;
  readonly delegatorActorId: string;
  readonly delegateActorId: string;
  readonly principalActorId: string;
  readonly trustDomainId: string;
  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly status: string;
  readonly delegationDepth: number;
  readonly canRedelegate: boolean;
  readonly issuedAt: string;
  readonly expiresAt?: string;
}

export interface RoleAssignmentRow {
  readonly id: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly trustDomainId: string;
  readonly status: string;
  readonly assignedAt: string;
  readonly expiresAt?: string;
}

export interface AuthorityDecisionRow {
  readonly id: string;
  readonly requestId: string;
  readonly type: string;
  readonly valid: boolean;
  readonly actorId: string;
  readonly principalActorId?: string;
  readonly trustDomainId: string;
  readonly reasonCode: string;
  readonly reason?: string;
  readonly proofId?: string;
  readonly evaluatedAt: string;
}

export interface AuthorityProofRow {
  readonly id: string;
  readonly requestId: string;
  readonly authorityDecisionId: string;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly decisionType: string;
  readonly valid: boolean;
  readonly proofHash: string;
  readonly previousHash?: string;
  readonly createdAt: string;
}

export interface AuthorityViewModel {
  readonly grants: readonly AuthorityGrantRow[];
  readonly delegations: readonly DelegationGrantRow[];
  readonly roleAssignments: readonly RoleAssignmentRow[];
  readonly decisions: readonly AuthorityDecisionRow[];
  readonly proofs: readonly AuthorityProofRow[];
}

// --- Approvals ---

export interface ApprovalRequestRow {
  readonly id: string;
  readonly trustDomainId: string;
  readonly actionRequestId: string;
  readonly requestedByActorId: string;
  readonly targetActorId: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly riskLevel: string;
  readonly status: string;
  readonly minimumApprovals: number;
  readonly currentApprovals: number;
  readonly requiresSegregationOfDuties: boolean;
  readonly createdAt: string;
  readonly expiresAt?: string;
}

export interface ApprovalEvidenceItemRow {
  readonly id: string;
  readonly type: string;
  readonly providedByActorId: string;
  readonly description?: string;
  readonly createdAt: string;
}

export interface ApprovalDecisionRow {
  readonly id: string;
  readonly approvalRequestId: string;
  readonly type: string;
  readonly approved: boolean;
  readonly approverActorId?: string;
  readonly reasonCode: string;
  readonly reason?: string;
  readonly evidenceReviewed: readonly ApprovalEvidenceItemRow[];
  readonly decidedAt: string;
}

export interface ApprovalProofRow {
  readonly id: string;
  readonly approvalRequestId: string;
  readonly approvalDecisionId: string;
  readonly trustDomainId: string;
  readonly status: string;
  readonly approved: boolean;
  readonly proofHash: string;
  readonly previousHash?: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
}

export interface ApprovalViewModel {
  readonly requests: readonly ApprovalRequestRow[];
  readonly decisions: readonly ApprovalDecisionRow[];
  readonly proofs: readonly ApprovalProofRow[];
  readonly pendingCount: number;
}

// --- External Agents ---

export interface ExternalAgentRow {
  readonly id: string;
  readonly displayName: string;
  readonly type: string;
  readonly status: string;
  readonly externalIssuerId?: string;
  readonly externalTrustDomainId?: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt?: string;
}

export interface HandshakeRequestRow {
  readonly id: string;
  readonly externalAgentId: string;
  readonly localTrustDomainId: string;
  readonly status: string;
  readonly requestedActions: readonly string[];
  readonly requestedResourceScopes: readonly string[];
  readonly approvalRequestId?: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
}

export interface AgentVisaRow {
  readonly id: string;
  readonly externalAgentId: string;
  readonly localTrustDomainId: string;
  readonly status: string;
  readonly allowedCapabilities: readonly string[];
  readonly allowedActions: readonly string[];
  readonly allowedResourceScopes: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt?: string;
}

export interface IngressGrantRow {
  readonly id: string;
  readonly agentVisaId: string;
  readonly externalAgentId: string;
  readonly localTrustDomainId: string;
  readonly status: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly capabilities: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt?: string;
}

export interface TrustBoundaryRow {
  readonly id: string;
  readonly localTrustDomainId: string;
  readonly externalIssuerId?: string;
  readonly status: string;
  readonly allowedAgentTypes: readonly string[];
  readonly requiresApprovalForUnknownIssuers: boolean;
  readonly requiresApprovalForHighRisk: boolean;
  readonly maxVisaTtlMinutes: number;
}

export interface ExternalAgentsViewModel {
  readonly externalAgents: readonly ExternalAgentRow[];
  readonly handshakeRequests: readonly HandshakeRequestRow[];
  readonly visas: readonly AgentVisaRow[];
  readonly ingressGrants: readonly IngressGrantRow[];
  readonly trustBoundaries: readonly TrustBoundaryRow[];
}

// --- Enforcement ---

export interface EnforcementRequestRow {
  readonly id: string;
  readonly mode: string;
  readonly status: string;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly principalActorId?: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly targetType: string;
  readonly targetName: string;
  readonly sideEffectType: string;
  readonly idempotencyKey?: string;
  readonly submittedAt: string;
}

export interface EnforcementDecisionRow {
  readonly id: string;
  readonly enforcementRequestId: string;
  readonly type: string;
  readonly allowedToExecute: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly recognitionDecisionId?: string;
  readonly authorityProofId?: string;
  readonly approvalProofId?: string;
  readonly handshakeProofId?: string;
  readonly decidedAt: string;
}

export interface ExecutionResultRow {
  readonly id: string;
  readonly enforcementRequestId: string;
  readonly enforcementDecisionId: string;
  readonly status: string;
  readonly executed: boolean;
  readonly errorMessage?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface SideEffectRow {
  readonly id: string;
  readonly enforcementRequestId: string;
  readonly type: string;
  readonly status: string;
  readonly executed: boolean;
  readonly description?: string;
  readonly plannedAt: string;
  readonly executedAt?: string;
}

export interface EnforcementViolationRow {
  readonly id: string;
  readonly enforcementRequestId: string;
  readonly type: string;
  readonly severity: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly detectedAt: string;
}

export interface EnforcementProofRow {
  readonly id: string;
  readonly enforcementRequestId: string;
  readonly enforcementDecisionId: string;
  readonly allowedToExecute: boolean;
  readonly executed: boolean;
  readonly recognitionDecisionId?: string;
  readonly authorityProofId?: string;
  readonly approvalProofId?: string;
  readonly handshakeProofId?: string;
  readonly proofHash: string;
  readonly previousHash?: string;
  readonly createdAt: string;
}

export interface EnforcementViewModel {
  readonly requests: readonly EnforcementRequestRow[];
  readonly decisions: readonly EnforcementDecisionRow[];
  readonly results: readonly ExecutionResultRow[];
  readonly sideEffects: readonly SideEffectRow[];
  readonly violations: readonly EnforcementViolationRow[];
  readonly proofs: readonly EnforcementProofRow[];
}

// --- Proofs ---

export interface ProofsViewModel {
  readonly recognitionProofs: readonly ProofReferenceRow[];
  readonly authorityProofs: readonly ProofReferenceRow[];
  readonly approvalProofs: readonly ProofReferenceRow[];
  readonly handshakeProofs: readonly ProofReferenceRow[];
  readonly enforcementProofs: readonly ProofReferenceRow[];
  readonly proofChains: readonly ProofChainRow[];
}

// --- Root read model ---

export interface AocControlPlaneReadModel {
  readonly trustDomainId: string;
  readonly generatedAt: string;
  readonly overview: AocOverviewViewModel;
  readonly recognition: RecognitionViewModel;
  readonly authority: AuthorityViewModel;
  readonly approvals: ApprovalViewModel;
  readonly externalAgents: ExternalAgentsViewModel;
  readonly enforcement: EnforcementViewModel;
  readonly proofs: ProofsViewModel;
  readonly timeline: readonly AocTimelineItem[];
}
