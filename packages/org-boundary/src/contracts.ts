/**
 * Organization boundary orchestration contracts.
 *
 * NOTE: Scoped access grammar is canonical in AOC-Protocol.
 */

import type { ScopedAccessRequest } from '@aoc/protocol';

export interface OrgBoundary {
  orgId: string;
  tenantId: string;
  namespace: string;
  allowedScopes: string[];
}

export interface OrgBoundaryCheckRequest {
  orgId: string;
  tenantId: string;
  access: ScopedAccessRequest;
}

export interface OrgBoundaryCheckResponse {
  allowed: boolean;
  reasonCodes: string[];
  matchedBoundaryId?: string;
}
