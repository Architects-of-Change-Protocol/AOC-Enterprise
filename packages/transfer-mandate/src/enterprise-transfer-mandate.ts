import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import { resourceRefIdentityEquals } from '@aoc-enterprise/resource-envelope';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { GovernedAuthorizationArtifact, GovernedAuthorizationStatus } from '@aoc-enterprise/governed-authorization';

import {
  ENTERPRISE_TRANSFER_SCHEMA_VERSION,
  collectEnterpriseTransferTermsIssues,
  enterpriseTransferScopeEquals,
  enterpriseTransferScopeSum,
  enterpriseTransferScopeWithin,
  enterpriseTransferTermsEquals,
  isTransferCanonicalIdArray,
  isTransferNonEmptyString,
  isTransferPlainObject,
  isTransferTimestamp,
  readEnterpriseTransferTerms,
  serializeEnterpriseTransferTerms,
  transferOptionalStringArrayEquals,
} from './enterprise-transfer-terms.js';
import { readTransferResourceRef, serializeTransferResourceRef } from './enterprise-transfer-request.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { EnterpriseTransferScope, EnterpriseTransferTerms, EnterpriseTransferTermsValidationCode, EnterpriseTransferableRightType, SerializedEnterpriseTransferTerms } from './enterprise-transfer-terms.js';
import type { SerializedEnterpriseTransferRequest } from './enterprise-transfer-request.js';

/**
 * The mandate's own authorization lifecycle -- deliberately not "is this
 * mandate currently usable", and emphatically not "did the transfer happen".
 *
 * `'active'` records that this is, as far as the mandate's own history is
 * concerned, the operative authorization; `'revoked'` records that a later,
 * separate act withdrew it.
 *
 * `'expired'`, `'exhausted'`, `'superseded'`, and -- specifically for this
 * action -- `'completed'`, `'settled'` and `'reversed'` are deliberately NOT
 * status values, mirroring `EnterpriseAccessGrantStatus`'s,
 * `EnterpriseTokenizationMandateStatus`'s,
 * `EnterpriseCollateralizationMandateStatus`'s and
 * `EnterpriseLicenseMandateStatus`'s own two-state rationale, plus two reasons
 * specific to transfer:
 *
 * - Expiry of the *authorization* is fully represented by
 *   `effectiveFrom`/`expiresAt`; exhaustion by recorded execution evidence
 *   measured against `terms.scope` and
 *   `terms.constraints.partialTransferAllowed`; supersession is a relationship
 *   between two mandates, not a property of either.
 * - **A completed transfer is a fact about the world, not about this
 *   authorization.** A registry reporting that a movement settled does not
 *   change what AOC authorized, and a `'completed'` status would quietly turn
 *   an unverified external report into a governance conclusion. The strongest
 *   temptation this action creates is to let external completion write back
 *   into governance state, and it is refused throughout.
 * - **A reported reversal is likewise not a status, and it restores nothing.**
 *   Recording that an external system reversed a transfer does not decrement
 *   the transferred scope, because AOC cannot verify the reversal and must not
 *   manufacture fresh transfer capacity from an unverified report. See
 *   `EnterpriseTransferLifecycleEvidence`.
 */
export type EnterpriseTransferMandateStatus = GovernedAuthorizationStatus;

