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
} from '@aoc/protocol/contracts';

import type {
  EnterprisePolicyEvaluationRequest,
  EnterprisePolicyEvaluationResponse,
} from '../../policy-runtime/src/contracts';

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
