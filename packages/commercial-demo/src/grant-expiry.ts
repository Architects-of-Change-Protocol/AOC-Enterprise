import type { UtcDateTime } from '@aoc/protocol';
import type { EnterpriseAccessGrant } from '@aoc-enterprise/access-grant';
import { ENTERPRISE_PROVIDER_FAILURE_REASONS, mapEnterpriseProviderFailureToUsageEventType } from '@aoc-enterprise/provider-adapter';
import type { EnterpriseProviderFailureReason, EnterpriseProviderFailureUsageEventType } from '@aoc-enterprise/provider-adapter';

/**
 * ADR-ACCESS-LIFECYCLE.md (R005.0) Phase 5 assigns grant-expiration
 * enforcement to the Provider Adapter: "The adapter is responsible for
 * refusing to translate or honor a grant once `expiresAt` has passed, by
 * comparing against wall-clock time itself." The Pinata adapter
 * (`@aoc-enterprise/pinata-adapter`) does not declare
 * `SupportsExpiration` in `PINATA_SUPPORTED_CAPABILITIES` -- honestly, since
 * `executePinataProviderTranslation` never reads a grant's `expiresAt` at
 * all (an `EnterpriseProviderTranslation` does not carry that field; see
 * `EnterpriseGrantTranslationInput` in `@aoc-enterprise/provider-adapter`).
 * For a provider whose adapter does not itself enforce expiration, that
 * check must happen one layer up, before a translation is ever produced --
 * exactly what this function does. It is demo-orchestration code, not a
 * change to any frozen contract: it reads only `EnterpriseAccessGrant.expiresAt`
 * (a field the grant already carries) and reuses the adapter contract's own
 * closed `EnterpriseProviderFailureReason` vocabulary rather than inventing
 * a new one.
 */
export type GrantExpiryCheck =
  | { readonly expired: false }
  | {
      readonly expired: true;
      readonly failureReason: EnterpriseProviderFailureReason;
      readonly usageEventType: EnterpriseProviderFailureUsageEventType;
      readonly message: string;
    };

export function checkGrantNotExpired(grant: EnterpriseAccessGrant, now: UtcDateTime): GrantExpiryCheck {
  if (Date.parse(now) < Date.parse(grant.expiresAt)) return { expired: false };

  const failureReason = ENTERPRISE_PROVIDER_FAILURE_REASONS.GRANT_EXPIRED;
  return {
    expired: true,
    failureReason,
    usageEventType: mapEnterpriseProviderFailureToUsageEventType(failureReason),
    message: `EnterpriseAccessGrant '${grant.id}' expired at ${grant.expiresAt}; refusing to translate or honor it as of ${now}.`,
  };
}
