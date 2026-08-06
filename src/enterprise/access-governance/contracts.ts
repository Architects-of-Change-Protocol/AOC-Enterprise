/**
 * Access Governance Runtime — Slice 1: Durable Grants + Truthful Effective
 * Revocation ("Sovereign Execution Binding", Slice 1 of N).
 *
 * This module gives the frozen, provider-neutral canonical contracts
 * `EnterpriseAccessGrant` (`@aoc-enterprise/access-grant`, R004.G) and
 * `EnterpriseGrantRevocation` (`@aoc-enterprise/grant-revocation`, R004.H) a
 * durable, tenant-scoped home, and adds exactly one new orchestration path
 * (`revokeGrant`, see `service.ts`) that turns "Enterprise records that a
 * grant was revoked" into "Enterprise durably records revocation, prevents
 * future authorization, invokes the strongest truthful provider-side
 * enforcement available, measures when revocation actually becomes
 * effective, and produces correlated evidence."
 *
 * This is deliberately NOT a redesign of `EnterpriseAccessGrant` /
 * `EnterpriseGrantRevocation` — both canonical contracts are consumed
 * as-is (via `deserializeEnterpriseAccessGrant` / `serializeEnterpriseAccessGrant`
 * and the revocation equivalents) at the store boundary; see
 * `access-grant-store.ts`. `AccessGrantRecord` below is this module's own
 * durable *row* shape (tenant/provider bookkeeping the frozen contract has
 * no field for), never a competing definition of what a grant *is*.
 *
 * Provider identity fix (GAP-012): `EnterpriseAccessGrant.resource` /
 * `EnterpriseProviderTranslation.resource` compose Protocol's bare
 * `ResourceRef` (`{ kind, id }`) — a single identity field. A prior Pinata
 * adapter revision overloaded that one field to mean, depending on which
 * operation was being performed, either a content CID (`gateways.private.createAccessLink`)
 * or Pinata's own internal file id (`files.public.get`/`files.public.delete`)
 * — two different provider identities silently sharing one field. This
 * module keeps `resource.id` as the Enterprise-internal resource identity
 * only, and carries the two distinct, optional Pinata identifiers
 * (`providerCid`, `providerFileId`) as explicit, separately-typed fields
 * that are never conflated and never share a column. See
 * `pinata-revocation-enforcement.ts` for how they are threaded through to
 * the adapter via `EnterpriseProviderTranslation.providerMetadata`
 * (`@aoc-enterprise/provider-translation`'s own, already-designed
 * provider-neutral extension point) rather than by widening any frozen
 * contract.
 */

// ---------------------------------------------------------------------------
// Access context (tenant / trust-domain scoping) — mirrors
// `PassportAccessContext` (`../passport/contracts.ts`) verbatim in shape and
// intent: a system caller sees every tenant; a tenant caller must name its
// own `organizationId` and can never see or mutate another tenant's records.
// ---------------------------------------------------------------------------

export interface AccessGovernanceContext {
  readonly system: boolean;
  readonly organizationId?: string;
  readonly actorId?: string;
}

// ---------------------------------------------------------------------------
// Durable AccessGrant record — the tenant-scoped, restart-durable projection
// of an issued `EnterpriseAccessGrant`. `status` mirrors
// `EnterpriseAccessGrantStatus` ('active' | 'revoked') exactly; this module
// never invents a third grant status.
// ---------------------------------------------------------------------------

export type AccessGrantStatus = 'active' | 'revoked';

export interface AccessGrantResource {
  readonly kind: string;
  readonly id: string;
}

