import type { CanonicalId, UtcDateTime } from '@aoc/protocol';

import {
  ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
  collectEnterpriseTokenizationScopeIssues,
  enterpriseTokenizationScopeEquals,
  isEnterpriseTokenizedRightType,
  isTokenizationCanonicalIdArray,
  isTokenizationNonEmptyString,
  isTokenizationPlainObject,
  isTokenizationPositiveInteger,
  isTokenizationTimestamp,
  tokenizationOptionalStringArrayEquals,
  tokenizationStringArrayEquals,
} from './enterprise-tokenization-terms.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { EnterpriseTokenizationScope, EnterpriseTokenizationTermsValidationCode, EnterpriseTokenizedRightType } from './enterprise-tokenization-terms.js';

/**
 * The canonical Enterprise-owned contract for **the immutable record of one
 * external tokenization actually performed under a previously-issued
 * `EnterpriseTokenizationMandate`**.
 *
 * This is the integration boundary, and it is the whole of it. AOC Enterprise
 * does not mint tokens, does not call a blockchain, does not hold keys, and
 * ships no provider adapter for tokenization. An external system -- a
 * tokenization provider, a regulated platform, a transfer agent, a custodian
 * -- performs the issuance and reports back what it did; this record is the
 * shape of that report, correlated to the mandate by `mandateRef` and
 * therefore, transitively, to the decision, approvals, obligations, authority
 * and asset that authorized it.
 *
 * The `external*` fields are opaque, provider-neutral strings AOC stores and
 * echoes and never parses, resolves, validates against any network, or acts
 * on. `externalContractReference` is not assumed to be an EVM address,
 * `externalTokenStandard` is not assumed to be an ERC number, and no field
 * assumes a token confers ownership: what the tokens represent is exactly and
 * only what `rights` records, and `rights` is checked against the mandate's
 * own authorized rights before this evidence may be recorded.
 *
 * Recording execution evidence never re-authorizes anything: this contract
 * observes, it does not decide -- the same observation-only posture
 * `EnterpriseUsageEvent` takes toward `EnterpriseAccessGrant`.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/tokenization-mandate`).
 */
export interface EnterpriseTokenizationExecutionEvidence {
  readonly schemaVersion: typeof ENTERPRISE_TOKENIZATION_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly mandateRef: CanonicalId;
  readonly executorRef: CanonicalId;
  readonly executedAt: UtcDateTime;
  /** The portion of the mandate's rights this issuance actually represented -- never wider than the mandate's own scope. */
  readonly issuedScope: EnterpriseTokenizationScope;
  readonly rights: readonly EnterpriseTokenizedRightType[];
  readonly correlationId: CanonicalId;
  /** Count of external units issued, when the external system reports one. Measured against `EnterpriseTokenizationConstraints.maximumIssuedUnits`. */
  readonly issuedUnits?: number;
  /** Opaque provider label (e.g. a platform name). Never a credential, endpoint, or client. */
  readonly externalSystem?: string;
  readonly externalNetwork?: string;
  readonly externalTokenStandard?: string;
  readonly externalContractReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly CanonicalId[];
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Whether two records represent the same observed external issuance: same evidence id, under the same mandate, by the same executor. */
export function enterpriseTokenizationExecutionEvidenceIdentityEquals(
  a: EnterpriseTokenizationExecutionEvidence,
  b: EnterpriseTokenizationExecutionEvidence,
): boolean {
  return a.id === b.id && a.mandateRef === b.mandateRef && a.executorRef === b.executorRef;
}

export function enterpriseTokenizationExecutionEvidenceEquals(
  a: EnterpriseTokenizationExecutionEvidence,
  b: EnterpriseTokenizationExecutionEvidence,
): boolean {
  return (
    enterpriseTokenizationExecutionEvidenceIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.executedAt === b.executedAt &&
    enterpriseTokenizationScopeEquals(a.issuedScope, b.issuedScope) &&
    tokenizationStringArrayEquals(a.rights, b.rights) &&
    a.correlationId === b.correlationId &&
    a.issuedUnits === b.issuedUnits &&
    a.externalSystem === b.externalSystem &&
    a.externalNetwork === b.externalNetwork &&
    a.externalTokenStandard === b.externalTokenStandard &&
    a.externalContractReference === b.externalContractReference &&
    a.externalTransactionReference === b.externalTransactionReference &&
    tokenizationOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseTokenizationExecutionValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_MANDATE_REF'
  | 'MISSING_EXECUTOR_REF'
  | 'MISSING_EXECUTED_AT'
  | 'INVALID_EXECUTED_AT'
  | 'MISSING_RIGHTS'
  | 'INVALID_RIGHTS'
  | 'EMPTY_RIGHTS'
  | 'DUPLICATE_RIGHTS'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_ISSUED_UNITS'
  | 'INVALID_EXTERNAL_REFERENCE'
  | 'INVALID_EVIDENCE_REFS'
  | EnterpriseTokenizationTermsValidationCode;

export interface EnterpriseTokenizationExecutionValidationIssue {
  readonly code: EnterpriseTokenizationExecutionValidationCode;
  readonly message: string;
}

export type EnterpriseTokenizationExecutionValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseTokenizationExecutionValidationIssue[] };

const EXTERNAL_STRING_FIELDS = ['externalSystem', 'externalNetwork', 'externalTokenStandard', 'externalContractReference', 'externalTransactionReference'] as const;

/** Validates internal consistency of a candidate execution evidence record. Never dereferences `mandateRef`, and never checks the external references against any real system. */
export function validateEnterpriseTokenizationExecutionEvidence(candidate: unknown): EnterpriseTokenizationExecutionValidationResult {
  if (!isTokenizationPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Tokenization execution evidence must be an object.' }] };
  }

  const errors: EnterpriseTokenizationExecutionValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_TOKENIZATION_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_TOKENIZATION_SCHEMA_VERSION}'.` });
  }

