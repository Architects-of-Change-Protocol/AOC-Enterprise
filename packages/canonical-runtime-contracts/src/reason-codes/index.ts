export * from './grant.js';
export * from './delegation.js';
export * from './claim.js';
export * from './governance.js';
export * from './audit.js';
export * from './boundary.js';
export * from './integration.js';
export * from './runtime.js';

import type { GrantReasonCode } from './grant.js';
import type { DelegationReasonCode } from './delegation.js';
import type { ClaimReasonCode } from './claim.js';
import type { GovernanceReasonCode } from './governance.js';
import type { AuditReasonCode } from './audit.js';
import type { BoundaryReasonCode } from './boundary.js';
import type { IntegrationReasonCode } from './integration.js';
import type { RuntimeReasonCode } from './runtime.js';

import {
  GRANT_REASON_CODES,
} from './grant.js';
import {
  DELEGATION_REASON_CODES,
} from './delegation.js';
import {
  CLAIM_REASON_CODES,
} from './claim.js';
import {
  GOVERNANCE_REASON_CODES,
} from './governance.js';
import {
  AUDIT_REASON_CODES,
} from './audit.js';
import {
  BOUNDARY_REASON_CODES,
} from './boundary.js';
import {
  INTEGRATION_REASON_CODES,
} from './integration.js';
import {
  RUNTIME_REASON_CODES,
} from './runtime.js';

export type CanonicalReasonCode =
  | GrantReasonCode
  | DelegationReasonCode
  | ClaimReasonCode
  | GovernanceReasonCode
  | AuditReasonCode
  | BoundaryReasonCode
  | IntegrationReasonCode
  | RuntimeReasonCode;

export const ALL_REASON_CODES = {
  ...GRANT_REASON_CODES,
  ...DELEGATION_REASON_CODES,
  ...CLAIM_REASON_CODES,
  ...GOVERNANCE_REASON_CODES,
  ...AUDIT_REASON_CODES,
  ...BOUNDARY_REASON_CODES,
  ...INTEGRATION_REASON_CODES,
  ...RUNTIME_REASON_CODES,
} as const;