export interface AccessGrantRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly status: AccessGrantStatus;
  readonly resource: AccessGrantResource;
  readonly principalId: string;
  readonly decisionRef: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly issuerRef?: string;

  /** Which provider system this grant is realized against, e.g. `'pinata'`. Absent for a grant never translated to any provider. */
  readonly providerSystem?: string;
  /** The provider's own content identifier (e.g. a Pinata CID) — an identity, never a file/record handle. Distinct from `providerFileId`; see GAP-012 in this file's module doc. */
  readonly providerCid?: string;
  /** The provider's own internal file/record identifier — a storage handle, never a content identity. Distinct from `providerCid`. */
  readonly providerFileId?: string;

  /**
   * The latest (maximum) `expiresAt` of any provider-issued, time-bounded
   * credential (e.g. a Pinata signed access link) issued under this grant so
   * far. `undefined` when no provider credential was ever issued. This is
   * the durable basis for the revocation invariant: `effectiveRevocationAt`
   * must never be computed as earlier than this value for a TTL-bounded
   * provider (see `pinata-revocation-enforcement.ts`).
   */
  readonly latestOutstandingCredentialExpiresAt?: string;

  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Provider enforcement result — the normalized, truthful record of what
// actually happened (or was truthfully determined not to happen) on the
// provider's own side as part of one revocation. Field names follow the
// vocabulary named in the Slice 1 task description directly.
// ---------------------------------------------------------------------------

/**
 * How revocation actually becomes effective for already-issued provider
 * credentials, distinguished rigorously per the Slice 1 task description:
 *
 * - `immediate_selective` — the provider genuinely invalidated the specific,
 *   already-issued credential; verified, never assumed from a method name.
 * - `ttl_bounded` — the provider cannot selectively invalidate an
 *   already-issued credential; it remains usable until its own recorded
 *   expiry. This is Pinata's true default semantics for every revocation
 *   reason except `resource-removed` (see `pinata-revocation-enforcement.ts`).
 * - `resource_wide` — the provider action taken (e.g. unpin/delete) affects
 *   every grant against that resource, not only the one being revoked. Only
 *   used when the revocation reason itself is resource-scoped
 *   (`resource-removed`) — never invoked merely to simulate per-grant
 *   revocation for a shared resource.
 * - `unsupported` — the provider has no operation this module can honestly
 *   invoke for this revocation at all.
 * - `unknown` — no provider was ever involved (no `providerSystem` recorded
 *   on the grant), so no revocation-effectiveness claim can be made about
 *   provider-side state.
 */
export type EffectiveRevocationMode = 'immediate_selective' | 'ttl_bounded' | 'resource_wide' | 'unsupported' | 'unknown';

export type ProviderActionResult = 'executed' | 'failed' | 'skipped';

export interface AccessGrantProviderEnforcementResult {
  readonly revocationRequestedAt: string;
  readonly providerSystem?: string;

  /** The concrete provider operation considered (e.g. `'files.public.delete'`), or `undefined` when no provider action was even attempted. */
  readonly providerAction?: string;
  readonly providerActionAttemptedAt?: string;
  readonly providerActionResult: ProviderActionResult;
  /** Always a plain, truthful sentence — never a raw provider SDK error, HTTP status, or stack trace. Explains *why* an action was skipped or failed, not just that it was. */
  readonly providerActionDetail: string;

  readonly effectiveRevocationMode: EffectiveRevocationMode;
  /** When revocation truthfully becomes effective. For `ttl_bounded`, never earlier than `outstandingCredentialExpiresAt` (the invariant this module enforces — see `pinata-revocation-enforcement.ts`). */
  readonly effectiveRevocationAt?: string;
  readonly enforcementLagSeconds?: number;
  readonly outstandingCredentialExpiresAt?: string;

  /**
   * `true` only when `effectiveRevocationAt`/`enforcementLagSeconds` were
   * confirmed by actually re-testing the provider credential (live
   * verification, e.g. Test E in the Slice 1 acceptance suite). `false`
   * means these values are a truthful *estimate*, derived from the
   * provider's own recorded TTL bound, never independently confirmed.
   * Never silently promoted to `true`.
   */
  readonly measured: boolean;
}

