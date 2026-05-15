import type { CapabilityToken, ConsentGrant, ScopedAccessRequest } from '@aoc/protocol/contracts';

export interface AuthorizationGrantInput {
  requestId: string;
  actorId: string;
  capability: CapabilityToken;
  consentGrants: ConsentGrant[];
  access: ScopedAccessRequest;
  tenantId: string;
  orgId: string;
}
