import type { EnterpriseGrantRevocationReason } from '@aoc-enterprise/grant-revocation';
import type { PinataProviderClient } from '@aoc-enterprise/pinata-adapter';
import { PINATA_PROVIDER_SYSTEM, executePinataProviderTranslation, pinataRevocationSemanticsForReason } from '@aoc-enterprise/pinata-adapter';
import { ENTERPRISE_PROVIDER_CAPABILITIES } from '@aoc-enterprise/provider-adapter';
import { ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS, ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION } from '@aoc-enterprise/provider-translation';
import type { AccessGrantProviderEnforcementResult, AccessGrantRecord } from './contracts.js';

/**
 * Truthful, Pinata-specific effective-revocation determination (Slice 1's
 * central invariant). This is the ONLY place in this module that decides
 * whether/how to invoke a Pinata provider action for a revocation — it is
 * deliberately the single source of enforcement truth so no second,
 * disagreeing code path can ever compute a different `effectiveRevocationAt`
 * for the same revocation (Slice 1: "Do not create parallel revocation
 * truths").
 *
 * Critical invariant enforced here, by construction, not merely asserted:
 * for `ttl_bounded` mode, `effectiveRevocationAt` is never computed as
 * earlier than `grant.latestOutstandingCredentialExpiresAt` — see the
 * `ttl_bounded` branch below, which sets `effectiveRevocationAt` FROM that
 * value directly, never from `revokedAt`.
 */
export interface DeterminePinataEnforcementInput {
  readonly grant: AccessGrantRecord;
  readonly reason: EnterpriseGrantRevocationReason;
  readonly revokedAt: string;
  readonly correlationId: string;
  /** Absent when no live Pinata credential is configured — see `isPinataAdapterLiveVerificationConfigured`. A `resource_wide` revocation cannot be attempted without one and is honestly reported as `providerActionResult: 'failed'`. */
  readonly client?: PinataProviderClient;
  readonly now: () => string;
}

function secondsBetween(earlier: string, later: string): number {
  return Math.max(0, (Date.parse(later) - Date.parse(earlier)) / 1000);
}

/**
 * Determines, and where truthfully applicable executes, Pinata-side
 * revocation enforcement for one grant. Never invoked for a grant whose
 * `providerSystem` is not `'pinata'` — callers branch on that before
 * reaching this function (see `service.ts`).
 */
