import type {
  EnterpriseTokenizationScope,
  EnterpriseTokenizationTerms,
  EnterpriseTokenizedRightType,
} from '@aoc-enterprise/tokenization-mandate';

import type { KernelDecisionStatus } from '../../kernel/index.js';

/**
 * Tokenization Governance Runtime — the durable, tenant-scoped home for the
 * `TOKENIZE` governed capability.
 *
 * This module adds no governance semantics. A `TOKENIZE` request is
 * evaluated by `AocKernel` exactly like every other capability request
 * (authority, policy, approvals, obligations, evidence), and the evaluation
 * is durably recorded by the canonical Governance Store as one integrity-
 * chained aggregate. What this module adds is the part the generalized path
 * genuinely does not have: a durable record of *what exactly was authorized*
 * (`EnterpriseTokenizationMandate`) and *what was actually done under it*
 * (`EnterpriseTokenizationExecutionEvidence`), both tenant-scoped and both
 * traceable back to the canonical decision that produced them.
 *
 * This is deliberately NOT a redesign of any canonical contract: the frozen
 * `@aoc-enterprise/tokenization-mandate` contracts are consumed as-is (via
 * `validateEnterpriseTokenizationMandate` / `serialize*` at the store
 * boundary). The record shapes below are this module's own durable *row*
 * shapes — tenant and bookkeeping fields the pure contracts have no field
 * for — never a competing definition of what a mandate *is*.
 *
 * Boundary: Soberanía Enterprise governs the authority to tokenize. It is not the
 * tokenization platform. Nothing in this module mints, issues, transfers, or
 * values a token, holds a key, or speaks to a chain; there is no provider
 * adapter here and none is implied by these types.
 */

// ---------------------------------------------------------------------------
// Access context (tenant / trust-domain scoping) — mirrors
// `AccessGovernanceContext` (`../access-governance/contracts.ts`) and
// `PassportAccessContext` (`../passport/contracts.ts`) verbatim in shape and
// intent: a system caller sees every tenant; a tenant caller must name its
// own `organizationId` and can never see or mutate another tenant's records.
// ---------------------------------------------------------------------------

export interface TokenizationGovernanceContext {
  readonly system: boolean;
  readonly organizationId?: string;
  readonly actorId?: string;
}

// ---------------------------------------------------------------------------
// Durable mandate record — the tenant-scoped, restart-durable projection of
// an issued `EnterpriseTokenizationMandate`. `status` mirrors
// `EnterpriseTokenizationMandateStatus` ('active' | 'revoked') exactly; this
// module never invents a third mandate status. Expiry and exhaustion are
// derived (see `lifecycle.ts`), never stored as a second source of truth.
// ---------------------------------------------------------------------------

export type TokenizationMandateStatus = 'active' | 'revoked';

export interface TokenizationMandateRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly status: TokenizationMandateStatus;

  /** Which governed asset this authorization covers — Protocol `ResourceRef` identity only. */
  readonly assetKind: string;
  readonly assetId: string;
  readonly assetTenantId?: string;

  /** Exactly what was authorized: rights, scope, executor, constraints. Copied verbatim from the validated request; never widened. */
  readonly terms: EnterpriseTokenizationTerms;

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

  /** Running total of external units reported by recorded execution evidence. The durable basis for the `maximumIssuedUnits` constraint. */
  readonly issuedUnits: number;
  /** How many external issuances have been recorded. The durable basis for the `additionalIssuanceAllowed` constraint. */
  readonly executionCount: number;

  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Durable execution record — the tenant-scoped projection of one
// `EnterpriseTokenizationExecutionEvidence`. Append-only: there is no update
// or delete path, mirroring the Governance Store's own append-only posture.
// ---------------------------------------------------------------------------

export interface TokenizationExecutionRecord {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly executorRef: string;
  readonly executedAt: string;
  readonly issuedScope: EnterpriseTokenizationScope;
  readonly rights: readonly EnterpriseTokenizedRightType[];
  readonly correlationId: string;
  readonly issuedUnits?: number;
  readonly externalSystem?: string;
  readonly externalNetwork?: string;
  readonly externalTokenStandard?: string;
  readonly externalContractReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
  readonly recordedAt: string;
}