/**
 * The neutral, honest placeholder `AccessGrantStore.beginRevocation`
 * persists before the real provider-enforcement determination runs. Never
 * claims a stronger or weaker outcome than "not yet determined" — never
 * `'immediate_selective'`/`'ttl_bounded'`/`'resource_wide'`, and never
 * `providerActionResult: 'executed'`.
 */
export function createPendingEnforcementResult(revocationRequestedAt: string): AccessGrantProviderEnforcementResult {
  return {
    revocationRequestedAt,
    providerActionResult: 'skipped',
    providerActionDetail: 'Provider enforcement determination has not yet run.',
    effectiveRevocationMode: 'unknown',
    measured: false,
  };
}

// ---------------------------------------------------------------------------
// Durable GrantRevocation record — the tenant-scoped, restart-durable
// projection of `EnterpriseGrantRevocation`, always paired 1:1 with the
// `AccessGrantProviderEnforcementResult` produced revoking it. At most one
// revocation per grant (mirrors `EnterpriseGrantRevocation`'s own
// `DUPLICATE_GRANT_REVOCATION` invariant), enforced by the store.
// ---------------------------------------------------------------------------

export interface AccessGrantRevocationRecord {
  readonly id: string;
  readonly grantId: string;
  readonly organizationId: string;
  readonly revokedAt: string;
  readonly reason: string;
  readonly issuerRef: string;
  readonly correlationId: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
  readonly enforcement: AccessGrantProviderEnforcementResult;
}

// ---------------------------------------------------------------------------
// Store-facing input/output shapes.
// ---------------------------------------------------------------------------

export interface IssueAccessGrantInput {
  readonly id: string;
  readonly organizationId: string;
  readonly resource: AccessGrantResource;
  readonly principalId: string;
  readonly decisionRef: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly issuerRef?: string;
  readonly providerSystem?: string;
  readonly providerCid?: string;
  readonly providerFileId?: string;
}

/**
 * Store-level phase-1 revoke input — already validated by `service.ts`.
 * Deliberately carries NO enforcement result: the governance fact of
 * revocation (grant flips `active -> revoked`, which alone already blocks
 * `requestProviderCredential` — see `lifecycle.ts`'s `assertActive`) must be
 * durably persisted BEFORE any provider is ever contacted, per the Slice 1
 * orchestration ordering ("persist governance revocation" precedes
 * "inspect provider enforcement capabilities" / "invoke provider adapter").
 * `AccessGrantStore.beginRevocation` persists a neutral, honest placeholder
 * enforcement result (`effectiveRevocationMode: 'unknown'`,
 * `providerActionResult: 'skipped'`) that `finalizeRevocationEnforcement`
 * then overwrites once the real determination completes — see
 * `FinalizeRevocationEnforcementInput`.
 */
export interface BeginRevocationInput {
  readonly revocationId: string;
  readonly grantId: string;
  readonly organizationId: string;
  readonly revokedAt: string;
  readonly reason: string;
  readonly issuerRef: string;
  readonly correlationId: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
}

/** Store-level phase-2 input: attaches the real, determined enforcement result to an already-persisted revocation. Called exactly once, only by `service.ts`'s `revokeGrant` — never a second, independent write path (Slice 1: "Do not create parallel revocation truths"). */
export interface FinalizeRevocationEnforcementInput {
  readonly grantId: string;
  readonly organizationId: string;
  readonly enforcement: AccessGrantProviderEnforcementResult;
}

export type RevokeOutcome =
  | { readonly kind: 'revoked'; readonly grant: AccessGrantRecord; readonly revocation: AccessGrantRevocationRecord }
  | { readonly kind: 'already-revoked'; readonly grant: AccessGrantRecord; readonly revocation: AccessGrantRevocationRecord };

export interface RecordProviderCredentialIssuanceInput {
  readonly grantId: string;
  readonly organizationId: string;
  readonly expiresAt: string;
}

export interface AccessGrantStoreHealth {
  readonly status: 'healthy' | 'unhealthy';
  readonly readable: boolean;
  readonly writable: boolean;
  readonly schemaVersion: string;
  readonly checkedAt: string;
}
