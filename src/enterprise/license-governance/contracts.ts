import type {
  EnterpriseLicensableRightType,
  EnterpriseLicenseExclusivity,
  EnterpriseLicenseLifecycleType,
  EnterpriseLicenseRightsScope,
  EnterpriseLicenseTerms,
  EnterpriseLicensedUnits,
  EnterpriseLicensedUseType,
} from '@aoc-enterprise/license-mandate';

import type { KernelDecisionStatus } from '../../kernel/index.js';

/**
 * License Governance Runtime — the durable, tenant-scoped home for the
 * `LICENSE` governed action.
 *
 * This module adds no governance semantics. A `LICENSE` request is evaluated
 * by `AocKernel` exactly like every other action request (authority, policy,
 * approvals, obligations, evidence), and the evaluation is durably recorded
 * by the canonical Governance Store as one integrity-chained aggregate. What
 * this module adds is the part the generalized path genuinely does not have:
 * a durable record of *what exactly was authorized*
 * (`EnterpriseLicenseMandate`), *what license was actually granted under it*
 * (`EnterpriseLicenseExecutionEvidence`), and *what an external system later
 * reported about that license ending*
 * (`EnterpriseLicenseLifecycleEvidence`) — all tenant-scoped and all
 * traceable back to the canonical decision that produced them.
 *
 * This is deliberately NOT a redesign of any canonical contract: the frozen
 * `@aoc-enterprise/license-mandate` contracts are consumed as-is (via
 * `validateEnterpriseLicenseMandate` / `serialize*` at the store boundary).
 * The record shapes below are this module's own durable *row* shapes — tenant
 * and bookkeeping fields the pure contracts have no field for — never a
 * competing definition of what a mandate *is*.
 *
 * It is also deliberately a sibling of `../tokenization-governance/` and
 * `../collateralization-governance/`, not a generalization of either: the
 * three modules are structurally parallel because the repository's governance
 * lifecycle is the same for all of them, and semantically distinct wherever
 * licensing differs — a licensee rather than a secured party, permitted uses
 * and operating contexts rather than networks and registries, an *optional*
 * executor, a rights scope that is optional and separate from permission
 * scope, and a per-license unit ceiling that deliberately does **not**
 * accumulate the way collateral scope does. See
 * `docs/enterprise/AOC_LICENSE_ACTION.md`, "TOKENIZE vs COLLATERALIZE vs
 * LICENSE".
 *
 * Boundary: AOC Enterprise governs the authority to license. It is not a
 * licensing platform, a contract system, a royalty engine, a marketplace, or
 * a rights registry. Nothing in this module drafts an agreement, captures a
 * signature, prices or values anything, calculates or settles a royalty or
 * tax, meters usage, enforces DRM, or contacts any external system; there is
 * no provider adapter here and none is implied by these types.
 */

// ---------------------------------------------------------------------------
// Access context (tenant / trust-domain scoping) — mirrors
// `AccessGovernanceContext` (`../access-governance/contracts.ts`),
// `PassportAccessContext` (`../passport/contracts.ts`),
// `TokenizationGovernanceContext` and `CollateralizationGovernanceContext`
// verbatim in shape and intent: a system caller sees every tenant; a tenant
// caller must name its own `organizationId` and can never see or mutate
// another tenant's records.
// ---------------------------------------------------------------------------

export interface LicenseGovernanceContext {
  readonly system: boolean;
  readonly organizationId?: string;
  readonly actorId?: string;
}

// ---------------------------------------------------------------------------
// Durable mandate record — the tenant-scoped, restart-durable projection of
// an issued `EnterpriseLicenseMandate`. `status` mirrors
// `EnterpriseLicenseMandateStatus` ('active' | 'revoked') exactly; this module
// never invents a third mandate status, and in particular never promotes an
// externally-reported termination or expiry into one. Expiry, exhaustion and
// permission containment are derived (see `lifecycle.ts`), never stored as a
// second source of truth.
// ---------------------------------------------------------------------------

export type LicenseMandateStatus = 'active' | 'revoked';

