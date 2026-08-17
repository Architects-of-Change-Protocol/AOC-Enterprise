import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import { resourceRefIdentityEquals } from '@aoc-enterprise/resource-envelope';

import {
  ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
  collectEnterpriseTokenizationTermsIssues,
  enterpriseTokenizationScopeWithin,
  enterpriseTokenizationTermsEquals,
  isTokenizationCanonicalIdArray,
  isTokenizationNonEmptyString,
  isTokenizationPlainObject,
  isTokenizationTimestamp,
  readEnterpriseTokenizationTerms,
  serializeEnterpriseTokenizationTerms,
  tokenizationOptionalStringArrayEquals,
} from './enterprise-tokenization-terms.js';
import { readTokenizationResourceRef, serializeTokenizationResourceRef } from './enterprise-tokenization-request.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { EnterpriseTokenizationScope, EnterpriseTokenizationTerms, EnterpriseTokenizationTermsValidationCode, EnterpriseTokenizedRightType, SerializedEnterpriseTokenizationTerms } from './enterprise-tokenization-terms.js';
import type { SerializedEnterpriseTokenizationRequest } from './enterprise-tokenization-request.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { GovernedAuthorizationArtifact, GovernedAuthorizationStatus } from '@aoc-enterprise/governed-authorization';

/**
 * The mandate's own issuance/revocation lifecycle -- deliberately not "is
 * this mandate currently usable". `'active'` records that this is, as far as
 * the mandate's own issuance history is concerned, the operative
 * authorization; `'revoked'` records that a later, separate act withdrew it.
 *
 * `'expired'`, `'consumed'` and `'superseded'` are deliberately NOT status
 * values, mirroring `EnterpriseAccessGrantStatus`'s own "'expired' is
 * deliberately not a status value" rationale. Expiry is fully represented by
 * `effectiveFrom`/`expiresAt`; exhaustion is fully represented by the
 * recorded external execution evidence measured against
 * `terms.constraints`; supersession is a relationship between two mandates,
 * not a property of either. Each would otherwise be a second,
 * independently-settable source of truth for a fact already recorded
 * elsewhere, with no way for a pure, wall-clock-free validation function to
 * keep the two consistent. `enterpriseTokenizationMandateAuthorizes` derives
 * all of them instead.
 */
export type EnterpriseTokenizationMandateStatus = GovernedAuthorizationStatus;

/**
 * The canonical Enterprise-owned contract for **the durable, machine-readable
 * record that a recognized authority authorized a specified party to tokenize
 * specified rights of a specified governed asset under specified conditions**.
 *
 * This is the `TOKENIZE` capability's grant artifact, and it is the same
 * shape of thing `EnterpriseAccessGrant` is for access: an immutable record
 * that an authorization was issued, produced only after a decision (and its
 * required approvals and obligations, resolved elsewhere) permitted it. It
 * references the canonical governance objects that created it and never
 * duplicates their contents:
 *
 * - `requestRef` -> `EnterpriseTokenizationRequest.id` (what was asked)
 * - `decisionRef` -> the Kernel decision id (what was decided)
 * - `evaluationRef?` -> the Governance Store evaluation aggregate id (the
 *   durable proof of that decision, including its trace, reason codes,
 *   events, and integrity chain)
 * - `approvalRefs?` -> approval proof/decision ids satisfied before issuance
 * - `obligationRefs?` -> `EnterpriseAccessObligation.id`s attached to it
 * - `evidenceRefs?` / `auditRefs?` -> evidence and audit records
 *
 * `terms` is the authorization itself: which rights, how much of them, by
 * whom, under what declared limits. It is carried directly (not re-derived by
 * dereferencing `requestRef`) because a mandate must be checked, displayed,
 * and audited without access to the request record it points at -- the same
 * reason `EnterpriseAccessGrant` carries `principalId` directly.
 *
 * A mandate authorizes; it never executes. Nothing here mints, issues, or
 * transfers a token, and revoking a mandate withdraws the authority to
 * perform *further* external issuance -- it makes no claim about tokens an
 * external system has already issued (see the package README, "Revocation
 * semantics").
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/tokenization-mandate`).
 */
export interface EnterpriseTokenizationMandate extends GovernedAuthorizationArtifact<EnterpriseTokenizationTerms> {
  /** Re-declared as this action's own literal so a serialized mandate names its schema on its face and cannot be replayed through a sibling action's contract. */
  readonly schemaVersion: typeof ENTERPRISE_TOKENIZATION_SCHEMA_VERSION;
  readonly status: EnterpriseTokenizationMandateStatus;
}