/**
 * The canonical Enterprise-owned contract for **the durable, machine-readable
 * record that a recognized authority authorized specified governed rights of a
 * specified governed asset -- or a defined portion of them -- to move from a
 * specified current holder to a specified recipient, under specified
 * conditions**.
 *
 * This is the `TRANSFER` governed action's grant artifact, and it is the same
 * shape of thing `EnterpriseAccessGrant` is for access,
 * `EnterpriseTokenizationMandate` is for tokenization,
 * `EnterpriseCollateralizationMandate` is for collateralization and
 * `EnterpriseLicenseMandate` is for licensing: an immutable record that an
 * authorization was issued, produced only after a decision (and its required
 * approvals and obligations, resolved elsewhere) permitted it. It references
 * the canonical governance objects that created it and never duplicates their
 * contents:
 *
 * - `requestRef` -> `EnterpriseTransferRequest.id` (what was asked)
 * - `decisionRef` -> the Kernel decision id (what was decided)
 * - `evaluationRef?` -> the Governance Store evaluation aggregate id (the
 *   durable proof of that decision, including its trace, reason codes, events,
 *   and integrity chain)
 * - `approvalRefs?` -> approval proof/decision ids satisfied before issuance
 * - `obligationRefs?` -> `EnterpriseAccessObligation.id`s attached to it
 * - `evidenceRefs?` / `auditRefs?` -> evidence and audit records
 *
 * `terms` is the authorization itself: which rights, how much of them, from
 * whom, to whom, under what declared limits. It is carried directly (not
 * re-derived by dereferencing `requestRef`) because a mandate must be checked,
 * displayed, and audited without access to the request record it points at --
 * the same reason `EnterpriseAccessGrant` carries `principalId` directly.
 *
 * ## What this record does not say
 *
 * A mandate authorizes; it never executes and never concludes. Nothing here
 * moves a right, updates a registry, passes title, settles consideration, or
 * contacts any external system. **The existence of a mandate is not a claim
 * that anything was transferred**: until execution evidence is recorded, AOC's
 * position is that it authorized the movement and does not know whether the
 * movement happened.
 *
 * And even after execution evidence exists, this record makes no claim that
 * the recipient may now do anything inside AOC. Authority to act is held by
 * the Authority Graph, and nothing in this contract or the runtime that
 * persists it writes to it. That is a deliberate, documented architectural
 * finding rather than an omission -- see
 * `docs/architecture/ADR-TRANSFER-ACTION.md`, "Post-transfer authority".
 *
 * Revoking a mandate withdraws the authority to move *further* rights under
 * it. It makes no claim that an already-executed movement was undone -- AOC
 * cannot reverse external state it does not control.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/transfer-mandate`).
 */
export interface EnterpriseTransferMandate extends GovernedAuthorizationArtifact<EnterpriseTransferTerms> {
  /** Re-declared as this action's own literal so a serialized mandate names its schema on its face and cannot be replayed through a sibling action's contract. */
  readonly schemaVersion: typeof ENTERPRISE_TRANSFER_SCHEMA_VERSION;
  readonly status: EnterpriseTransferMandateStatus;
}

// ---------------------------------------------------------------------------
// Derived authorization semantics
// ---------------------------------------------------------------------------

/** One concrete external movement a caller proposes to effect under a mandate. */
export interface EnterpriseTransferExerciseAttempt {
  /** The party proposing to effect the external movement. Checked against `terms.executorRef` only when the mandate bound one. */
  readonly executedBy: CanonicalId;
  /** The party the proposed movement takes the rights from. Must be exactly the mandate's own transferor. */
  readonly transferorRef: CanonicalId;
  /** The party the proposed movement delivers the rights to. Must be exactly the mandate's own transferee -- there is no substitution disposition. */
  readonly transfereeRef: CanonicalId;
  readonly rights: readonly EnterpriseTransferableRightType[];
  /** How much of the named rights this movement carries. */
  readonly scope: EnterpriseTransferScope;
  readonly at: UtcDateTime;
  /** The scope already moved under this mandate by previously-recorded executions. Absent means nothing has moved yet. */
  readonly alreadyTransferredScope?: EnterpriseTransferScope;
  /** The opaque registry label the external system reports the movement was effected through. Measured against `terms.constraints.permittedRegistries`. */
  readonly registry?: string;
  /** Whether the external system reported the recipient's acceptance. Measured against `terms.constraints.recipientAcceptanceRequired`. */
  readonly hasRecipientAcceptance?: boolean;
  /** Whether the external system reported evidence of consideration. Measured against `terms.constraints.considerationEvidenceRequired`. AOC never learns an amount. */
  readonly hasConsiderationEvidence?: boolean;
  /** Whether the external system reported an agreement reference. Measured against `terms.constraints.externalAgreementReferenceRequired`. */
  readonly hasExternalAgreementReference?: boolean;
  /** How many external movements have already been recorded under this mandate. Used only to enforce `constraints.partialTransferAllowed`. */
  readonly priorExecutionCount?: number;
}

