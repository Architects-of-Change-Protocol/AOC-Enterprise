import {
  ENTERPRISE_TRANSFER_SCHEMA_VERSION,
  enterpriseTransferMandateAuthorizes,
  enterpriseTransferScopeSum,
  enterpriseTransferTermsWithin,
  type EnterpriseTransferMandate,
  type EnterpriseTransferScope,
  type EnterpriseTransferTerms,
  type EnterpriseTransferableRightType,
} from '@aoc-enterprise/transfer-mandate';

import { TransferGovernanceError } from './errors.js';
import type { TransferMandateRecord, TransferMandateStatus } from './contracts.js';

/**
 * The TransferMandate lifecycle state machine — deliberately two stored
 * states, `'active' -> 'revoked'`, exactly mirroring
 * `EnterpriseTransferMandateStatus`, which in turn mirrors
 * `EnterpriseAccessGrantStatus`'s own two-state rationale.
 *
 * Every other state a caller might reasonably ask about is *derived* here
 * rather than stored, so it can never disagree with the facts it is derived
 * from:
 *
 * - `expired` — derived from `effectiveFrom`/`expiresAt` against the instant
 *   being asked about.
 * - `exhausted` — derived from recorded execution evidence measured against
 *   `terms.scope` and `terms.constraints.partialTransferAllowed`.
 * - `superseded` — deliberately not modelled at all: it is a relationship
 *   between two mandates, not a property of either.
 * - `completed` / `settled` / `reversed` — deliberately not modelled as
 *   mandate state at all. See below.
 *
 * ## Revocation is not reversal
 *
 * This is the distinction that matters most for this action, and it is the
 * strongest form of "revocation is not release" for collateral and "revocation
 * is not termination" for licences.
 *
 * Revoking a mandate withdraws the authority to move *further* rights from
 * that moment. It does **not** undo, unwind, rescind, or reverse a movement an
 * external system has already effected — AOC governs authority and cannot pull
 * back a right it never held and did not move. Execution evidence recorded
 * before revocation is preserved immutably, and the revocation record itself
 * preserves both the execution count and the cumulative transferred scope at
 * the moment authority was withdrawn, so the record shows precisely what
 * revocation did *not* undo.
 *
 * Conversely, an external system *reporting* that a movement was registered,
 * rejected, reversed or corrected is an observation, not a governance act: it
 * is recorded as `TransferLifecycleRecord` and changes neither the mandate's
 * status, nor its execution count, nor its transferred scope. Decrementing the
 * transferred scope on an unverified reversal report would silently
 * manufacture fresh transfer capacity over a right AOC has already recorded as
 * having left — which is precisely the escalation this module exists to
 * prevent, and the most tempting one this action offers.
 *
 * Authorizing a *reversal* (rather than merely observing one) would be a
 * separate governed request — and, because a reversal moves rights back, it
 * would be a transfer in its own right rather than an undo of this one. It is
 * deliberately not implemented here.
 *
 * ## What this module deliberately does not do
 *
 * There is no function here that grants the transferee anything. Recording
 * that a movement occurred does not make the recipient an authority holder in
 * the Authority Graph, does not issue it a capability token, and does not
 * enable it to submit governed requests over the transferred right. See
 * `docs/architecture/ADR-TRANSFER-ACTION.md`, "Post-transfer authority".
 */
export function assertTransferRevocable(status: TransferMandateStatus): void {
  if (status === 'revoked') {
    throw new TransferGovernanceError('TRANSFER_MANDATE_NOT_ACTIVE', 'This transfer mandate has already been revoked.');
  }
}

export function assertTransferActive(status: TransferMandateStatus): void {
  if (status !== 'active') {
    throw new TransferGovernanceError(
      'TRANSFER_MANDATE_NOT_ACTIVE',
      'This transfer mandate is not active; no further movement of rights is authorized under it.',
    );
  }
}

/**
 * The single guard preventing a narrower request from becoming a wider
 * authorization. Enforced at the persistence boundary (not only in the
 * orchestration that normally copies terms verbatim), so no future second
 * write path can quietly turn 25% into 100%, Company B into Company C, or one
 * holder's rights into another's.
 */
