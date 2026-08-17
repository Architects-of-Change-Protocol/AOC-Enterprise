import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import { resourceRefIdentityEquals } from '@aoc-enterprise/resource-envelope';

import {
  ENTERPRISE_LICENSE_SCHEMA_VERSION,
  collectEnterpriseLicenseTermsIssues,
  enterpriseLicenseContextsWithin,
  enterpriseLicenseExclusivityWithin,
  enterpriseLicenseRightsScopeWithin,
  enterpriseLicenseTermsEquals,
  enterpriseLicensedUnitsWithin,
  enterpriseLicensedUsesWithin,
  isLicenseCanonicalIdArray,
  isLicenseNonEmptyString,
  isLicensePlainObject,
  isLicenseTimestamp,
  licenseOptionalStringArrayEquals,
  readEnterpriseLicenseTerms,
  serializeEnterpriseLicenseTerms,
} from './enterprise-license-terms.js';
import { readLicenseResourceRef, serializeLicenseResourceRef } from './enterprise-license-request.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { EnterpriseLicensableRightType, EnterpriseLicenseExclusivity, EnterpriseLicenseRightsScope, EnterpriseLicenseTerms, EnterpriseLicenseTermsValidationCode, EnterpriseLicensedUnits, EnterpriseLicensedUseType, SerializedEnterpriseLicenseTerms } from './enterprise-license-terms.js';
import type { SerializedEnterpriseLicenseRequest } from './enterprise-license-request.js';
import type { GovernedAuthorizationArtifact, GovernedAuthorizationStatus } from '@aoc-enterprise/governed-authorization';

/**
 * The mandate's own authorization lifecycle -- deliberately not "is this
 * mandate currently usable", and emphatically not "is the external license
 * still in force".
 *
 * `'active'` records that this is, as far as the mandate's own history is
 * concerned, the operative authorization; `'revoked'` records that a later,
 * separate act withdrew it.
 *
 * `'expired'`, `'exhausted'`, `'superseded'` and -- importantly for this
 * action -- `'terminated'` and `'lapsed'` are deliberately NOT status values,
 * mirroring `EnterpriseAccessGrantStatus`'s,
 * `EnterpriseTokenizationMandateStatus`'s and
 * `EnterpriseCollateralizationMandateStatus`'s own two-state rationale, plus
 * one reason specific to licensing:
 *
 * - Expiry of the *authorization* is fully represented by
 *   `effectiveFrom`/`expiresAt`.
 * - Exhaustion is fully represented by recorded execution evidence measured
 *   against `terms.constraints.additionalLicensesAllowed`.
 * - Supersession is a relationship between two mandates, not a property of
 *   either.
 * - **The end of an external license is a fact about that license, not about
 *   this authorization.** A licensing platform reporting that an agreement
 *   expired, was terminated, cancelled, surrendered or superseded does not
 *   retroactively change what AOC authorized, and AOC must never present an
 *   externally-reported fact as a governance state it determined. External
 *   lifecycle is therefore recorded as separate, append-only,
 *   observation-only evidence (`EnterpriseLicenseLifecycleEvidence`) that
 *   references the mandate, never as a status on it.
 */
export type EnterpriseLicenseMandateStatus = GovernedAuthorizationStatus;