export type EnterpriseTransferRefusalCode =
  | 'INVALID_EXERCISE_INSTANT'
  | 'MANDATE_REVOKED'
  | 'MANDATE_NOT_YET_EFFECTIVE'
  | 'MANDATE_EXPIRED'
  | 'EXECUTOR_NOT_AUTHORIZED'
  | 'TRANSFEROR_NOT_AUTHORIZED'
  | 'TRANSFEREE_NOT_AUTHORIZED'
  | 'RIGHTS_NOT_AUTHORIZED'
  | 'SCOPE_EXCEEDS_MANDATE'
  | 'PARTIAL_TRANSFER_PROHIBITED'
  | 'CUMULATIVE_SCOPE_EXCEEDS_MANDATE'
  | 'REGISTRY_NOT_PERMITTED'
  | 'RECIPIENT_ACCEPTANCE_REQUIRED'
  | 'CONSIDERATION_EVIDENCE_REQUIRED'
  | 'EXTERNAL_AGREEMENT_REFERENCE_REQUIRED';

export type EnterpriseTransferAuthorizationResult =
  | { readonly authorized: true }
  | { readonly authorized: false; readonly code: EnterpriseTransferRefusalCode; readonly reason: string };

/**
 * The single place this package decides whether a mandate authorizes one
 * concrete external movement. Pure: it reads the mandate, the attempt, and the
 * attempt's own `at` instant -- it never reads a wall clock, contacts a
 * registry or provider, or mutates anything. Every derived state the status
 * vocabulary deliberately omits (expired, not-yet-effective, exhausted) is
 * computed here from the fields that already record it.
 *
 * The order of checks is deliberate: identity bindings (executor, transferor,
 * transferee) are refused before quantity checks, so a substitution attempt is
 * reported as a substitution rather than as a downstream scope problem.
 *
 * Containment is semantic throughout, never string coincidence: rights are
 * compared as a set, quantities only between commensurable scopes, registries
 * against an allow-list, and durations as parsed instants.
 */
