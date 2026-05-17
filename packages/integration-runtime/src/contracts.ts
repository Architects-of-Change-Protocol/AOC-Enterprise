/**
 * Integration runtime orchestration contracts.
 *
 * NOTE: Capability token constraints and identity claims originate in AOC-Protocol.
 */

import type { AocIdentityClaims, CapabilityToken } from '@aoc/protocol';

export interface IntegrationAdapterDescriptor {
  adapterId: string;
  kind: 'idp' | 'policy-engine' | 'storage' | 'audit-sink' | 'custom';
  version: string;
  displayName: string;
  declaredScopes: string[];
}

export interface IntegrationAdapterRegistration {
  tenantId: string;
  orgId?: string;
  descriptor: IntegrationAdapterDescriptor;
  registeredBy: AocIdentityClaims;
  registrationCapability?: CapabilityToken;
  metadata?: Record<string, unknown>;
}

export interface IntegrationAdapterRegistrationResult {
  adapterId: string;
  accepted: boolean;
  reasonCodes: string[];
  registeredAt?: string;
}
