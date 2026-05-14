/**
 * Enterprise policy-runtime orchestration contracts.
 *
 * NOTE: Identity, capability token, consent grant, scoped access grammar,
 * and audit envelope primitives are canonical in AOC-Protocol.
 * Import paths below are placeholders until package wiring is finalized.
 */

// Placeholder imports from AOC-Protocol canonical contracts.
import type {
  AocIdentityClaims,
  CapabilityToken,
  ConsentGrant,
  ScopedAccessRequest,
  AuditEventEnvelope,
} from '@aoc/protocol/contracts';

export interface EnterprisePolicyEvaluationRequest {
  requestId: string;
  tenantId: string;
  orgId: string;
  principal: AocIdentityClaims;
  capability: CapabilityToken;
  consentGrants: ConsentGrant[];
  access: ScopedAccessRequest;
  context?: Record<string, unknown>;
}

export type EnterprisePolicyDecision = 'allow' | 'deny' | 'allow-with-obligations';

export interface EnterprisePolicyObligation {
  type: string;
  params?: Record<string, unknown>;
}

export interface EnterprisePolicyEvaluationResponse {
  requestId: string;
  decision: EnterprisePolicyDecision;
  reasonCodes: string[];
  obligations?: EnterprisePolicyObligation[];
  policyRevisionId: string;
  decisionId: string;
  audit?: AuditEventEnvelope;
}
