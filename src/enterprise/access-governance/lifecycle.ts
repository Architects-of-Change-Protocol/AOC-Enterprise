import { AccessGovernanceError } from './errors.js';
import type { AccessGrantStatus } from './contracts.js';

/**
 * The AccessGrant lifecycle state machine — deliberately two states,
 * `'active' -> 'revoked'`, exactly mirroring `EnterpriseAccessGrantStatus`
 * (`@aoc-enterprise/access-grant`, R004.G). Unlike `AgentPassportStatus`'s
 * six-state machine (draft/active/suspended/revoked/expired/retired), this
 * module has no suspend/reactivate/retire transitions -- `EnterpriseAccessGrant`
 * itself was deliberately designed with only two states (see its own
 * "'expired' is deliberately not a status value" rationale), and this
 * durable projection does not invent a third.
 */
export function assertRevocable(status: AccessGrantStatus): void {
  if (status === 'revoked') {
    throw new AccessGovernanceError('ACCESS_GRANT_NOT_ACTIVE', 'This Access Grant has already been revoked.');
  }
}

export function assertActive(status: AccessGrantStatus): void {
  if (status !== 'active') {
    throw new AccessGovernanceError('ACCESS_GRANT_NOT_ACTIVE', 'This Access Grant is not active; no new provider credential may be issued under it.');
  }
}