// ---------------------------------------------------------------------------
// Derived authorization semantics
// ---------------------------------------------------------------------------

/** One concrete external issuance a caller proposes to perform under a mandate. */
export interface EnterpriseTokenizationExerciseAttempt {
  readonly executorRef: CanonicalId;
  readonly rights: readonly EnterpriseTokenizedRightType[];
  readonly scope: EnterpriseTokenizationScope;
  readonly at: UtcDateTime;
  /** External units already issued under this mandate, from previously recorded execution evidence. Omit (or `0`) when nothing has been issued yet. */
  readonly alreadyIssuedUnits?: number;
  /** How many external issuances have already been recorded under this mandate. Used only to enforce `constraints.additionalIssuanceAllowed`. */
  readonly priorExecutionCount?: number;
  /** Units this attempt would issue. Compared against `constraints.maximumIssuedUnits` together with `alreadyIssuedUnits`. */
  readonly issuingUnits?: number;
}

export type EnterpriseTokenizationRefusalCode =
  | 'INVALID_EXERCISE_INSTANT'
  | 'MANDATE_REVOKED'
  | 'MANDATE_NOT_YET_EFFECTIVE'
  | 'MANDATE_EXPIRED'
  | 'EXECUTOR_NOT_AUTHORIZED'
  | 'RIGHTS_NOT_AUTHORIZED'
  | 'SCOPE_EXCEEDS_MANDATE'
  | 'ADDITIONAL_ISSUANCE_PROHIBITED'
  | 'MAXIMUM_ISSUANCE_EXCEEDED';

export type EnterpriseTokenizationAuthorizationResult =
  | { readonly authorized: true }
  | { readonly authorized: false; readonly code: EnterpriseTokenizationRefusalCode; readonly reason: string };

/**
 * The single place this package decides whether a mandate authorizes one
 * concrete external issuance. Pure: it reads the mandate, the attempt, and
 * the attempt's own `at` instant -- it never reads a wall clock, contacts a
 * provider, or mutates anything. Every derived state the status vocabulary
 * deliberately omits (expired, not-yet-effective, exhausted) is computed
 * here from the fields that already record it.
 */
