import type { CanonicalId, UtcDateTime } from '@aoc/protocol';

import {
  ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
  collectEnterpriseCollateralizationScopeIssues,
  collateralizationOptionalStringArrayEquals,
  collateralizationStringArrayEquals,
  enterpriseCollateralizationScopeEquals,
  enterpriseSecuredAmountEquals,
  isCollateralizationCanonicalIdArray,
  isCollateralizationNonEmptyString,
  isCollateralizationPlainObject,
  isCollateralizationPositiveInteger,
  isCollateralizationTimestamp,
  isEnterpriseCollateralizableRightType,
  isEnterpriseSecuredAmount,
  serializeEnterpriseCollateralizationScope,
} from './enterprise-collateralization-terms.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { EnterpriseCollateralizableRightType, EnterpriseCollateralizationScope, EnterpriseCollateralizationTermsValidationCode, EnterpriseSecuredAmount } from './enterprise-collateralization-terms.js';

/**
 * The canonical Enterprise-owned contract for **the immutable record of one
 * external collateral arrangement actually created under a previously-issued
 * `EnterpriseCollateralizationMandate`**.
 *
 * This is the integration boundary, and it is the whole of it. AOC Enterprise
 * does not create security interests, file with any registry, perfect
 * anything, determine priority, originate or service loans, value assets, or
 * liquidate collateral, and it ships no provider adapter for
 * collateralization. An external system -- a lender's platform, a collateral
 * agent, a registry, a custodian, a contracting counterparty -- creates the
 * arrangement and reports back what it did; this record is the shape of that
 * report, correlated to the mandate by `mandateRef` and therefore,
 * transitively, to the decision, approvals, obligations, authority and asset
 * that authorized it.
 *
 * The `external*` fields, `jurisdiction` and `priorityRank` are opaque,
 * provider-neutral values AOC stores and echoes and never parses, resolves,
 * validates against any registry, or acts on. Nothing here assumes a
 * blockchain, a government lien registry, a UCC filing system, a securities
 * platform, real estate, or any jurisdiction's law. `priorityRank` records
 * what an external system *reported*; it is never a priority AOC determined,
 * and recording it is not a claim of legal perfection or of standing against
 * any third party.
 *
 * `committedScope` is the portion of the mandate's rights this arrangement
 * actually encumbered. It is never wider than the mandate's scope, and --
 * unlike tokenization's issued units -- it *accumulates*: the sum of every
 * recorded `committedScope` under a mandate must stay inside the scope the
 * mandate authorizes.
 *
 * Recording execution evidence never re-authorizes anything: this contract
 * observes, it does not decide -- the same observation-only posture
 * `EnterpriseUsageEvent` takes toward `EnterpriseAccessGrant`.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/collateralization-mandate`).
 */
export interface EnterpriseCollateralizationExecutionEvidence {
  readonly schemaVersion: typeof ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly mandateRef: CanonicalId;
  readonly executorRef: CanonicalId;
  readonly executedAt: UtcDateTime;
  /** The obligation the arrangement secures, as reported. Checked against the mandate's own before this evidence may be recorded. */
  readonly securedObligationRef: CanonicalId;
  /** The party the arrangement benefits, as reported. Checked against the mandate's own before this evidence may be recorded. */
  readonly securedPartyRef: CanonicalId;
  /** The portion of the mandate's rights this arrangement encumbered -- never wider than the mandate's own scope, and cumulative across executions. */
  readonly committedScope: EnterpriseCollateralizationScope;
  readonly rights: readonly EnterpriseCollateralizableRightType[];
  readonly correlationId: CanonicalId;
  /** The obligation amount the external system reports this arrangement secures. Measured against `EnterpriseCollateralizationConstraints.maximumSecuredAmount`. */
  readonly securedAmount?: EnterpriseSecuredAmount;
  /** Opaque provider label (e.g. a platform or collateral agent name). Never a credential, endpoint, or client. */
  readonly externalSystem?: string;
  /** Opaque registry/provider label, measured against `permittedRegistries`. AOC neither resolves nor contacts it, and does not assume a registry exists. */
  readonly externalRegistry?: string;
  /** Opaque reference to the security/collateral agreement the external system created. */
  readonly externalAgreementReference?: string;
  /** Opaque reference to whatever filing or registration the external system performed, if any. Not a claim that a filing perfected anything. */
  readonly externalFilingReference?: string;
  readonly externalTransactionReference?: string;
  /** Opaque jurisdiction label, measured against `permittedJurisdictions`. AOC hard-codes no jurisdiction and interprets none. */
  readonly jurisdiction?: string;
  /** The ranking the external system reports, `1` most senior. Reported, never determined by AOC. */
  readonly priorityRank?: number;
  readonly evidenceRefs?: readonly CanonicalId[];
}

