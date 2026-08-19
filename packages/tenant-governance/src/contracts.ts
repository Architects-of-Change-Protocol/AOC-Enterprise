/**
 * Tenant governance orchestration contracts for Soberanía Enterprise.
 *
 * NOTE: Capability semantics are owned by AOC-Protocol. Verified actor
 * identity claims are Enterprise-owned (see `@aoc-enterprise/identity`) --
 * Soberanía Protocol governance determined identity claims are not part of its
 * public API.
 */

import type { CapabilityToken } from '@aoc/protocol';
import type { VerifiedActorClaims } from '@aoc-enterprise/identity';

export interface TenantGovernanceContext {
  tenantId: string;
  actor: VerifiedActorClaims;
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
