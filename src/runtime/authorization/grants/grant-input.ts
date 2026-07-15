import type { CapabilityToken, ConsentGrant } from '@aoc/protocol';
import type { EnterpriseScopedAccessRequest } from '@aoc-enterprise/scoped-access';

export interface AuthorizationGrantInput {
  requestId: string;
  actorId: string;
  capability: CapabilityToken;
  consentGrants: ConsentGrant[];
  access: EnterpriseScopedAccessRequest;
  tenantId: string;
  orgId: string;
}
