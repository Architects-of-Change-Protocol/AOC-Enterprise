import type { CanonicalId, UtcDateTime } from '@aoc/protocol';

/**
 * Enterprise composition over a future `EnterpriseAccessGrant`.
 *
 * A `Grant` answers *"what authorization exists?"*. `EnterpriseGrantRevocation`
 * answers a different question about a grant that already existed: *"when and
 * why did that authorization cease to be valid?"*. It is the immutable
 * business record of a revocation event -- not the mechanism that carries a
 * revocation out.
 *
 * No `EnterpriseAccessGrant` contract exists in this repository yet (it is
 * referenced only as "future `AccessGrant`" in the READMEs of
 * `@aoc-enterprise/resource-envelope`, `@aoc-enterprise/access-decision`, and
 * `@aoc-enterprise/access-obligation`). This is not a blocker: this contract
 * composes with it the same way `EnterpriseAccessObligation` already composes
 * with `EnterpriseAccessDecision` -- **by an opaque reference**
 * (`grantRef: CanonicalId`), never by embedding or importing a grant's shape.
 * A reference does not require the referenced contract to exist yet; it only
 * requires a stable identifier space (`CanonicalId`) to point into, which
 * `@aoc/protocol` already provides. When `EnterpriseAccessGrant` is defined,
 * `grantRef` is understood to point at that contract's own identity field --
 * no change to this contract is required.
 *
 * `correlationId` mirrors `EnterpriseAccessDecision.correlationId` in both
 * name and purpose: an opaque pointer that lets a revocation be correlated
 * with the rest of an audit trail (the decision that led to the grant, the
 * obligations attached to it, evidence bundles, etc.) without this contract
 * knowing or assuming the shape of any of those records.
 *
 * This is a pure data contract: no persistence, no service, no API, no
 * provider adapter, no URL invalidation, no cache invalidation, no session
 * termination, no JWT invalidation, no OAuth revocation, no timer, no
 * scheduler, no runtime enforcement. `EnterpriseGrantRevocation` records that
 * a grant is no longer valid; it never makes that true anywhere else.
 *
 * Ownership: Soberanía Enterprise (`@aoc-enterprise/grant-revocation`).
 */
export const ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION = '1.0.0' as const;

/**
 * The canonical, minimum-required vocabulary of declarative revocation
 * reasons. Each is a *category describing why a grant is no longer valid*,
 * never an instruction to act: `'expired'` records that the grant's own
 * validity window elapsed; `'administrator-revoked'` records that an
 * administrator withdrew it directly; `'policy-changed'` records that the
 * policy that permitted the grant no longer does; `'principal-disabled'`
 * records that the grantee is no longer an eligible principal;
 * `'resource-removed'` records that the governed resource itself is gone;
 * `'manual-revocation'` records a deliberate, one-off revocation not
 * otherwise categorized; `'security-incident'` records that the grant was
 * revoked in response to a security event. None of these categories performs
 * anything -- interpreting a reason and acting on it (invalidating a URL,
 * terminating a session, blacklisting a token) is a future provider
 * adapter's or enforcement layer's job, never this record's (see "Future
 * integration path" in the README).
 *
 * This is deliberately a closed union, not an open string, mirroring the
 * closed `EnterpriseAccessObligationType` and `EnterpriseResourceLifecycleState`
 * vocabularies already established in this repository's Enterprise contract
 * line: the categories are stable, provider-neutral, shared vocabulary, not
 * a provider-specific enum (see "Non-negotiable rules" -- no provider-specific
 * revocation reason is introduced; no `pinata-unpin-failed`, `s3-object-deleted`,
 * or similar appears here). A future category is a `schemaVersion` change,
 * not an escape hatch.
 */
export const ENTERPRISE_GRANT_REVOCATION_REASONS = {
  EXPIRED: 'expired',
  ADMINISTRATOR_REVOKED: 'administrator-revoked',
  POLICY_CHANGED: 'policy-changed',
  PRINCIPAL_DISABLED: 'principal-disabled',
  RESOURCE_REMOVED: 'resource-removed',
  MANUAL_REVOCATION: 'manual-revocation',
  SECURITY_INCIDENT: 'security-incident',
} as const;

export type EnterpriseGrantRevocationReason =
  (typeof ENTERPRISE_GRANT_REVOCATION_REASONS)[keyof typeof ENTERPRISE_GRANT_REVOCATION_REASONS];

