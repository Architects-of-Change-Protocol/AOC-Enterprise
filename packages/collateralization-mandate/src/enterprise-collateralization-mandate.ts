import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import { resourceRefIdentityEquals } from '@aoc-enterprise/resource-envelope';

import {
  ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
  collectEnterpriseCollateralizationTermsIssues,
  collateralizationOptionalStringArrayEquals,
  enterpriseCollateralizationScopeSum,
  enterpriseCollateralizationScopeWithin,
  enterpriseCollateralizationTermsEquals,
  enterpriseSecuredAmountWithin,
  isCollateralizationCanonicalIdArray,
  isCollateralizationNonEmptyString,
  isCollateralizationPlainObject,
  isCollateralizationTimestamp,
  readEnterpriseCollateralizationTerms,
  serializeEnterpriseCollateralizationTerms,
} from './enterprise-collateralization-terms.js';
import { readCollateralizationResourceRef, serializeCollateralizationResourceRef } from './enterprise-collateralization-request.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { EnterpriseCollateralizableRightType, EnterpriseCollateralizationScope, EnterpriseCollateralizationTerms, EnterpriseCollateralizationTermsValidationCode, EnterpriseSecuredAmount, SerializedEnterpriseCollateralizationTerms } from './enterprise-collateralization-terms.js';
import type { SerializedEnterpriseCollateralizationRequest } from './enterprise-collateralization-request.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { GovernedAuthorizationArtifact, GovernedAuthorizationStatus } from '@aoc-enterprise/governed-authorization';

/**
 * The mandate's own authorization lifecycle -- deliberately not "is this
 * mandate currently usable", and emphatically not "is the external collateral
 * arrangement still in place".
 *
 * `'active'` records that this is, as far as the mandate's own history is
 * concerned, the operative authorization; `'revoked'` records that a later,
 * separate act withdrew it.
 *
 * `'expired'`, `'exhausted'`, `'superseded'` and -- importantly for this
 * action -- `'released'` and `'discharged'` are deliberately NOT status
 * values, mirroring `EnterpriseAccessGrantStatus`'s and
 * `EnterpriseTokenizationMandateStatus`'s own two-state rationale, plus one
 * reason specific to collateral:
 *
 * - Expiry is fully represented by `effectiveFrom`/`expiresAt`.
 * - Exhaustion is fully represented by recorded execution evidence measured
 *   against `terms.scope` and `terms.constraints`.
 * - Supersession is a relationship between two mandates, not a property of
 *   either.
 * - **Release/discharge is a fact about an external arrangement, not about
 *   this authorization.** An external system reporting that a security
 *   interest was released does not retroactively change what AOC authorized,
 *   and AOC must never present an externally-reported fact as a governance
 *   state it determined. Release is therefore recorded as separate,
 *   append-only, observation-only evidence
 *   (`EnterpriseCollateralizationReleaseEvidence`) that references the
 *   mandate, never as a status on it.
 */
export type EnterpriseCollateralizationMandateStatus = GovernedAuthorizationStatus;

