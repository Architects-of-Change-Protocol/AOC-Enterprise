import type { CanonicalId, UtcDateTime } from '@aoc/protocol';

import {
  ENTERPRISE_LICENSE_SCHEMA_VERSION,
  collectEnterpriseLicenseContextIssues,
  collectEnterpriseLicenseRightsScopeIssues,
  enterpriseLicenseContextsEquals,
  enterpriseLicenseRightsScopeEquals,
  enterpriseLicensedUnitsEquals,
  isEnterpriseLicensableRightType,
  isEnterpriseLicenseExclusivity,
  isEnterpriseLicensedUnits,
  isEnterpriseLicensedUseType,
  isLicenseCanonicalIdArray,
  isLicenseNonEmptyString,
  isLicensePlainObject,
  isLicenseTimestamp,
  licenseOptionalStringArrayEquals,
  licenseStringArrayEquals,
  readEnterpriseLicenseContexts,
  serializeEnterpriseLicenseContexts,
  serializeEnterpriseLicenseRightsScope,
} from './enterprise-license-terms.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { EnterpriseLicensableRightType, EnterpriseLicenseExclusivity, EnterpriseLicenseRightsScope, EnterpriseLicenseTermsValidationCode, EnterpriseLicensedUnits, EnterpriseLicensedUseType } from './enterprise-license-terms.js';

/**
 * The canonical Enterprise-owned contract for **the immutable record of one
 * external license actually granted under a previously-issued
 * `EnterpriseLicenseMandate`**.
 *
 * This is the integration boundary, and it is the whole of it. AOC Enterprise
 * does not draft agreements, capture signatures, operate a licensing
 * marketplace, list or price licenses, calculate or collect royalties, settle
 * payments, compute tax, meter usage, or enforce DRM, and it ships no
 * provider adapter for licensing. An external system -- a licensing platform,
 * a rights administrator, a contracting counterparty, or the licensor's own
 * legal process -- grants the license and reports back what it did; this
 * record is the shape of that report, correlated to the mandate by
 * `mandateRef` and therefore, transitively, to the decision, approvals,
 * obligations, authority and asset that authorized it.
 *
 * **A mandate proves AOC authorized the license. This record is the only
 * thing that says a license was actually granted**, and even then it says so
 * on someone else's word: it is a report AOC preserved, never a fact AOC
 * verified. Nothing here asserts that the agreement is legally enforceable,
 * that any formality was satisfied, that consideration passed, or that the
 * licensee accepted anything beyond what the reporting system claims.
 *
 * The `external*` fields and every value in `contexts` are opaque,
 * provider-neutral values AOC stores and echoes and never parses, resolves,
 * validates, or acts on. Nothing here assumes a jurisdiction, a legal system,
 * a media type, a distribution platform, or an asset class.
 *
 * `executedBy` names the party that performed the external licensing act. It
 * is *checked* against the mandate's `terms.executorRef` only when the
 * mandate bound one; when the mandate binds no executor, it is recorded as an
 * observation and constrains nothing. This asymmetry with
 * `EnterpriseTokenizationExecutionEvidence.executorRef` and
 * `EnterpriseCollateralizationExecutionEvidence.executorRef` is deliberate --
 * see `EnterpriseLicenseTerms`.
 *
 * Recording execution evidence never re-authorizes anything: this contract
 * observes, it does not decide -- the same observation-only posture
 * `EnterpriseUsageEvent` takes toward `EnterpriseAccessGrant`.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/license-mandate`).
 */
