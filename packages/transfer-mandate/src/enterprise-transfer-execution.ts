import type { CanonicalId, UtcDateTime } from '@aoc/protocol';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { GovernedExecutionEvidenceCore, GovernedLifecycleEvidenceCore } from '@aoc-enterprise/governed-authorization';

import {
  ENTERPRISE_TRANSFER_SCHEMA_VERSION,
  collectEnterpriseTransferScopeIssues,
  enterpriseTransferScopeEquals,
  isEnterpriseTransferableRightType,
  isTransferCanonicalIdArray,
  isTransferNonEmptyString,
  isTransferPlainObject,
  isTransferTimestamp,
  serializeEnterpriseTransferScope,
  transferOptionalStringArrayEquals,
  transferStringArrayEquals,
} from './enterprise-transfer-terms.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { EnterpriseTransferScope, EnterpriseTransferTermsValidationCode, EnterpriseTransferableRightType } from './enterprise-transfer-terms.js';

/**
 * The canonical Enterprise-owned contract for **the immutable record of one
 * external movement of rights actually effected under a previously-issued
 * `EnterpriseTransferMandate`**.
 *
 * This is the integration boundary, and it is the whole of it. Soberanía Enterprise
 * does not move rights, operate or update a registry, act as a transfer agent
 * or custodian, pass title, draft or sign agreements, price a transfer, hold
 * or release consideration, escrow anything, settle, or compute tax, and it
 * ships no provider adapter for transfer. An external system -- a registry, a
 * custodian, a transfer agent, a counterparty's own process -- effects the
 * movement and reports back what it did; this record is the shape of that
 * report, correlated to the mandate by `mandateRef` and therefore,
 * transitively, to the decision, approvals, obligations, authority and asset
 * that authorized it.
 *
 * **A mandate proves Soberanía authorized the movement. This record is the only
 * thing that says a movement actually happened**, and even then it says so on
 * someone else's word: it is a report Soberanía preserved, never a fact Soberanía
 * verified. Nothing here asserts that title passed, that any registry reflects
 * the movement, that consideration was paid, that any formality was satisfied,
 * or that the recipient can exercise anything.
 *
 * In particular -- and this is the single most important boundary this action
 * has -- **recording this evidence does not move authority inside Soberanía.** The
 * recipient named here gains no standing, no capability token, no authority
 * grant, and no ability to submit governed requests over the transferred
 * right. See `docs/architecture/ADR-TRANSFER-ACTION.md`, "Post-transfer
 * authority".
 *
 * The `external*` fields and `registry` are opaque, provider-neutral values
 * Soberanía stores and echoes and never parses, resolves, validates, or acts on.
 * `externalConsiderationReference` is a reference and never an amount: there
 * is no monetary quantity anywhere in this package, deliberately.
 *
 * `executedBy` names the party that effected the external movement. It is
 * *checked* against the mandate's `terms.executorRef` only when the mandate
 * bound one; when the mandate binds no executor, it is recorded as an
 * observation and constrains nothing -- the same asymmetry
 * `EnterpriseLicenseExecutionEvidence` establishes, and for the sharper reason
 * recorded on `EnterpriseTransferTerms`.
 *
 * Recording execution evidence never re-authorizes anything: this contract
 * observes, it does not decide -- the same observation-only posture
 * `EnterpriseUsageEvent` takes toward `EnterpriseAccessGrant`.
 *
 * Ownership: Soberanía Enterprise (`@aoc-enterprise/transfer-mandate`).
 */
