/**
 * Agent governance orchestration contracts.
 *
 * NOTE: Agent identity and delegated capability semantics come from AOC-Protocol.
 */

import type { AocIdentityClaims, CapabilityToken } from '@aoc/protocol/contracts';

export interface GovernedAgentProfile {
  agentId: string;
  tenantId: string;
  orgId: string;
  identity: AocIdentityClaims;
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