export interface LicenseMandateRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly status: LicenseMandateStatus;

  /** Which governed asset this authorization covers — Protocol `ResourceRef` identity only. */
  readonly assetKind: string;
  readonly assetId: string;
  readonly assetTenantId?: string;

  /** Exactly what was authorized: rights, licensee, permitted uses, exclusivity, constraints, and any rights scope or bound executor. Copied verbatim from the validated request; never widened. */
  readonly terms: EnterpriseLicenseTerms;

  readonly requestRef: string;
  readonly requestedBy: string;

  /** The canonical Kernel decision that authorized this mandate. */
  readonly decisionRef: string;
  /** The Governance Store aggregate that durably proves that decision (trace, reason codes, events, integrity chain). */
  readonly evaluationRef?: string;

  /** When AOC's authority to grant under this mandate begins. Not the external license's effective date. */
  readonly effectiveFrom: string;
  /** When AOC's authority to grant under this mandate ends. Not the external license's expiry. */
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly issuerRef?: string;

  readonly approvalRefs?: readonly string[];
  readonly obligationRefs?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs?: readonly string[];

  /**
   * How many external licenses have been recorded under this mandate. The
   * durable basis for the `additionalLicensesAllowed` constraint.
   *
   * Deliberately the *only* cumulative field on this record, and the contrast
   * with `CollateralizationMandateRecord.committedScope` is a finding rather
   * than an omission. Collateral scope accumulates because encumbering a
   * finite right twice exhausts it; licensed units do not, because granting
   * ten seats to one licensee and ten to another exhausts nothing about the
   * asset. `maximumLicensedUnits` is therefore a per-license ceiling, checked
   * against each grant, never summed into a pool.
   *
   * A reported termination or expiry does **not** decrement it: AOC cannot
   * verify that an external license actually ended and must never create
   * fresh licensing capacity on the strength of an unverified report.
   */
  readonly executionCount: number;

  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Durable execution record — the tenant-scoped projection of one
// `EnterpriseLicenseExecutionEvidence`. Append-only: there is no update or
// delete path, mirroring the Governance Store's own append-only posture.
// ---------------------------------------------------------------------------

export interface LicenseExecutionRecord {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  /** Who performed the external licensing act. Checked against the mandate's `executorRef` only when the mandate bound one. */
  readonly executedBy: string;
  readonly executedAt: string;
  readonly licenseeRef: string;
  readonly rights: readonly EnterpriseLicensableRightType[];
  readonly grantedUses: readonly EnterpriseLicensedUseType[];
  readonly exclusivity: EnterpriseLicenseExclusivity;
  readonly correlationId: string;
  readonly rightsScope?: EnterpriseLicenseRightsScope;
  readonly contexts?: Readonly<Record<string, readonly string[]>>;
  readonly licenseEffectiveAt?: string;
  readonly licenseExpiresAt?: string;
  readonly licensedUnits?: EnterpriseLicensedUnits;
  readonly externalSystem?: string;
  readonly externalAgreementReference?: string;
  readonly externalAcceptanceReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
  readonly recordedAt: string;
}

// ---------------------------------------------------------------------------
// Durable lifecycle record — the tenant-scoped projection of one
// `EnterpriseLicenseLifecycleEvidence`. Also append-only, and deliberately a
// *separate* record rather than a mutation of the execution it refers to: the
// execution evidence is immutable, and what an external system later reported
// is a new observation, not a correction of the old one.
// ---------------------------------------------------------------------------

export interface LicenseLifecycleRecord {
  readonly id: string;
  readonly mandateId: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly reportedBy: string;
  readonly occurredAt: string;
  readonly lifecycleType: EnterpriseLicenseLifecycleType;
  readonly correlationId: string;
  readonly externalSystem?: string;
  readonly externalReference?: string;
  readonly evidenceRefs?: readonly string[];
  readonly recordedAt: string;
}

// ---------------------------------------------------------------------------
// Durable revocation record — at most one per mandate, mirroring
// `AccessGrantRevocationRecord`'s, `TokenizationMandateRevocationRecord`'s and
// `CollateralizationMandateRevocationRecord`'s 1:1 pairing.
// ---------------------------------------------------------------------------

export interface LicenseMandateRevocationRecord {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly revokedAt: string;
  readonly reason: string;
  readonly issuerRef: string;
  readonly correlationId: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];

  /**
   * How many external licenses had already been granted when authority was
   * withdrawn.
   *
   * Preserved deliberately, and this is the single most important semantic
   * point of the whole module: revoking a mandate withdraws the authority to
   * grant *further* licenses and makes no claim whatsoever about a license an
   * external system has already granted. This field is the durable, immutable
   * record that the authorization *had* been exercised — see `lifecycle.ts`
   * and the package README, "Revocation is not termination".
   */
  readonly executionsAtRevocation: number;
}

// ---------------------------------------------------------------------------
// Store-facing input shapes.
// ---------------------------------------------------------------------------

export interface IssueLicenseMandateInput {
  readonly id: string;
  readonly organizationId: string;
  readonly assetKind: string;
  readonly assetId: string;
  readonly assetTenantId?: string;

  /**
   * The terms this mandate will carry. Validated by the store against
   * `requestedTerms` — a mandate may narrow what was asked for, never widen
   * it, and never substitute a different licensee or bound executor. See
   * `assertNoLicensePermissionEscalation` in `lifecycle.ts`.
   */
  readonly terms: EnterpriseLicenseTerms;
  /** The terms of the originating, already-validated `EnterpriseLicenseRequest`. */
  readonly requestedTerms: EnterpriseLicenseTerms;

  readonly requestRef: string;
  readonly requestedBy: string;
  readonly decisionRef: string;
  readonly evaluationRef?: string;
  readonly effectiveFrom: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly issuerRef?: string;
  readonly approvalRefs?: readonly string[];
  readonly obligationRefs?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
}