/**
 * The canonical Enterprise-owned contract for **the durable, machine-readable
 * record that a recognized authority authorized the grant of a specified
 * permission, over specified rights of a specified governed asset, to a
 * specified licensee, for specified uses, under specified conditions**.
 *
 * This is the `LICENSE` governed action's grant artifact, and it is the same
 * shape of thing `EnterpriseAccessGrant` is for access,
 * `EnterpriseTokenizationMandate` is for tokenization and
 * `EnterpriseCollateralizationMandate` is for collateralization: an immutable
 * record that an authorization was issued, produced only after a decision
 * (and its required approvals and obligations, resolved elsewhere) permitted
 * it. It references the canonical governance objects that created it and
 * never duplicates their contents:
 *
 * - `requestRef` -> `EnterpriseLicenseRequest.id` (what was asked)
 * - `decisionRef` -> the Kernel decision id (what was decided)
 * - `evaluationRef?` -> the Governance Store evaluation aggregate id (the
 *   durable proof of that decision, including its trace, reason codes,
 *   events, and integrity chain)
 * - `approvalRefs?` -> approval proof/decision ids satisfied before issuance
 * - `obligationRefs?` -> `EnterpriseAccessObligation.id`s attached to it
 * - `evidenceRefs?` / `auditRefs?` -> evidence and audit records
 *
 * `terms` is the authorization itself: which rights, to whom, for which uses,
 * how exclusively, under what declared limits. It is carried directly (not
 * re-derived by dereferencing `requestRef`) because a mandate must be
 * checked, displayed, and audited without access to the request record it
 * points at -- the same reason `EnterpriseAccessGrant` carries `principalId`
 * directly.
 *
 * ## What this record does not say
 *
 * A mandate authorizes; it never executes and never concludes. Nothing here
 * drafts an agreement, captures a signature, transfers ownership, settles a
 * royalty, meters usage, or contacts any external system. In particular, the
 * existence of a mandate is **not** a claim that a license agreement exists:
 * until execution evidence is recorded, AOC's position is that it authorized
 * the grant and does not know whether the grant was made.
 *
 * Revoking a mandate withdraws the authority to grant or execute *further*
 * licenses. It makes no claim that an already-granted external license
 * ceased to exist -- AOC cannot erase external legal state it does not
 * control (see the package README, "Revocation is not termination").
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/license-mandate`).
 */
export interface EnterpriseLicenseMandate extends GovernedAuthorizationArtifact<EnterpriseLicenseTerms> {
  /** Re-declared as this action's own literal so a serialized mandate names its schema on its face and cannot be replayed through a sibling action's contract. */
  readonly schemaVersion: typeof ENTERPRISE_LICENSE_SCHEMA_VERSION;
  readonly status: EnterpriseLicenseMandateStatus;
  /** When AOC's authority to grant under this mandate ends. **Not** the external license's expiry -- see `EnterpriseLicenseConstraints.maximumLicenseTermEndsAt`, which is a genuinely different duration and is deliberately not folded into the shared skeleton. */
  readonly expiresAt: UtcDateTime;
}

// ---------------------------------------------------------------------------
// Derived authorization semantics
// ---------------------------------------------------------------------------

/** One concrete external license a caller proposes to grant under a mandate. */
export interface EnterpriseLicenseExerciseAttempt {
  /** The party proposing to perform the external licensing act. Checked against `terms.executorRef` only when the mandate bound one. */
  readonly executedBy: CanonicalId;
  /** The party the proposed license would be granted to. Must be exactly the mandate's own licensee unless the mandate permits assignment. */
  readonly licenseeRef: CanonicalId;
  readonly rights: readonly EnterpriseLicensableRightType[];
  /** The uses the proposed license would actually grant. Must be a subset of `terms.permittedUses` and disjoint from `terms.constraints.prohibitedUses`. */
  readonly grantedUses: readonly EnterpriseLicensedUseType[];
  readonly exclusivity: EnterpriseLicenseExclusivity;
  readonly at: UtcDateTime;
  /** The portion of the named rights the proposed license draws on, when the mandate expresses one. Presence must match the mandate's -- see `enterpriseLicenseRightsScopeWithin`. */
  readonly rightsScope?: EnterpriseLicenseRightsScope;
  /** The operating context the external system reports the license is confined to, by opaque dimension. Measured against `terms.constraints.permittedContexts`. */
  readonly contexts?: Readonly<Record<string, readonly string[]>>;
  /** When the external license itself expires, as reported. Measured against `terms.constraints.maximumLicenseTermEndsAt`. */
  readonly licenseExpiresAt?: UtcDateTime;
  /** The size of the proposed license in named units, as reported. Measured against `terms.constraints.maximumLicensedUnits`. */
  readonly licensedUnits?: EnterpriseLicensedUnits;
  /** Whether the external system reported an agreement reference. Measured against `terms.constraints.externalAgreementReferenceRequired`. */
  readonly hasExternalAgreementReference?: boolean;
  /** How many external licenses have already been recorded under this mandate. Used only to enforce `constraints.additionalLicensesAllowed`. */
  readonly priorExecutionCount?: number;
}