export async function determineAndExecutePinataEnforcement(input: DeterminePinataEnforcementInput): Promise<AccessGrantProviderEnforcementResult> {
  const { grant, reason, revokedAt, correlationId, client, now } = input;
  // Guaranteed 'pinata' by this function's own calling contract (see the
  // doc comment above) -- narrowed to a definite `string` here so every
  // return below can assign `providerSystem` directly under
  // `exactOptionalPropertyTypes`.
  const providerSystem = grant.providerSystem ?? PINATA_PROVIDER_SYSTEM;
  const revocationRequestedAt = now();
  const semantics = pinataRevocationSemanticsForReason(reason);

  if (semantics === 'ttl_bounded') {
    const outstandingCredentialExpiresAt = grant.latestOutstandingCredentialExpiresAt;
    // Nothing was ever issued under this grant: there is no outstanding
    // credential to wait out, so revocation is effective the moment future
    // issuance is prevented -- which happens synchronously, in-process,
    // before this function is ever called (see `service.ts`'s revokeGrant).
    const effectiveRevocationAt = outstandingCredentialExpiresAt ?? revokedAt;
    return {
      revocationRequestedAt,
      providerSystem,
      providerActionResult: 'skipped',
      providerActionDetail:
        "Pinata cannot selectively invalidate an already-issued signed access link (no such API exists); unpinning the shared resource to simulate per-grant revocation was not attempted because it would revoke every other grant issued against the same resource, not only this one. Future issuance is prevented Enterprise-side, effective immediately.",
      effectiveRevocationMode: 'ttl_bounded',
      effectiveRevocationAt,
      enforcementLagSeconds: secondsBetween(revokedAt, effectiveRevocationAt),
      ...(outstandingCredentialExpiresAt !== undefined ? { outstandingCredentialExpiresAt } : {}),
      measured: false,
    };
  }

  // semantics === 'resource_wide' (reason === 'resource-removed'): the only
  // Pinata operation this adapter can honestly invoke, `files.public.delete`,
  // matches the revocation's own intent (the resource itself is gone), so it
  // is genuinely appropriate here -- never for any other reason.
  if (grant.providerFileId === undefined || client === undefined) {
    return {
      revocationRequestedAt,
      providerSystem,
      providerAction: 'files.public.delete',
      providerActionAttemptedAt: revocationRequestedAt,
      providerActionResult: 'failed',
      providerActionDetail:
        grant.providerFileId === undefined
          ? "This grant has no recorded Pinata file id (providerFileId); files.public.delete cannot be attempted without it."
          : 'No live Pinata client was configured; files.public.delete was not attempted. Falling back to the truthful ttl_bounded floor.',
      effectiveRevocationMode: 'ttl_bounded',
      effectiveRevocationAt: grant.latestOutstandingCredentialExpiresAt ?? revokedAt,
      enforcementLagSeconds: secondsBetween(revokedAt, grant.latestOutstandingCredentialExpiresAt ?? revokedAt),
      ...(grant.latestOutstandingCredentialExpiresAt !== undefined ? { outstandingCredentialExpiresAt: grant.latestOutstandingCredentialExpiresAt } : {}),
      measured: false,
    };
  }

  const translation = {
    schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
    id: `${grant.id}-invalidate-${revocationRequestedAt}`,
    providerSystem: PINATA_PROVIDER_SYSTEM,
    capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_GRANT_REVOCATION,
    executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.INVALIDATE_GRANT,
    grantRef: grant.id,
    resource: grant.resource,
    providerMetadata: { pinataFileId: grant.providerFileId },
    translatedAt: revocationRequestedAt,
    correlationId,
  };

  const executionResult = await executePinataProviderTranslation(translation, client, { now });
  const providerActionAttemptedAt = executionResult.outcome === 'executed' ? executionResult.executedAt : executionResult.failedAt;

  if (executionResult.outcome === 'failed') {
    return {
      revocationRequestedAt,
      providerSystem,
      providerAction: 'files.public.delete',
      providerActionAttemptedAt,
      providerActionResult: 'failed',
      providerActionDetail: `files.public.delete failed (${executionResult.failureReason}): ${executionResult.message}. Falling back to the truthful ttl_bounded floor -- the shared resource was NOT deleted.`,
      effectiveRevocationMode: 'ttl_bounded',
      effectiveRevocationAt: grant.latestOutstandingCredentialExpiresAt ?? revokedAt,
      enforcementLagSeconds: secondsBetween(revokedAt, grant.latestOutstandingCredentialExpiresAt ?? revokedAt),
      ...(grant.latestOutstandingCredentialExpiresAt !== undefined ? { outstandingCredentialExpiresAt: grant.latestOutstandingCredentialExpiresAt } : {}),
      measured: false,
    };
  }

  return {
    revocationRequestedAt,
    providerSystem,
    providerAction: 'files.public.delete',
    providerActionAttemptedAt,
    providerActionResult: 'executed',
    providerActionDetail:
      "files.public.delete unpinned the shared resource. This affects every grant issued against it, not only the one being revoked -- appropriate here only because the revocation reason is 'resource-removed'.",
    effectiveRevocationMode: 'resource_wide',
    effectiveRevocationAt: providerActionAttemptedAt,
    enforcementLagSeconds: secondsBetween(revokedAt, providerActionAttemptedAt),
    measured: false,
  };
}

/**
 * `'unknown'` enforcement — used when a grant was never associated with any
 * provider system at all. No provider-side claim of any kind can be made.
 */
export function unknownProviderEnforcement(revokedAt: string, now: () => string): AccessGrantProviderEnforcementResult {
  return {
    revocationRequestedAt: now(),
    providerActionResult: 'skipped',
    providerActionDetail: 'No provider system was ever associated with this grant; only Enterprise-side governance revocation applies.',
    effectiveRevocationMode: 'unknown',
    effectiveRevocationAt: revokedAt,
    enforcementLagSeconds: 0,
    measured: false,
  };
}
