import type {
  EnterpriseTransferLifecycleType,
  EnterpriseTransferScope,
  EnterpriseTransferTerms,
  EnterpriseTransferableRightType,
} from '@aoc-enterprise/transfer-mandate';

import type { KernelDecisionStatus } from '../../kernel/index.js';

/**
 * Transfer Governance Runtime — the durable, tenant-scoped home for the
 * `TRANSFER` governed action.
 *
 * This module adds no governance semantics. A `TRANSFER` request is evaluated
 * by `AocKernel` exactly like every other action request (authority, policy,
 * approvals, obligations, evidence), and the evaluation is durably recorded by
 * the canonical Governance Store as one integrity-chained aggregate. What this
 * module adds is the part the generalized path genuinely does not have: a
 * durable record of *what exactly was authorized to move*
 * (`EnterpriseTransferMandate`), *what actually moved under it*
 * (`EnterpriseTransferExecutionEvidence`), and *what an external system later
 * reported about that movement* (`EnterpriseTransferLifecycleEvidence`) — all
 * tenant-scoped and all traceable back to the canonical decision that produced
 * them.
 *
 * This is deliberately NOT a redesign of any canonical contract: the frozen
 * `@aoc-enterprise/transfer-mandate` contracts are consumed as-is (via
 * `validateEnterpriseTransferMandate` / `serialize*` at the store boundary).
 * The record shapes below are this module's own durable *row* shapes — tenant
 * and bookkeeping fields the pure contracts have no field for — never a
 * competing definition of what a mandate *is*.
 *
 * It is also deliberately a sibling of `../tokenization-governance/`,
 * `../collateralization-governance/` and `../license-governance/`, not a
 * generalization of any of them: the four modules are structurally parallel
 * because the repository's governance lifecycle is the same for all of them,
 * and semantically distinct wherever transfer differs — a source party as well
 * as a recipient, a quantity that is *conserved* rather than merely bounded,
 * an absolutely binding recipient with no assignment escape, an *optional*
 * executor, and a single flag that decides both partiality and repeatability
 * because for a transfer those are the same question. See
 * `docs/enterprise/AOC_TRANSFER_ACTION.md`.
 *
 * ## The boundary this module holds hardest
 *
 * **Recording that a transfer executed does not move authority.** Nothing in
 * this module writes to the Authority Graph, issues a capability token, or
 * changes what the recipient may do. That is a deliberate architectural
 * position with a recorded consequence: after a fully-evidenced transfer, AOC
 * still does not recognize the recipient as authorized over the transferred
 * right, and a separate administrative act is required. See
 * `docs/architecture/ADR-TRANSFER-ACTION.md`, "Post-transfer authority", and
 * the test suite `src/enterprise/__tests__/transfer-authority-transition.test.ts`,
 * which measures this rather than assuming it.
 *
 * Boundary: AOC Enterprise governs the authority to transfer. It is not a
 * registry, a transfer agent, a custodian, a settlement system, an escrow, or
 * a title system. Nothing in this module moves a right, updates a register,
 * prices or values anything, holds or settles consideration, calculates tax,
 * or contacts any external system; there is no provider adapter here and none
 * is implied by these types.
 */

// ---------------------------------------------------------------------------
// Access context (tenant / trust-domain scoping) — mirrors
// `AccessGovernanceContext` (`../access-governance/contracts.ts`),
// `PassportAccessContext` (`../passport/contracts.ts`),
// `TokenizationGovernanceContext`, `CollateralizationGovernanceContext` and
// `LicenseGovernanceContext` verbatim in shape and intent: a system caller
// sees every tenant; a tenant caller must name its own `organizationId` and
// can never see or mutate another tenant's records.
// ---------------------------------------------------------------------------

export interface TransferGovernanceContext {
  readonly system: boolean;
  readonly organizationId?: string;
  readonly actorId?: string;
}

// ---------------------------------------------------------------------------
// Durable mandate record — the tenant-scoped, restart-durable projection of an
// issued `EnterpriseTransferMandate`. `status` mirrors
// `EnterpriseTransferMandateStatus` ('active' | 'revoked') exactly; this module
// never invents a third mandate status, and in particular never promotes an
// externally-reported completion, registration or reversal into one. Expiry,
// exhaustion and scope containment are derived (see `lifecycle.ts`), never
// stored as a second source of truth.
// ---------------------------------------------------------------------------

export type TransferMandateStatus = 'active' | 'revoked';

