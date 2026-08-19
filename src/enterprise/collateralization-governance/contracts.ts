import type {
  EnterpriseCollateralReleaseType,
  EnterpriseCollateralizableRightType,
  EnterpriseCollateralizationScope,
  EnterpriseCollateralizationTerms,
  EnterpriseSecuredAmount,
} from '@aoc-enterprise/collateralization-mandate';

import type { KernelDecisionStatus } from '../../kernel/index.js';

/**
 * Collateralization Governance Runtime — the durable, tenant-scoped home for
 * the `COLLATERALIZE` governed action.
 *
 * This module adds no governance semantics. A `COLLATERALIZE` request is
 * evaluated by `AocKernel` exactly like every other action request
 * (authority, policy, approvals, obligations, evidence), and the evaluation
 * is durably recorded by the canonical Governance Store as one integrity-
 * chained aggregate. What this module adds is the part the generalized path
 * genuinely does not have: a durable record of *what exactly was authorized*
 * (`EnterpriseCollateralizationMandate`), *what was actually done under it*
 * (`EnterpriseCollateralizationExecutionEvidence`), and *what an external
 * system later reported about the arrangement ending*
 * (`EnterpriseCollateralizationReleaseEvidence`) — all tenant-scoped and all
 * traceable back to the canonical decision that produced them.
 *
 * This is deliberately NOT a redesign of any canonical contract: the frozen
 * `@aoc-enterprise/collateralization-mandate` contracts are consumed as-is
 * (via `validateEnterpriseCollateralizationMandate` / `serialize*` at the
 * store boundary). The record shapes below are this module's own durable
 * *row* shapes — tenant and bookkeeping fields the pure contracts have no
 * field for — never a competing definition of what a mandate *is*.
 *
 * It is also deliberately a sibling of `../tokenization-governance/`, not a
 * generalization of it: the two modules are structurally parallel because the
 * repository's governance lifecycle is the same for both, and semantically
 * distinct wherever collateral differs from tokenization (secured obligation,
 * secured party, cumulative committed scope, release evidence). See
 * `docs/enterprise/AOC_COLLATERALIZE_ACTION.md`, "TOKENIZE vs COLLATERALIZE".
 *
 * Boundary: Soberanía Enterprise governs the authority to collateralize. It is not
 * a lender, a collateral agent, a registry, or a platform. Nothing in this
 * module originates a loan, computes interest or loan-to-value, values or
 * prices an asset, creates or perfects a security interest, determines
 * priority, files with any registry, liquidates or seizes anything, or
 * contacts any external system; there is no provider adapter here and none is
 * implied by these types.
 */

// ---------------------------------------------------------------------------
// Access context (tenant / trust-domain scoping) — mirrors
// `AccessGovernanceContext` (`../access-governance/contracts.ts`),
// `PassportAccessContext` (`../passport/contracts.ts`) and
// `TokenizationGovernanceContext` verbatim in shape and intent: a system
// caller sees every tenant; a tenant caller must name its own
// `organizationId` and can never see or mutate another tenant's records.
// ---------------------------------------------------------------------------

export interface CollateralizationGovernanceContext {
  readonly system: boolean;
  readonly organizationId?: string;
  readonly actorId?: string;
}

// ---------------------------------------------------------------------------
// Durable mandate record — the tenant-scoped, restart-durable projection of
// an issued `EnterpriseCollateralizationMandate`. `status` mirrors
// `EnterpriseCollateralizationMandateStatus` ('active' | 'revoked') exactly;
// this module never invents a third mandate status, and in particular never
// promotes an externally-reported release into one. Expiry, exhaustion and
// cumulative-scope containment are derived (see `lifecycle.ts`), never stored
// as a second source of truth.
// ---------------------------------------------------------------------------

export type CollateralizationMandateStatus = 'active' | 'revoked';