export interface RecordLicenseExecutionInput {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly executedBy: string;
  readonly executedAt: string;
  readonly licenseeRef: string;
  readonly rights: readonly EnterpriseLicensableRightType[];
  readonly grantedUses: readonly EnterpriseLicensedUseType[];
  readonly exclusivity: EnterpriseLicenseExclusivity;
  readonly correlationId: string;
  readonly rightsScope?: EnterpriseLicenseRightsScope;
  readonly contexts?: Readonly<Record<string, readonly string[]>>;
  readonly licenseEffectiveAt?: string;
  readonly licenseExpiresAt?: string;
  readonly licensedUnits?: EnterpriseLicensedUnits;
  readonly externalSystem?: string;
  readonly externalAgreementReference?: string;
  readonly externalAcceptanceReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RecordLicenseLifecycleInput {
  readonly id: string;
  readonly mandateId: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly reportedBy: string;
  readonly occurredAt: string;
  readonly lifecycleType: EnterpriseLicenseLifecycleType;
  readonly correlationId: string;
  readonly externalSystem?: string;
  readonly externalReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RevokeLicenseMandateInput {
  readonly revocationId: string;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly revokedAt: string;
  readonly reason: string;
  readonly issuerRef: string;
  readonly correlationId: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
}

export type LicenseRevokeOutcome =
  | {
      readonly kind: 'revoked';
      readonly mandate: LicenseMandateRecord;
      readonly revocation: LicenseMandateRevocationRecord;
    }
  | {
      readonly kind: 'already-revoked';
      readonly mandate: LicenseMandateRecord;
      readonly revocation: LicenseMandateRevocationRecord;
    };

export interface LicenseMandateStoreHealth {
  readonly status: 'healthy' | 'unhealthy';
  readonly readable: boolean;
  readonly writable: boolean;
  readonly schemaVersion: string;
  readonly checkedAt: string;
}

// ---------------------------------------------------------------------------
// Service-facing outcome shapes.
// ---------------------------------------------------------------------------

/**
 * The result of routing one `LICENSE` request through the canonical
 * governance path. `status` is the Kernel's own decision status, verbatim —
 * this module never re-labels, softens, or reinterprets it. A `mandate` is
 * present only for `allowed`; `approval_required` deliberately produces no
 * mandate, because "an approval is still outstanding" is not authorization.
 */
export interface LicenseRequestOutcome {
  readonly status: KernelDecisionStatus;
  readonly requestId: string;
  readonly decisionId: string;
  readonly evaluationId: string;
  readonly reasonCodes: readonly string[];
  readonly summary: string;
  readonly mandate?: LicenseMandateRecord;
}

/**
 * The complete governance chain behind one mandate, assembled from references
 * this module already stores — never a second, license-specific audit log.
 * Every id here resolves against a canonical store: the Governance Store
 * (`evaluationRef`, `decisionRef`), the Approval Runtime (`approvalRefs`), the
 * obligation/evidence records the decision produced, and this module's own
 * append-only execution and lifecycle records.
 *
 * It answers, from stored references alone: why was licensing permitted, who
 * had authority, which governed rights were involved, what portion of them if
 * any, who the licensee was, what uses were permitted, what uses were
 * excluded, what operating context applied, how exclusive the grant was, what
 * duration applied, who was authorized to execute it if anyone was bound,
 * what obligations existed, whether the external execution was consistent with
 * the mandate, whether future authorization has been revoked, and what
 * external lifecycle evidence exists.
 */
export interface LicenseEvidenceLineage {
  readonly mandateId: string;
  readonly organizationId: string;
  readonly asset: { readonly kind: string; readonly id: string; readonly tenantId?: string };
  readonly terms: EnterpriseLicenseTerms;
  readonly requestRef: string;
  readonly requestedBy: string;
  /** Lifted out of `terms` deliberately: "who received it, for what, and how exclusively" are the questions a licensing reviewer asks first. */
  readonly licenseeRef: string;
  readonly permittedUses: readonly EnterpriseLicensedUseType[];
  readonly prohibitedUses: readonly EnterpriseLicensedUseType[];
  readonly exclusivity: EnterpriseLicenseExclusivity;
  /** Present only when this authorization bound an external executor. Absent means the mandate did not bind who performs the licensing act. */
  readonly executorRef?: string;
  /** Present only when the permission was expressed as a portion of the named rights. Absent means "not fractionally expressed", never "100%". */
  readonly rightsScope?: EnterpriseLicenseRightsScope;
  readonly permittedContexts?: Readonly<Record<string, readonly string[]>>;
  readonly maximumLicenseTermEndsAt?: string;
  readonly decisionRef: string;
  readonly evaluationRef?: string;
  readonly approvalRefs: readonly string[];
  readonly obligationRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly auditRefs: readonly string[];
  readonly executionRefs: readonly string[];
  readonly lifecycleRefs: readonly string[];
  readonly executionCount: number;
  readonly revocationRef?: string;
}
