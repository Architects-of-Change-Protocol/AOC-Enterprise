import {
  ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
  enterpriseTokenizationMandateAuthorizes,
  enterpriseTokenizationTermsWithin,
  type EnterpriseTokenizationMandate,
  type EnterpriseTokenizationScope,
  type EnterpriseTokenizationTerms,
  type EnterpriseTokenizedRightType,
} from '@aoc-enterprise/tokenization-mandate';

import { TokenizationGovernanceError } from './errors.js';
import type { TokenizationMandateRecord, TokenizationMandateStatus } from './contracts.js';

/**
 * The TokenizationMandate lifecycle state machine — deliberately two stored
 * states, `'active' -> 'revoked'`, exactly mirroring
 * `EnterpriseTokenizationMandateStatus`, which in turn mirrors
 * `EnterpriseAccessGrantStatus`'s own two-state rationale.
 *
 * Every other state a caller might reasonably ask about is *derived* here
 * rather than stored, so it can never disagree with the facts it is derived
 * from:
 *
 * - `expired` — derived from `effectiveFrom`/`expiresAt` against the instant
 *   being asked about.
 * - `exhausted` (the task's "consumed") — derived from recorded execution
 *   evidence measured against `terms.constraints.additionalIssuanceAllowed`
 *   and `maximumIssuedUnits`.
 * - `superseded` — deliberately not modelled at all: it is a relationship
 *   between two mandates, not a property of either, and nothing in this
 *   repository's evidence requires it yet.
 *
 * Revocation semantics (important, and deliberately narrow): revoking a
 * mandate withdraws the authority to perform *additional* external issuance.
 * It makes no claim whatsoever about tokens an external system has already
 * issued — Soberanía governs authority and does not pretend to hold technical
 * powers an external tokenization system does not grant it. Execution
 * evidence recorded before revocation is preserved immutably, and the
 * revocation record itself preserves the execution count at the moment
 * authority was withdrawn.
 */
export function assertRevocable(status: TokenizationMandateStatus): void {
  if (status === 'revoked') {
    throw new TokenizationGovernanceError('TOKENIZATION_MANDATE_NOT_ACTIVE', 'This tokenization mandate has already been revoked.');
  }
}

export function assertActive(status: TokenizationMandateStatus): void {
  if (status !== 'active') {
    throw new TokenizationGovernanceError(
      'TOKENIZATION_MANDATE_NOT_ACTIVE',
      'This tokenization mandate is not active; no further external issuance is authorized under it.',
    );
  }
}

/**
 * The single guard preventing a narrower request from becoming a wider
 * authorization. Enforced at the persistence boundary (not only in the
 * orchestration that normally copies terms verbatim), so no future second
 * write path can quietly turn `20%` into `100%`.
 */
export function assertNoScopeEscalation(terms: EnterpriseTokenizationTerms, requestedTerms: EnterpriseTokenizationTerms): void {
  if (!enterpriseTokenizationTermsWithin(terms, requestedTerms)) {
    throw new TokenizationGovernanceError(
      'TOKENIZATION_SCOPE_ESCALATION',
      'A tokenization mandate may narrow the terms that were requested, never widen them: the proposed mandate terms are not contained by the requested terms.',
      { requestedScope: requestedTerms.scope, mandateScope: terms.scope },
    );
  }
}

/** Projects a durable record back onto the canonical, pure `EnterpriseTokenizationMandate` shape so authorization is decided by the frozen contract, never by a second copy of its rules living here. */
export function toCanonicalMandate(record: TokenizationMandateRecord): EnterpriseTokenizationMandate {
  return {
    schemaVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
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

export interface TokenizationExerciseProposal {
  readonly executorRef: string;
  readonly rights: readonly EnterpriseTokenizedRightType[];
  readonly issuedScope: EnterpriseTokenizationScope;
  readonly executedAt: string;
  readonly issuedUnits?: number;
}

/**
 * Decides whether a durable mandate record authorizes one proposed external
 * issuance, delegating the decision itself entirely to the canonical
 * `enterpriseTokenizationMandateAuthorizes`. Throws
 * `TOKENIZATION_EXECUTION_NOT_AUTHORIZED` carrying the contract's own
 * refusal code, so callers see exactly why — revoked, expired, wrong
 * executor, unauthorized rights, scope exceeded, additional issuance
 * prohibited, or issuance ceiling exceeded.
 */
export function assertExerciseAuthorized(record: TokenizationMandateRecord, proposal: TokenizationExerciseProposal): void {
  const result = enterpriseTokenizationMandateAuthorizes(toCanonicalMandate(record), {
    executorRef: proposal.executorRef,
    rights: proposal.rights,
    scope: proposal.issuedScope,
    at: proposal.executedAt,
    alreadyIssuedUnits: record.issuedUnits,
    priorExecutionCount: record.executionCount,
    ...(proposal.issuedUnits !== undefined ? { issuingUnits: proposal.issuedUnits } : {}),
  });
  if (!result.authorized) {
    throw new TokenizationGovernanceError('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', result.reason, { refusalCode: result.code, mandateId: record.id });
  }
}
