import {
  ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
  enterpriseCollateralizationMandateAuthorizes,
  enterpriseCollateralizationScopeSum,
  enterpriseCollateralizationTermsWithin,
  type EnterpriseCollateralizableRightType,
  type EnterpriseCollateralizationMandate,
  type EnterpriseCollateralizationScope,
  type EnterpriseCollateralizationTerms,
  type EnterpriseSecuredAmount,
} from '@aoc-enterprise/collateralization-mandate';

import { CollateralizationGovernanceError } from './errors.js';
import type { CollateralizationMandateRecord, CollateralizationMandateStatus } from './contracts.js';

/**
 * The CollateralizationMandate lifecycle state machine — deliberately two
 * stored states, `'active' -> 'revoked'`, exactly mirroring
 * `EnterpriseCollateralizationMandateStatus`, which in turn mirrors
 * `EnterpriseAccessGrantStatus`'s own two-state rationale.
 *
 * Every other state a caller might reasonably ask about is *derived* here
 * rather than stored, so it can never disagree with the facts it is derived
 * from:
 *
 * - `expired` — derived from `effectiveFrom`/`expiresAt` against the instant
 *   being asked about.
 * - `exhausted` — derived from recorded execution evidence measured against
 *   `terms.scope` (cumulatively) and
 *   `terms.constraints.additionalCollateralizationAllowed`.
 * - `superseded` — deliberately not modelled at all: it is a relationship
 *   between two mandates, not a property of either.
 * - `released` / `discharged` — deliberately not modelled as mandate state at
 *   all. See below.
 *
 * ## Revocation is not release
 *
 * This is the distinction that matters most for this action, and the point
 * where collateralization differs sharply from tokenization.
 *
 * Revoking a mandate withdraws the authority to perform *additional* external
 * collateralization from that moment. It does **not** release, discharge,
 * terminate, or invalidate a security interest an external system has already
 * created — AOC governs authority and does not pretend to hold legal or
 * technical powers over an arrangement it never executed. Execution evidence
 * recorded before revocation is preserved immutably, and the revocation
 * record itself preserves both the execution count and the committed scope at
 * the moment authority was withdrawn.
 *
 * Conversely, an external system *reporting* a release is an observation, not
 * a governance act: it is recorded as `CollateralizationReleaseRecord` and
 * changes neither the mandate's status nor its committed scope. Decrementing
 * committed scope on an unverified report would silently manufacture fresh
 * collateralization headroom, which is precisely the escalation this module
 * exists to prevent.
 *
 * Authorizing a *release* (rather than merely observing one) would be a
 * separate governed action with its own request, decision and mandate. It is
 * deliberately not implemented here.
 */
export function assertCollateralizationRevocable(status: CollateralizationMandateStatus): void {
  if (status === 'revoked') {
    throw new CollateralizationGovernanceError('COLLATERALIZATION_MANDATE_NOT_ACTIVE', 'This collateralization mandate has already been revoked.');
  }
}

export function assertCollateralizationActive(status: CollateralizationMandateStatus): void {
  if (status !== 'active') {
    throw new CollateralizationGovernanceError(
      'COLLATERALIZATION_MANDATE_NOT_ACTIVE',
      'This collateralization mandate is not active; no further external collateralization is authorized under it.',
    );
  }
}

/**
 * The single guard preventing a narrower request from becoming a wider
 * authorization. Enforced at the persistence boundary (not only in the
 * orchestration that normally copies terms verbatim), so no future second
 * write path can quietly turn `20%` into `100%`, swap Obligation A for
 * Obligation B, or substitute a different secured party or executor.
 */
export function assertNoCollateralScopeEscalation(
  terms: EnterpriseCollateralizationTerms,
  requestedTerms: EnterpriseCollateralizationTerms,
): void {
  if (!enterpriseCollateralizationTermsWithin(terms, requestedTerms)) {
    throw new CollateralizationGovernanceError(
      'COLLATERALIZATION_SCOPE_ESCALATION',
      'A collateralization mandate may narrow the terms that were requested, never widen them: the proposed mandate terms are not contained by the requested terms.',
      {
        requestedScope: requestedTerms.scope,
        mandateScope: terms.scope,
        requestedSecuredObligationRef: requestedTerms.securedObligationRef,
        mandateSecuredObligationRef: terms.securedObligationRef,
        requestedSecuredPartyRef: requestedTerms.securedPartyRef,
        mandateSecuredPartyRef: terms.securedPartyRef,
      },
    );
  }
}

