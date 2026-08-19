/**
 * Agent governance orchestration contracts.
 *
 * NOTE: Delegated capability semantics come from AOC-Protocol. Verified actor
 * identity claims are Enterprise-owned (see `@aoc-enterprise/identity`) --
 * Soberanía Protocol governance determined identity claims are not part of its
 * public API.
 */

import type { CapabilityToken } from '@aoc/protocol';
import type { VerifiedActorClaims } from '@aoc-enterprise/identity';

export interface GovernedAgentProfile {
  agentId: string;
  tenantId: string;
  orgId: string;
  identity: VerifiedActorClaims;
  baselineCapabilities: CapabilityToken[];
  riskTier: 'low' | 'medium' | 'high' | 'critical';
}

export interface AgentGovernanceCheckRequest {
  agentId: string;
  requestedAction: string;
  tenantId: string;
  orgId: string;
  delegatedCapability?: CapabilityToken;
  context?: Record<string, unknown>;
}

export interface AgentGovernanceCheckResponse {
  allowed: boolean;
  reasonCodes: string[];
  requiredControls?: string[];
}