export function enterpriseTransferMandateAuthorizes(
  mandate: EnterpriseTransferMandate,
  attempt: EnterpriseTransferExerciseAttempt,
): EnterpriseTransferAuthorizationResult {
  if (mandate.status === 'revoked') {
    return {
      authorized: false,
      code: 'MANDATE_REVOKED',
      reason: 'This transfer mandate has been revoked; no further movement of rights is authorized under it. Rights already moved are unaffected.',
    };
  }

  // An unparseable instant is refused outright rather than compared: every
  // window check below would silently evaluate false against NaN, turning an
  // unreadable timestamp into an authorization.
  const at = Date.parse(attempt.at);
  if (!Number.isFinite(at)) {
    return {
      authorized: false,
      code: 'INVALID_EXERCISE_INSTANT',
      reason: `'${String(attempt.at)}' is not a readable instant; the exercise cannot be placed inside the mandate's validity window.`,
    };
  }
  if (at < Date.parse(mandate.effectiveFrom)) {
    return { authorized: false, code: 'MANDATE_NOT_YET_EFFECTIVE', reason: `This transfer mandate does not take effect until ${mandate.effectiveFrom}.` };
  }
  if (at >= Date.parse(mandate.expiresAt)) {
    return { authorized: false, code: 'MANDATE_EXPIRED', reason: `This transfer mandate expired at ${mandate.expiresAt}.` };
  }

  const { terms } = mandate;
  const { constraints } = terms;

  // Executor binding applies only when the mandate actually bound one. A
  // mandate with no `executorRef` does not bind who effects the movement, and
  // `executedBy` is recorded as an observation rather than checked.
  if (terms.executorRef !== undefined && attempt.executedBy !== terms.executorRef) {
    return { authorized: false, code: 'EXECUTOR_NOT_AUTHORIZED', reason: `Only '${terms.executorRef}' may effect this transfer mandate.` };
  }

  // The source binding. A movement out of a different holder is a different
  // transfer: this authorization says nothing about anyone else's rights, and
  // silently accepting another source would let one party's authorization
  // move another party's property.
  if (attempt.transferorRef !== terms.transferorRef) {
    return {
      authorized: false,
      code: 'TRANSFEROR_NOT_AUTHORIZED',
      reason: `This transfer mandate authorizes moving rights held by '${terms.transferorRef}' only; moving a different holder's rights requires its own authorization.`,
    };
  }

  // The destination binding, and unlike `EnterpriseLicenseMandate` there is no
  // disposition that relaxes it. A licensee may be permitted to assign a
  // permission it already holds; a "substituted recipient" is not a relaxation
  // of anything, it is a different transfer to a different party requiring its
  // own authority, policy and approvals.
  if (attempt.transfereeRef !== terms.transfereeRef) {
    return {
      authorized: false,
      code: 'TRANSFEREE_NOT_AUTHORIZED',
      reason: `This transfer mandate authorizes a movement to '${terms.transfereeRef}' only; delivering to a different recipient requires a new authorization, and no constraint in this contract can relax that.`,
    };
  }

  const unauthorizedRight = attempt.rights.find((right) => !terms.rights.includes(right));
  if (unauthorizedRight !== undefined || attempt.rights.length === 0) {
    return {
      authorized: false,
      code: 'RIGHTS_NOT_AUTHORIZED',
      reason:
        attempt.rights.length === 0
          ? 'An exercise must name at least one right; this mandate authorizes moving specific rights, never the asset as a whole.'
          : `This transfer mandate does not authorize moving the right '${String(unauthorizedRight)}'.`,
    };
  }

  if (!enterpriseTransferScopeWithin(attempt.scope, terms.scope)) {
    return {
      authorized: false,
      code: 'SCOPE_EXCEEDS_MANDATE',
      reason: 'The proposed movement is larger than, or not commensurable with, the portion of the named rights this transfer mandate authorizes.',
    };
  }

  // "May this be done in parts at all?" is answered before "does the total
  // still fit?", and for this action it answers two questions at once.
  //
  // When partial transfer is prohibited, the authorization describes exactly
  // one movement of exactly the authorized quantity. A *smaller* movement is
  // refused here as well as a repeat one, and that asymmetry with
  // `additionalLicensesAllowed` / `additionalCollateralizationAllowed` is the
  // point: a license for at most ten seats is honoured by granting five, but a
  // transfer of 25% that moves 10% has not partially satisfied the
  // authorization -- it has performed a partial transfer, which is precisely
  // what was prohibited, and left the remaining 15% in a state no one
  // authorized.
  if (!constraints.partialTransferAllowed) {
    const priorExecutions = attempt.priorExecutionCount ?? 0;
    if (priorExecutions > 0) {
      return {
        authorized: false,
        code: 'PARTIAL_TRANSFER_PROHIBITED',
        reason: 'This transfer mandate prohibits partial transfer and has already been exercised; the rights it authorized have already moved.',
      };
    }
    if (!enterpriseTransferScopeEquals(attempt.scope, terms.scope)) {
      return {
        authorized: false,
        code: 'PARTIAL_TRANSFER_PROHIBITED',
        reason:
          'This transfer mandate prohibits partial transfer, so a single movement must carry exactly the authorized portion of the named rights; moving less is the partial transfer the authorization refused.',
      };
    }
  }

  // Cumulative containment. Transferred scope accumulates for a stronger
  // reason than collateral scope does: what has left the transferor cannot
  // leave again, so two movements of 15% under a 25% authorization move 30% of
  // rights only 25% of which were ever authorized to move. Incommensurable
  // scopes (a unit count against a proportional share, or two different
  // denominations) sum to `null` and are refused rather than coerced.
  const alreadyTransferred = attempt.alreadyTransferredScope;
  if (alreadyTransferred !== undefined) {
    const total = enterpriseTransferScopeSum(alreadyTransferred, attempt.scope);
    if (total === null || !enterpriseTransferScopeWithin(total, terms.scope)) {
      return {
        authorized: false,
        code: 'CUMULATIVE_SCOPE_EXCEEDS_MANDATE',
        reason: 'Adding this movement to the portion already transferred under this mandate would move more of the named rights than it authorizes.',
      };
    }
  }

  const permittedRegistries = constraints.permittedRegistries;
  if (permittedRegistries !== undefined) {
    // An unreported registry cannot be shown to be inside a declared
    // allow-list, so it is refused rather than assumed to be permitted.
    if (attempt.registry === undefined || !permittedRegistries.includes(attempt.registry)) {
      return {
        authorized: false,
        code: 'REGISTRY_NOT_PERMITTED',
        reason: `This transfer mandate permits the movement to be effected only through: ${permittedRegistries.join(', ')}; the proposed exercise does not report one of them.`,
      };
    }
  }

  if (constraints.recipientAcceptanceRequired === true && attempt.hasRecipientAcceptance !== true) {
    return {
      authorized: false,
      code: 'RECIPIENT_ACCEPTANCE_REQUIRED',
      reason:
        "This transfer mandate requires the recipient's acceptance to be evidenced with the movement; AOC records that reference and never interprets, resolves, or verifies what it names.",
    };
  }

  if (constraints.considerationEvidenceRequired === true && attempt.hasConsiderationEvidence !== true) {
    return {
      authorized: false,
      code: 'CONSIDERATION_EVIDENCE_REQUIRED',
      reason:
        'This transfer mandate requires evidence of consideration to be reported with the movement. AOC records that a reference was produced; it computes no price, holds no funds, and settles nothing.',
    };
  }

  if (constraints.externalAgreementReferenceRequired === true && attempt.hasExternalAgreementReference !== true) {
    return {
      authorized: false,
      code: 'EXTERNAL_AGREEMENT_REFERENCE_REQUIRED',
      reason: 'This transfer mandate requires an external agreement reference to be reported with the movement.',
    };
  }

  return { authorized: true };
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Whether two records represent the same issued mandate: same id, issued from the same request and decision, over the same asset. */
export function enterpriseTransferMandateIdentityEquals(a: EnterpriseTransferMandate, b: EnterpriseTransferMandate): boolean {
  return a.id === b.id && a.requestRef === b.requestRef && a.decisionRef === b.decisionRef && resourceRefIdentityEquals(a.asset, b.asset);
}

export function enterpriseTransferMandateEquals(a: EnterpriseTransferMandate, b: EnterpriseTransferMandate): boolean {
  return (
    enterpriseTransferMandateIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.status === b.status &&
    enterpriseTransferTermsEquals(a.terms, b.terms) &&
    a.requestedBy === b.requestedBy &&
    a.effectiveFrom === b.effectiveFrom &&
    a.expiresAt === b.expiresAt &&
    a.correlationId === b.correlationId &&
    a.evaluationRef === b.evaluationRef &&
    a.issuerRef === b.issuerRef &&
    transferOptionalStringArrayEquals(a.approvalRefs, b.approvalRefs) &&
    transferOptionalStringArrayEquals(a.obligationRefs, b.obligationRefs) &&
    transferOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs) &&
    transferOptionalStringArrayEquals(a.auditRefs, b.auditRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseTransferMandateValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_STATUS'
  | 'INVALID_STATUS'
  | 'MISSING_ASSET'
  | 'INVALID_ASSET'
  | 'MISSING_REQUEST_REF'
  | 'MISSING_REQUESTED_BY'
  | 'MISSING_DECISION_REF'
  | 'MISSING_EFFECTIVE_FROM'
  | 'INVALID_EFFECTIVE_FROM'
  | 'MISSING_EXPIRES_AT'
  | 'INVALID_EXPIRES_AT'
  | 'EXPIRY_NOT_AFTER_EFFECTIVE_FROM'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_EVALUATION_REF'
  | 'INVALID_ISSUER_REF'
  | 'INVALID_APPROVAL_REFS'
  | 'INVALID_OBLIGATION_REFS'
  | 'INVALID_EVIDENCE_REFS'
  | 'INVALID_AUDIT_REFS'
  | EnterpriseTransferTermsValidationCode;

export interface EnterpriseTransferMandateValidationIssue {
  readonly code: EnterpriseTransferMandateValidationCode;
  readonly message: string;
}

export type EnterpriseTransferMandateValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseTransferMandateValidationIssue[] };

const MANDATE_STATUSES: readonly EnterpriseTransferMandateStatus[] = ['active', 'revoked'];

/** Validates internal consistency of a candidate mandate. Accepts `unknown` so it can guard deserialized/external input. Never dereferences any `*Ref`. */
export function validateEnterpriseTransferMandate(candidate: unknown): EnterpriseTransferMandateValidationResult {
  if (!isTransferPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Transfer mandate must be an object.' }] };
  }

  const errors: EnterpriseTransferMandateValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_TRANSFER_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_TRANSFER_SCHEMA_VERSION}'.` });
  }

  if (!isTransferNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (candidate.status === undefined) {
    errors.push({ code: 'MISSING_STATUS', message: 'status is required.' });
  } else if (typeof candidate.status !== 'string' || !MANDATE_STATUSES.includes(candidate.status as EnterpriseTransferMandateStatus)) {
    errors.push({ code: 'INVALID_STATUS', message: `status must be one of: ${MANDATE_STATUSES.join(', ')}.` });
  }

  if (!isTransferPlainObject(candidate.asset)) {
    errors.push({ code: 'MISSING_ASSET', message: 'asset (a ResourceRef) is required.' });
  } else if (!isTransferNonEmptyString(candidate.asset.kind) || !isTransferNonEmptyString(candidate.asset.id)) {
    errors.push({ code: 'INVALID_ASSET', message: 'asset.kind and asset.id must both be non-empty strings.' });
  }

  errors.push(...collectEnterpriseTransferTermsIssues(candidate.terms));

  if (!isTransferNonEmptyString(candidate.requestRef)) {
    errors.push({ code: 'MISSING_REQUEST_REF', message: 'requestRef is required and must be a non-empty string.' });
  }
  if (!isTransferNonEmptyString(candidate.requestedBy)) {
    errors.push({ code: 'MISSING_REQUESTED_BY', message: 'requestedBy is required and must be a non-empty string.' });
  }
  if (!isTransferNonEmptyString(candidate.decisionRef)) {
    errors.push({
      code: 'MISSING_DECISION_REF',
      message: 'decisionRef is required and must be a non-empty string; a mandate can only exist because a canonical governance decision produced it.',
    });
  }

  let effectiveFromMs: number | undefined;
  if (candidate.effectiveFrom === undefined) {
    errors.push({ code: 'MISSING_EFFECTIVE_FROM', message: 'effectiveFrom is required.' });
  } else if (!isTransferTimestamp(candidate.effectiveFrom)) {
    errors.push({ code: 'INVALID_EFFECTIVE_FROM', message: 'effectiveFrom must be an ISO 8601 timestamp string.' });
  } else {
    effectiveFromMs = Date.parse(candidate.effectiveFrom);
  }

  let expiresAtMs: number | undefined;
  if (candidate.expiresAt === undefined) {
    errors.push({
      code: 'MISSING_EXPIRES_AT',
      message: 'expiresAt is required; an authorization with no recorded expiry is not a state this contract can represent. It bounds AOC authority to move rights, and says nothing about rights already moved.',
    });
  } else if (!isTransferTimestamp(candidate.expiresAt)) {
    errors.push({ code: 'INVALID_EXPIRES_AT', message: 'expiresAt must be an ISO 8601 timestamp string.' });
  } else {
    expiresAtMs = Date.parse(candidate.expiresAt);
  }

  if (effectiveFromMs !== undefined && expiresAtMs !== undefined && expiresAtMs <= effectiveFromMs) {
    errors.push({ code: 'EXPIRY_NOT_AFTER_EFFECTIVE_FROM', message: 'expiresAt must be strictly after effectiveFrom.' });
  }

  if (!isTransferNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.evaluationRef !== undefined && !isTransferNonEmptyString(candidate.evaluationRef)) {
    errors.push({ code: 'INVALID_EVALUATION_REF', message: 'evaluationRef must be a non-empty string when present.' });
  }
  if (candidate.issuerRef !== undefined && !isTransferNonEmptyString(candidate.issuerRef)) {
    errors.push({ code: 'INVALID_ISSUER_REF', message: 'issuerRef must be a non-empty string when present.' });
  }

  const refLists: readonly (readonly [string, EnterpriseTransferMandateValidationCode])[] = [
    ['approvalRefs', 'INVALID_APPROVAL_REFS'],
    ['obligationRefs', 'INVALID_OBLIGATION_REFS'],
    ['evidenceRefs', 'INVALID_EVIDENCE_REFS'],
    ['auditRefs', 'INVALID_AUDIT_REFS'],
  ];
  for (const [field, code] of refLists) {
    const value = candidate[field];
    if (value !== undefined && !isTransferCanonicalIdArray(value)) {
      errors.push({ code, message: `${field} must be an array of non-empty strings when present.` });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseTransferMandate {
  readonly schemaVersion: string;
  readonly id: string;
  readonly status: string;
  readonly asset: SerializedEnterpriseTransferRequest['asset'];
  readonly terms: SerializedEnterpriseTransferTerms;
  readonly requestRef: string;
  readonly requestedBy: string;
  readonly decisionRef: string;
  readonly effectiveFrom: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly evaluationRef?: string;
  readonly issuerRef?: string;
  readonly approvalRefs?: readonly string[];
  readonly obligationRefs?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
}

/** Projects a mandate to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseTransferMandate(mandate: EnterpriseTransferMandate): SerializedEnterpriseTransferMandate {
  return {
    schemaVersion: mandate.schemaVersion,
    id: mandate.id,
    status: mandate.status,
    asset: serializeTransferResourceRef(mandate.asset),
    terms: serializeEnterpriseTransferTerms(mandate.terms),
    requestRef: mandate.requestRef,
    requestedBy: mandate.requestedBy,
    decisionRef: mandate.decisionRef,
    effectiveFrom: mandate.effectiveFrom,
    expiresAt: mandate.expiresAt,
    correlationId: mandate.correlationId,
    ...(mandate.evaluationRef === undefined ? {} : { evaluationRef: mandate.evaluationRef }),
    ...(mandate.issuerRef === undefined ? {} : { issuerRef: mandate.issuerRef }),
    ...(mandate.approvalRefs === undefined ? {} : { approvalRefs: [...mandate.approvalRefs].sort() }),
    ...(mandate.obligationRefs === undefined ? {} : { obligationRefs: [...mandate.obligationRefs].sort() }),
    ...(mandate.evidenceRefs === undefined ? {} : { evidenceRefs: [...mandate.evidenceRefs].sort() }),
    ...(mandate.auditRefs === undefined ? {} : { auditRefs: [...mandate.auditRefs].sort() }),
  };
}

/** Thrown by `deserializeEnterpriseTransferMandate` when the input fails validation. Carries the full issue list rather than just the first. */
export class EnterpriseTransferMandateValidationError extends Error {
  readonly issues: readonly EnterpriseTransferMandateValidationIssue[];

  constructor(issues: readonly EnterpriseTransferMandateValidationIssue[]) {
    super(`Invalid EnterpriseTransferMandate: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseTransferMandateValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseTransferMandate`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseTransferMandate(candidate: unknown): EnterpriseTransferMandate {
  const result = validateEnterpriseTransferMandate(candidate);
  if (!result.valid) throw new EnterpriseTransferMandateValidationError(result.errors);

  const value = candidate as SerializedEnterpriseTransferMandate;
  return {
    schemaVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
    id: value.id,
    status: value.status as EnterpriseTransferMandateStatus,
    asset: readTransferResourceRef(value.asset),
    terms: readEnterpriseTransferTerms(value.terms),
    requestRef: value.requestRef,
    requestedBy: value.requestedBy,
    decisionRef: value.decisionRef,
    effectiveFrom: value.effectiveFrom,
    expiresAt: value.expiresAt,
    correlationId: value.correlationId,
    ...(value.evaluationRef === undefined ? {} : { evaluationRef: value.evaluationRef }),
    ...(value.issuerRef === undefined ? {} : { issuerRef: value.issuerRef }),
    ...(value.approvalRefs === undefined ? {} : { approvalRefs: [...value.approvalRefs] }),
    ...(value.obligationRefs === undefined ? {} : { obligationRefs: [...value.obligationRefs] }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
    ...(value.auditRefs === undefined ? {} : { auditRefs: [...value.auditRefs] }),
  };
}