export interface EnterpriseTransferExecutionEvidence extends GovernedExecutionEvidenceCore {
  /** Re-declared as this action's own literal so a serialized record names its schema on its face. */
  readonly schemaVersion: typeof ENTERPRISE_TRANSFER_SCHEMA_VERSION;
  /**
   * Who effected the external movement, as reported. Checked against the
   * mandate's `executorRef` only when the mandate bound one.
   *
   * Declared here rather than inherited, and that is the four-enforcement
   * finding rather than an oversight: `TOKENIZE` and `COLLATERALIZE` carry a
   * required, always-checked `executorRef`, while `LICENSE` and `TRANSFER`
   * carry an `executedBy` that is an observation unless a binding exists. One
   * inherited field would have had to mean "checked" and "merely recorded" at
   * once. See `GovernedExecutionEvidenceCore`.
   */
  readonly executedBy: CanonicalId;
  /** The party the rights moved from, as reported. Checked against the mandate's own before this evidence may be recorded. */
  readonly transferorRef: CanonicalId;
  /** The party the rights moved to, as reported. Checked against the mandate's own; never substitutable. */
  readonly transfereeRef: CanonicalId;
  readonly rights: readonly EnterpriseTransferableRightType[];
  /** How much of the named rights this movement carried. Summed across executions and held inside the mandate's authorized scope. */
  readonly transferredScope: EnterpriseTransferScope;
  readonly correlationId: CanonicalId;
  /** When the external movement itself takes effect, as reported. Deliberately distinct from the mandate's `effectiveFrom`, which bounds Soberanía authority. */
  readonly transferEffectiveAt?: UtcDateTime;
  /** Opaque registry label the movement was effected through. Measured against `permittedRegistries`. Never resolved or contacted. */
  readonly registry?: string;
  /** Opaque provider label (e.g. a custodian or transfer agent name). Never a credential, endpoint, or client. */
  readonly externalSystem?: string;
  /** Opaque reference to the transfer agreement the external system produced. Not a claim that anything was signed or is enforceable. */
  readonly externalAgreementReference?: string;
  /** Opaque reference to the recipient's acceptance, as the external system records it. Not a claim that acceptance was legally effective. */
  readonly externalAcceptanceReference?: string;
  /** Opaque reference to whatever evidences consideration. **Never an amount** -- Soberanía computes, holds and settles nothing. */
  readonly externalConsiderationReference?: string;
  /** Opaque reference to the registry entry, book-entry movement, or filing the external system produced. */
  readonly externalRegistrationReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly CanonicalId[];
}

/**
 * What an external system reported subsequently happened to a movement it had
 * already reported. A closed vocabulary because these are the reported
 * *categories*, not legal conclusions: Soberanía records which word the external
 * system used and derives nothing from the choice.
 *
 * - `registered` -- the movement was recorded in a registry or book of record.
 * - `rejected` -- the movement was refused after being reported.
 * - `reversed` -- the movement was undone.
 * - `corrected` -- the movement was amended.
 * - `superseded` -- the movement was replaced by a later arrangement.
 *
 * Note that `'completed'` and `'settled'` are deliberately absent. The
 * execution evidence *is* the report that the movement happened; a second
 * "it really happened" category would invite a caller to treat the first
 * record as provisional, which it is not -- Soberanía's position after
 * `EnterpriseTransferExecutionEvidence` is already "an external system says
 * this movement occurred", and no further word from that system makes Soberanía's
 * knowledge any less second-hand.
 */
export const ENTERPRISE_TRANSFER_LIFECYCLE_TYPES = {
  REGISTERED: 'registered',
  REJECTED: 'rejected',
  REVERSED: 'reversed',
  CORRECTED: 'corrected',
  SUPERSEDED: 'superseded',
} as const;

export type EnterpriseTransferLifecycleType = (typeof ENTERPRISE_TRANSFER_LIFECYCLE_TYPES)[keyof typeof ENTERPRISE_TRANSFER_LIFECYCLE_TYPES];

/**
 * The canonical Enterprise-owned contract for **the immutable record that an
 * external system reported a previously-effected movement was registered,
 * rejected, reversed, corrected, or superseded**.
 *
 * This is the same lifecycle distinction `EnterpriseCollateralizationReleaseEvidence`
 * draws for collateral and `EnterpriseLicenseLifecycleEvidence` draws for
 * licences, and it is deliberately modelled the same way -- as *evidence*, not
 * as a governed action and not as a mandate status:
 *
 * - It is **not** `REVERSE_TRANSFER`, `RESCIND_TRANSFER` or `RETURN`. No
 *   governed action is introduced by this contract, no authority is evaluated,
 *   no decision is produced, and nothing is authorized. Should reversing a
 *   transfer ever need to be *authorized* by Soberanía rather than merely
 *   *observed*, that is a separate governed action with its own request,
 *   decision and mandate -- and, because a reversal moves rights back, it
 *   would be a transfer in its own right rather than an undo button on this
 *   one.
 * - It is **not** a mandate status. An external movement being reversed is a
 *   fact about that movement; presenting it as governance state would be Soberanía
 *   claiming to know, or to have caused, something it did not.
 * - It does **not** restore transfer headroom. Recording a reversal does not
 *   decrement the mandate's `transferredScope` or `executionCount`, because
 *   Soberanía cannot verify the reversal actually occurred and must not create fresh
 *   transfer capacity on the strength of an unverified report. This is the
 *   strictest instance of a rule the collateral and licence actions already
 *   observe, and the one where the temptation to break it is greatest.
 *
 * It references the execution it concerns (`executionRef`) as well as the
 * mandate (`mandateRef`), so a reviewer can follow one movement from
 * authorization through execution to reported outcome without a second audit
 * system.
 *
 * Ownership: Soberanía Enterprise (`@aoc-enterprise/transfer-mandate`).
 */