/**
 * The canonical Enterprise-owned contract for **the immutable record that a
 * previously-issued Access Grant is no longer valid**. See the package
 * README for the full design rationale, ownership boundary, and relationship
 * to a future `EnterpriseAccessGrant`, `EnterpriseAccessDecision`,
 * `EnterpriseAccessObligation`, `UsageEvent`, and provider adapters.
 *
 * Field groups (Phase 3):
 * - `id` -- revocation identity. Immutable and unique within any collection
 *   of revocation records (see `validateEnterpriseGrantRevocationSet`'s
 *   `DUPLICATE_REVOCATION_ID`).
 * - `grantRef` -- an opaque pointer to the grant this record revokes (a
 *   future `EnterpriseAccessGrant`'s own identity). A reference, never an
 *   embedding: this contract does not know or assume the shape of a grant.
 * - `revokedAt` -- the instant this revocation took effect as a business
 *   fact, not when it was enforced anywhere.
 * - `reason` -- why the grant is no longer valid, from the canonical,
 *   provider-neutral `EnterpriseGrantRevocationReason` vocabulary.
 * - `issuerRef` -- an opaque pointer to the principal or system that
 *   recorded this revocation (an administrator, a policy engine, an
 *   automated expiry process). Mirrors the reference style of Protocol's own
 *   `CapabilityToken.issuer` / `ConsentGrant.grantor`.
 * - `correlationId` -- an opaque pointer that ties this revocation to the
 *   rest of an audit trail, mirroring `EnterpriseAccessDecision.correlationId`.
 * - `evidenceRefs?` -- opaque pointers to evidence records that informed
 *   this revocation, mirroring `EnterpriseAccessDecision.evidenceRefs` /
 *   `EnterpriseAccessObligation.evidenceRefs`.
 * - `description?` -- optional human-readable documentation metadata,
 *   mirroring the `reason?: string` / `description?: string` precedent on
 *   `EnterpriseAccessDecision` / `EnterpriseAccessObligation`.
 */
export interface EnterpriseGrantRevocation {
  readonly schemaVersion: typeof ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly grantRef: CanonicalId;
  readonly revokedAt: UtcDateTime;
  readonly reason: EnterpriseGrantRevocationReason;
  readonly issuerRef: CanonicalId;
  readonly correlationId: CanonicalId;
  readonly evidenceRefs?: readonly CanonicalId[];
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Identity equality -- derives from revocation identity, grant reference, and
// timestamp (Phase 7), the same compound-identity pattern
// `enterpriseAccessDecisionIdentityEquals` already establishes (resource
// identity + principal + evaluation instant) rather than a bare single field.
// Identity equality is always a strict subset of full structural equality,
// never a second, independently invented notion of "the same revocation."
// ---------------------------------------------------------------------------

/**
 * Whether two revocation records represent the same revocation event: the
 * same revocation identity, the same revoked grant, at the same revocation
 * instant. Two records can share identity while disagreeing on every other
 * field (e.g. a corrected `description` recorded after the fact) -- this
 * function captures only the identity, not full equivalence; see
 * `enterpriseGrantRevocationEquals` for that. Never derived from runtime
 * execution state (Phase 7): this contract has no execution-shaped field to
 * begin with.
 */
export function enterpriseGrantRevocationIdentityEquals(a: EnterpriseGrantRevocation, b: EnterpriseGrantRevocation): boolean {
  return a.id === b.id && a.grantRef === b.grantRef && a.revokedAt === b.revokedAt;
}

function optionalCanonicalIdArrayEquals(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.length === bSorted.length && aSorted.every((value, index) => value === bSorted[index]);
}

/**
 * Full structural equality: identity (via `enterpriseGrantRevocationIdentityEquals`)
 * plus every other field -- `reason`, `issuerRef`, `correlationId`,
 * `evidenceRefs`, `description`. Extends the required identity basis (Phase
 * 7) to every remaining declarative field, exactly as
 * `enterpriseAccessDecisionEquals` / `enterpriseAccessObligationEquals`
 * extend their own identity functions to full structural equality.
 */
export function enterpriseGrantRevocationEquals(a: EnterpriseGrantRevocation, b: EnterpriseGrantRevocation): boolean {
  return (
    enterpriseGrantRevocationIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.reason === b.reason &&
    a.issuerRef === b.issuerRef &&
    a.correlationId === b.correlationId &&
    optionalCanonicalIdArrayEquals(a.evidenceRefs, b.evidenceRefs) &&
    a.description === b.description
  );
}

// ---------------------------------------------------------------------------
// Validation -- required fields, reference integrity, timestamp consistency,
// and reason-vocabulary consistency for a single candidate (Phase 5). No
// provider validation, no resource-existence validation, no network
// validation, no policy-correctness validation, no runtime-enforcement
// validation. See `validateEnterpriseGrantRevocationSet` below for
// duplicate-revocation detection across a collection, which this function --
// operating on one candidate at a time -- cannot express.
// ---------------------------------------------------------------------------

export type EnterpriseGrantRevocationValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_GRANT_REF'
  | 'INVALID_GRANT_REF'
  | 'MISSING_REVOKED_AT'
  | 'INVALID_REVOKED_AT'
  | 'MISSING_REASON'
  | 'INVALID_REASON'
  | 'MISSING_ISSUER_REF'
  | 'INVALID_ISSUER_REF'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_CORRELATION_ID'
  | 'INVALID_DESCRIPTION'
  | 'INVALID_EVIDENCE_REFS';

export interface EnterpriseGrantRevocationValidationIssue {
  readonly code: EnterpriseGrantRevocationValidationCode;
  readonly message: string;
}

export type EnterpriseGrantRevocationValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseGrantRevocationValidationIssue[] };

