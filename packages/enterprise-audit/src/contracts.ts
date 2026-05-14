/**
 * Enterprise audit routing orchestration contracts.
 *
 * NOTE: Audit envelope shape is canonical in AOC-Protocol.
 */

import type { AuditEventEnvelope, CapabilityToken } from '@aoc/protocol/contracts';

export interface EnterpriseAuditRoute {
  routeId: string;
  sinkType: 'siem' | 'data-lake' | 'event-bus' | 'sovereign-store';
  sinkRef: string;
  tenantId: string;
  orgId?: string;
}

export interface EnterpriseAuditRoutingRequest {
  event: AuditEventEnvelope;
  tenantId: string;
  orgId?: string;
  actorCapability?: CapabilityToken;
}

export interface EnterpriseAuditRoutingDecision {
  routeIds: string[];
  dropped: boolean;
  reasonCodes: string[];
}