export interface CollateralizationMandateRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly status: CollateralizationMandateStatus;

  /** Which governed asset this authorization covers — Protocol `ResourceRef` identity only. */
  readonly assetKind: string;
  readonly assetId: string;
  readonly assetTenantId?: string;

  /** Exactly what was authorized: rights, scope, secured obligation, secured party, executor, constraints. Copied verbatim from the validated request; never widened. */
  readonly terms: EnterpriseCollateralizationTerms;

  readonly requestRef: string;
  readonly requestedBy: string;

  /** The canonical Kernel decision that authorized this mandate. */
  readonly decisionRef: string;
  /** The Governance Store aggregate that durably proves that decision (trace, reason codes, events, integrity chain). */
  readonly evaluationRef?: string;

  readonly effectiveFrom: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly issuerRef?: string;

  readonly approvalRefs?: readonly string[];
  readonly obligationRefs?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs?: readonly string[];

  /**
   * The running sum of every `committedScope` reported by recorded execution
   * evidence, or `undefined` while nothing has been committed. The durable
   * basis for cumulative-scope containment — the invariant with no
   * tokenization analogue, and the reason this record carries a scope rather
   * than a unit count.
   *
   * A reported release does **not** decrement it: Soberanía cannot verify that an
   * external encumbrance actually ended and must never create fresh
   * collateralization headroom on the strength of an unverified report.
   */
  readonly committedScope?: EnterpriseCollateralizationScope;
  /** How many external collateralizations have been recorded. The durable basis for the `additionalCollateralizationAllowed` constraint. */
  readonly executionCount: number;

  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Durable execution record — the tenant-scoped projection of one
// `EnterpriseCollateralizationExecutionEvidence`. Append-only: there is no
// update or delete path, mirroring the Governance Store's own append-only
// posture.
// ---------------------------------------------------------------------------

export interface CollateralizationExecutionRecord {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly executorRef: string;
  readonly executedAt: string;
  readonly securedObligationRef: string;
  readonly securedPartyRef: string;
  readonly committedScope: EnterpriseCollateralizationScope;
  readonly rights: readonly EnterpriseCollateralizableRightType[];
  readonly correlationId: string;
  readonly securedAmount?: EnterpriseSecuredAmount;
  readonly externalSystem?: string;
  readonly externalRegistry?: string;
  readonly externalAgreementReference?: string;
  readonly externalFilingReference?: string;
  readonly externalTransactionReference?: string;
  readonly jurisdiction?: string;
  readonly priorityRank?: number;
  readonly evidenceRefs?: readonly string[];
  readonly recordedAt: string;
}

// ---------------------------------------------------------------------------
// Durable release record — the tenant-scoped projection of one
// `EnterpriseCollateralizationReleaseEvidence`. Also append-only, and
// deliberately a *separate* record rather than a mutation of the execution it
// refers to: the execution evidence is immutable, and what an external system
// later reported is a new observation, not a correction of the old one.
// ---------------------------------------------------------------------------

export interface CollateralizationReleaseRecord {
  readonly id: string;
  readonly mandateId: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly reportedBy: string;
  readonly releasedAt: string;
  readonly releaseType: EnterpriseCollateralReleaseType;
  readonly correlationId: string;
  readonly externalSystem?: string;
  readonly externalRegistry?: string;
  readonly externalReleaseReference?: string;
  readonly evidenceRefs?: readonly string[];
  readonly recordedAt: string;
}

// ---------------------------------------------------------------------------
// Durable revocation record — at most one per mandate, mirroring
// `AccessGrantRevocationRecord`'s and `TokenizationMandateRevocationRecord`'s
// 1:1 pairing.
// ---------------------------------------------------------------------------

export interface CollateralizationMandateRevocationRecord {
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
   * How many external collateralizations had already been recorded, and how
   * much scope they had committed, when authority was withdrawn.
   *
   * Preserved deliberately, and this is the single most important semantic
   * point of the whole module: revoking a mandate withdraws the authority to
   * perform *further* collateralization and makes no claim whatsoever about a
   * security interest an external system has already created. These fields
   * are the durable, immutable record that the authorization *had* been
   * exercised — see `lifecycle.ts` and the package README, "Revocation is not
   * release".
   */
  readonly executionsAtRevocation: number;
  readonly committedScopeAtRevocation?: EnterpriseCollateralizationScope;
}

// ---------------------------------------------------------------------------
// Store-facing input shapes.
// ---------------------------------------------------------------------------

export interface IssueCollateralizationMandateInput {
  readonly id: string;
  readonly organizationId: string;
  readonly assetKind: string;
  readonly assetId: string;
  readonly assetTenantId?: string;