/**
 * The canonical Enterprise-owned contract for **the durable, machine-readable
 * record that a recognized authority authorized a specified executor to
 * commit specified rights and scope of a specified governed asset as
 * collateral securing a specified obligation for a specified secured party,
 * under specified conditions**.
 *
 * This is the `COLLATERALIZE` governed action's grant artifact, and it is the
 * same shape of thing `EnterpriseAccessGrant` is for access and
 * `EnterpriseTokenizationMandate` is for tokenization: an immutable record
 * that an authorization was issued, produced only after a decision (and its
 * required approvals and obligations, resolved elsewhere) permitted it. It
 * references the canonical governance objects that created it and never
 * duplicates their contents:
 *
 * - `requestRef` -> `EnterpriseCollateralizationRequest.id` (what was asked)
 * - `decisionRef` -> the Kernel decision id (what was decided)
 * - `evaluationRef?` -> the Governance Store evaluation aggregate id (the
 *   durable proof of that decision, including its trace, reason codes,
 *   events, and integrity chain)
 * - `approvalRefs?` -> approval proof/decision ids satisfied before issuance
 * - `obligationRefs?` -> `EnterpriseAccessObligation.id`s attached to it
 * - `evidenceRefs?` / `auditRefs?` -> evidence and audit records
 *
 * `terms` is the authorization itself: which rights, how much of them,
 * securing which obligation, for whose benefit, by whom, under what declared
 * limits. It is carried directly (not re-derived by dereferencing
 * `requestRef`) because a mandate must be checked, displayed, and audited
 * without access to the request record it points at -- the same reason
 * `EnterpriseAccessGrant` carries `principalId` directly.
 *
 * A mandate authorizes; it never executes. Nothing here creates a security
 * interest, perfects one, files anything with any registry, determines
 * priority, values an asset, originates or services a loan, or liquidates
 * anything. Committing rights as collateral is **not** transferring them, and
 * no field here asserts otherwise. Revoking a mandate withdraws the authority
 * to perform *further* external collateralization -- it makes no claim about
 * a security interest an external system has already created (see the package
 * README, "Revocation is not release").
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/collateralization-mandate`).
 */
export interface EnterpriseCollateralizationMandate extends GovernedAuthorizationArtifact<EnterpriseCollateralizationTerms> {
  /** Re-declared as this action's own literal so a serialized mandate names its schema on its face and cannot be replayed through a sibling action's contract. */
  readonly schemaVersion: typeof ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION;
  readonly status: EnterpriseCollateralizationMandateStatus;
}

// ---------------------------------------------------------------------------
// Derived authorization semantics
// ---------------------------------------------------------------------------

/** One concrete external collateralization a caller proposes to perform under a mandate. */
export interface EnterpriseCollateralizationExerciseAttempt {
  readonly executorRef: CanonicalId;
  /** The obligation the proposed arrangement would secure. Must be exactly the mandate's own; substituting another obligation is a different authorization. */
  readonly securedObligationRef: CanonicalId;
  /** The party the proposed arrangement would benefit. Must be exactly the mandate's own; substituting another beneficiary is a different authorization. */
  readonly securedPartyRef: CanonicalId;
  readonly rights: readonly EnterpriseCollateralizableRightType[];
  readonly scope: EnterpriseCollateralizationScope;
  readonly at: UtcDateTime;
  /** Scope already committed under this mandate, summed from previously recorded execution evidence. Omit when nothing has been committed yet. */
  readonly alreadyCommittedScope?: EnterpriseCollateralizationScope;
  /** How many external collateralizations have already been recorded under this mandate. Used only to enforce `constraints.additionalCollateralizationAllowed`. */
  readonly priorExecutionCount?: number;
  /** The obligation amount the external system reports this arrangement secures. Compared against `constraints.maximumSecuredAmount`. */
  readonly securedAmount?: EnterpriseSecuredAmount;
  /** The opaque registry/provider label the external system reports. Compared against `constraints.permittedRegistries`. */
  readonly externalRegistry?: string;
  /** The opaque jurisdiction label the external system reports. Compared against `constraints.permittedJurisdictions`. */
  readonly jurisdiction?: string;
  /** The ranking the external system reports the arrangement takes, `1` most senior. Compared against `constraints.requiredPriorityRank`. */
  readonly priorityRank?: number;
}

export type EnterpriseCollateralizationRefusalCode =
  | 'INVALID_EXERCISE_INSTANT'
  | 'MANDATE_REVOKED'
  | 'MANDATE_NOT_YET_EFFECTIVE'
  | 'MANDATE_EXPIRED'
  | 'EXECUTOR_NOT_AUTHORIZED'
  | 'SECURED_OBLIGATION_NOT_AUTHORIZED'
  | 'SECURED_PARTY_NOT_AUTHORIZED'
  | 'RIGHTS_NOT_AUTHORIZED'
  | 'SCOPE_EXCEEDS_MANDATE'
  | 'CUMULATIVE_SCOPE_EXCEEDS_MANDATE'
  | 'ADDITIONAL_COLLATERALIZATION_PROHIBITED'
  | 'SECURED_AMOUNT_EXCEEDS_MANDATE'
  | 'REGISTRY_NOT_PERMITTED'
  | 'JURISDICTION_NOT_PERMITTED'
  | 'PRIORITY_RANK_NOT_AUTHORIZED';