  if (!isTokenizationNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }
  if (!isTokenizationNonEmptyString(candidate.mandateRef)) {
    errors.push({ code: 'MISSING_MANDATE_REF', message: 'mandateRef is required and must be a non-empty string.' });
  }
  if (!isTokenizationNonEmptyString(candidate.executorRef)) {
    errors.push({ code: 'MISSING_EXECUTOR_REF', message: 'executorRef is required and must be a non-empty string.' });
  }

  if (candidate.executedAt === undefined) {
    errors.push({ code: 'MISSING_EXECUTED_AT', message: 'executedAt is required.' });
  } else if (!isTokenizationTimestamp(candidate.executedAt)) {
    errors.push({ code: 'INVALID_EXECUTED_AT', message: 'executedAt must be an ISO 8601 timestamp string.' });
  }

  errors.push(...collectEnterpriseTokenizationScopeIssues(candidate.issuedScope, 'issuedScope'));

  if (candidate.rights === undefined) {
    errors.push({ code: 'MISSING_RIGHTS', message: 'rights is required.' });
  } else if (!Array.isArray(candidate.rights) || !candidate.rights.every((right) => isEnterpriseTokenizedRightType(right))) {
    errors.push({ code: 'INVALID_RIGHTS', message: 'rights must be an array of canonical tokenized right categories.' });
  } else if (candidate.rights.length === 0) {
    errors.push({ code: 'EMPTY_RIGHTS', message: 'rights must name at least one right.' });
  } else if (new Set(candidate.rights).size !== candidate.rights.length) {
    errors.push({ code: 'DUPLICATE_RIGHTS', message: 'rights must not repeat a right category.' });
  }

  if (!isTokenizationNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.issuedUnits !== undefined && !isTokenizationPositiveInteger(candidate.issuedUnits)) {
    errors.push({ code: 'INVALID_ISSUED_UNITS', message: 'issuedUnits must be a positive integer when present.' });
  }

  for (const field of EXTERNAL_STRING_FIELDS) {
    const value = candidate[field];
    if (value !== undefined && !isTokenizationNonEmptyString(value)) {
      errors.push({ code: 'INVALID_EXTERNAL_REFERENCE', message: `${field} must be a non-empty string when present.` });
    }
  }