/**
 * How an external collateral arrangement ended, in the reporting system's own
 * terms. A closed vocabulary because these are the reported *categories*, not
 * legal conclusions: AOC records which word the external system used and
 * derives nothing from the choice.
 */
export const ENTERPRISE_COLLATERAL_RELEASE_TYPES = {
  RELEASED: 'released',
  DISCHARGED: 'discharged',
  SATISFIED: 'satisfied',
  TERMINATED: 'terminated',
} as const;

export type EnterpriseCollateralReleaseType = (typeof ENTERPRISE_COLLATERAL_RELEASE_TYPES)[keyof typeof ENTERPRISE_COLLATERAL_RELEASE_TYPES];

/**
 * The canonical Enterprise-owned contract for **the immutable record that an
 * external system reported a previously-created collateral arrangement was
 * released, discharged, satisfied, or terminated**.
 *
 * This is the lifecycle distinction `TOKENIZE` does not have, and it is
 * deliberately modelled as *evidence*, not as a governed action and not as a
 * mandate status:
 *
 * - It is **not** `RELEASE_COLLATERAL`. No governed action is introduced by
 *   this contract, no authority is evaluated, no decision is produced, and
 *   nothing is authorized. Should releasing collateral ever need to be
 *   *authorized* by AOC rather than merely *observed*, that is a separate
 *   governed action with its own request, decision and mandate.
 * - It is **not** a mandate status. An external release is a fact about an
 *   external arrangement; presenting it as governance state would be AOC
 *   claiming to know, or to have caused, something it did not.
 * - It does **not** restore committed scope. Recording a release does not
 *   decrement the scope committed under a mandate, because AOC cannot verify
 *   that the external encumbrance actually ended and must not create headroom
 *   on the strength of an unverified report.
 *
 * It references the execution it ends (`executionRef`) as well as the mandate
 * (`mandateRef`), so a reviewer can follow one arrangement from authorization
 * through creation to reported release without a second audit system.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/collateralization-mandate`).
 */