export type EnterpriseCollateralizationAuthorizationResult =
  | { readonly authorized: true }
  | { readonly authorized: false; readonly code: EnterpriseCollateralizationRefusalCode; readonly reason: string };

/**
 * The single place this package decides whether a mandate authorizes one
 * concrete external collateralization. Pure: it reads the mandate, the
 * attempt, and the attempt's own `at` instant -- it never reads a wall clock,
 * contacts a provider or registry, or mutates anything. Every derived state
 * the status vocabulary deliberately omits (expired, not-yet-effective,
 * exhausted) is computed here from the fields that already record it.
 *
 * The order of checks is deliberate: identity bindings (executor, secured
 * obligation, secured party) are refused before quantity checks, so a
 * substitution attempt is reported as a substitution rather than as a
 * downstream scope or amount problem.
 */
export function enterpriseCollateralizationMandateAuthorizes(
  mandate: EnterpriseCollateralizationMandate,
  attempt: EnterpriseCollateralizationExerciseAttempt,
): EnterpriseCollateralizationAuthorizationResult {
  if (mandate.status === 'revoked') {
    return {
      authorized: false,
      code: 'MANDATE_REVOKED',
      reason: 'This collateralization mandate has been revoked; no further external collateralization is authorized under it.',
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
    return { authorized: false, code: 'MANDATE_NOT_YET_EFFECTIVE', reason: `This collateralization mandate does not take effect until ${mandate.effectiveFrom}.` };
  }
  if (at >= Date.parse(mandate.expiresAt)) {
    return { authorized: false, code: 'MANDATE_EXPIRED', reason: `This collateralization mandate expired at ${mandate.expiresAt}.` };
  }

  const { terms } = mandate;

  if (attempt.executorRef !== terms.executorRef) {
    return { authorized: false, code: 'EXECUTOR_NOT_AUTHORIZED', reason: `Only '${terms.executorRef}' may execute this collateralization mandate.` };
  }

  if (attempt.securedObligationRef !== terms.securedObligationRef) {
    return {
      authorized: false,
      code: 'SECURED_OBLIGATION_NOT_AUTHORIZED',
      reason: `This collateralization mandate authorizes collateral securing obligation '${terms.securedObligationRef}' only; securing a different obligation requires a new authorization.`,
    };
  }

  if (attempt.securedPartyRef !== terms.securedPartyRef) {
    return {
      authorized: false,
      code: 'SECURED_PARTY_NOT_AUTHORIZED',
      reason: `This collateralization mandate authorizes '${terms.securedPartyRef}' as the secured party only; a different secured party requires a new authorization.`,
    };
  }

  const unauthorizedRight = attempt.rights.find((right) => !terms.rights.includes(right));
  if (unauthorizedRight !== undefined || attempt.rights.length === 0) {
    return {
      authorized: false,
      code: 'RIGHTS_NOT_AUTHORIZED',
      reason:
        attempt.rights.length === 0
          ? 'An exercise must name at least one right; this mandate authorizes specific rights, never the asset as a whole.'
          : `This collateralization mandate does not authorize the right '${String(unauthorizedRight)}'.`,
    };
  }

  if (!enterpriseCollateralizationScopeWithin(attempt.scope, terms.scope)) {
    return { authorized: false, code: 'SCOPE_EXCEEDS_MANDATE', reason: 'The proposed exercise is outside the scope this collateralization mandate authorizes.' };
  }

  // "May this be exercised again at all?" is answered before "does the total
  // still fit?": a mandate that permits a single arrangement has already been
  // spent, and reporting that as a scope problem would misdescribe it.
  const priorExecutions = attempt.priorExecutionCount ?? 0;
  if (priorExecutions > 0 && !terms.constraints.additionalCollateralizationAllowed) {
    return {
      authorized: false,
      code: 'ADDITIONAL_COLLATERALIZATION_PROHIBITED',
      reason: 'This collateralization mandate prohibits additional collateralization and has already been exercised.',
    };
  }

  // Cumulative containment. Unlike an issuance ceiling, collateral scope
  // accumulates: two commitments of 15% each commit 30% of the named rights,
  // and an authorization for 20% must refuse the second even though 15% is,
  // on its own, inside 20%. Incommensurable scopes (a unit count against a
  // proportional share, or two different denominations) sum to `null` and are
  // refused rather than coerced.
  const committed = attempt.alreadyCommittedScope;
  if (committed !== undefined) {
    const total = enterpriseCollateralizationScopeSum(committed, attempt.scope);
    if (total === null || !enterpriseCollateralizationScopeWithin(total, terms.scope)) {
      return {
        authorized: false,
        code: 'CUMULATIVE_SCOPE_EXCEEDS_MANDATE',
        reason: 'Adding this exercise to the scope already committed under this mandate would exceed the scope it authorizes.',
      };
    }
  }

  const maximumAmount = terms.constraints.maximumSecuredAmount;
  if (maximumAmount !== undefined) {
    // An absent reported amount cannot be shown to be inside a declared
    // ceiling, so it is refused rather than assumed to be zero.
    if (attempt.securedAmount === undefined || !enterpriseSecuredAmountWithin(attempt.securedAmount, maximumAmount)) {
      return {
        authorized: false,
        code: 'SECURED_AMOUNT_EXCEEDS_MANDATE',
        reason: `This collateralization mandate authorizes securing at most ${maximumAmount.minorUnits} minor units of '${maximumAmount.currency}'; the proposed exercise does not report an amount inside that ceiling.`,
      };
    }
  }

  const permittedRegistries = terms.constraints.permittedRegistries;
  if (permittedRegistries !== undefined && (attempt.externalRegistry === undefined || !permittedRegistries.includes(attempt.externalRegistry))) {
    return {
      authorized: false,
      code: 'REGISTRY_NOT_PERMITTED',
      reason: `This collateralization mandate restricts external execution to the registries it names; '${String(attempt.externalRegistry)}' is not one of them.`,
    };
  }

  const permittedJurisdictions = terms.constraints.permittedJurisdictions;
  if (permittedJurisdictions !== undefined && (attempt.jurisdiction === undefined || !permittedJurisdictions.includes(attempt.jurisdiction))) {
    return {
      authorized: false,
      code: 'JURISDICTION_NOT_PERMITTED',
      reason: `This collateralization mandate restricts external execution to the jurisdictions it names; '${String(attempt.jurisdiction)}' is not one of them.`,
    };
  }

  const requiredRank = terms.constraints.requiredPriorityRank;
  if (requiredRank !== undefined && (attempt.priorityRank === undefined || attempt.priorityRank > requiredRank)) {
    return {
      authorized: false,
      code: 'PRIORITY_RANK_NOT_AUTHORIZED',
      reason: `This collateralization mandate requires the external arrangement to rank no less senior than ${requiredRank}; the reported ranking is '${String(attempt.priorityRank)}'. AOC compares what an external system reports and determines no priority of its own.`,
    };
  }

  return { authorized: true };
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Whether two records represent the same issued mandate: same id, issued from the same request and decision, over the same asset. */
export function enterpriseCollateralizationMandateIdentityEquals(
  a: EnterpriseCollateralizationMandate,
  b: EnterpriseCollateralizationMandate,
): boolean {
  return a.id === b.id && a.requestRef === b.requestRef && a.decisionRef === b.decisionRef && resourceRefIdentityEquals(a.asset, b.asset);
}

export function enterpriseCollateralizationMandateEquals(
  a: EnterpriseCollateralizationMandate,
  b: EnterpriseCollateralizationMandate,
): boolean {
  return (
    enterpriseCollateralizationMandateIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.status === b.status &&
    enterpriseCollateralizationTermsEquals(a.terms, b.terms) &&
    a.requestedBy === b.requestedBy &&
    a.effectiveFrom === b.effectiveFrom &&
    a.expiresAt === b.expiresAt &&
    a.correlationId === b.correlationId &&
    a.evaluationRef === b.evaluationRef &&
    a.issuerRef === b.issuerRef &&
    collateralizationOptionalStringArrayEquals(a.approvalRefs, b.approvalRefs) &&
    collateralizationOptionalStringArrayEquals(a.obligationRefs, b.obligationRefs) &&
    collateralizationOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs) &&
    collateralizationOptionalStringArrayEquals(a.auditRefs, b.auditRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseCollateralizationMandateValidationCode =
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
  | EnterpriseCollateralizationTermsValidationCode;

export interface EnterpriseCollateralizationMandateValidationIssue {
  readonly code: EnterpriseCollateralizationMandateValidationCode;
  readonly message: string;
}

export type EnterpriseCollateralizationMandateValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseCollateralizationMandateValidationIssue[] };

const MANDATE_STATUSES: readonly EnterpriseCollateralizationMandateStatus[] = ['active', 'revoked'];

/** Validates internal consistency of a candidate mandate. Accepts `unknown` so it can guard deserialized/external input. Never dereferences any `*Ref`. */
export function validateEnterpriseCollateralizationMandate(candidate: unknown): EnterpriseCollateralizationMandateValidationResult {
  if (!isCollateralizationPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Collateralization mandate must be an object.' }] };
  }

  const errors: EnterpriseCollateralizationMandateValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION}'.` });
  }

  if (!isCollateralizationNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (candidate.status === undefined) {
    errors.push({ code: 'MISSING_STATUS', message: 'status is required.' });
  } else if (typeof candidate.status !== 'string' || !MANDATE_STATUSES.includes(candidate.status as EnterpriseCollateralizationMandateStatus)) {
    errors.push({ code: 'INVALID_STATUS', message: `status must be one of: ${MANDATE_STATUSES.join(', ')}.` });
  }

  if (!isCollateralizationPlainObject(candidate.asset)) {
    errors.push({ code: 'MISSING_ASSET', message: 'asset (a ResourceRef) is required.' });
  } else if (!isCollateralizationNonEmptyString(candidate.asset.kind) || !isCollateralizationNonEmptyString(candidate.asset.id)) {
    errors.push({ code: 'INVALID_ASSET', message: 'asset.kind and asset.id must both be non-empty strings.' });
  }

  errors.push(...collectEnterpriseCollateralizationTermsIssues(candidate.terms));

  if (!isCollateralizationNonEmptyString(candidate.requestRef)) {
    errors.push({ code: 'MISSING_REQUEST_REF', message: 'requestRef is required and must be a non-empty string.' });
  }
  if (!isCollateralizationNonEmptyString(candidate.requestedBy)) {
    errors.push({ code: 'MISSING_REQUESTED_BY', message: 'requestedBy is required and must be a non-empty string.' });
  }
  if (!isCollateralizationNonEmptyString(candidate.decisionRef)) {
    errors.push({
      code: 'MISSING_DECISION_REF',
      message: 'decisionRef is required and must be a non-empty string; a mandate can only exist because a canonical governance decision produced it.',
    });
  }

  let effectiveFromMs: number | undefined;
  if (candidate.effectiveFrom === undefined) {
    errors.push({ code: 'MISSING_EFFECTIVE_FROM', message: 'effectiveFrom is required.' });
  } else if (!isCollateralizationTimestamp(candidate.effectiveFrom)) {
    errors.push({ code: 'INVALID_EFFECTIVE_FROM', message: 'effectiveFrom must be an ISO 8601 timestamp string.' });
  } else {
    effectiveFromMs = Date.parse(candidate.effectiveFrom);
  }

  let expiresAtMs: number | undefined;
  if (candidate.expiresAt === undefined) {
    errors.push({ code: 'MISSING_EXPIRES_AT', message: 'expiresAt is required; an authorization with no recorded expiry is not a state this contract can represent.' });
  } else if (!isCollateralizationTimestamp(candidate.expiresAt)) {
    errors.push({ code: 'INVALID_EXPIRES_AT', message: 'expiresAt must be an ISO 8601 timestamp string.' });
  } else {
    expiresAtMs = Date.parse(candidate.expiresAt);
  }

  if (effectiveFromMs !== undefined && expiresAtMs !== undefined && expiresAtMs <= effectiveFromMs) {
    errors.push({ code: 'EXPIRY_NOT_AFTER_EFFECTIVE_FROM', message: 'expiresAt must be strictly after effectiveFrom.' });
  }

  if (!isCollateralizationNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.evaluationRef !== undefined && !isCollateralizationNonEmptyString(candidate.evaluationRef)) {
    errors.push({ code: 'INVALID_EVALUATION_REF', message: 'evaluationRef must be a non-empty string when present.' });
  }
  if (candidate.issuerRef !== undefined && !isCollateralizationNonEmptyString(candidate.issuerRef)) {
    errors.push({ code: 'INVALID_ISSUER_REF', message: 'issuerRef must be a non-empty string when present.' });
  }

  const refLists: readonly (readonly [string, EnterpriseCollateralizationMandateValidationCode])[] = [
    ['approvalRefs', 'INVALID_APPROVAL_REFS'],
    ['obligationRefs', 'INVALID_OBLIGATION_REFS'],
    ['evidenceRefs', 'INVALID_EVIDENCE_REFS'],
    ['auditRefs', 'INVALID_AUDIT_REFS'],
  ];
  for (const [field, code] of refLists) {
    const value = candidate[field];
    if (value !== undefined && !isCollateralizationCanonicalIdArray(value)) {
      errors.push({ code, message: `${field} must be an array of non-empty strings when present.` });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseCollateralizationMandate {
  readonly schemaVersion: string;
  readonly id: string;
  readonly status: string;
  readonly asset: SerializedEnterpriseCollateralizationRequest['asset'];
  readonly terms: SerializedEnterpriseCollateralizationTerms;
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
export function serializeEnterpriseCollateralizationMandate(
  mandate: EnterpriseCollateralizationMandate,
): SerializedEnterpriseCollateralizationMandate {
  return {
    schemaVersion: mandate.schemaVersion,
    id: mandate.id,
    status: mandate.status,
    asset: serializeCollateralizationResourceRef(mandate.asset),
    terms: serializeEnterpriseCollateralizationTerms(mandate.terms),
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

/** Thrown by `deserializeEnterpriseCollateralizationMandate` when the input fails validation. Carries the full issue list rather than just the first. */
export class EnterpriseCollateralizationMandateValidationError extends Error {
  readonly issues: readonly EnterpriseCollateralizationMandateValidationIssue[];

  constructor(issues: readonly EnterpriseCollateralizationMandateValidationIssue[]) {
    super(`Invalid EnterpriseCollateralizationMandate: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseCollateralizationMandateValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseCollateralizationMandate`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseCollateralizationMandate(candidate: unknown): EnterpriseCollateralizationMandate {
  const result = validateEnterpriseCollateralizationMandate(candidate);
  if (!result.valid) throw new EnterpriseCollateralizationMandateValidationError(result.errors);

  const value = candidate as SerializedEnterpriseCollateralizationMandate;
  return {
    schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
    id: value.id,
    status: value.status as EnterpriseCollateralizationMandateStatus,
    asset: readCollateralizationResourceRef(value.asset),
    terms: readEnterpriseCollateralizationTerms(value.terms),
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