// ---------------------------------------------------------------------------
// Durable revocation record — at most one per mandate, mirroring
// `AccessGrantRevocationRecord`'s 1:1 pairing.
// ---------------------------------------------------------------------------

export interface TokenizationMandateRevocationRecord {
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
   * How many external issuances had already been recorded when authority was
   * withdrawn. Preserved deliberately: revoking a mandate withdraws the
   * authority to perform *further* issuance and makes no claim about tokens
   * an external system has already issued. This field is the durable,
   * immutable record that the authorization *had* been exercised — see
   * `lifecycle.ts`.
   */
  readonly executionsAtRevocation: number;
}

// ---------------------------------------------------------------------------
// Store-facing input shapes.
// ---------------------------------------------------------------------------

export interface IssueTokenizationMandateInput {
  readonly id: string;
  readonly organizationId: string;
  readonly assetKind: string;
  readonly assetId: string;
  readonly assetTenantId?: string;

  /**
   * The terms this mandate will carry. Validated by the store against
   * `requestedTerms` — a mandate may narrow what was asked for, never widen
   * it. See `assertNoScopeEscalation` in `lifecycle.ts`.
   */
  readonly terms: EnterpriseTokenizationTerms;
  /** The terms of the originating, already-validated `EnterpriseTokenizationRequest`. */
  readonly requestedTerms: EnterpriseTokenizationTerms;

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

export interface RecordTokenizationExecutionInput {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly executorRef: string;
  readonly executedAt: string;
  readonly issuedScope: EnterpriseTokenizationScope;
  readonly rights: readonly EnterpriseTokenizedRightType[];
  readonly correlationId: string;
  readonly issuedUnits?: number;
  readonly externalSystem?: string;
  readonly externalNetwork?: string;
  readonly externalTokenStandard?: string;
  readonly externalContractReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RevokeTokenizationMandateInput {
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

export type TokenizationRevokeOutcome =
  | { readonly kind: 'revoked'; readonly mandate: TokenizationMandateRecord; readonly revocation: TokenizationMandateRevocationRecord }
  | { readonly kind: 'already-revoked'; readonly mandate: TokenizationMandateRecord; readonly revocation: TokenizationMandateRevocationRecord };

export interface TokenizationMandateStoreHealth {
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
 * The result of routing one `TOKENIZE` request through the canonical
 * governance path. `status` is the Kernel's own decision status, verbatim —
 * this module never re-labels, softens, or reinterprets it. A `mandate` is
 * present only for `allowed`; `approval_required` deliberately produces no
 * mandate, because "an approval is still outstanding" is not authorization.
 */
export interface TokenizationRequestOutcome {
  readonly status: KernelDecisionStatus;
  readonly requestId: string;
  readonly decisionId: string;
  readonly evaluationId: string;
  readonly reasonCodes: readonly string[];
  readonly summary: string;
  readonly mandate?: TokenizationMandateRecord;
}

/**
 * The complete governance chain behind one mandate, assembled from
 * references this module already stores — never a second, tokenization-
 * specific audit log. Every id here resolves against a canonical store: the
 * Governance Store (`evaluationRef`, `decisionRef`), the Approval Runtime
 * (`approvalRefs`), the obligation/evidence records the decision produced,
 * and this module's own append-only execution records.
 */
export interface TokenizationEvidenceLineage {
  readonly mandateId: string;
  readonly organizationId: string;
  readonly asset: { readonly kind: string; readonly id: string; readonly tenantId?: string };
  readonly terms: EnterpriseTokenizationTerms;
  readonly requestRef: string;
  readonly requestedBy: string;
  readonly decisionRef: string;
  readonly evaluationRef?: string;
  readonly approvalRefs: readonly string[];
  readonly obligationRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly auditRefs: readonly string[];
  readonly executionRefs: readonly string[];
  readonly revocationRef?: string;
}