export interface EnterpriseTransferLifecycleEvidence extends GovernedLifecycleEvidenceCore {
  /** Re-declared as this action's own literal so a serialized record names its schema on its face. */
  readonly schemaVersion: typeof ENTERPRISE_TRANSFER_SCHEMA_VERSION;
  readonly occurredAt: UtcDateTime;
  readonly lifecycleType: EnterpriseTransferLifecycleType;
  readonly correlationId: CanonicalId;
  readonly externalSystem?: string;
  /** Opaque reference to whatever registration, rejection, reversal or correction record the external system produced. Not a claim that anything legally occurred. */
  readonly externalReference?: string;
  readonly evidenceRefs?: readonly CanonicalId[];
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Whether two records represent the same observed movement: same evidence id, under the same mandate, between the same two parties. */
export function enterpriseTransferExecutionEvidenceIdentityEquals(
  a: EnterpriseTransferExecutionEvidence,
  b: EnterpriseTransferExecutionEvidence,
): boolean {
  return a.id === b.id && a.mandateRef === b.mandateRef && a.transferorRef === b.transferorRef && a.transfereeRef === b.transfereeRef;
}

export function enterpriseTransferExecutionEvidenceEquals(
  a: EnterpriseTransferExecutionEvidence,
  b: EnterpriseTransferExecutionEvidence,
): boolean {
  return (
    enterpriseTransferExecutionEvidenceIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.executedBy === b.executedBy &&
    a.executedAt === b.executedAt &&
    transferStringArrayEquals(a.rights, b.rights) &&
    enterpriseTransferScopeEquals(a.transferredScope, b.transferredScope) &&
    a.correlationId === b.correlationId &&
    a.transferEffectiveAt === b.transferEffectiveAt &&
    a.registry === b.registry &&
    a.externalSystem === b.externalSystem &&
    a.externalAgreementReference === b.externalAgreementReference &&
    a.externalAcceptanceReference === b.externalAcceptanceReference &&
    a.externalConsiderationReference === b.externalConsiderationReference &&
    a.externalRegistrationReference === b.externalRegistrationReference &&
    a.externalTransactionReference === b.externalTransactionReference &&
    transferOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

export function enterpriseTransferLifecycleEvidenceEquals(
  a: EnterpriseTransferLifecycleEvidence,
  b: EnterpriseTransferLifecycleEvidence,
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
    transferOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseTransferExecutionValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_MANDATE_REF'
  | 'MISSING_EXECUTED_BY'
  | 'MISSING_EXECUTED_AT'
  | 'INVALID_EXECUTED_AT'
  | 'MISSING_TRANSFEROR_REF'
  | 'MISSING_TRANSFEREE_REF'
  | 'TRANSFEROR_IS_TRANSFEREE'
  | 'MISSING_RIGHTS'
  | 'INVALID_RIGHTS'
  | 'EMPTY_RIGHTS'
  | 'DUPLICATE_RIGHTS'
  | 'MISSING_TRANSFERRED_SCOPE'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_TRANSFER_EFFECTIVE_AT'
  | 'INVALID_EXTERNAL_REFERENCE'
  | 'INVALID_EVIDENCE_REFS'
  | EnterpriseTransferTermsValidationCode;

export interface EnterpriseTransferExecutionValidationIssue {
  readonly code: EnterpriseTransferExecutionValidationCode;
  readonly message: string;
}

export type EnterpriseTransferExecutionValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseTransferExecutionValidationIssue[] };

const EXTERNAL_STRING_FIELDS = [
  'registry',
  'externalSystem',
  'externalAgreementReference',
  'externalAcceptanceReference',
  'externalConsiderationReference',
  'externalRegistrationReference',
  'externalTransactionReference',
] as const;

/** Validates internal consistency of a candidate execution evidence record. Never dereferences `mandateRef`, and never checks the external references against any real system. */
export function validateEnterpriseTransferExecutionEvidence(candidate: unknown): EnterpriseTransferExecutionValidationResult {
  if (!isTransferPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Transfer execution evidence must be an object.' }] };
  }

  const errors: EnterpriseTransferExecutionValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_TRANSFER_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_TRANSFER_SCHEMA_VERSION}'.` });
  }

  if (!isTransferNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }
  if (!isTransferNonEmptyString(candidate.mandateRef)) {
    errors.push({ code: 'MISSING_MANDATE_REF', message: 'mandateRef is required and must be a non-empty string.' });
  }
  if (!isTransferNonEmptyString(candidate.executedBy)) {
    errors.push({
      code: 'MISSING_EXECUTED_BY',
      message: 'executedBy is required and must be a non-empty string; evidence must record who effected the external movement, whether or not the mandate bound an executor.',
    });
  }
  if (!isTransferNonEmptyString(candidate.transferorRef)) {
    errors.push({
      code: 'MISSING_TRANSFEROR_REF',
      message: 'transferorRef is required and must be a non-empty string; evidence must record which party the rights moved from.',
    });
  }
  if (!isTransferNonEmptyString(candidate.transfereeRef)) {
    errors.push({
      code: 'MISSING_TRANSFEREE_REF',
      message: 'transfereeRef is required and must be a non-empty string; evidence must record which party the rights moved to.',
    });
  }
  if (
    isTransferNonEmptyString(candidate.transferorRef) &&
    isTransferNonEmptyString(candidate.transfereeRef) &&
    candidate.transferorRef === candidate.transfereeRef
  ) {
    errors.push({
      code: 'TRANSFEROR_IS_TRANSFEREE',
      message: 'transferorRef and transfereeRef must name different parties; a movement reported between one party and itself is not evidence of a transfer.',
    });
  }

  if (candidate.executedAt === undefined) {
    errors.push({ code: 'MISSING_EXECUTED_AT', message: 'executedAt is required.' });
  } else if (!isTransferTimestamp(candidate.executedAt)) {
    errors.push({ code: 'INVALID_EXECUTED_AT', message: 'executedAt must be an ISO 8601 timestamp string.' });
  }

  if (candidate.rights === undefined) {
    errors.push({ code: 'MISSING_RIGHTS', message: 'rights is required.' });
  } else if (!Array.isArray(candidate.rights) || !candidate.rights.every((right) => isEnterpriseTransferableRightType(right))) {
    errors.push({ code: 'INVALID_RIGHTS', message: 'rights must be an array of canonical transferable right categories.' });
  } else if (candidate.rights.length === 0) {
    errors.push({ code: 'EMPTY_RIGHTS', message: 'rights must name at least one right.' });
  } else if (new Set(candidate.rights).size !== candidate.rights.length) {
    errors.push({ code: 'DUPLICATE_RIGHTS', message: 'rights must not repeat a right category.' });
  }

  if (candidate.transferredScope === undefined) {
    errors.push({
      code: 'MISSING_TRANSFERRED_SCOPE',
      message: 'transferredScope is required; evidence of a movement that does not say how much moved cannot be measured against the authorization, and cannot be summed.',
    });
  } else {
    errors.push(...collectEnterpriseTransferScopeIssues(candidate.transferredScope, 'transferredScope'));
  }

  if (!isTransferNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.transferEffectiveAt !== undefined && !isTransferTimestamp(candidate.transferEffectiveAt)) {
    errors.push({ code: 'INVALID_TRANSFER_EFFECTIVE_AT', message: 'transferEffectiveAt must be an ISO 8601 timestamp string when present.' });
  }

  for (const field of EXTERNAL_STRING_FIELDS) {
    const value = candidate[field];
    if (value !== undefined && !isTransferNonEmptyString(value)) {
      errors.push({ code: 'INVALID_EXTERNAL_REFERENCE', message: `${field} must be a non-empty string when present.` });
    }
  }

  if (candidate.evidenceRefs !== undefined && !isTransferCanonicalIdArray(candidate.evidenceRefs)) {
    errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export type EnterpriseTransferLifecycleValidationCode =
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

export interface EnterpriseTransferLifecycleValidationIssue {
  readonly code: EnterpriseTransferLifecycleValidationCode;
  readonly message: string;
}

export type EnterpriseTransferLifecycleValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseTransferLifecycleValidationIssue[] };

const LIFECYCLE_TYPES: readonly EnterpriseTransferLifecycleType[] = Object.values(ENTERPRISE_TRANSFER_LIFECYCLE_TYPES);

export function isEnterpriseTransferLifecycleType(value: unknown): value is EnterpriseTransferLifecycleType {
  return typeof value === 'string' && LIFECYCLE_TYPES.includes(value as EnterpriseTransferLifecycleType);
}

const LIFECYCLE_EXTERNAL_STRING_FIELDS = ['externalSystem', 'externalReference'] as const;

/** Validates internal consistency of a candidate lifecycle evidence record. Never dereferences `mandateRef`/`executionRef`, and never verifies the reported outcome against any external system. */
export function validateEnterpriseTransferLifecycleEvidence(candidate: unknown): EnterpriseTransferLifecycleValidationResult {
  if (!isTransferPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Transfer lifecycle evidence must be an object.' }] };
  }

  const errors: EnterpriseTransferLifecycleValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_TRANSFER_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_TRANSFER_SCHEMA_VERSION}'.` });
  }