export interface TransferMandateRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly status: TransferMandateStatus;

  /** Which governed asset the moving rights belong to — Protocol `ResourceRef` identity only. */
  readonly assetKind: string;
  readonly assetId: string;
  readonly assetTenantId?: string;

  /** Exactly what was authorized: rights, scope, transferor, transferee, constraints, and any bound executor. Copied verbatim from the validated request; never widened. */
  readonly terms: EnterpriseTransferTerms;

  readonly requestRef: string;
  readonly requestedBy: string;

  /** The canonical Kernel decision that authorized this mandate. */
  readonly decisionRef: string;
  /** The Governance Store aggregate that durably proves that decision (trace, reason codes, events, integrity chain). */
  readonly evaluationRef?: string;

  /** When AOC's authority to move rights under this mandate begins. Not the external movement's effective date. */
  readonly effectiveFrom: string;
  /** When AOC's authority to move rights under this mandate ends. Says nothing about rights already moved. */
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly issuerRef?: string;

  readonly approvalRefs?: readonly string[];
  readonly obligationRefs?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs?: readonly string[];

  /**
   * The running sum of every `transferredScope` reported by recorded execution
   * evidence under this mandate, or absent when nothing has moved yet.
   *
   * Structurally the analogue of
   * `CollateralizationMandateRecord.committedScope`, and semantically a
   * stronger invariant. Collateral scope accumulates because encumbering a
   * finite right twice exhausts it; transferred scope accumulates because the
   * right *left*, and what has left cannot leave again. The contrast with
   * `LicenseMandateRecord`, which deliberately has no such column, is the
   * finding: a per-license unit ceiling does not accumulate because granting
   * ten seats to one licensee and ten to another exhausts nothing about the
   * asset, whereas moving 25% twice moves 50%.
   *
   * A reported reversal or correction does **not** decrement it: AOC cannot
   * verify that an external movement was actually undone and must never create
   * fresh transfer capacity on the strength of an unverified report.
   */
  readonly transferredScope?: EnterpriseTransferScope;

  /**
   * How many external movements have been recorded under this mandate. The
   * durable basis for the `partialTransferAllowed` constraint, which for this
   * action bounds repetition and partiality with one flag — see
   * `EnterpriseTransferConstraints`.
   */
  readonly executionCount: number;

  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Durable execution record — the tenant-scoped projection of one
// `EnterpriseTransferExecutionEvidence`. Append-only: there is no update or
// delete path, mirroring the Governance Store's own append-only posture.
// ---------------------------------------------------------------------------

export interface TransferExecutionRecord {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  /** Who effected the external movement. Checked against the mandate's `executorRef` only when the mandate bound one. */
  readonly executedBy: string;
  readonly executedAt: string;
  readonly transferorRef: string;
  readonly transfereeRef: string;
  readonly rights: readonly EnterpriseTransferableRightType[];
  readonly transferredScope: EnterpriseTransferScope;
  readonly correlationId: string;
  readonly transferEffectiveAt?: string;
  readonly registry?: string;
  readonly externalSystem?: string;
  readonly externalAgreementReference?: string;
  readonly externalAcceptanceReference?: string;
  /** Opaque reference only — never an amount. AOC computes, holds and settles nothing. */
  readonly externalConsiderationReference?: string;
  readonly externalRegistrationReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
  readonly recordedAt: string;
}

// ---------------------------------------------------------------------------
// Durable lifecycle record — the tenant-scoped projection of one
// `EnterpriseTransferLifecycleEvidence`. Also append-only, and deliberately a
// *separate* record rather than a mutation of the execution it refers to: the
// execution evidence is immutable, and what an external system later reported
// is a new observation, not a correction of the old one.
// ---------------------------------------------------------------------------

export interface TransferLifecycleRecord {
  readonly id: string;
  readonly mandateId: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly reportedBy: string;
  readonly occurredAt: string;
  readonly lifecycleType: EnterpriseTransferLifecycleType;
  readonly correlationId: string;
  readonly externalSystem?: string;
  readonly externalReference?: string;
  readonly evidenceRefs?: readonly string[];
  readonly recordedAt: string;
}

// ---------------------------------------------------------------------------
// Durable revocation record — at most one per mandate, mirroring
// `AccessGrantRevocationRecord`'s, `TokenizationMandateRevocationRecord`'s,
// `CollateralizationMandateRevocationRecord`'s and
// `LicenseMandateRevocationRecord`'s 1:1 pairing.
// ---------------------------------------------------------------------------

export interface TransferMandateRevocationRecord {
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
   * How many external movements had already been effected when authority was
   * withdrawn.
   *
   * Preserved deliberately, and — with `transferredScopeAtRevocation` — the
   * single most important semantic point of the whole module: revoking a
   * mandate withdraws the authority to move *further* rights and makes no
   * claim whatsoever about rights an external system has already moved. AOC
   * cannot pull a transferred right back, and a revocation that implied it
   * could would be the most consequential lie this system could tell.
   */
  readonly executionsAtRevocation: number;

  /** How much had already moved when authority was withdrawn. Immutable proof of what revocation did *not* undo. */
  readonly transferredScopeAtRevocation?: EnterpriseTransferScope;
}