export type EnterpriseLicenseRefusalCode =
  | 'INVALID_EXERCISE_INSTANT'
  | 'MANDATE_REVOKED'
  | 'MANDATE_NOT_YET_EFFECTIVE'
  | 'MANDATE_EXPIRED'
  | 'EXECUTOR_NOT_AUTHORIZED'
  | 'LICENSEE_NOT_AUTHORIZED'
  | 'RIGHTS_NOT_AUTHORIZED'
  | 'USES_NOT_AUTHORIZED'
  | 'USE_PROHIBITED'
  | 'EXCLUSIVITY_EXCEEDS_MANDATE'
  | 'RIGHTS_SCOPE_EXCEEDS_MANDATE'
  | 'CONTEXT_NOT_PERMITTED'
  | 'LICENSE_TERM_EXCEEDS_MANDATE'
  | 'LICENSED_UNITS_EXCEED_MANDATE'
  | 'EXTERNAL_AGREEMENT_REFERENCE_REQUIRED'
  | 'ADDITIONAL_LICENSES_PROHIBITED';

export type EnterpriseLicenseAuthorizationResult =
  | { readonly authorized: true }
  | { readonly authorized: false; readonly code: EnterpriseLicenseRefusalCode; readonly reason: string };

/**
 * The single place this package decides whether a mandate authorizes one
 * concrete external license grant. Pure: it reads the mandate, the attempt,
 * and the attempt's own `at` instant -- it never reads a wall clock, contacts
 * a provider or platform, or mutates anything. Every derived state the status
 * vocabulary deliberately omits (expired, not-yet-effective, exhausted) is
 * computed here from the fields that already record it.
 *
 * The order of checks is deliberate: identity bindings (executor, licensee)
 * are refused before permission checks, so a substitution attempt is reported
 * as a substitution rather than as a downstream use or context problem.
 *
 * Containment is semantic throughout, never string coincidence: uses are
 * compared as sets, exclusivity as a rank, contexts dimension by dimension
 * with every value checked, durations as parsed instants, unit counts within
 * a matching denomination only, and rights scope only between commensurable
 * scopes.
 */