const REVOCATION_REASONS: readonly EnterpriseGrantRevocationReason[] = Object.values(ENTERPRISE_GRANT_REVOCATION_REASONS);
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validates internal consistency of a single candidate revocation record.
 * Accepts `unknown` so it can guard deserialized/external input, not just
 * already-typed values. Checks required fields, reference-field shape
 * ("reference integrity" -- `grantRef`/`issuerRef`/`correlationId` must be
 * well-formed non-empty identifiers, never whether the referenced grant,
 * issuer, or correlation trail actually exists), timestamp well-formedness
 * ("timestamp consistency" -- `revokedAt` must be a valid ISO 8601 UTC
 * instant), and reason-vocabulary membership ("reason consistency" --
 * `reason` must be one of the canonical, closed values). Never provider
 * status, resource existence, network, policy-correctness, or
 * runtime-enforcement validation.
 */
export function validateEnterpriseGrantRevocation(candidate: unknown): EnterpriseGrantRevocationValidationResult {
  const errors: EnterpriseGrantRevocationValidationIssue[] = [];

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Revocation record must be an object.' }] };
  }

  if (candidate.schemaVersion !== ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION) {
    errors.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `schemaVersion must be '${ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION}'.`,
    });
  }

  if (!isNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (!isNonEmptyString(candidate.grantRef)) {
    errors.push({
      code: candidate.grantRef === undefined ? 'MISSING_GRANT_REF' : 'INVALID_GRANT_REF',
      message: 'grantRef is required and must be a non-empty string.',
    });
  }

  if (candidate.revokedAt === undefined) {
    errors.push({ code: 'MISSING_REVOKED_AT', message: 'revokedAt is required.' });
  } else if (typeof candidate.revokedAt !== 'string' || !ISO_8601_PATTERN.test(candidate.revokedAt)) {
    errors.push({ code: 'INVALID_REVOKED_AT', message: 'revokedAt must be an ISO 8601 UTC timestamp string.' });
  }

  if (candidate.reason === undefined) {
    errors.push({ code: 'MISSING_REASON', message: 'reason is required.' });
  } else if (typeof candidate.reason !== 'string' || !REVOCATION_REASONS.includes(candidate.reason as EnterpriseGrantRevocationReason)) {
    errors.push({ code: 'INVALID_REASON', message: `reason must be one of: ${REVOCATION_REASONS.join(', ')}.` });
  }

  if (!isNonEmptyString(candidate.issuerRef)) {
    errors.push({
      code: candidate.issuerRef === undefined ? 'MISSING_ISSUER_REF' : 'INVALID_ISSUER_REF',
      message: 'issuerRef is required and must be a non-empty string.',
    });
  }

  if (!isNonEmptyString(candidate.correlationId)) {
    errors.push({
      code: candidate.correlationId === undefined ? 'MISSING_CORRELATION_ID' : 'INVALID_CORRELATION_ID',
      message: 'correlationId is required and must be a non-empty string.',
    });
  }

  if (candidate.description !== undefined && !isNonEmptyString(candidate.description)) {
    errors.push({ code: 'INVALID_DESCRIPTION', message: 'description must be a non-empty string when present.' });
  }

  if (candidate.evidenceRefs !== undefined) {
    if (!Array.isArray(candidate.evidenceRefs) || !candidate.evidenceRefs.every((ref) => isNonEmptyString(ref))) {
      errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Duplicate detection -- operates on a collection, not a single record
// (Phase 5: "duplicate revocations"). A collection of revocation records
// (e.g. every revocation ever recorded) must not declare the same revocation
// identity twice, and must not record two independent revocations of the
// same grant -- a grant is revoked at most once. This is still a purely
// declarative, internal-consistency check: it never looks up whether the
// referenced grant actually exists or is actually still active.
// ---------------------------------------------------------------------------

export type EnterpriseGrantRevocationSetValidationCode = 'DUPLICATE_REVOCATION_ID' | 'DUPLICATE_GRANT_REVOCATION';

export interface EnterpriseGrantRevocationSetValidationIssue {
  readonly code: EnterpriseGrantRevocationSetValidationCode;
  readonly message: string;
}

export type EnterpriseGrantRevocationSetValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseGrantRevocationSetValidationIssue[] };

function findDuplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

/**
 * Validates that no two revocation records in `revocations` share the same
 * `id`, and that no two records claim to revoke the same grant (`grantRef`).
 * Deliberately a separate function from `validateEnterpriseGrantRevocation`:
 * "duplicate" is a property of a collection, not of any single record, so it
 * cannot be expressed by that function's per-candidate signature. Does not
 * check individual record shape -- call `validateEnterpriseGrantRevocation`
 * for that.
 */
export function validateEnterpriseGrantRevocationSet(
  revocations: readonly EnterpriseGrantRevocation[],
): EnterpriseGrantRevocationSetValidationResult {
  const errors: EnterpriseGrantRevocationSetValidationIssue[] = [];

  for (const id of findDuplicates(revocations.map((revocation) => revocation.id))) {
    errors.push({ code: 'DUPLICATE_REVOCATION_ID', message: `Revocation id '${id}' appears more than once in the set.` });
  }

  for (const grantRef of findDuplicates(revocations.map((revocation) => revocation.grantRef))) {
    errors.push({ code: 'DUPLICATE_GRANT_REVOCATION', message: `Grant '${grantRef}' is the subject of more than one revocation record in the set.` });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization -- stable, deterministic, provider-neutral, round-trip safe,
// version-friendly (Phase 6).
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseGrantRevocation {
  readonly schemaVersion: string;
  readonly id: string;
  readonly grantRef: string;
  readonly revokedAt: string;
  readonly reason: string;
  readonly issuerRef: string;
  readonly correlationId: string;
  readonly evidenceRefs?: readonly string[];
  readonly description?: string;
}

/** Projects an `EnterpriseGrantRevocation` to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already a valid `EnterpriseGrantRevocation` by construction. */
export function serializeEnterpriseGrantRevocation(revocation: EnterpriseGrantRevocation): SerializedEnterpriseGrantRevocation {
  const evidenceRefs = revocation.evidenceRefs === undefined ? undefined : [...revocation.evidenceRefs].sort();

  return {
    schemaVersion: revocation.schemaVersion,
    id: revocation.id,
    grantRef: revocation.grantRef,
    revokedAt: revocation.revokedAt,
    reason: revocation.reason,
    issuerRef: revocation.issuerRef,
    correlationId: revocation.correlationId,
    ...(evidenceRefs === undefined ? {} : { evidenceRefs }),
    ...(revocation.description === undefined ? {} : { description: revocation.description }),
  };
}

/**
 * Thrown by `deserializeEnterpriseGrantRevocation` when the input fails
 * `validateEnterpriseGrantRevocation`. Carries the full issue list rather
 * than just the first, matching `EnterpriseGrantRevocationValidationResult`.
 */
export class EnterpriseGrantRevocationValidationError extends Error {
  readonly issues: readonly EnterpriseGrantRevocationValidationIssue[];

  constructor(issues: readonly EnterpriseGrantRevocationValidationIssue[]) {
    super(`Invalid EnterpriseGrantRevocation: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseGrantRevocationValidationError';
    this.issues = issues;
  }
}

/**
 * Parses and validates a candidate value (e.g. `JSON.parse` output) into an
 * `EnterpriseGrantRevocation`. Every field is mapped explicitly from the
 * validated candidate -- no structural cast (`as EnterpriseGrantRevocation`)
 * over unchecked input, matching the convention already established in
 * `@aoc-enterprise/resource-envelope`, `@aoc-enterprise/access-decision`, and
 * `@aoc-enterprise/access-obligation`.
 *
 * Throws `EnterpriseGrantRevocationValidationError` when validation fails.
 */
export function deserializeEnterpriseGrantRevocation(candidate: unknown): EnterpriseGrantRevocation {
  const result = validateEnterpriseGrantRevocation(candidate);
  if (!result.valid) {
    throw new EnterpriseGrantRevocationValidationError(result.errors);
  }

  // Validated above: `candidate` has the required shape of a
  // SerializedEnterpriseGrantRevocation. Read through a narrow local view
  // instead of casting the whole object to EnterpriseGrantRevocation.
  const value = candidate as SerializedEnterpriseGrantRevocation;

  return {
    schemaVersion: ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION,
    id: value.id,
    grantRef: value.grantRef,
    revokedAt: value.revokedAt,
    reason: value.reason as EnterpriseGrantRevocationReason,
    issuerRef: value.issuerRef,
    correlationId: value.correlationId,
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
    ...(value.description === undefined ? {} : { description: value.description }),
  };
}