/** Projects a durable record back onto the canonical, pure `EnterpriseCollateralizationMandate` shape so authorization is decided by the frozen contract, never by a second copy of its rules living here. */
export function toCanonicalCollateralizationMandate(record: CollateralizationMandateRecord): EnterpriseCollateralizationMandate {
  return {
    schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
    id: record.id,
    status: record.status,
    asset: {
      kind: record.assetKind,
      id: record.assetId,
      ...(record.assetTenantId !== undefined ? { tenantId: record.assetTenantId } : {}),
    },
    terms: record.terms,
    requestRef: record.requestRef,
    requestedBy: record.requestedBy,
    decisionRef: record.decisionRef,
    effectiveFrom: record.effectiveFrom,
    expiresAt: record.expiresAt,
    correlationId: record.correlationId,
    ...(record.evaluationRef !== undefined ? { evaluationRef: record.evaluationRef } : {}),
    ...(record.issuerRef !== undefined ? { issuerRef: record.issuerRef } : {}),
    ...(record.approvalRefs !== undefined ? { approvalRefs: record.approvalRefs } : {}),
    ...(record.obligationRefs !== undefined ? { obligationRefs: record.obligationRefs } : {}),
    ...(record.evidenceRefs !== undefined ? { evidenceRefs: record.evidenceRefs } : {}),
    ...(record.auditRefs !== undefined ? { auditRefs: record.auditRefs } : {}),
  };
}

export interface CollateralizationExerciseProposal {
  readonly executorRef: string;
  readonly securedObligationRef: string;
  readonly securedPartyRef: string;
  readonly rights: readonly EnterpriseCollateralizableRightType[];
  readonly committedScope: EnterpriseCollateralizationScope;
  readonly executedAt: string;
  readonly securedAmount?: EnterpriseSecuredAmount;
  readonly externalRegistry?: string;
  readonly jurisdiction?: string;
  readonly priorityRank?: number;
}

/**
 * Decides whether a durable mandate record authorizes one proposed external
 * collateralization, delegating the decision itself entirely to the canonical
 * `enterpriseCollateralizationMandateAuthorizes`. Throws
 * `COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED` carrying the contract's own
 * refusal code, so callers see exactly why — revoked, expired, wrong
 * executor, wrong secured obligation, wrong secured party, unauthorized
 * rights, scope exceeded, cumulative scope exceeded, additional
 * collateralization prohibited, secured amount over the ceiling, or a
 * registry / jurisdiction / priority ranking outside what the mandate
 * permits.
 */
export function assertCollateralExerciseAuthorized(
  record: CollateralizationMandateRecord,
  proposal: CollateralizationExerciseProposal,
): void {
  const result = enterpriseCollateralizationMandateAuthorizes(toCanonicalCollateralizationMandate(record), {
    executorRef: proposal.executorRef,
    securedObligationRef: proposal.securedObligationRef,
    securedPartyRef: proposal.securedPartyRef,
    rights: proposal.rights,
    scope: proposal.committedScope,
    at: proposal.executedAt,
    priorExecutionCount: record.executionCount,
    ...(record.committedScope !== undefined ? { alreadyCommittedScope: record.committedScope } : {}),
    ...(proposal.securedAmount !== undefined ? { securedAmount: proposal.securedAmount } : {}),
    ...(proposal.externalRegistry !== undefined ? { externalRegistry: proposal.externalRegistry } : {}),
    ...(proposal.jurisdiction !== undefined ? { jurisdiction: proposal.jurisdiction } : {}),
    ...(proposal.priorityRank !== undefined ? { priorityRank: proposal.priorityRank } : {}),
  });
  if (!result.authorized) {
    throw new CollateralizationGovernanceError('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', result.reason, {
      refusalCode: result.code,
      mandateId: record.id,
    });
  }
}

/**
 * The cumulative committed scope a mandate would carry after admitting one
 * further commitment. Returns `null` when the two scopes are not
 * commensurable, which callers must surface as a refusal rather than
 * treating as "no change" — the authorization check has already refused that
 * case, and this function must not paper over a second write path that
 * somehow reached it.
 */
export function nextCommittedCollateralScope(
  current: EnterpriseCollateralizationScope | undefined,
  addition: EnterpriseCollateralizationScope,
): EnterpriseCollateralizationScope | null {
  if (current === undefined) return addition;
  return enterpriseCollateralizationScopeSum(current, addition);
}
