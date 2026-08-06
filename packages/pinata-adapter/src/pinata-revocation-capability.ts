import type { CanonicalId, UtcDateTime } from '@aoc/protocol';
import type { EnterpriseGrantRevocationReason } from '@aoc-enterprise/grant-revocation';
import { ENTERPRISE_GRANT_REVOCATION_REASONS } from '@aoc-enterprise/grant-revocation';
import { PINATA_PROVIDER_SYSTEM } from './pinata-provider-adapter.js';

/**
 * Truthful Pinata revocation-capability record (Sovereign Execution
 * Binding, Slice 1 — "Durable Grants + Truthful Effective Revocation").
 *
 * `EnterpriseProviderCapabilityDeclaration` (`@aoc-enterprise/provider-adapter`,
 * R005.A, frozen) has exactly one capability for revocation,
 * `SupportsGrantRevocation`, and that single boolean-shaped flag cannot
 * truthfully express what Pinata actually does: `SupportsGrantRevocation: true`
 * is accurate (Pinata genuinely has *a* provider-side operation,
 * `files.public.delete`, that this adapter invokes for `InvalidateGrant`),
 * but it says nothing about *what kind* of revocation that operation
 * performs -- whether an already-issued, outstanding credential (a signed
 * gateway access link) is actually invalidated, or merely that future
 * issuance is prevented, or that the entire underlying resource is
 * destroyed for every grant against it, not only the one being revoked.
 *
 * Rather than widen the frozen `EnterpriseProviderCapabilityDeclaration`
 * shape (architectural drift `ADR-PINATA-PROVIDER-ADAPTER.md` explicitly
 * treats as something to report, not something to smuggle in), this module
 * adds a new, additive, Pinata-owned record that a durable orchestration
 * layer (e.g. `src/enterprise/access-governance/`) consults *alongside*
 * `createPinataProviderCapabilityDeclaration`'s existing output, never in
 * place of it. No frozen contract's shape, schema version, or vocabulary is
 * changed by this file.
 */
export const PINATA_REVOCATION_CAPABILITY_SCHEMA_VERSION = '1.0.0' as const;

/**
 * How Pinata's own primitives realize revocation for one of the closed,
 * provider-neutral `EnterpriseGrantRevocationReason` values
 * (`@aoc-enterprise/grant-revocation`) -- distinguished per the Slice 1 task
 * description's own vocabulary:
 *
 * - `'resource_wide'` — `files.public.delete` genuinely unpins/deletes the
 *   file record. This is a real provider action, but its blast radius is
 *   the entire resource, not one grant: every other grant issued against
 *   the same CID loses access too. Truthfully applicable only when the
 *   revocation reason is itself resource-scoped (`'resource-removed'`),
 *   matching `ADR-ACCESS-LIFECYCLE.md`'s own worked example. Never invoked
 *   merely to simulate per-grant revocation for a shared resource -- see
 *   `pinataRevocationSemanticsForReason` below.
 * - `'ttl_bounded'` — for every other revocation reason, Pinata has no
 *   operation this adapter can honestly invoke that only affects the one
 *   grant being revoked. An already-issued signed access link (Pinata's
 *   only "temporary access" primitive) carries its own `expires` Unix
 *   timestamp and remains usable until that instant elapses, regardless of
 *   any Enterprise-side revocation. This is Pinata's true default.
 *
 * `'immediate_selective'` and `'unsupported'` are part of the shared,
 * provider-neutral vocabulary (`EffectiveRevocationMode`,
 * `src/enterprise/access-governance/contracts.ts`) but this adapter never
 * produces either: Pinata has no selective-invalidation primitive at all
 * (never `'immediate_selective'`), and every revocation reason maps to one
 * of the two modes above (never `'unsupported'`).
 */
export type PinataRevocationSemantics = 'ttl_bounded' | 'resource_wide';

const PINATA_REVOCATION_SEMANTICS_BY_REASON: Readonly<Record<EnterpriseGrantRevocationReason, PinataRevocationSemantics>> = {
  [ENTERPRISE_GRANT_REVOCATION_REASONS.RESOURCE_REMOVED]: 'resource_wide',
  [ENTERPRISE_GRANT_REVOCATION_REASONS.EXPIRED]: 'ttl_bounded',
  [ENTERPRISE_GRANT_REVOCATION_REASONS.ADMINISTRATOR_REVOKED]: 'ttl_bounded',
  [ENTERPRISE_GRANT_REVOCATION_REASONS.POLICY_CHANGED]: 'ttl_bounded',
  [ENTERPRISE_GRANT_REVOCATION_REASONS.PRINCIPAL_DISABLED]: 'ttl_bounded',
  [ENTERPRISE_GRANT_REVOCATION_REASONS.MANUAL_REVOCATION]: 'ttl_bounded',
  [ENTERPRISE_GRANT_REVOCATION_REASONS.SECURITY_INCIDENT]: 'ttl_bounded',
};