export function assertNoTransferScopeEscalation(terms: EnterpriseTransferTerms, requestedTerms: EnterpriseTransferTerms): void {
  if (!enterpriseTransferTermsWithin(terms, requestedTerms)) {
    throw new TransferGovernanceError(
      'TRANSFER_SCOPE_ESCALATION',
      'A transfer mandate may narrow the portion that was requested, never widen it, and may never substitute a different transferor, transferee or bound executor: the proposed mandate terms are not contained by the requested terms.',
      {
        requestedTransferorRef: requestedTerms.transferorRef,
        mandateTransferorRef: terms.transferorRef,
        requestedTransfereeRef: requestedTerms.transfereeRef,
        mandateTransfereeRef: terms.transfereeRef,
        requestedScope: requestedTerms.scope,
        mandateScope: terms.scope,
      },
    );
  }
}

/** Projects a durable record back onto the canonical, pure `EnterpriseTransferMandate` shape so authorization is decided by the frozen contract, never by a second copy of its rules living here. */
export function toCanonicalTransferMandate(record: TransferMandateRecord): EnterpriseTransferMandate {
  return {
    schemaVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
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

export interface TransferExerciseProposal {
  readonly executedBy: string;
  readonly transferorRef: string;
  readonly transfereeRef: string;
  readonly rights: readonly EnterpriseTransferableRightType[];
  readonly transferredScope: EnterpriseTransferScope;
  readonly executedAt: string;
  readonly registry?: string;
  readonly externalAcceptanceReference?: string;
  readonly externalConsiderationReference?: string;
  readonly externalAgreementReference?: string;
}

/**
 * Decides whether a durable mandate record authorizes one proposed external
 * movement, delegating the decision itself entirely to the canonical
 * `enterpriseTransferMandateAuthorizes`. Throws
 * `TRANSFER_EXECUTION_NOT_AUTHORIZED` carrying the contract's own refusal
 * code, so callers see exactly why — revoked, expired, wrong executor, wrong
 * source holder, wrong recipient, unauthorized rights, a portion larger than
 * (or incommensurable with) the mandate's, a partial movement under a mandate
 * that forbids partiality, a cumulative total that would exceed what was
 * authorized, a registry outside the permitted list, or a missing required
 * acceptance, consideration or agreement reference.
 *
 * The already-transferred total is read from the durable record rather than
 * supplied by the caller, so a caller cannot understate what has already moved
 * in order to move more.
 *
 * The three evidence requirements are passed as presence flags rather than
 * values: each constraint asks whether a reference was reported, and AOC never
 * interprets, resolves, or verifies what any of them names. In particular
 * `externalConsiderationReference` is never an amount, and no arithmetic is
 * performed on it anywhere.
 */
export function assertTransferExerciseAuthorized(record: TransferMandateRecord, proposal: TransferExerciseProposal): void {
  const result = enterpriseTransferMandateAuthorizes(toCanonicalTransferMandate(record), {
    executedBy: proposal.executedBy,
    transferorRef: proposal.transferorRef,
    transfereeRef: proposal.transfereeRef,
    rights: proposal.rights,
    scope: proposal.transferredScope,
    at: proposal.executedAt,
    priorExecutionCount: record.executionCount,
    hasRecipientAcceptance: proposal.externalAcceptanceReference !== undefined,
    hasConsiderationEvidence: proposal.externalConsiderationReference !== undefined,
    hasExternalAgreementReference: proposal.externalAgreementReference !== undefined,
    ...(record.transferredScope !== undefined ? { alreadyTransferredScope: record.transferredScope } : {}),
    ...(proposal.registry !== undefined ? { registry: proposal.registry } : {}),
  });
  if (!result.authorized) {
    throw new TransferGovernanceError('TRANSFER_EXECUTION_NOT_AUTHORIZED', result.reason, {
      refusalCode: result.code,
      mandateId: record.id,
    });
  }
}

/**
 * Adds a newly-recorded movement to the mandate's running transferred total,
 * or returns `null` when the two are not commensurable.
 *
 * A `null` return is propagated as a refusal by the caller, never treated as
 * zero: `enterpriseTransferMandateAuthorizes` has already refused an
 * incommensurable pair by this point, so reaching `null` here would mean the
 * store's own accounting had diverged from the contract's, and continuing
 * would record a total AOC could not justify.
 */
export function nextTransferredScope(
  current: EnterpriseTransferScope | undefined,
  addition: EnterpriseTransferScope,
): EnterpriseTransferScope | null {
  if (current === undefined) return addition;
  return enterpriseTransferScopeSum(current, addition);
}
