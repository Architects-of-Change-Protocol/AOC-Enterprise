/**
 * Enterprise policy-runtime orchestration contracts.
 *
 * NOTE: Capability token, consent grant, scoped access grammar, and audit
 * envelope primitives are canonical in AOC-Protocol. Verified actor identity
 * claims are Enterprise-owned (see `@aoc-enterprise/identity`) -- AOC Protocol
 * governance determined identity claims are not part of its public API.
 */

import type {
  CapabilityToken,
  ConsentGrant,
  ScopedAccessRequest,
  AuditEventEnvelope,
} from '@aoc/protocol';
import type { VerifiedActorClaims } from '@aoc-enterprise/identity';

export interface EnterprisePolicyEvaluationRequest {
  requestId: string;
  tenantId: string;
  orgId: string;
  principal: VerifiedActorClaims;
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