/**
 * The single source of truth for "what does invoking Pinata actually do for
 * this revocation reason" — a pure, total, synchronous lookup, never a
 * network call. `resource-removed` is the only reason honestly served by
 * `files.public.delete`; every other reason is `ttl_bounded` because
 * deleting the shared resource to revoke one principal's grant would
 * over-revoke every other grant against it (the Slice 1 task's own
 * invariant: "Never delete/unpin an entire resource merely to simulate
 * per-grant revocation").
 */
export function pinataRevocationSemanticsForReason(reason: EnterpriseGrantRevocationReason): PinataRevocationSemantics {
  return PINATA_REVOCATION_SEMANTICS_BY_REASON[reason];
}

/**
 * The truthful, Pinata-owned revocation-capability record. Every field
 * exists to be honest, not favorable: `supportsSelectiveInvalidationOfIssuedCredential`
 * is `false` because it genuinely is -- Pinata's signed gateway access
 * links have no revocation API of their own, only their own `expires`
 * bound (verified directly from the `pinata` SDK's `gateways.private`
 * surface, `pinata-provider-client.ts`; never inferred from a method name).
 */
export interface PinataRevocationCapability {
  readonly schemaVersion: typeof PINATA_REVOCATION_CAPABILITY_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly providerSystem: typeof PINATA_PROVIDER_SYSTEM;

  /** Always `true`: preventing new issuance is Enterprise-side gating (never translating a new `ProvideTemporaryAccess`/`ProvideReadOnlyAccess` for a revoked grant), independent of any provider primitive. */
  readonly supportsPreventionOfFutureIssuance: true;
  /** Always `false`: Pinata has no API to invalidate one already-issued signed access link before its own `expires` bound. Never overridden per reason -- this is a provider-wide fact, not a per-revocation one. */
  readonly supportsSelectiveInvalidationOfIssuedCredential: false;
  /** Always `true`: `files.public.delete` genuinely unpins/deletes the file record, affecting every grant issued against it. */
  readonly supportsResourceWideInvalidation: true;

  readonly revocationSemanticsByReason: Readonly<Record<EnterpriseGrantRevocationReason, PinataRevocationSemantics>>;

  /**
   * Pinata's own minimum/maximum bound on `expires` (the signed access
   * link's requested duration, in seconds), if any. Left `null` rather than
   * a guessed number: neither the `pinata` SDK's own type declarations nor
   * any document already present in this repository state a fixed
   * minimum/maximum, and this record's own purpose is to never assert a
   * bound it has not verified. A future slice that verifies real Pinata
   * behavior (see Slice 1's "Live Provider Verification" gate) should
   * populate this from an observed rejection/acceptance boundary, never
   * from documentation alone.
   */
  readonly minRequestedDurationSeconds: number | null;
  readonly maxRequestedDurationSeconds: number | null;

  /** `SupportsUsageReporting`-shaped fact, restated here for the same reason as the rest of this record: Pinata has no per-grant usage-registration or per-credential-invalidation event stream this adapter could use to *observe* enforcement lag; every `enforcementLagSeconds` this Slice computes is a truthful estimate from the credential's own recorded `expires`, never a provider-confirmed measurement, unless independently verified against a live credential (see `AccessGrantProviderEnforcementResult.measured`). */
  readonly supportsUsageEventBackedEnforcementLagMeasurement: false;

  readonly declaredAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  readonly description?: string;
}

export function createPinataRevocationCapability(input: {
  readonly id: CanonicalId;
  readonly declaredAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  readonly description?: string;
}): PinataRevocationCapability {
  return {
    schemaVersion: PINATA_REVOCATION_CAPABILITY_SCHEMA_VERSION,
    id: input.id,
    providerSystem: PINATA_PROVIDER_SYSTEM,
    supportsPreventionOfFutureIssuance: true,
    supportsSelectiveInvalidationOfIssuedCredential: false,
    supportsResourceWideInvalidation: true,
    revocationSemanticsByReason: PINATA_REVOCATION_SEMANTICS_BY_REASON,
    minRequestedDurationSeconds: null,
    maxRequestedDurationSeconds: null,
    supportsUsageEventBackedEnforcementLagMeasurement: false,
    declaredAt: input.declaredAt,
    correlationId: input.correlationId,
    ...(input.description === undefined ? {} : { description: input.description }),
  };
}