  if (!isTransferNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }
  if (!isTransferNonEmptyString(candidate.mandateRef)) {
    errors.push({ code: 'MISSING_MANDATE_REF', message: 'mandateRef is required and must be a non-empty string.' });
  }
  if (!isTransferNonEmptyString(candidate.executionRef)) {
    errors.push({
      code: 'MISSING_EXECUTION_REF',
      message: 'executionRef is required and must be a non-empty string; a lifecycle report concerns one specific movement, never a mandate in the abstract.',
    });
  }
  if (!isTransferNonEmptyString(candidate.reportedBy)) {
    errors.push({ code: 'MISSING_REPORTED_BY', message: 'reportedBy is required and must be a non-empty string.' });
  }

  if (candidate.occurredAt === undefined) {
    errors.push({ code: 'MISSING_OCCURRED_AT', message: 'occurredAt is required.' });
  } else if (!isTransferTimestamp(candidate.occurredAt)) {
    errors.push({ code: 'INVALID_OCCURRED_AT', message: 'occurredAt must be an ISO 8601 timestamp string.' });
  }

  if (candidate.lifecycleType === undefined) {
    errors.push({ code: 'MISSING_LIFECYCLE_TYPE', message: 'lifecycleType is required.' });
  } else if (!isEnterpriseTransferLifecycleType(candidate.lifecycleType)) {
    errors.push({ code: 'INVALID_LIFECYCLE_TYPE', message: `lifecycleType must be one of: ${LIFECYCLE_TYPES.join(', ')}.` });
  }