export interface EnterpriseLicenseExecutionEvidence {
  readonly schemaVersion: typeof ENTERPRISE_LICENSE_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly mandateRef: CanonicalId;
  /** Who performed the external licensing act, as reported. Checked against the mandate's `executorRef` only when the mandate bound one. */
  readonly executedBy: CanonicalId;
  readonly executedAt: UtcDateTime;
  /** The party the license was granted to, as reported. Checked against the mandate's own before this evidence may be recorded. */
  readonly licenseeRef: CanonicalId;
  readonly rights: readonly EnterpriseLicensableRightType[];
  /** The uses the granted license actually permits -- never wider than the mandate's `permittedUses`, and never touching its `prohibitedUses`. */
  readonly grantedUses: readonly EnterpriseLicensedUseType[];
  readonly exclusivity: EnterpriseLicenseExclusivity;
  readonly correlationId: CanonicalId;
  /** The portion of the named rights the granted license draws on. Present only when the mandate expressed one. */
  readonly rightsScope?: EnterpriseLicenseRightsScope;
  /** The operating context the granted license is confined to, by opaque dimension. Measured against `permittedContexts`. */
  readonly contexts?: Readonly<Record<string, readonly string[]>>;
  /** When the external license itself takes effect, as reported. Deliberately distinct from the mandate's `effectiveFrom`, which bounds AOC authority. */
  readonly licenseEffectiveAt?: UtcDateTime;
  /** When the external license itself ends, as reported. Deliberately distinct from the mandate's `expiresAt`; measured against `maximumLicenseTermEndsAt`. */
  readonly licenseExpiresAt?: UtcDateTime;
  /** How large the granted license is in named units, as reported. Measured against `maximumLicensedUnits`. Not a usage measurement -- AOC meters nothing. */
  readonly licensedUnits?: EnterpriseLicensedUnits;
  /** Opaque provider label (e.g. a licensing platform or rights administrator name). Never a credential, endpoint, or client. */
  readonly externalSystem?: string;
  /** Opaque reference to the license agreement the external system produced. Not a claim that anything was signed or is enforceable. */
  readonly externalAgreementReference?: string;
  /** Opaque reference to the licensee's acceptance, as the external system records it. Not a claim that acceptance was legally effective. */
  readonly externalAcceptanceReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly CanonicalId[];
}

/**
 * How an external license ended, in the reporting system's own terms. A
 * closed vocabulary because these are the reported *categories*, not legal
 * conclusions: AOC records which word the external system used and derives
 * nothing from the choice.
 */
export const ENTERPRISE_LICENSE_LIFECYCLE_TYPES = {
  EXPIRED: 'expired',
  TERMINATED: 'terminated',
  CANCELLED: 'cancelled',
  SURRENDERED: 'surrendered',
  SUPERSEDED: 'superseded',
} as const;

export type EnterpriseLicenseLifecycleType = (typeof ENTERPRISE_LICENSE_LIFECYCLE_TYPES)[keyof typeof ENTERPRISE_LICENSE_LIFECYCLE_TYPES];

/**
 * The canonical Enterprise-owned contract for **the immutable record that an
 * external system reported a previously-granted license expired, was
 * terminated, cancelled, surrendered, or superseded**.
 *
 * This is the same lifecycle distinction `EnterpriseCollateralizationReleaseEvidence`
 * draws for collateral, and it is deliberately modelled the same way -- as
 * *evidence*, not as a governed action and not as a mandate status:
 *
 * - It is **not** `TERMINATE_LICENSE`. No governed action is introduced by
 *   this contract, no authority is evaluated, no decision is produced, and
 *   nothing is authorized. Should terminating a license ever need to be
 *   *authorized* by AOC rather than merely *observed*, that is a separate
 *   governed action with its own request, decision and mandate.
 * - It is **not** a mandate status. An external license ending is a fact
 *   about that license; presenting it as governance state would be AOC
 *   claiming to know, or to have caused, something it did not.
 * - It does **not** restore exercise headroom. Recording an end does not
 *   decrement the mandate's execution count, because AOC cannot verify the
 *   external license actually ended and must not create fresh licensing
 *   capacity on the strength of an unverified report.
 *
 * It references the execution it ends (`executionRef`) as well as the mandate
 * (`mandateRef`), so a reviewer can follow one license from authorization
 * through grant to reported end without a second audit system.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/license-mandate`).
 */
