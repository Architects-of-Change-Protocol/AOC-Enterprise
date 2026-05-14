/**
 * Tenant governance orchestration contracts for AOC Enterprise.
 *
 * NOTE: Principal identity and capability semantics are owned by AOC-Protocol.
 */

import type { AocIdentityClaims, CapabilityToken } from '@aoc/protocol/contracts';

export interface TenantGovernanceContext {
  tenantId: string;
  actor: AocIdentityClaims;
  actorCapability?: CapabilityToken;
}

export interface TenantPolicyBinding {
  tenantId: string;
  policyBundleId: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface TenantIsolationProfile {
  mode: 'logical' | 'strong' | 'sovereign';
  region?: string;
  keyRootRef?: string;
}

export interface TenantGovernanceContract {
  context: TenantGovernanceContext;
  isolation: TenantIsolationProfile;
  policyBindings: TenantPolicyBinding[];
  tags?: Record<string, string>;
}
