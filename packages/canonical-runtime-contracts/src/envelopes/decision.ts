import type { PolicyDecisionType } from '../governance/decisions.js';
import type { CanonicalObligation } from '../governance/obligations.js';

export interface RuntimeDecisionEnvelope {
  readonly allowed: boolean;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PolicyEvaluationDecisionEnvelope {
  readonly requestId: string;
  readonly decision: PolicyDecisionType;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly obligations?: ReadonlyArray<CanonicalObligation>;
  readonly policyRevisionId: string;
  readonly decisionId: string;
}

export const GRANT_OUTCOME_TYPES = {
  ISSUED: 'issued',
  ALLOWED: 'allowed',
  DENIED: 'denied',
  CONSUMED: 'consumed',
  REVOKED: 'revoked',
  ERROR: 'error',
} as const;

export type GrantOutcomeType = typeof GRANT_OUTCOME_TYPES[keyof typeof GRANT_OUTCOME_TYPES];

export const ACCESS_REQUEST_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
} as const;

export type AccessRequestStatus = typeof ACCESS_REQUEST_STATUSES[keyof typeof ACCESS_REQUEST_STATUSES];

export const GRANT_RECORD_STATUSES = {
  ACTIVE: 'active',
  REVOKED: 'revoked',
} as const;

export type GrantRecordStatus = typeof GRANT_RECORD_STATUSES[keyof typeof GRANT_RECORD_STATUSES];

export const AUDIT_SINK_TYPES = {
  SIEM: 'siem',
  DATA_LAKE: 'data-lake',
  EVENT_BUS: 'event-bus',
  SOVEREIGN_STORE: 'sovereign-store',
} as const;

export type AuditSinkType = typeof AUDIT_SINK_TYPES[keyof typeof AUDIT_SINK_TYPES];

export const INTEGRATION_ADAPTER_KINDS = {
  IDP: 'idp',
  POLICY_ENGINE: 'policy-engine',
  STORAGE: 'storage',
  AUDIT_SINK: 'audit-sink',
  CUSTOM: 'custom',
} as const;

export type IntegrationAdapterKind = typeof INTEGRATION_ADAPTER_KINDS[keyof typeof INTEGRATION_ADAPTER_KINDS];

export const NEGOTIATION_TYPES = {
  FEDERATION_EXPANSION: 'federation_expansion',
  DELEGATION_EXTENSION: 'delegation_extension',
  AI_EXECUTION_REQUEST: 'ai_execution_request',
  TEMPORARY_ISOLATION_EXCEPTION: 'temporary_isolation_exception',
  REMOTE_EXECUTION_AUTHORITY: 'remote_execution_authority',
  TRUST_RECOVERY: 'trust_recovery',
  EMERGENCY_GOVERNANCE: 'emergency_governance',
} as const;

export type RuntimeNegotiationType = typeof NEGOTIATION_TYPES[keyof typeof NEGOTIATION_TYPES];

export const CONTROL_PLANE_EVENT_TYPES = {
  ACCESS_REQUEST_CREATED: 'ACCESS_REQUEST_CREATED',
  ACCESS_REQUEST_APPROVED: 'ACCESS_REQUEST_APPROVED',
  ACCESS_REQUEST_DENIED: 'ACCESS_REQUEST_DENIED',
  GRANT_CREATED: 'GRANT_CREATED',
  GRANT_REVOKED: 'GRANT_REVOKED',
} as const;

export type ControlPlaneEventType = typeof CONTROL_PLANE_EVENT_TYPES[keyof typeof CONTROL_PLANE_EVENT_TYPES];