export interface EnterpriseLicenseLifecycleEvidence {
  readonly schemaVersion: typeof ENTERPRISE_LICENSE_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly mandateRef: CanonicalId;
  /** The specific external license being reported as ended. */
  readonly executionRef: CanonicalId;
  /** Who reported the end. An opaque party pointer -- typically the executor, the licensor or the licensee, but AOC neither requires nor infers which. */
  readonly reportedBy: CanonicalId;
  readonly occurredAt: UtcDateTime;
  readonly lifecycleType: EnterpriseLicenseLifecycleType;
  readonly correlationId: CanonicalId;
  readonly externalSystem?: string;
  /** Opaque reference to whatever termination/expiry instrument or record the external system produced. Not a claim that anything was legally terminated. */
  readonly externalReference?: string;
  readonly evidenceRefs?: readonly CanonicalId[];
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Whether two records represent the same observed external license: same evidence id, under the same mandate, granted to the same licensee. */
export function enterpriseLicenseExecutionEvidenceIdentityEquals(
  a: EnterpriseLicenseExecutionEvidence,
  b: EnterpriseLicenseExecutionEvidence,
): boolean {
  return a.id === b.id && a.mandateRef === b.mandateRef && a.licenseeRef === b.licenseeRef;
}

export function enterpriseLicenseExecutionEvidenceEquals(
  a: EnterpriseLicenseExecutionEvidence,
  b: EnterpriseLicenseExecutionEvidence,
): boolean {
  return (
    enterpriseLicenseExecutionEvidenceIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.executedBy === b.executedBy &&
    a.executedAt === b.executedAt &&
    licenseStringArrayEquals(a.rights, b.rights) &&
    licenseStringArrayEquals(a.grantedUses, b.grantedUses) &&
    a.exclusivity === b.exclusivity &&
    a.correlationId === b.correlationId &&
    enterpriseLicenseRightsScopeEquals(a.rightsScope, b.rightsScope) &&
    enterpriseLicenseContextsEquals(a.contexts, b.contexts) &&
    a.licenseEffectiveAt === b.licenseEffectiveAt &&
    a.licenseExpiresAt === b.licenseExpiresAt &&
    enterpriseLicensedUnitsEquals(a.licensedUnits, b.licensedUnits) &&
    a.externalSystem === b.externalSystem &&
    a.externalAgreementReference === b.externalAgreementReference &&
    a.externalAcceptanceReference === b.externalAcceptanceReference &&
    a.externalTransactionReference === b.externalTransactionReference &&
    licenseOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

export function enterpriseLicenseLifecycleEvidenceEquals(
  a: EnterpriseLicenseLifecycleEvidence,
  b: EnterpriseLicenseLifecycleEvidence,
): boolean {
  return (
    a.id === b.id &&
    a.mandateRef === b.mandateRef &&
    a.executionRef === b.executionRef &&
    a.schemaVersion === b.schemaVersion &&
    a.reportedBy === b.reportedBy &&
    a.occurredAt === b.occurredAt &&
    a.lifecycleType === b.lifecycleType &&
    a.correlationId === b.correlationId &&
    a.externalSystem === b.externalSystem &&
    a.externalReference === b.externalReference &&
    licenseOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseLicenseExecutionValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_MANDATE_REF'
  | 'MISSING_EXECUTED_BY'
  | 'MISSING_EXECUTED_AT'
  | 'INVALID_EXECUTED_AT'
  | 'MISSING_LICENSEE_REF'
  | 'MISSING_RIGHTS'
  | 'INVALID_RIGHTS'
  | 'EMPTY_RIGHTS'
  | 'DUPLICATE_RIGHTS'
  | 'MISSING_GRANTED_USES'
  | 'INVALID_GRANTED_USES'
  | 'EMPTY_GRANTED_USES'
  | 'DUPLICATE_GRANTED_USES'
  | 'MISSING_EXCLUSIVITY'
  | 'INVALID_EXCLUSIVITY'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_CONTEXTS'
  | 'INVALID_LICENSE_EFFECTIVE_AT'
  | 'INVALID_LICENSE_EXPIRES_AT'
  | 'LICENSE_EXPIRY_NOT_AFTER_EFFECTIVE'
  | 'INVALID_LICENSED_UNITS'
  | 'INVALID_EXTERNAL_REFERENCE'
  | 'INVALID_EVIDENCE_REFS'
  | EnterpriseLicenseTermsValidationCode;

export interface EnterpriseLicenseExecutionValidationIssue {
  readonly code: EnterpriseLicenseExecutionValidationCode;
  readonly message: string;
}

export type EnterpriseLicenseExecutionValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseLicenseExecutionValidationIssue[] };

const EXTERNAL_STRING_FIELDS = ['externalSystem', 'externalAgreementReference', 'externalAcceptanceReference', 'externalTransactionReference'] as const;

/** Validates internal consistency of a candidate execution evidence record. Never dereferences `mandateRef`, and never checks the external references against any real system. */
export function validateEnterpriseLicenseExecutionEvidence(candidate: unknown): EnterpriseLicenseExecutionValidationResult {
  if (!isLicensePlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'License execution evidence must be an object.' }] };
  }

  const errors: EnterpriseLicenseExecutionValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_LICENSE_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_LICENSE_SCHEMA_VERSION}'.` });
  }

  if (!isLicenseNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }
  if (!isLicenseNonEmptyString(candidate.mandateRef)) {
    errors.push({ code: 'MISSING_MANDATE_REF', message: 'mandateRef is required and must be a non-empty string.' });
  }
  if (!isLicenseNonEmptyString(candidate.executedBy)) {
    errors.push({
      code: 'MISSING_EXECUTED_BY',
      message: 'executedBy is required and must be a non-empty string; evidence must record who performed the external licensing act, whether or not the mandate bound an executor.',
    });
  }
  if (!isLicenseNonEmptyString(candidate.licenseeRef)) {
    errors.push({
      code: 'MISSING_LICENSEE_REF',
      message: 'licenseeRef is required and must be a non-empty string; evidence must record which party received the permission.',
    });
  }

  if (candidate.executedAt === undefined) {
    errors.push({ code: 'MISSING_EXECUTED_AT', message: 'executedAt is required.' });
  } else if (!isLicenseTimestamp(candidate.executedAt)) {
    errors.push({ code: 'INVALID_EXECUTED_AT', message: 'executedAt must be an ISO 8601 timestamp string.' });
  }

  if (candidate.rights === undefined) {
    errors.push({ code: 'MISSING_RIGHTS', message: 'rights is required.' });
  } else if (!Array.isArray(candidate.rights) || !candidate.rights.every((right) => isEnterpriseLicensableRightType(right))) {
    errors.push({ code: 'INVALID_RIGHTS', message: 'rights must be an array of canonical licensable right categories.' });
  } else if (candidate.rights.length === 0) {
    errors.push({ code: 'EMPTY_RIGHTS', message: 'rights must name at least one right.' });
  } else if (new Set(candidate.rights).size !== candidate.rights.length) {
    errors.push({ code: 'DUPLICATE_RIGHTS', message: 'rights must not repeat a right category.' });
  }

  if (candidate.grantedUses === undefined) {
    errors.push({ code: 'MISSING_GRANTED_USES', message: 'grantedUses is required.' });
  } else if (!Array.isArray(candidate.grantedUses) || !candidate.grantedUses.every((use) => isEnterpriseLicensedUseType(use))) {
    errors.push({ code: 'INVALID_GRANTED_USES', message: 'grantedUses must be an array of canonical governed use categories.' });
  } else if (candidate.grantedUses.length === 0) {
    errors.push({ code: 'EMPTY_GRANTED_USES', message: 'grantedUses must name at least one use; a license granting nothing is not evidence of an exercise.' });
  } else if (new Set(candidate.grantedUses).size !== candidate.grantedUses.length) {
    errors.push({ code: 'DUPLICATE_GRANTED_USES', message: 'grantedUses must not repeat a use.' });
  }

  if (candidate.exclusivity === undefined) {
    errors.push({ code: 'MISSING_EXCLUSIVITY', message: 'exclusivity is required; evidence must record how exclusively the license was granted.' });
  } else if (!isEnterpriseLicenseExclusivity(candidate.exclusivity)) {
    errors.push({ code: 'INVALID_EXCLUSIVITY', message: "exclusivity must be one of: non-exclusive, sole, exclusive." });
  }

  if (!isLicenseNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.rightsScope !== undefined) {
    errors.push(...collectEnterpriseLicenseRightsScopeIssues(candidate.rightsScope, 'rightsScope'));
  }

  if (candidate.contexts !== undefined) {
    errors.push(...collectEnterpriseLicenseContextIssues(candidate.contexts, 'contexts', 'INVALID_CONTEXTS'));
  }

  let effectiveMs: number | undefined;
  if (candidate.licenseEffectiveAt !== undefined) {
    if (!isLicenseTimestamp(candidate.licenseEffectiveAt)) {
      errors.push({ code: 'INVALID_LICENSE_EFFECTIVE_AT', message: 'licenseEffectiveAt must be an ISO 8601 timestamp string when present.' });
    } else {
      effectiveMs = Date.parse(candidate.licenseEffectiveAt);
    }
  }
  let expiresMs: number | undefined;
  if (candidate.licenseExpiresAt !== undefined) {
    if (!isLicenseTimestamp(candidate.licenseExpiresAt)) {
      errors.push({ code: 'INVALID_LICENSE_EXPIRES_AT', message: 'licenseExpiresAt must be an ISO 8601 timestamp string when present.' });
    } else {
      expiresMs = Date.parse(candidate.licenseExpiresAt);
    }
  }
  if (effectiveMs !== undefined && expiresMs !== undefined && expiresMs <= effectiveMs) {
    errors.push({
      code: 'LICENSE_EXPIRY_NOT_AFTER_EFFECTIVE',
      message: 'licenseExpiresAt must be strictly after licenseEffectiveAt; a license that ends before it begins is not a report AOC can preserve as meaningful.',
    });
  }

  if (candidate.licensedUnits !== undefined && !isEnterpriseLicensedUnits(candidate.licensedUnits)) {
    errors.push({
      code: 'INVALID_LICENSED_UNITS',
      message: 'licensedUnits must be { units: a positive integer, unitDenomination: a non-empty opaque label } when present.',
    });
  }

  for (const field of EXTERNAL_STRING_FIELDS) {
    const value = candidate[field];
    if (value !== undefined && !isLicenseNonEmptyString(value)) {
      errors.push({ code: 'INVALID_EXTERNAL_REFERENCE', message: `${field} must be a non-empty string when present.` });
    }
  }

  if (candidate.evidenceRefs !== undefined && !isLicenseCanonicalIdArray(candidate.evidenceRefs)) {
    errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export type EnterpriseLicenseLifecycleValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_MANDATE_REF'
  | 'MISSING_EXECUTION_REF'
  | 'MISSING_REPORTED_BY'
  | 'MISSING_OCCURRED_AT'
  | 'INVALID_OCCURRED_AT'
  | 'MISSING_LIFECYCLE_TYPE'
  | 'INVALID_LIFECYCLE_TYPE'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_EXTERNAL_REFERENCE'
  | 'INVALID_EVIDENCE_REFS';

export interface EnterpriseLicenseLifecycleValidationIssue {
  readonly code: EnterpriseLicenseLifecycleValidationCode;
  readonly message: string;
}

export type EnterpriseLicenseLifecycleValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseLicenseLifecycleValidationIssue[] };

