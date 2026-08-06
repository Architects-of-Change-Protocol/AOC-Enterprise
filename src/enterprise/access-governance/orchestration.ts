import type { EnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import { resolveGovernanceAccessContext } from '../orchestration/governance-read-service.js';
import type { RevokeOutcome } from './contracts.js';
import type { AccessGrantService, RevokeAccessGrantRequest } from './service.js';

export interface RevokeGrantRequestInput {
  /** `undefined` when the caller is genuinely anonymous — the same convention `evaluateGovernanceRequest` uses. */
  readonly authorizationHeader?: string;
  readonly grantId: string;
  readonly reason: RevokeAccessGrantRequest['reason'];
  readonly requestedBy: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
  readonly correlationId?: string;
  readonly revokedAt?: string;
}

export interface RevokeGrantRequestDependencies {
  readonly service: AccessGrantService;
  readonly configuration: EnterpriseConfiguration;
}

/**
 * The one, authoritative, authenticated entry point for revocation Slice 1
 * asks for — conceptually `revokeGrant(grantId, reason, requestedBy)`.
 *
 * Authenticates the caller (step 1 of the Slice 1 orchestration ordering)
 * BEFORE `AccessGrantService.revokeGrant` (step 2 onward) ever runs, reusing
 * the exact same credential resolution `evaluateGovernanceRequest`
 * (`../orchestration/evaluate-governance-request.ts`) and the read-side
 * Governance Store surface already use
 * (`resolveGovernanceAccessContext`, `../orchestration/governance-read-service.ts`)
 * — no second, independent authentication implementation. When
 * `configuration.features.requireAuthentication` is `false` (local/dev
 * posture), every caller resolves to `{ system: true }`, matching the rest
 * of the Enterprise Host's own trust model; this is a deployment posture,
 * never a per-module override.
 *
 * This is the ONLY path this module exposes that accepts a raw
 * `authorizationHeader` — `AccessGrantService.revokeGrant` itself always
 * requires an already-resolved `AccessGovernanceContext` and never touches
 * a credential (Slice 1 security requirement: "No new public or internal
 * orchestration path may permit unauthenticated revocation").
 */
export async function revokeGrantRequest(input: RevokeGrantRequestInput, deps: RevokeGrantRequestDependencies): Promise<RevokeOutcome> {
  const context = resolveGovernanceAccessContext(input.authorizationHeader, deps.configuration);
  return deps.service.revokeGrant(context, {
    grantId: input.grantId,
    reason: input.reason,
    requestedBy: input.requestedBy,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    ...(input.revokedAt !== undefined ? { revokedAt: input.revokedAt } : {}),
  });
}