export interface EnterpriseCollateralizationReleaseEvidence {
  readonly schemaVersion: typeof ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly mandateRef: CanonicalId;
  /** The specific external arrangement being reported as ended. */
  readonly executionRef: CanonicalId;
  /** Who reported the release. An opaque party pointer -- typically the executor or the secured party, but AOC neither requires nor infers which. */
  readonly reportedBy: CanonicalId;
  readonly releasedAt: UtcDateTime;
  readonly releaseType: EnterpriseCollateralReleaseType;
  readonly correlationId: CanonicalId;
  readonly externalSystem?: string;
  readonly externalRegistry?: string;
  /** Opaque reference to whatever release/discharge instrument the external system produced. Not a claim that anything was legally discharged. */
  readonly externalReleaseReference?: string;
  readonly evidenceRefs?: readonly CanonicalId[];
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Whether two records represent the same observed external arrangement: same evidence id, under the same mandate, by the same executor. */
export function enterpriseCollateralizationExecutionEvidenceIdentityEquals(
  a: EnterpriseCollateralizationExecutionEvidence,
  b: EnterpriseCollateralizationExecutionEvidence,
): boolean {
  return a.id === b.id && a.mandateRef === b.mandateRef && a.executorRef === b.executorRef;
}

export function enterpriseCollateralizationExecutionEvidenceEquals(
  a: EnterpriseCollateralizationExecutionEvidence,
  b: EnterpriseCollateralizationExecutionEvidence,
): boolean {
  return (
    enterpriseCollateralizationExecutionEvidenceIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.executedAt === b.executedAt &&
    a.securedObligationRef === b.securedObligationRef &&
    a.securedPartyRef === b.securedPartyRef &&
    enterpriseCollateralizationScopeEquals(a.committedScope, b.committedScope) &&
    collateralizationStringArrayEquals(a.rights, b.rights) &&
    a.correlationId === b.correlationId &&
    enterpriseSecuredAmountEquals(a.securedAmount, b.securedAmount) &&
    a.externalSystem === b.externalSystem &&
    a.externalRegistry === b.externalRegistry &&
    a.externalAgreementReference === b.externalAgreementReference &&
    a.externalFilingReference === b.externalFilingReference &&
    a.externalTransactionReference === b.externalTransactionReference &&
    a.jurisdiction === b.jurisdiction &&
    a.priorityRank === b.priorityRank &&
    collateralizationOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

export function enterpriseCollateralizationReleaseEvidenceEquals(
  a: EnterpriseCollateralizationReleaseEvidence,
  b: EnterpriseCollateralizationReleaseEvidence,
): boolean {
  return (
    a.id === b.id &&
    a.mandateRef === b.mandateRef &&
    a.executionRef === b.executionRef &&
    a.schemaVersion === b.schemaVersion &&
    a.reportedBy === b.reportedBy &&
    a.releasedAt === b.releasedAt &&
    a.releaseType === b.releaseType &&
    a.correlationId === b.correlationId &&
    a.externalSystem === b.externalSystem &&
    a.externalRegistry === b.externalRegistry &&
    a.externalReleaseReference === b.externalReleaseReference &&
    collateralizationOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseCollateralizationExecutionValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_MANDATE_REF'
  | 'MISSING_EXECUTOR_REF'
  | 'MISSING_EXECUTED_AT'
  | 'INVALID_EXECUTED_AT'
  | 'MISSING_SECURED_OBLIGATION_REF'
  | 'MISSING_SECURED_PARTY_REF'
  | 'MISSING_RIGHTS'
  | 'INVALID_RIGHTS'
  | 'EMPTY_RIGHTS'
  | 'DUPLICATE_RIGHTS'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_SECURED_AMOUNT'
  | 'INVALID_PRIORITY_RANK'
  | 'INVALID_EXTERNAL_REFERENCE'
  | 'INVALID_EVIDENCE_REFS'
  | EnterpriseCollateralizationTermsValidationCode;

export interface EnterpriseCollateralizationExecutionValidationIssue {
  readonly code: EnterpriseCollateralizationExecutionValidationCode;
  readonly message: string;
}

export type EnterpriseCollateralizationExecutionValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseCollateralizationExecutionValidationIssue[] };

const EXTERNAL_STRING_FIELDS = [
  'externalSystem',
  'externalRegistry',
  'externalAgreementReference',
  'externalFilingReference',
  'externalTransactionReference',
  'jurisdiction',
] as const;

/** Validates internal consistency of a candidate execution evidence record. Never dereferences `mandateRef`, and never checks the external references against any real system. */
export function validateEnterpriseCollateralizationExecutionEvidence(candidate: unknown): EnterpriseCollateralizationExecutionValidationResult {
  if (!isCollateralizationPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Collateralization execution evidence must be an object.' }] };
  }

  const errors: EnterpriseCollateralizationExecutionValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION}'.` });
  }

  if (!isCollateralizationNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }
  if (!isCollateralizationNonEmptyString(candidate.mandateRef)) {
    errors.push({ code: 'MISSING_MANDATE_REF', message: 'mandateRef is required and must be a non-empty string.' });
  }
  if (!isCollateralizationNonEmptyString(candidate.executorRef)) {
    errors.push({ code: 'MISSING_EXECUTOR_REF', message: 'executorRef is required and must be a non-empty string.' });
  }
  if (!isCollateralizationNonEmptyString(candidate.securedObligationRef)) {
    errors.push({
      code: 'MISSING_SECURED_OBLIGATION_REF',
      message: 'securedObligationRef is required and must be a non-empty string; evidence must record which obligation the arrangement secured.',
    });
  }
  if (!isCollateralizationNonEmptyString(candidate.securedPartyRef)) {
    errors.push({
      code: 'MISSING_SECURED_PARTY_REF',
      message: 'securedPartyRef is required and must be a non-empty string; evidence must record which party the arrangement benefited.',
    });
  }

  if (candidate.executedAt === undefined) {
    errors.push({ code: 'MISSING_EXECUTED_AT', message: 'executedAt is required.' });
  } else if (!isCollateralizationTimestamp(candidate.executedAt)) {
    errors.push({ code: 'INVALID_EXECUTED_AT', message: 'executedAt must be an ISO 8601 timestamp string.' });
  }

  errors.push(...collectEnterpriseCollateralizationScopeIssues(candidate.committedScope, 'committedScope'));

  if (candidate.rights === undefined) {
    errors.push({ code: 'MISSING_RIGHTS', message: 'rights is required.' });
  } else if (!Array.isArray(candidate.rights) || !candidate.rights.every((right) => isEnterpriseCollateralizableRightType(right))) {
    errors.push({ code: 'INVALID_RIGHTS', message: 'rights must be an array of canonical collateralizable right categories.' });
  } else if (candidate.rights.length === 0) {
    errors.push({ code: 'EMPTY_RIGHTS', message: 'rights must name at least one right.' });
  } else if (new Set(candidate.rights).size !== candidate.rights.length) {
    errors.push({ code: 'DUPLICATE_RIGHTS', message: 'rights must not repeat a right category.' });
  }

  if (!isCollateralizationNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.securedAmount !== undefined && !isEnterpriseSecuredAmount(candidate.securedAmount)) {
    errors.push({
      code: 'INVALID_SECURED_AMOUNT',
      message: 'securedAmount must be { minorUnits: a non-negative integer, currency: a non-empty opaque label } when present.',
    });
  }

  if (candidate.priorityRank !== undefined && !isCollateralizationPositiveInteger(candidate.priorityRank)) {
    errors.push({ code: 'INVALID_PRIORITY_RANK', message: 'priorityRank must be a positive integer when present (1 is the most senior ranking), and records only what an external system reported.' });
  }

  for (const field of EXTERNAL_STRING_FIELDS) {
    const value = candidate[field];
    if (value !== undefined && !isCollateralizationNonEmptyString(value)) {
      errors.push({ code: 'INVALID_EXTERNAL_REFERENCE', message: `${field} must be a non-empty string when present.` });
    }
  }

  if (candidate.evidenceRefs !== undefined && !isCollateralizationCanonicalIdArray(candidate.evidenceRefs)) {
    errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export type EnterpriseCollateralizationReleaseValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_MANDATE_REF'
  | 'MISSING_EXECUTION_REF'
  | 'MISSING_REPORTED_BY'
  | 'MISSING_RELEASED_AT'
  | 'INVALID_RELEASED_AT'
  | 'MISSING_RELEASE_TYPE'
  | 'INVALID_RELEASE_TYPE'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_EXTERNAL_REFERENCE'
  | 'INVALID_EVIDENCE_REFS';

export interface EnterpriseCollateralizationReleaseValidationIssue {
  readonly code: EnterpriseCollateralizationReleaseValidationCode;
  readonly message: string;
}

export type EnterpriseCollateralizationReleaseValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseCollateralizationReleaseValidationIssue[] };

const RELEASE_TYPES: readonly EnterpriseCollateralReleaseType[] = Object.values(ENTERPRISE_COLLATERAL_RELEASE_TYPES);

export function isEnterpriseCollateralReleaseType(value: unknown): value is EnterpriseCollateralReleaseType {
  return typeof value === 'string' && RELEASE_TYPES.includes(value as EnterpriseCollateralReleaseType);
}

const RELEASE_EXTERNAL_STRING_FIELDS = ['externalSystem', 'externalRegistry', 'externalReleaseReference'] as const;

/** Validates internal consistency of a candidate release evidence record. Never dereferences `mandateRef`/`executionRef`, and never verifies the reported release against any external system. */
export function validateEnterpriseCollateralizationReleaseEvidence(candidate: unknown): EnterpriseCollateralizationReleaseValidationResult {
  if (!isCollateralizationPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Collateralization release evidence must be an object.' }] };
  }

  const errors: EnterpriseCollateralizationReleaseValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION}'.` });
  }

  if (!isCollateralizationNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }
  if (!isCollateralizationNonEmptyString(candidate.mandateRef)) {
    errors.push({ code: 'MISSING_MANDATE_REF', message: 'mandateRef is required and must be a non-empty string.' });
  }
  if (!isCollateralizationNonEmptyString(candidate.executionRef)) {
    errors.push({
      code: 'MISSING_EXECUTION_REF',
      message: 'executionRef is required and must be a non-empty string; a release ends one specific recorded arrangement, never a mandate in the abstract.',
    });
  }
  if (!isCollateralizationNonEmptyString(candidate.reportedBy)) {
    errors.push({ code: 'MISSING_REPORTED_BY', message: 'reportedBy is required and must be a non-empty string.' });
  }

  if (candidate.releasedAt === undefined) {
    errors.push({ code: 'MISSING_RELEASED_AT', message: 'releasedAt is required.' });
  } else if (!isCollateralizationTimestamp(candidate.releasedAt)) {
    errors.push({ code: 'INVALID_RELEASED_AT', message: 'releasedAt must be an ISO 8601 timestamp string.' });
  }

  if (candidate.releaseType === undefined) {
    errors.push({ code: 'MISSING_RELEASE_TYPE', message: 'releaseType is required.' });
  } else if (!isEnterpriseCollateralReleaseType(candidate.releaseType)) {
    errors.push({ code: 'INVALID_RELEASE_TYPE', message: `releaseType must be one of: ${RELEASE_TYPES.join(', ')}.` });
  }

  if (!isCollateralizationNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  for (const field of RELEASE_EXTERNAL_STRING_FIELDS) {
    const value = candidate[field];
    if (value !== undefined && !isCollateralizationNonEmptyString(value)) {
      errors.push({ code: 'INVALID_EXTERNAL_REFERENCE', message: `${field} must be a non-empty string when present.` });
    }
  }

  if (candidate.evidenceRefs !== undefined && !isCollateralizationCanonicalIdArray(candidate.evidenceRefs)) {
    errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseCollateralizationExecutionEvidence {
  readonly schemaVersion: string;
  readonly id: string;
  readonly mandateRef: string;
  readonly executorRef: string;
  readonly executedAt: string;
  readonly securedObligationRef: string;
  readonly securedPartyRef: string;
  readonly committedScope: EnterpriseCollateralizationScope;
  readonly rights: readonly string[];
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

/** Projects execution evidence to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseCollateralizationExecutionEvidence(
  evidence: EnterpriseCollateralizationExecutionEvidence,
): SerializedEnterpriseCollateralizationExecutionEvidence {
  return {
    schemaVersion: evidence.schemaVersion,
    id: evidence.id,
    mandateRef: evidence.mandateRef,
    executorRef: evidence.executorRef,
    executedAt: evidence.executedAt,
    securedObligationRef: evidence.securedObligationRef,
    securedPartyRef: evidence.securedPartyRef,
    committedScope: serializeEnterpriseCollateralizationScope(evidence.committedScope),
    rights: [...evidence.rights].sort(),
    correlationId: evidence.correlationId,
    ...(evidence.securedAmount === undefined ? {} : { securedAmount: { minorUnits: evidence.securedAmount.minorUnits, currency: evidence.securedAmount.currency } }),
    ...(evidence.externalSystem === undefined ? {} : { externalSystem: evidence.externalSystem }),
    ...(evidence.externalRegistry === undefined ? {} : { externalRegistry: evidence.externalRegistry }),
    ...(evidence.externalAgreementReference === undefined ? {} : { externalAgreementReference: evidence.externalAgreementReference }),
    ...(evidence.externalFilingReference === undefined ? {} : { externalFilingReference: evidence.externalFilingReference }),
    ...(evidence.externalTransactionReference === undefined ? {} : { externalTransactionReference: evidence.externalTransactionReference }),
    ...(evidence.jurisdiction === undefined ? {} : { jurisdiction: evidence.jurisdiction }),
    ...(evidence.priorityRank === undefined ? {} : { priorityRank: evidence.priorityRank }),
    ...(evidence.evidenceRefs === undefined ? {} : { evidenceRefs: [...evidence.evidenceRefs].sort() }),
  };
}

export interface SerializedEnterpriseCollateralizationReleaseEvidence {
  readonly schemaVersion: string;
  readonly id: string;
  readonly mandateRef: string;
  readonly executionRef: string;
  readonly reportedBy: string;
  readonly releasedAt: string;
  readonly releaseType: string;
  readonly correlationId: string;
  readonly externalSystem?: string;
  readonly externalRegistry?: string;
  readonly externalReleaseReference?: string;
  readonly evidenceRefs?: readonly string[];
}

/** Projects release evidence to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseCollateralizationReleaseEvidence(
  evidence: EnterpriseCollateralizationReleaseEvidence,
): SerializedEnterpriseCollateralizationReleaseEvidence {
  return {
    schemaVersion: evidence.schemaVersion,
    id: evidence.id,
    mandateRef: evidence.mandateRef,
    executionRef: evidence.executionRef,
    reportedBy: evidence.reportedBy,
    releasedAt: evidence.releasedAt,
    releaseType: evidence.releaseType,
    correlationId: evidence.correlationId,
    ...(evidence.externalSystem === undefined ? {} : { externalSystem: evidence.externalSystem }),
    ...(evidence.externalRegistry === undefined ? {} : { externalRegistry: evidence.externalRegistry }),
    ...(evidence.externalReleaseReference === undefined ? {} : { externalReleaseReference: evidence.externalReleaseReference }),
    ...(evidence.evidenceRefs === undefined ? {} : { evidenceRefs: [...evidence.evidenceRefs].sort() }),
  };
}

/** Thrown by `deserializeEnterpriseCollateralizationExecutionEvidence` when the input fails validation. */
export class EnterpriseCollateralizationExecutionValidationError extends Error {
  readonly issues: readonly EnterpriseCollateralizationExecutionValidationIssue[];

  constructor(issues: readonly EnterpriseCollateralizationExecutionValidationIssue[]) {
    super(`Invalid EnterpriseCollateralizationExecutionEvidence: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseCollateralizationExecutionValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseCollateralizationExecutionEvidence`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseCollateralizationExecutionEvidence(candidate: unknown): EnterpriseCollateralizationExecutionEvidence {
  const result = validateEnterpriseCollateralizationExecutionEvidence(candidate);
  if (!result.valid) throw new EnterpriseCollateralizationExecutionValidationError(result.errors);

  const value = candidate as SerializedEnterpriseCollateralizationExecutionEvidence;
  return {
    schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
    id: value.id,
    mandateRef: value.mandateRef,
    executorRef: value.executorRef,
    executedAt: value.executedAt,
    securedObligationRef: value.securedObligationRef,
    securedPartyRef: value.securedPartyRef,
    committedScope: serializeEnterpriseCollateralizationScope(value.committedScope),
    rights: value.rights.map((right) => right as EnterpriseCollateralizableRightType),
    correlationId: value.correlationId,
    ...(value.securedAmount === undefined ? {} : { securedAmount: { minorUnits: value.securedAmount.minorUnits, currency: value.securedAmount.currency } }),
    ...(value.externalSystem === undefined ? {} : { externalSystem: value.externalSystem }),
    ...(value.externalRegistry === undefined ? {} : { externalRegistry: value.externalRegistry }),
    ...(value.externalAgreementReference === undefined ? {} : { externalAgreementReference: value.externalAgreementReference }),
    ...(value.externalFilingReference === undefined ? {} : { externalFilingReference: value.externalFilingReference }),
    ...(value.externalTransactionReference === undefined ? {} : { externalTransactionReference: value.externalTransactionReference }),
    ...(value.jurisdiction === undefined ? {} : { jurisdiction: value.jurisdiction }),
    ...(value.priorityRank === undefined ? {} : { priorityRank: value.priorityRank }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}

/** Thrown by `deserializeEnterpriseCollateralizationReleaseEvidence` when the input fails validation. */
export class EnterpriseCollateralizationReleaseValidationError extends Error {
  readonly issues: readonly EnterpriseCollateralizationReleaseValidationIssue[];

  constructor(issues: readonly EnterpriseCollateralizationReleaseValidationIssue[]) {
    super(`Invalid EnterpriseCollateralizationReleaseEvidence: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseCollateralizationReleaseValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseCollateralizationReleaseEvidence`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseCollateralizationReleaseEvidence(candidate: unknown): EnterpriseCollateralizationReleaseEvidence {
  const result = validateEnterpriseCollateralizationReleaseEvidence(candidate);
  if (!result.valid) throw new EnterpriseCollateralizationReleaseValidationError(result.errors);

  const value = candidate as SerializedEnterpriseCollateralizationReleaseEvidence;
  return {
    schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
    id: value.id,
    mandateRef: value.mandateRef,
    executionRef: value.executionRef,
    reportedBy: value.reportedBy,
    releasedAt: value.releasedAt,
    releaseType: value.releaseType as EnterpriseCollateralReleaseType,
    correlationId: value.correlationId,
    ...(value.externalSystem === undefined ? {} : { externalSystem: value.externalSystem }),
    ...(value.externalRegistry === undefined ? {} : { externalRegistry: value.externalRegistry }),
    ...(value.externalReleaseReference === undefined ? {} : { externalReleaseReference: value.externalReleaseReference }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}