const LIFECYCLE_TYPES: readonly EnterpriseLicenseLifecycleType[] = Object.values(ENTERPRISE_LICENSE_LIFECYCLE_TYPES);

export function isEnterpriseLicenseLifecycleType(value: unknown): value is EnterpriseLicenseLifecycleType {
  return typeof value === 'string' && LIFECYCLE_TYPES.includes(value as EnterpriseLicenseLifecycleType);
}

const LIFECYCLE_EXTERNAL_STRING_FIELDS = ['externalSystem', 'externalReference'] as const;

/** Validates internal consistency of a candidate lifecycle evidence record. Never dereferences `mandateRef`/`executionRef`, and never verifies the reported end against any external system. */
export function validateEnterpriseLicenseLifecycleEvidence(candidate: unknown): EnterpriseLicenseLifecycleValidationResult {
  if (!isLicensePlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'License lifecycle evidence must be an object.' }] };
  }

  const errors: EnterpriseLicenseLifecycleValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_LICENSE_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_LICENSE_SCHEMA_VERSION}'.` });
  }

  if (!isLicenseNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }
  if (!isLicenseNonEmptyString(candidate.mandateRef)) {
    errors.push({ code: 'MISSING_MANDATE_REF', message: 'mandateRef is required and must be a non-empty string.' });
  }
  if (!isLicenseNonEmptyString(candidate.executionRef)) {
    errors.push({
      code: 'MISSING_EXECUTION_REF',
      message: 'executionRef is required and must be a non-empty string; a lifecycle report ends one specific granted license, never a mandate in the abstract.',
    });
  }
  if (!isLicenseNonEmptyString(candidate.reportedBy)) {
    errors.push({ code: 'MISSING_REPORTED_BY', message: 'reportedBy is required and must be a non-empty string.' });
  }

  if (candidate.occurredAt === undefined) {
    errors.push({ code: 'MISSING_OCCURRED_AT', message: 'occurredAt is required.' });
  } else if (!isLicenseTimestamp(candidate.occurredAt)) {
    errors.push({ code: 'INVALID_OCCURRED_AT', message: 'occurredAt must be an ISO 8601 timestamp string.' });
  }

  if (candidate.lifecycleType === undefined) {
    errors.push({ code: 'MISSING_LIFECYCLE_TYPE', message: 'lifecycleType is required.' });
  } else if (!isEnterpriseLicenseLifecycleType(candidate.lifecycleType)) {
    errors.push({ code: 'INVALID_LIFECYCLE_TYPE', message: `lifecycleType must be one of: ${LIFECYCLE_TYPES.join(', ')}.` });
  }

  if (!isLicenseNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  for (const field of LIFECYCLE_EXTERNAL_STRING_FIELDS) {
    const value = candidate[field];
    if (value !== undefined && !isLicenseNonEmptyString(value)) {
      errors.push({ code: 'INVALID_EXTERNAL_REFERENCE', message: `${field} must be a non-empty string when present.` });
    }
  }

  if (candidate.evidenceRefs !== undefined && !isLicenseCanonicalIdArray(candidate.evidenceRefs)) {
    errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseLicenseExecutionEvidence {
  readonly schemaVersion: string;
  readonly id: string;
  readonly mandateRef: string;
  readonly executedBy: string;
  readonly executedAt: string;
  readonly licenseeRef: string;
  readonly rights: readonly string[];
  readonly grantedUses: readonly string[];
  readonly exclusivity: string;
  readonly correlationId: string;
  readonly rightsScope?: EnterpriseLicenseRightsScope;
  readonly contexts?: Readonly<Record<string, readonly string[]>>;
  readonly licenseEffectiveAt?: string;
  readonly licenseExpiresAt?: string;
  readonly licensedUnits?: EnterpriseLicensedUnits;
  readonly externalSystem?: string;
  readonly externalAgreementReference?: string;
  readonly externalAcceptanceReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
}

/** Projects execution evidence to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseLicenseExecutionEvidence(
  evidence: EnterpriseLicenseExecutionEvidence,
): SerializedEnterpriseLicenseExecutionEvidence {
  return {
    schemaVersion: evidence.schemaVersion,
    id: evidence.id,
    mandateRef: evidence.mandateRef,
    executedBy: evidence.executedBy,
    executedAt: evidence.executedAt,
    licenseeRef: evidence.licenseeRef,
    rights: [...evidence.rights].sort(),
    grantedUses: [...evidence.grantedUses].sort(),
    exclusivity: evidence.exclusivity,
    correlationId: evidence.correlationId,
    ...(evidence.rightsScope === undefined ? {} : { rightsScope: serializeEnterpriseLicenseRightsScope(evidence.rightsScope) }),
    ...(evidence.contexts === undefined ? {} : { contexts: serializeEnterpriseLicenseContexts(evidence.contexts) }),
    ...(evidence.licenseEffectiveAt === undefined ? {} : { licenseEffectiveAt: evidence.licenseEffectiveAt }),
    ...(evidence.licenseExpiresAt === undefined ? {} : { licenseExpiresAt: evidence.licenseExpiresAt }),
    ...(evidence.licensedUnits === undefined
      ? {}
      : { licensedUnits: { units: evidence.licensedUnits.units, unitDenomination: evidence.licensedUnits.unitDenomination } }),
    ...(evidence.externalSystem === undefined ? {} : { externalSystem: evidence.externalSystem }),
    ...(evidence.externalAgreementReference === undefined ? {} : { externalAgreementReference: evidence.externalAgreementReference }),
    ...(evidence.externalAcceptanceReference === undefined ? {} : { externalAcceptanceReference: evidence.externalAcceptanceReference }),
    ...(evidence.externalTransactionReference === undefined ? {} : { externalTransactionReference: evidence.externalTransactionReference }),
    ...(evidence.evidenceRefs === undefined ? {} : { evidenceRefs: [...evidence.evidenceRefs].sort() }),
  };
}

export interface SerializedEnterpriseLicenseLifecycleEvidence {
  readonly schemaVersion: string;
  readonly id: string;
  readonly mandateRef: string;
  readonly executionRef: string;
  readonly reportedBy: string;
  readonly occurredAt: string;
  readonly lifecycleType: string;
  readonly correlationId: string;
  readonly externalSystem?: string;
  readonly externalReference?: string;
  readonly evidenceRefs?: readonly string[];
}

/** Projects lifecycle evidence to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseLicenseLifecycleEvidence(
  evidence: EnterpriseLicenseLifecycleEvidence,
): SerializedEnterpriseLicenseLifecycleEvidence {
  return {
    schemaVersion: evidence.schemaVersion,
    id: evidence.id,
    mandateRef: evidence.mandateRef,
    executionRef: evidence.executionRef,
    reportedBy: evidence.reportedBy,
    occurredAt: evidence.occurredAt,
    lifecycleType: evidence.lifecycleType,
    correlationId: evidence.correlationId,
    ...(evidence.externalSystem === undefined ? {} : { externalSystem: evidence.externalSystem }),
    ...(evidence.externalReference === undefined ? {} : { externalReference: evidence.externalReference }),
    ...(evidence.evidenceRefs === undefined ? {} : { evidenceRefs: [...evidence.evidenceRefs].sort() }),
  };
}

/** Thrown by `deserializeEnterpriseLicenseExecutionEvidence` when the input fails validation. */
export class EnterpriseLicenseExecutionValidationError extends Error {
  readonly issues: readonly EnterpriseLicenseExecutionValidationIssue[];

  constructor(issues: readonly EnterpriseLicenseExecutionValidationIssue[]) {
    super(`Invalid EnterpriseLicenseExecutionEvidence: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseLicenseExecutionValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseLicenseExecutionEvidence`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseLicenseExecutionEvidence(candidate: unknown): EnterpriseLicenseExecutionEvidence {
  const result = validateEnterpriseLicenseExecutionEvidence(candidate);
  if (!result.valid) throw new EnterpriseLicenseExecutionValidationError(result.errors);

  const value = candidate as SerializedEnterpriseLicenseExecutionEvidence;
  return {
    schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
    id: value.id,
    mandateRef: value.mandateRef,
    executedBy: value.executedBy,
    executedAt: value.executedAt,
    licenseeRef: value.licenseeRef,
    rights: value.rights.map((right) => right as EnterpriseLicensableRightType),
    grantedUses: value.grantedUses.map((use) => use as EnterpriseLicensedUseType),
    exclusivity: value.exclusivity as EnterpriseLicenseExclusivity,
    correlationId: value.correlationId,
    ...(value.rightsScope === undefined ? {} : { rightsScope: serializeEnterpriseLicenseRightsScope(value.rightsScope) }),
    ...(value.contexts === undefined ? {} : { contexts: readEnterpriseLicenseContexts(value.contexts) }),
    ...(value.licenseEffectiveAt === undefined ? {} : { licenseEffectiveAt: value.licenseEffectiveAt }),
    ...(value.licenseExpiresAt === undefined ? {} : { licenseExpiresAt: value.licenseExpiresAt }),
    ...(value.licensedUnits === undefined
      ? {}
      : { licensedUnits: { units: value.licensedUnits.units, unitDenomination: value.licensedUnits.unitDenomination } }),
    ...(value.externalSystem === undefined ? {} : { externalSystem: value.externalSystem }),
    ...(value.externalAgreementReference === undefined ? {} : { externalAgreementReference: value.externalAgreementReference }),
    ...(value.externalAcceptanceReference === undefined ? {} : { externalAcceptanceReference: value.externalAcceptanceReference }),
    ...(value.externalTransactionReference === undefined ? {} : { externalTransactionReference: value.externalTransactionReference }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}

/** Thrown by `deserializeEnterpriseLicenseLifecycleEvidence` when the input fails validation. */
export class EnterpriseLicenseLifecycleValidationError extends Error {
  readonly issues: readonly EnterpriseLicenseLifecycleValidationIssue[];

  constructor(issues: readonly EnterpriseLicenseLifecycleValidationIssue[]) {
    super(`Invalid EnterpriseLicenseLifecycleEvidence: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseLicenseLifecycleValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseLicenseLifecycleEvidence`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseLicenseLifecycleEvidence(candidate: unknown): EnterpriseLicenseLifecycleEvidence {
  const result = validateEnterpriseLicenseLifecycleEvidence(candidate);
  if (!result.valid) throw new EnterpriseLicenseLifecycleValidationError(result.errors);

  const value = candidate as SerializedEnterpriseLicenseLifecycleEvidence;
  return {
    schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
    id: value.id,
    mandateRef: value.mandateRef,
    executionRef: value.executionRef,
    reportedBy: value.reportedBy,
    occurredAt: value.occurredAt,
    lifecycleType: value.lifecycleType as EnterpriseLicenseLifecycleType,
    correlationId: value.correlationId,
    ...(value.externalSystem === undefined ? {} : { externalSystem: value.externalSystem }),
    ...(value.externalReference === undefined ? {} : { externalReference: value.externalReference }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}