export function enterpriseLicenseMandateAuthorizes(
  mandate: EnterpriseLicenseMandate,
  attempt: EnterpriseLicenseExerciseAttempt,
): EnterpriseLicenseAuthorizationResult {
  if (mandate.status === 'revoked') {
    return {
      authorized: false,
      code: 'MANDATE_REVOKED',
      reason: 'This license mandate has been revoked; no further external licensing is authorized under it.',
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
    return { authorized: false, code: 'MANDATE_NOT_YET_EFFECTIVE', reason: `This license mandate does not take effect until ${mandate.effectiveFrom}.` };
  }
  if (at >= Date.parse(mandate.expiresAt)) {
    return { authorized: false, code: 'MANDATE_EXPIRED', reason: `This license mandate expired at ${mandate.expiresAt}.` };
  }

  const { terms } = mandate;
  const { constraints } = terms;

  // Executor binding applies only when the mandate actually bound one.
  // A mandate with no `executorRef` does not bind who performs the licensing
  // act, and `executedBy` is recorded as an observation rather than checked.
  if (terms.executorRef !== undefined && attempt.executedBy !== terms.executorRef) {
    return { authorized: false, code: 'EXECUTOR_NOT_AUTHORIZED', reason: `Only '${terms.executorRef}' may execute this license mandate.` };
  }

  // Licensee binding is the default and is preserved unless this
  // authorization declared the license freely assignable. A license the
  // licensee may assign to anyone the moment it exists is one whose licensee
  // identity the authorization did not bind; anything less than
  // `'permitted'` -- including `'approval-required'` -- keeps the binding,
  // because the further approval is precisely what has not happened here.
  if (attempt.licenseeRef !== terms.licenseeRef && constraints.assignment !== 'permitted') {
    return {
      authorized: false,
      code: 'LICENSEE_NOT_AUTHORIZED',
      reason: `This license mandate authorizes a grant to '${terms.licenseeRef}' only; granting to a different licensee requires a new authorization, or an authorization whose assignment disposition is 'permitted'.`,
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
          : `This license mandate does not authorize the right '${String(unauthorizedRight)}'.`,
    };
  }

  if (attempt.grantedUses.length === 0 || !enterpriseLicensedUsesWithin(attempt.grantedUses, terms.permittedUses)) {
    const unauthorizedUse = attempt.grantedUses.find((use) => !terms.permittedUses.includes(use));
    return {
      authorized: false,
      code: 'USES_NOT_AUTHORIZED',
      reason:
        attempt.grantedUses.length === 0
          ? 'An exercise must name at least one governed use; a license granting nothing is not an exercise of this authorization.'
          : `This license mandate does not permit the use '${String(unauthorizedUse)}'.`,
    };
  }

  // Checked separately from the allow-list even though the two can never
  // overlap in a valid mandate: an explicit exclusion deserves to be reported
  // as an exclusion, and this stays correct if a prohibited use is ever added
  // to a vocabulary that a stored allow-list predates.
  if (constraints.prohibitedUses !== undefined) {
    const prohibited = attempt.grantedUses.find((use) => constraints.prohibitedUses?.includes(use) === true);
    if (prohibited !== undefined) {
      return {
        authorized: false,
        code: 'USE_PROHIBITED',
        reason: `This license mandate explicitly excludes the use '${prohibited}'.`,
      };
    }
  }

  if (!enterpriseLicenseExclusivityWithin(attempt.exclusivity, terms.exclusivity)) {
    return {
      authorized: false,
      code: 'EXCLUSIVITY_EXCEEDS_MANDATE',
      reason: `This license mandate authorizes a '${terms.exclusivity}' grant; a '${attempt.exclusivity}' grant is more exclusive than was authorized.`,
    };
  }

  if (!enterpriseLicenseRightsScopeWithin(attempt.rightsScope, terms.rightsScope)) {
    return {
      authorized: false,
      code: 'RIGHTS_SCOPE_EXCEEDS_MANDATE',
      reason:
        terms.rightsScope === undefined
          ? 'This license mandate does not express the permission as a portion of the named rights, so an exercise may not assert one; AOC cannot verify a portion it never authorized.'
          : 'The proposed exercise is outside the portion of the named rights this license mandate authorizes, or does not express one at all.',
    };
  }

  if (!enterpriseLicenseContextsWithin(attempt.contexts, constraints.permittedContexts)) {
    return {
      authorized: false,
      code: 'CONTEXT_NOT_PERMITTED',
      reason: 'This license mandate confines the license to the operating context it names; the proposed exercise reports a context outside it, or does not report one at all.',
    };
  }

  const maximumTermEnd = constraints.maximumLicenseTermEndsAt;
  if (maximumTermEnd !== undefined) {
    // An unreported external expiry cannot be shown to be inside a declared
    // ceiling -- a license with no stated end is potentially perpetual -- so
    // it is refused rather than assumed to be bounded.
    if (attempt.licenseExpiresAt === undefined || Date.parse(attempt.licenseExpiresAt) > Date.parse(maximumTermEnd)) {
      return {
        authorized: false,
        code: 'LICENSE_TERM_EXCEEDS_MANDATE',
        reason: `This license mandate authorizes an external license running no later than ${maximumTermEnd}; the proposed exercise does not report an expiry inside that ceiling.`,
      };
    }
  }

  const maximumUnits = constraints.maximumLicensedUnits;
  if (maximumUnits !== undefined) {
    if (attempt.licensedUnits === undefined || !enterpriseLicensedUnitsWithin(attempt.licensedUnits, maximumUnits)) {
      return {
        authorized: false,
        code: 'LICENSED_UNITS_EXCEED_MANDATE',
        reason: `This license mandate authorizes at most ${maximumUnits.units} '${maximumUnits.unitDenomination}' per granted license; the proposed exercise does not report a count inside that ceiling.`,
      };
    }
  }

  if (constraints.externalAgreementReferenceRequired === true && attempt.hasExternalAgreementReference !== true) {
    return {
      authorized: false,
      code: 'EXTERNAL_AGREEMENT_REFERENCE_REQUIRED',
      reason:
        'This license mandate requires an external agreement reference to be reported with the license grant; AOC records that reference and never interprets, resolves, or verifies what it names.',
    };
  }

  // "May this be exercised again at all?" is answered last, so a second
  // attempt that is *also* substantively wrong is reported by its
  // substantive fault rather than being masked as exhaustion.
  const priorExecutions = attempt.priorExecutionCount ?? 0;
  if (priorExecutions > 0 && !constraints.additionalLicensesAllowed) {
    return {
      authorized: false,
      code: 'ADDITIONAL_LICENSES_PROHIBITED',
      reason: 'This license mandate prohibits additional licenses and has already been exercised.',
    };
  }

  return { authorized: true };
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Whether two records represent the same issued mandate: same id, issued from the same request and decision, over the same asset. */
export function enterpriseLicenseMandateIdentityEquals(a: EnterpriseLicenseMandate, b: EnterpriseLicenseMandate): boolean {
  return a.id === b.id && a.requestRef === b.requestRef && a.decisionRef === b.decisionRef && resourceRefIdentityEquals(a.asset, b.asset);
}

export function enterpriseLicenseMandateEquals(a: EnterpriseLicenseMandate, b: EnterpriseLicenseMandate): boolean {
  return (
    enterpriseLicenseMandateIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.status === b.status &&
    enterpriseLicenseTermsEquals(a.terms, b.terms) &&
    a.requestedBy === b.requestedBy &&
    a.effectiveFrom === b.effectiveFrom &&
    a.expiresAt === b.expiresAt &&
    a.correlationId === b.correlationId &&
    a.evaluationRef === b.evaluationRef &&
    a.issuerRef === b.issuerRef &&
    licenseOptionalStringArrayEquals(a.approvalRefs, b.approvalRefs) &&
    licenseOptionalStringArrayEquals(a.obligationRefs, b.obligationRefs) &&
    licenseOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs) &&
    licenseOptionalStringArrayEquals(a.auditRefs, b.auditRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseLicenseMandateValidationCode =
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
  | EnterpriseLicenseTermsValidationCode;

export interface EnterpriseLicenseMandateValidationIssue {
  readonly code: EnterpriseLicenseMandateValidationCode;
  readonly message: string;
}

export type EnterpriseLicenseMandateValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseLicenseMandateValidationIssue[] };

const MANDATE_STATUSES: readonly EnterpriseLicenseMandateStatus[] = ['active', 'revoked'];

/** Validates internal consistency of a candidate mandate. Accepts `unknown` so it can guard deserialized/external input. Never dereferences any `*Ref`. */
export function validateEnterpriseLicenseMandate(candidate: unknown): EnterpriseLicenseMandateValidationResult {
  if (!isLicensePlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'License mandate must be an object.' }] };
  }

  const errors: EnterpriseLicenseMandateValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_LICENSE_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_LICENSE_SCHEMA_VERSION}'.` });
  }

  if (!isLicenseNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (candidate.status === undefined) {
    errors.push({ code: 'MISSING_STATUS', message: 'status is required.' });
  } else if (typeof candidate.status !== 'string' || !MANDATE_STATUSES.includes(candidate.status as EnterpriseLicenseMandateStatus)) {
    errors.push({ code: 'INVALID_STATUS', message: `status must be one of: ${MANDATE_STATUSES.join(', ')}.` });
  }

  if (!isLicensePlainObject(candidate.asset)) {
    errors.push({ code: 'MISSING_ASSET', message: 'asset (a ResourceRef) is required.' });
  } else if (!isLicenseNonEmptyString(candidate.asset.kind) || !isLicenseNonEmptyString(candidate.asset.id)) {
    errors.push({ code: 'INVALID_ASSET', message: 'asset.kind and asset.id must both be non-empty strings.' });
  }

  errors.push(...collectEnterpriseLicenseTermsIssues(candidate.terms));

  if (!isLicenseNonEmptyString(candidate.requestRef)) {
    errors.push({ code: 'MISSING_REQUEST_REF', message: 'requestRef is required and must be a non-empty string.' });
  }
  if (!isLicenseNonEmptyString(candidate.requestedBy)) {
    errors.push({ code: 'MISSING_REQUESTED_BY', message: 'requestedBy is required and must be a non-empty string.' });
  }
  if (!isLicenseNonEmptyString(candidate.decisionRef)) {
    errors.push({
      code: 'MISSING_DECISION_REF',
      message: 'decisionRef is required and must be a non-empty string; a mandate can only exist because a canonical governance decision produced it.',
    });
  }

  let effectiveFromMs: number | undefined;
  if (candidate.effectiveFrom === undefined) {
    errors.push({ code: 'MISSING_EFFECTIVE_FROM', message: 'effectiveFrom is required.' });
  } else if (!isLicenseTimestamp(candidate.effectiveFrom)) {
    errors.push({ code: 'INVALID_EFFECTIVE_FROM', message: 'effectiveFrom must be an ISO 8601 timestamp string.' });
  } else {
    effectiveFromMs = Date.parse(candidate.effectiveFrom);
  }

  let expiresAtMs: number | undefined;
  if (candidate.expiresAt === undefined) {
    errors.push({
      code: 'MISSING_EXPIRES_AT',
      message: 'expiresAt is required; an authorization with no recorded expiry is not a state this contract can represent. It bounds AOC authority, not the external license term.',
    });
  } else if (!isLicenseTimestamp(candidate.expiresAt)) {
    errors.push({ code: 'INVALID_EXPIRES_AT', message: 'expiresAt must be an ISO 8601 timestamp string.' });
  } else {
    expiresAtMs = Date.parse(candidate.expiresAt);
  }

  if (effectiveFromMs !== undefined && expiresAtMs !== undefined && expiresAtMs <= effectiveFromMs) {
    errors.push({ code: 'EXPIRY_NOT_AFTER_EFFECTIVE_FROM', message: 'expiresAt must be strictly after effectiveFrom.' });
  }

  if (!isLicenseNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.evaluationRef !== undefined && !isLicenseNonEmptyString(candidate.evaluationRef)) {
    errors.push({ code: 'INVALID_EVALUATION_REF', message: 'evaluationRef must be a non-empty string when present.' });
  }
  if (candidate.issuerRef !== undefined && !isLicenseNonEmptyString(candidate.issuerRef)) {
    errors.push({ code: 'INVALID_ISSUER_REF', message: 'issuerRef must be a non-empty string when present.' });
  }

  const refLists: readonly (readonly [string, EnterpriseLicenseMandateValidationCode])[] = [
    ['approvalRefs', 'INVALID_APPROVAL_REFS'],
    ['obligationRefs', 'INVALID_OBLIGATION_REFS'],
    ['evidenceRefs', 'INVALID_EVIDENCE_REFS'],
    ['auditRefs', 'INVALID_AUDIT_REFS'],
  ];
  for (const [field, code] of refLists) {
    const value = candidate[field];
    if (value !== undefined && !isLicenseCanonicalIdArray(value)) {
      errors.push({ code, message: `${field} must be an array of non-empty strings when present.` });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseLicenseMandate {
  readonly schemaVersion: string;
  readonly id: string;
  readonly status: string;
  readonly asset: SerializedEnterpriseLicenseRequest['asset'];
  readonly terms: SerializedEnterpriseLicenseTerms;
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
export function serializeEnterpriseLicenseMandate(mandate: EnterpriseLicenseMandate): SerializedEnterpriseLicenseMandate {
  return {
    schemaVersion: mandate.schemaVersion,
    id: mandate.id,
    status: mandate.status,
    asset: serializeLicenseResourceRef(mandate.asset),
    terms: serializeEnterpriseLicenseTerms(mandate.terms),
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

/** Thrown by `deserializeEnterpriseLicenseMandate` when the input fails validation. Carries the full issue list rather than just the first. */
export class EnterpriseLicenseMandateValidationError extends Error {
  readonly issues: readonly EnterpriseLicenseMandateValidationIssue[];

  constructor(issues: readonly EnterpriseLicenseMandateValidationIssue[]) {
    super(`Invalid EnterpriseLicenseMandate: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseLicenseMandateValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseLicenseMandate`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseLicenseMandate(candidate: unknown): EnterpriseLicenseMandate {
  const result = validateEnterpriseLicenseMandate(candidate);
  if (!result.valid) throw new EnterpriseLicenseMandateValidationError(result.errors);

  const value = candidate as SerializedEnterpriseLicenseMandate;
  return {
    schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
    id: value.id,
    status: value.status as EnterpriseLicenseMandateStatus,
    asset: readLicenseResourceRef(value.asset),
    terms: readEnterpriseLicenseTerms(value.terms),
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