export function enterpriseTokenizationMandateAuthorizes(
  mandate: EnterpriseTokenizationMandate,
  attempt: EnterpriseTokenizationExerciseAttempt,
): EnterpriseTokenizationAuthorizationResult {
  if (mandate.status === 'revoked') {
    return { authorized: false, code: 'MANDATE_REVOKED', reason: 'This tokenization mandate has been revoked; no further external issuance is authorized under it.' };
  }

  // An unparseable instant is refused outright rather than compared: every
  // window check below would silently evaluate false against NaN, turning an
  // unreadable timestamp into an authorization.
  const at = Date.parse(attempt.at);
  if (!Number.isFinite(at)) {
    return { authorized: false, code: 'INVALID_EXERCISE_INSTANT', reason: `'${String(attempt.at)}' is not a readable instant; the exercise cannot be placed inside the mandate's validity window.` };
  }
  if (at < Date.parse(mandate.effectiveFrom)) {
    return { authorized: false, code: 'MANDATE_NOT_YET_EFFECTIVE', reason: `This tokenization mandate does not take effect until ${mandate.effectiveFrom}.` };
  }
  if (at >= Date.parse(mandate.expiresAt)) {
    return { authorized: false, code: 'MANDATE_EXPIRED', reason: `This tokenization mandate expired at ${mandate.expiresAt}.` };
  }

  if (attempt.executorRef !== mandate.terms.executorRef) {
    return { authorized: false, code: 'EXECUTOR_NOT_AUTHORIZED', reason: `Only '${mandate.terms.executorRef}' may execute this tokenization mandate.` };
  }

  const unauthorizedRight = attempt.rights.find((right) => !mandate.terms.rights.includes(right));
  if (unauthorizedRight !== undefined || attempt.rights.length === 0) {
    return {
      authorized: false,
      code: 'RIGHTS_NOT_AUTHORIZED',
      reason:
        attempt.rights.length === 0
          ? 'An exercise must name at least one right; this mandate authorizes specific rights, never the asset as a whole.'
          : `This tokenization mandate does not authorize the right '${String(unauthorizedRight)}'.`,
    };
  }

  if (!enterpriseTokenizationScopeWithin(attempt.scope, mandate.terms.scope)) {
    return { authorized: false, code: 'SCOPE_EXCEEDS_MANDATE', reason: 'The proposed exercise is outside the scope this tokenization mandate authorizes.' };
  }

  const priorExecutions = attempt.priorExecutionCount ?? 0;
  if (priorExecutions > 0 && !mandate.terms.constraints.additionalIssuanceAllowed) {
    return {
      authorized: false,
      code: 'ADDITIONAL_ISSUANCE_PROHIBITED',
      reason: 'This tokenization mandate prohibits additional issuance and has already been exercised.',
    };
  }

  const maximum = mandate.terms.constraints.maximumIssuedUnits;
  if (maximum !== undefined) {
    const total = (attempt.alreadyIssuedUnits ?? 0) + (attempt.issuingUnits ?? 0);
    if (total > maximum) {
      return {
        authorized: false,
        code: 'MAXIMUM_ISSUANCE_EXCEEDED',
        reason: `This tokenization mandate authorizes at most ${maximum} external units; the proposed exercise would bring the total to ${total}.`,
      };
    }
  }

  return { authorized: true };
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Whether two records represent the same issued mandate: same id, issued from the same request and decision, over the same asset. */
export function enterpriseTokenizationMandateIdentityEquals(a: EnterpriseTokenizationMandate, b: EnterpriseTokenizationMandate): boolean {
  return a.id === b.id && a.requestRef === b.requestRef && a.decisionRef === b.decisionRef && resourceRefIdentityEquals(a.asset, b.asset);
}

export function enterpriseTokenizationMandateEquals(a: EnterpriseTokenizationMandate, b: EnterpriseTokenizationMandate): boolean {
  return (
    enterpriseTokenizationMandateIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.status === b.status &&
    enterpriseTokenizationTermsEquals(a.terms, b.terms) &&
    a.requestedBy === b.requestedBy &&
    a.effectiveFrom === b.effectiveFrom &&
    a.expiresAt === b.expiresAt &&
    a.correlationId === b.correlationId &&
    a.evaluationRef === b.evaluationRef &&
    a.issuerRef === b.issuerRef &&
    tokenizationOptionalStringArrayEquals(a.approvalRefs, b.approvalRefs) &&
    tokenizationOptionalStringArrayEquals(a.obligationRefs, b.obligationRefs) &&
    tokenizationOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs) &&
    tokenizationOptionalStringArrayEquals(a.auditRefs, b.auditRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseTokenizationMandateValidationCode =
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
  | EnterpriseTokenizationTermsValidationCode;

export interface EnterpriseTokenizationMandateValidationIssue {
  readonly code: EnterpriseTokenizationMandateValidationCode;
  readonly message: string;
}

export type EnterpriseTokenizationMandateValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseTokenizationMandateValidationIssue[] };

const MANDATE_STATUSES: readonly EnterpriseTokenizationMandateStatus[] = ['active', 'revoked'];

/** Validates internal consistency of a candidate mandate. Accepts `unknown` so it can guard deserialized/external input. Never dereferences any `*Ref`. */
export function validateEnterpriseTokenizationMandate(candidate: unknown): EnterpriseTokenizationMandateValidationResult {
  if (!isTokenizationPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Tokenization mandate must be an object.' }] };
  }

  const errors: EnterpriseTokenizationMandateValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_TOKENIZATION_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_TOKENIZATION_SCHEMA_VERSION}'.` });
  }

  if (!isTokenizationNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (candidate.status === undefined) {
    errors.push({ code: 'MISSING_STATUS', message: 'status is required.' });
  } else if (typeof candidate.status !== 'string' || !MANDATE_STATUSES.includes(candidate.status as EnterpriseTokenizationMandateStatus)) {
    errors.push({ code: 'INVALID_STATUS', message: `status must be one of: ${MANDATE_STATUSES.join(', ')}.` });
  }

  if (!isTokenizationPlainObject(candidate.asset)) {
    errors.push({ code: 'MISSING_ASSET', message: 'asset (a ResourceRef) is required.' });
  } else if (!isTokenizationNonEmptyString(candidate.asset.kind) || !isTokenizationNonEmptyString(candidate.asset.id)) {
    errors.push({ code: 'INVALID_ASSET', message: 'asset.kind and asset.id must both be non-empty strings.' });
  }

  errors.push(...collectEnterpriseTokenizationTermsIssues(candidate.terms));

  if (!isTokenizationNonEmptyString(candidate.requestRef)) {
    errors.push({ code: 'MISSING_REQUEST_REF', message: 'requestRef is required and must be a non-empty string.' });
  }
  if (!isTokenizationNonEmptyString(candidate.requestedBy)) {
    errors.push({ code: 'MISSING_REQUESTED_BY', message: 'requestedBy is required and must be a non-empty string.' });
  }
  if (!isTokenizationNonEmptyString(candidate.decisionRef)) {
    errors.push({
      code: 'MISSING_DECISION_REF',
      message: 'decisionRef is required and must be a non-empty string; a mandate can only exist because a canonical governance decision produced it.',
    });
  }

  let effectiveFromMs: number | undefined;
  if (candidate.effectiveFrom === undefined) {
    errors.push({ code: 'MISSING_EFFECTIVE_FROM', message: 'effectiveFrom is required.' });
  } else if (!isTokenizationTimestamp(candidate.effectiveFrom)) {
    errors.push({ code: 'INVALID_EFFECTIVE_FROM', message: 'effectiveFrom must be an ISO 8601 timestamp string.' });
  } else {
    effectiveFromMs = Date.parse(candidate.effectiveFrom);
  }

  let expiresAtMs: number | undefined;
  if (candidate.expiresAt === undefined) {
    errors.push({ code: 'MISSING_EXPIRES_AT', message: 'expiresAt is required; an authorization with no recorded expiry is not a state this contract can represent.' });
  } else if (!isTokenizationTimestamp(candidate.expiresAt)) {
    errors.push({ code: 'INVALID_EXPIRES_AT', message: 'expiresAt must be an ISO 8601 timestamp string.' });
  } else {
    expiresAtMs = Date.parse(candidate.expiresAt);
  }

  if (effectiveFromMs !== undefined && expiresAtMs !== undefined && expiresAtMs <= effectiveFromMs) {
    errors.push({ code: 'EXPIRY_NOT_AFTER_EFFECTIVE_FROM', message: 'expiresAt must be strictly after effectiveFrom.' });
  }

  if (!isTokenizationNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.evaluationRef !== undefined && !isTokenizationNonEmptyString(candidate.evaluationRef)) {
    errors.push({ code: 'INVALID_EVALUATION_REF', message: 'evaluationRef must be a non-empty string when present.' });
  }
  if (candidate.issuerRef !== undefined && !isTokenizationNonEmptyString(candidate.issuerRef)) {
    errors.push({ code: 'INVALID_ISSUER_REF', message: 'issuerRef must be a non-empty string when present.' });
  }

  const refLists: readonly (readonly [string, EnterpriseTokenizationMandateValidationCode])[] = [
    ['approvalRefs', 'INVALID_APPROVAL_REFS'],
    ['obligationRefs', 'INVALID_OBLIGATION_REFS'],
    ['evidenceRefs', 'INVALID_EVIDENCE_REFS'],
    ['auditRefs', 'INVALID_AUDIT_REFS'],
  ];
  for (const [field, code] of refLists) {
    const value = candidate[field];
    if (value !== undefined && !isTokenizationCanonicalIdArray(value)) {
      errors.push({ code, message: `${field} must be an array of non-empty strings when present.` });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseTokenizationMandate {
  readonly schemaVersion: string;
  readonly id: string;
  readonly status: string;
  readonly asset: SerializedEnterpriseTokenizationRequest['asset'];
  readonly terms: SerializedEnterpriseTokenizationTerms;
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
export function serializeEnterpriseTokenizationMandate(mandate: EnterpriseTokenizationMandate): SerializedEnterpriseTokenizationMandate {
  return {
    schemaVersion: mandate.schemaVersion,
    id: mandate.id,
    status: mandate.status,
    asset: serializeTokenizationResourceRef(mandate.asset),
    terms: serializeEnterpriseTokenizationTerms(mandate.terms),
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

/** Thrown by `deserializeEnterpriseTokenizationMandate` when the input fails validation. Carries the full issue list rather than just the first. */
export class EnterpriseTokenizationMandateValidationError extends Error {
  readonly issues: readonly EnterpriseTokenizationMandateValidationIssue[];

  constructor(issues: readonly EnterpriseTokenizationMandateValidationIssue[]) {
    super(`Invalid EnterpriseTokenizationMandate: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseTokenizationMandateValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseTokenizationMandate`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseTokenizationMandate(candidate: unknown): EnterpriseTokenizationMandate {
  const result = validateEnterpriseTokenizationMandate(candidate);
  if (!result.valid) throw new EnterpriseTokenizationMandateValidationError(result.errors);

  const value = candidate as SerializedEnterpriseTokenizationMandate;
  return {
    schemaVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
    id: value.id,
    status: value.status as EnterpriseTokenizationMandateStatus,
    asset: readTokenizationResourceRef(value.asset),
    terms: readEnterpriseTokenizationTerms(value.terms),
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
