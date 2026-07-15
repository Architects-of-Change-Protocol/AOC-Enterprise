/**
 * Integration runtime orchestration contracts.
 *
 * NOTE: Capability token constraints originate in AOC-Protocol. Verified actor
 * identity claims are Enterprise-owned (see `@aoc-enterprise/identity`) -- AOC
 * Protocol governance determined identity claims are not part of its public API.
 */

import type { CapabilityToken } from '@aoc/protocol';
import type { VerifiedActorClaims } from '@aoc-enterprise/identity';

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
  registeredBy: VerifiedActorClaims;
  registrationCapability?: CapabilityToken;
  metadata?: Record<string, unknown>;
}

export interface IntegrationAdapterRegistrationResult {
  adapterId: string;
  accepted: boolean;
  reasonCodes: string[];
  registeredAt?: string;
}
