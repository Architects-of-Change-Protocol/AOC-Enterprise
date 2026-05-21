/**
 * Control plane SDK facade contracts.
 *
 * NOTE: Identity/capability/consent/scoped-access primitives are imported from AOC-Protocol.
 */

import type {
  AocIdentityClaims,
  CapabilityToken,
  ConsentGrant,
  ScopedAccessRequest,
} from '@aoc/protocol';

import type {
  EnterprisePolicyEvaluationRequest,
  EnterprisePolicyEvaluationResponse,
} from '@aoc-enterprise/policy-runtime';

export interface ControlPlaneEvaluationInput {
  caller: AocIdentityClaims;
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