// ---------------------------------------------------------------------------
// Store-facing input shapes.
// ---------------------------------------------------------------------------

export interface IssueTransferMandateInput {
  readonly id: string;
  readonly organizationId: string;
  readonly assetKind: string;
  readonly assetId: string;
  readonly assetTenantId?: string;

  /**
   * The terms this mandate will carry. Validated by the store against
   * `requestedTerms` — a mandate may narrow the portion that was asked for,
   * never widen it, and never substitute a different transferor, transferee or
   * bound executor. See `assertNoTransferScopeEscalation` in `lifecycle.ts`.
   */
  readonly terms: EnterpriseTransferTerms;
  /** The terms of the originating, already-validated `EnterpriseTransferRequest`. */
  readonly requestedTerms: EnterpriseTransferTerms;

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

export interface RecordTransferExecutionInput {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly executedBy: string;
  readonly executedAt: string;
  readonly transferorRef: string;
  readonly transfereeRef: string;
  readonly rights: readonly EnterpriseTransferableRightType[];
  readonly transferredScope: EnterpriseTransferScope;
  readonly correlationId: string;
  readonly transferEffectiveAt?: string;
  readonly registry?: string;
  readonly externalSystem?: string;
  readonly externalAgreementReference?: string;
  readonly externalAcceptanceReference?: string;
  readonly externalConsiderationReference?: string;
  readonly externalRegistrationReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RecordTransferLifecycleInput {
  readonly id: string;
  readonly mandateId: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly reportedBy: string;
  readonly occurredAt: string;
  readonly lifecycleType: EnterpriseTransferLifecycleType;
  readonly correlationId: string;
  readonly externalSystem?: string;
  readonly externalReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RevokeTransferMandateInput {
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

export type TransferRevokeOutcome =
  | {
      readonly kind: 'revoked';
      readonly mandate: TransferMandateRecord;
      readonly revocation: TransferMandateRevocationRecord;
    }
  | {
      readonly kind: 'already-revoked';
      readonly mandate: TransferMandateRecord;
      readonly revocation: TransferMandateRevocationRecord;
    };

export interface TransferMandateStoreHealth {
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
 * The result of routing one `TRANSFER` request through the canonical
 * governance path. `status` is the Kernel's own decision status, verbatim —
 * this module never re-labels, softens, or reinterprets it. A `mandate` is
 * present only for `allowed`; `approval_required` deliberately produces no
 * mandate, because "an approval is still outstanding" is not authorization.
 */
export interface TransferRequestOutcome {
  readonly status: KernelDecisionStatus;
  readonly requestId: string;
  readonly decisionId: string;
  readonly evaluationId: string;
  readonly reasonCodes: readonly string[];
  readonly summary: string;
  readonly mandate?: TransferMandateRecord;
}

/**
 * The complete governance chain behind one mandate, assembled from references
 * this module already stores — never a second, transfer-specific audit log.
 * Every id here resolves against a canonical store: the Governance Store
 * (`evaluationRef`, `decisionRef`), the Approval Runtime (`approvalRefs`), the
 * obligation/evidence records the decision produced, and this module's own
 * append-only execution and lifecycle records.
 *
 * It answers, from stored references alone: why was the transfer permitted,
 * who had authority, which governed rights were involved, how much of them,
 * whose rights were they, who received them, under what restrictions, who was
 * authorized to effect it if anyone was bound, what obligations existed,
 * whether the external movement was consistent with the mandate, how much has
 * actually moved, whether future authority has been revoked, and what external
 * lifecycle evidence exists.
 *
 * It deliberately does **not** answer "what may the recipient now do?" — that
 * question is answered by the Authority Graph, which this module does not
 * write to. See `docs/architecture/ADR-TRANSFER-ACTION.md`.
 */
export interface TransferEvidenceLineage {
  readonly mandateId: string;
  readonly organizationId: string;
  readonly asset: { readonly kind: string; readonly id: string; readonly tenantId?: string };
  readonly terms: EnterpriseTransferTerms;
  readonly requestRef: string;
  readonly requestedBy: string;
  /** Lifted out of `terms` deliberately: "from whom, to whom, and how much" are the questions a transfer reviewer asks first. */
  readonly transferorRef: string;
  readonly transfereeRef: string;
  readonly rights: readonly EnterpriseTransferableRightType[];
  readonly authorizedScope: EnterpriseTransferScope;
  /** How much has actually moved, per recorded evidence. Absent means nothing has moved yet — never "none authorized". */
  readonly transferredScope?: EnterpriseTransferScope;
  /** Present only when this authorization bound an external executor. Absent means the mandate did not bind who effects the movement. */
  readonly executorRef?: string;
  readonly partialTransferAllowed: boolean;
  readonly permittedRegistries?: readonly string[];
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