  /**
   * The terms this mandate will carry. Validated by the store against
   * `requestedTerms` — a mandate may narrow what was asked for, never widen
   * it, and never substitute a different secured obligation, secured party or
   * executor. See `assertNoCollateralScopeEscalation` in `lifecycle.ts`.
   */
  readonly terms: EnterpriseCollateralizationTerms;
  /** The terms of the originating, already-validated `EnterpriseCollateralizationRequest`. */
  readonly requestedTerms: EnterpriseCollateralizationTerms;

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

export interface RecordCollateralizationExecutionInput {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly executorRef: string;
  readonly executedAt: string;
  readonly securedObligationRef: string;
  readonly securedPartyRef: string;
  readonly committedScope: EnterpriseCollateralizationScope;
  readonly rights: readonly EnterpriseCollateralizableRightType[];
  readonly correlationId: string;
  readonly securedAmount?: EnterpriseSecuredAmount;
  readonly externalSystem?: string;
  readonly externalRegistry?: string;
  readonly externalAgreementReference?: string;
  readonly externalFilingReference?: string;
  readonly externalTransactionReference?: string;
  readonly jurisdiction?: string;
  readonly priorityRank?: number;
  readonly evidenceRefs?: readonly string[];
}

export interface RecordCollateralizationReleaseInput {
  readonly id: string;
  readonly mandateId: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly reportedBy: string;
  readonly releasedAt: string;
  readonly releaseType: EnterpriseCollateralReleaseType;
  readonly correlationId: string;
  readonly externalSystem?: string;
  readonly externalRegistry?: string;
  readonly externalReleaseReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RevokeCollateralizationMandateInput {
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

export type CollateralizationRevokeOutcome =
  | {
      readonly kind: 'revoked';
      readonly mandate: CollateralizationMandateRecord;
      readonly revocation: CollateralizationMandateRevocationRecord;
    }
  | {
      readonly kind: 'already-revoked';
      readonly mandate: CollateralizationMandateRecord;
      readonly revocation: CollateralizationMandateRevocationRecord;
    };

export interface CollateralizationMandateStoreHealth {
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
 * The result of routing one `COLLATERALIZE` request through the canonical
 * governance path. `status` is the Kernel's own decision status, verbatim —
 * this module never re-labels, softens, or reinterprets it. A `mandate` is
 * present only for `allowed`; `approval_required` deliberately produces no
 * mandate, because "an approval is still outstanding" is not authorization.
 */
export interface CollateralizationRequestOutcome {
  readonly status: KernelDecisionStatus;
  readonly requestId: string;
  readonly decisionId: string;
  readonly evaluationId: string;
  readonly reasonCodes: readonly string[];
  readonly summary: string;
  readonly mandate?: CollateralizationMandateRecord;
}

/**
 * The complete governance chain behind one mandate, assembled from
 * references this module already stores — never a second,
 * collateralization-specific audit log. Every id here resolves against a
 * canonical store: the Governance Store (`evaluationRef`, `decisionRef`), the
 * Approval Runtime (`approvalRefs`), the obligation/evidence records the
 * decision produced, and this module's own append-only execution and release
 * records.
 *
 * It answers, from stored references alone: why was collateralization
 * permitted, who had authority, which rights were committed, what portion of
 * them, what obligation was secured, who the secured party was, who was
 * authorized to execute it, what restrictions applied, whether the external
 * execution was consistent with the mandate, and whether any arrangement has
 * been reported as released.
 */
export interface CollateralizationEvidenceLineage {
  readonly mandateId: string;
  readonly organizationId: string;
  readonly asset: { readonly kind: string; readonly id: string; readonly tenantId?: string };
  readonly terms: EnterpriseCollateralizationTerms;
  readonly requestRef: string;
  readonly requestedBy: string;
  readonly securedObligationRef: string;
  readonly securedPartyRef: string;
  readonly executorRef: string;
  readonly decisionRef: string;
  readonly evaluationRef?: string;
  readonly approvalRefs: readonly string[];
  readonly obligationRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly auditRefs: readonly string[];
  readonly executionRefs: readonly string[];
  readonly releaseRefs: readonly string[];
  /** The cumulative scope committed by recorded executions, or `undefined` if none has been. Never reduced by a reported release. */
  readonly committedScope?: EnterpriseCollateralizationScope;
  readonly revocationRef?: string;
}