  if (candidate.evidenceRefs !== undefined && !isTokenizationCanonicalIdArray(candidate.evidenceRefs)) {
    errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseTokenizationExecutionEvidence {
  readonly schemaVersion: string;
  readonly id: string;
  readonly mandateRef: string;
  readonly executorRef: string;
  readonly executedAt: string;
  readonly issuedScope: EnterpriseTokenizationScope;
  readonly rights: readonly string[];
  readonly correlationId: string;
  readonly issuedUnits?: number;
  readonly externalSystem?: string;
  readonly externalNetwork?: string;
  readonly externalTokenStandard?: string;
  readonly externalContractReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
}

/** Projects execution evidence to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseTokenizationExecutionEvidence(
  evidence: EnterpriseTokenizationExecutionEvidence,
): SerializedEnterpriseTokenizationExecutionEvidence {
  const scope = evidence.issuedScope;
  return {
    schemaVersion: evidence.schemaVersion,
    id: evidence.id,
    mandateRef: evidence.mandateRef,
    executorRef: evidence.executorRef,
    executedAt: evidence.executedAt,
    issuedScope:
      scope.kind === 'proportional'
        ? { kind: 'proportional', basisPoints: scope.basisPoints }
        : { kind: 'unitized', units: scope.units, unitDenomination: scope.unitDenomination },
    rights: [...evidence.rights].sort(),
    correlationId: evidence.correlationId,
    ...(evidence.issuedUnits === undefined ? {} : { issuedUnits: evidence.issuedUnits }),
    ...(evidence.externalSystem === undefined ? {} : { externalSystem: evidence.externalSystem }),
    ...(evidence.externalNetwork === undefined ? {} : { externalNetwork: evidence.externalNetwork }),
    ...(evidence.externalTokenStandard === undefined ? {} : { externalTokenStandard: evidence.externalTokenStandard }),
    ...(evidence.externalContractReference === undefined ? {} : { externalContractReference: evidence.externalContractReference }),
    ...(evidence.externalTransactionReference === undefined ? {} : { externalTransactionReference: evidence.externalTransactionReference }),
    ...(evidence.evidenceRefs === undefined ? {} : { evidenceRefs: [...evidence.evidenceRefs].sort() }),
  };
}

/** Thrown by `deserializeEnterpriseTokenizationExecutionEvidence` when the input fails validation. */
export class EnterpriseTokenizationExecutionValidationError extends Error {
  readonly issues: readonly EnterpriseTokenizationExecutionValidationIssue[];

  constructor(issues: readonly EnterpriseTokenizationExecutionValidationIssue[]) {
    super(`Invalid EnterpriseTokenizationExecutionEvidence: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseTokenizationExecutionValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseTokenizationExecutionEvidence`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseTokenizationExecutionEvidence(candidate: unknown): EnterpriseTokenizationExecutionEvidence {
  const result = validateEnterpriseTokenizationExecutionEvidence(candidate);
  if (!result.valid) throw new EnterpriseTokenizationExecutionValidationError(result.errors);

  const value = candidate as SerializedEnterpriseTokenizationExecutionEvidence;
  const scope = value.issuedScope;
  return {
    schemaVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
    id: value.id,
    mandateRef: value.mandateRef,
    executorRef: value.executorRef,
    executedAt: value.executedAt,
    issuedScope:
      scope.kind === 'proportional'
        ? { kind: 'proportional', basisPoints: scope.basisPoints }
        : { kind: 'unitized', units: scope.units, unitDenomination: scope.unitDenomination },
    rights: value.rights.map((right) => right as EnterpriseTokenizedRightType),
    correlationId: value.correlationId,
    ...(value.issuedUnits === undefined ? {} : { issuedUnits: value.issuedUnits }),
    ...(value.externalSystem === undefined ? {} : { externalSystem: value.externalSystem }),
    ...(value.externalNetwork === undefined ? {} : { externalNetwork: value.externalNetwork }),
    ...(value.externalTokenStandard === undefined ? {} : { externalTokenStandard: value.externalTokenStandard }),
    ...(value.externalContractReference === undefined ? {} : { externalContractReference: value.externalContractReference }),
    ...(value.externalTransactionReference === undefined ? {} : { externalTransactionReference: value.externalTransactionReference }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}
