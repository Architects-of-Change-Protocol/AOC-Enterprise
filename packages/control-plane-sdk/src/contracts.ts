/**
 * Control plane SDK facade contracts.
 *
 * NOTE: Capability/consent/scoped-access primitives are imported from
 * AOC-Protocol. Verified actor identity claims are Enterprise-owned (see
 * `@aoc-enterprise/identity`) -- AOC Protocol governance determined identity
 * claims are not part of its public API.
 */

import type {
  CapabilityToken,
  ConsentGrant,
  ScopedAccessRequest,
} from '@aoc/protocol';
import type { VerifiedActorClaims } from '@aoc-enterprise/identity';

import type {
  EnterprisePolicyEvaluationRequest,
  EnterprisePolicyEvaluationResponse,
} from '@aoc-enterprise/policy-runtime';

export interface ControlPlaneEvaluationInput {
  caller: VerifiedActorClaims;
  capability: CapabilityToken;
  consentGrants: ConsentGrant[];
  access: ScopedAccessRequest;
  tenantId: string;
  orgId: string;
}

export interface ControlPlaneFacadeContract {
  evaluatePolicy(input: ControlPlaneEvaluationInput): Promise<EnterprisePolicyEvaluationResponse>;
  buildPolicyRequest(input: ControlPlaneEvaluationInput): EnterprisePolicyEvaluationRequest;
}