  if (!isTransferNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  for (const field of LIFECYCLE_EXTERNAL_STRING_FIELDS) {
    const value = candidate[field];
    if (value !== undefined && !isTransferNonEmptyString(value)) {
      errors.push({ code: 'INVALID_EXTERNAL_REFERENCE', message: `${field} must be a non-empty string when present.` });
    }
  }

  if (candidate.evidenceRefs !== undefined && !isTransferCanonicalIdArray(candidate.evidenceRefs)) {
    errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseTransferExecutionEvidence {
  readonly schemaVersion: string;
  readonly id: string;
  readonly mandateRef: string;
  readonly executedBy: string;
  readonly executedAt: string;
  readonly transferorRef: string;
  readonly transfereeRef: string;
  readonly rights: readonly string[];
  readonly transferredScope: EnterpriseTransferScope;
  readonly correlationId: string;
  readonly transferEffectiveAt?: string;
  readonly registry?: string;
  readonly externalSystem?: string;
  readonly externalAgreementReference?: string;
  readonly externalAcceptanceReference?: string;
  readonly externalConsiderationReference?: string;
  readonly externalRegistrationReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
}

/** Projects execution evidence to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseTransferExecutionEvidence(
  evidence: EnterpriseTransferExecutionEvidence,
): SerializedEnterpriseTransferExecutionEvidence {
  return {
    schemaVersion: evidence.schemaVersion,
    id: evidence.id,
    mandateRef: evidence.mandateRef,
    executedBy: evidence.executedBy,
    executedAt: evidence.executedAt,
    transferorRef: evidence.transferorRef,
    transfereeRef: evidence.transfereeRef,
    rights: [...evidence.rights].sort(),
    transferredScope: serializeEnterpriseTransferScope(evidence.transferredScope),
    correlationId: evidence.correlationId,
    ...(evidence.transferEffectiveAt === undefined ? {} : { transferEffectiveAt: evidence.transferEffectiveAt }),
    ...(evidence.registry === undefined ? {} : { registry: evidence.registry }),
    ...(evidence.externalSystem === undefined ? {} : { externalSystem: evidence.externalSystem }),
    ...(evidence.externalAgreementReference === undefined ? {} : { externalAgreementReference: evidence.externalAgreementReference }),
    ...(evidence.externalAcceptanceReference === undefined ? {} : { externalAcceptanceReference: evidence.externalAcceptanceReference }),
    ...(evidence.externalConsiderationReference === undefined ? {} : { externalConsiderationReference: evidence.externalConsiderationReference }),
    ...(evidence.externalRegistrationReference === undefined ? {} : { externalRegistrationReference: evidence.externalRegistrationReference }),
    ...(evidence.externalTransactionReference === undefined ? {} : { externalTransactionReference: evidence.externalTransactionReference }),
    ...(evidence.evidenceRefs === undefined ? {} : { evidenceRefs: [...evidence.evidenceRefs].sort() }),
  };
}

export interface SerializedEnterpriseTransferLifecycleEvidence {
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
export function serializeEnterpriseTransferLifecycleEvidence(
  evidence: EnterpriseTransferLifecycleEvidence,
): SerializedEnterpriseTransferLifecycleEvidence {
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

/** Thrown by `deserializeEnterpriseTransferExecutionEvidence` when the input fails validation. */
export class EnterpriseTransferExecutionValidationError extends Error {
  readonly issues: readonly EnterpriseTransferExecutionValidationIssue[];

  constructor(issues: readonly EnterpriseTransferExecutionValidationIssue[]) {
    super(`Invalid EnterpriseTransferExecutionEvidence: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseTransferExecutionValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseTransferExecutionEvidence`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseTransferExecutionEvidence(candidate: unknown): EnterpriseTransferExecutionEvidence {
  const result = validateEnterpriseTransferExecutionEvidence(candidate);
  if (!result.valid) throw new EnterpriseTransferExecutionValidationError(result.errors);

  const value = candidate as SerializedEnterpriseTransferExecutionEvidence;
  return {
    schemaVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
    id: value.id,
    mandateRef: value.mandateRef,
    executedBy: value.executedBy,
    executedAt: value.executedAt,
    transferorRef: value.transferorRef,
    transfereeRef: value.transfereeRef,
    rights: value.rights.map((right) => right as EnterpriseTransferableRightType),
    transferredScope: serializeEnterpriseTransferScope(value.transferredScope),
    correlationId: value.correlationId,
    ...(value.transferEffectiveAt === undefined ? {} : { transferEffectiveAt: value.transferEffectiveAt }),
    ...(value.registry === undefined ? {} : { registry: value.registry }),
    ...(value.externalSystem === undefined ? {} : { externalSystem: value.externalSystem }),
    ...(value.externalAgreementReference === undefined ? {} : { externalAgreementReference: value.externalAgreementReference }),
    ...(value.externalAcceptanceReference === undefined ? {} : { externalAcceptanceReference: value.externalAcceptanceReference }),
    ...(value.externalConsiderationReference === undefined ? {} : { externalConsiderationReference: value.externalConsiderationReference }),
    ...(value.externalRegistrationReference === undefined ? {} : { externalRegistrationReference: value.externalRegistrationReference }),
    ...(value.externalTransactionReference === undefined ? {} : { externalTransactionReference: value.externalTransactionReference }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}

/** Thrown by `deserializeEnterpriseTransferLifecycleEvidence` when the input fails validation. */
export class EnterpriseTransferLifecycleValidationError extends Error {
  readonly issues: readonly EnterpriseTransferLifecycleValidationIssue[];

  constructor(issues: readonly EnterpriseTransferLifecycleValidationIssue[]) {
    super(`Invalid EnterpriseTransferLifecycleEvidence: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseTransferLifecycleValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseTransferLifecycleEvidence`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseTransferLifecycleEvidence(candidate: unknown): EnterpriseTransferLifecycleEvidence {
  const result = validateEnterpriseTransferLifecycleEvidence(candidate);
  if (!result.valid) throw new EnterpriseTransferLifecycleValidationError(result.errors);

  const value = candidate as SerializedEnterpriseTransferLifecycleEvidence;
  return {
    schemaVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
    id: value.id,
    mandateRef: value.mandateRef,
    executionRef: value.executionRef,
    reportedBy: value.reportedBy,
    occurredAt: value.occurredAt,
    lifecycleType: value.lifecycleType as EnterpriseTransferLifecycleType,
    correlationId: value.correlationId,
    ...(value.externalSystem === undefined ? {} : { externalSystem: value.externalSystem }),
    ...(value.externalReference === undefined ? {} : { externalReference: value.externalReference }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}
