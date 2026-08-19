import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import { resourceRefIdentityEquals } from '@aoc-enterprise/resource-envelope';

/**
 * Enterprise composition over `EnterpriseAccessDecision`
 * (`@aoc-enterprise/access-decision`) and `EnterpriseAccessObligation`
 * (`@aoc-enterprise/access-obligation`), and over Soberanía Protocol's `ResourceRef`.
 *
 * `EnterpriseAccessDecision` answers *"should access be granted?"*
 * (`outcome: 'allow' | 'deny' | 'conditional'`). `EnterpriseAccessObligation`
 * answers *"under what mandatory conditions?"*. Neither is itself the
 * authorization a principal actually holds -- a decision is an evaluation
 * record, not a credential, and can be evaluated (and re-evaluated) any
 * number of times without ever being "held" by anyone. `EnterpriseAccessGrant`
 * is the immutable record that answers a third, distinct question: *"what
 * authorization was issued?"* -- produced once a decision (and its mandatory
 * obligations, resolved elsewhere) permit it, and referenced by everything
 * downstream that needs to know a principal currently holds -- or once
 * held -- authorization for a resource.
 *
 * `EnterpriseAccessGrant` references `EnterpriseAccessDecision` by an opaque
 * `decisionRef: CanonicalId` (that decision's own `correlationId`) and
 * `EnterpriseAccessObligation`s by opaque `obligationRefs?: readonly
 * CanonicalId[]` (each obligation's own `id`) -- it never embeds either.
 * It composes Soberanía Protocol's `ResourceRef` directly (`resource: ResourceRef`),
 * the same identity primitive `EnterpriseResourceEnvelope` composes, but
 * -- deliberately -- not the envelope itself: a grant needs to know *which*
 * resource access was issued for, never where its bytes live, whether it is
 * still there, or any other storage-lifecycle fact that is
 * `EnterpriseResourceEnvelope`'s job alone.
 *
 * This is a pure data contract: no persistence, no service, no API, no
 * provider SDK, no provider credential, no JWT, no OAuth token, no signed
 * URL, no runtime session, no execution engine, no enforcement, no approval
 * workflow. It records that authorization was issued; it never carries out,
 * enforces, or translates that authorization into anything a provider
 * understands. That translation is a future Provider Adapter's job -- see
 * the package README's "Future integration path".
 *
 * Ownership: Soberanía Enterprise (`@aoc-enterprise/access-grant`).
 *
 * See the package README for the full design rationale, including why
 * `status` is a two-state, non-time-derived vocabulary, and why no provider,
 * credential, or session field was added despite this being the contract a
 * Provider Adapter will eventually consume.
 */
export const ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION = '1.0.0' as const;

/**
 * The grant's own issuance/revocation lifecycle -- deliberately not "is this
 * grant currently within its validity window." `'active'` records that this
 * is, as far as this record's own issuance history is concerned, the
 * operative grant; `'revoked'` records that a later, separate event (a
 * future `GrantRevocation` record, which will reference this grant's `id`
 * the same way this contract references a decision's `id`) withdrew it. This
 * mirrors the precedent `EnterpriseResourceEnvelope.lifecycleState` already
 * establishes: each `EnterpriseAccessGrant` value is an immutable snapshot,
 * but the field it holds can differ between snapshots of the same `id` taken
 * at different times, with whatever persists those snapshots (out of scope
 * here) responsible for producing the next one.
 *
 * `'expired'` is deliberately not a status value. Expiration is fully and
 * exclusively represented by `issuedAt`/`expiresAt` (see "Expiration
 * semantics" below); a status-derived `'expired'` value would create a
 * second, independently-settable source of truth for the same fact, with no
 * way for `validateEnterpriseAccessGrant` -- a pure function with no
 * wall-clock input -- to keep the two consistent. Whether an `'active'`
 * grant has lapsed past `expiresAt` is a comparison against the current
 * time; this immutable, non-executing contract does not perform that
 * comparison (see "Explicit non-responsibilities" in the README).
 *
 * No third state (e.g. `'suspended'`, `'pending'`) is included: nothing in
 * this repository's evidence justifies one, and Phase 4 of this sequence
 * requires avoiding unnecessary states.
 */
export type EnterpriseAccessGrantStatus = 'active' | 'revoked';

/**
 * The canonical Enterprise-owned contract for **the immutable record of an
 * issued authorization**. See the package README for the full design
 * rationale, ownership boundary, and relationship to `EnterpriseAccessDecision`,
 * `EnterpriseAccessObligation`, a future `GrantRevocation`, `UsageEvent`,
 * `EvidenceCorrelation`, and Provider Adapters.
 *
 * Field groups:
 * - `id` -- grant identity, minted once at issuance.
 * - `status` -- the grant's own issuance/revocation lifecycle (see
 *   `EnterpriseAccessGrantStatus`).
 * - `resource` -- which governed resource this authorization covers,
 *   composing Protocol's `ResourceRef` directly (identity only -- never the
 *   full `EnterpriseResourceEnvelope`, which this contract does not embed).
 * - `decisionRef` -- an opaque pointer to the `EnterpriseAccessDecision`
 *   that authorized issuing this grant (that decision's own
 *   `correlationId`). A reference, never an embedding, mirroring
 *   `EnterpriseAccessObligation.decisionRef`.
 * - `principalId` -- who this authorization was issued to. Carried directly
 *   (not re-derived by dereferencing `decisionRef`) because this contract
 *   composes the decision by reference, not by embedding, and a grant must
 *   be reasoned about -- checked, displayed, audited -- without requiring
 *   access to the `EnterpriseAccessDecision` record it points to.
 * - `issuedAt` + `expiresAt` -- immutable expiration metadata (see
 *   "Expiration semantics" below). Both required: an indefinite grant with
 *   no recorded expiration is not a state this contract can represent.
 * - `correlationId` -- this issuance event's own audit-trail correlation
 *   identifier, distinct from `decisionRef` (which correlates back to the
 *   *evaluation* event, not the *issuance* event) -- the same
 *   each-lifecycle-event-gets-its-own-correlation-id pattern
 *   `EnterpriseResourceEnvelope.correlationId` (registration) and
 *   `EnterpriseAccessDecision.correlationId` (evaluation) already establish.
 * - `issuerRef?` -- an opaque pointer to whatever issued this grant (an
 *   approval engine, a runtime host, a service principal). Optional: not
 *   every deployment topology records a distinct issuer identity beyond the
 *   decision/correlation trail.
 * - `obligationRefs?` -- opaque pointers to the `EnterpriseAccessObligation`s
 *   (by their own `id`) that were resolved before this grant was issued.
 *   Optional: a decision can carry zero obligations.
 * - `auditRefs?` -- opaque pointers to audit trail entries associated with
 *   this grant's issuance, distinct from `correlationId` (this grant's own
 *   event identifier) the same way `EnterpriseAccessDecision.evidenceRefs`
 *   is distinct from `EnterpriseAccessDecision.correlationId`.
 */
export interface EnterpriseAccessGrant {
  readonly schemaVersion: typeof ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly status: EnterpriseAccessGrantStatus;
  readonly resource: ResourceRef;
  readonly decisionRef: CanonicalId;
  readonly principalId: CanonicalId;
  readonly issuedAt: UtcDateTime;
  readonly expiresAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  readonly issuerRef?: CanonicalId;
  readonly obligationRefs?: readonly CanonicalId[];
  readonly auditRefs?: readonly CanonicalId[];
}

// ---------------------------------------------------------------------------
// Identity equality -- derives from grant identity, the issued decision, the
// principal, and the resource (Phase 8's required basis), never from status,
// timestamps, or any other field, and never from runtime execution. Resource
// identity delegates entirely to `resourceRefIdentityEquals`, already
// canonical for `ResourceRef` in `@aoc-enterprise/resource-envelope` -- this
// module never defines a second identity algorithm.
// ---------------------------------------------------------------------------

/**
 * Whether two grants represent the same issued authorization: the same
 * grant id, issued from the same decision, to the same principal, for the
 * same resource. Two grants can share identity while disagreeing on every
 * other field (e.g. `status` moving from `'active'` to `'revoked'` in a
 * later snapshot) -- see `enterpriseAccessGrantEquals` for full structural
 * equality.
 */
export function enterpriseAccessGrantIdentityEquals(a: EnterpriseAccessGrant, b: EnterpriseAccessGrant): boolean {
  return (
    a.id === b.id &&
    a.decisionRef === b.decisionRef &&
    a.principalId === b.principalId &&
    resourceRefIdentityEquals(a.resource, b.resource)
  );
}

function recordAttributesEquals(a: Readonly<Record<string, string>> | undefined, b: Readonly<Record<string, string>> | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function optionalCanonicalIdArrayEquals(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.length === bSorted.length && aSorted.every((value, index) => value === bSorted[index]);
}

/**
 * Full structural equality: identity (via `enterpriseAccessGrantIdentityEquals`)
 * plus every other field -- `status`, `issuedAt`, `expiresAt`,
 * `correlationId`, `issuerRef`, `obligationRefs`, `auditRefs`, and
 * `resource.attributes` (descriptive, excluded from identity the same way
 * `resourceRefIdentityEquals` excludes it). This satisfies Phase 8's basis
 * and extends it to every remaining declarative field, exactly as
 * `enterpriseResourceEnvelopeEquals`/`enterpriseAccessDecisionEquals`/
 * `enterpriseAccessObligationEquals` extend their own identity functions.
 */
export function enterpriseAccessGrantEquals(a: EnterpriseAccessGrant, b: EnterpriseAccessGrant): boolean {
  return (
    enterpriseAccessGrantIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    recordAttributesEquals(a.resource.attributes, b.resource.attributes) &&
    a.status === b.status &&
    a.issuedAt === b.issuedAt &&
    a.expiresAt === b.expiresAt &&
    a.correlationId === b.correlationId &&
    a.issuerRef === b.issuerRef &&
    optionalCanonicalIdArrayEquals(a.obligationRefs, b.obligationRefs) &&
    optionalCanonicalIdArrayEquals(a.auditRefs, b.auditRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation -- internal consistency, required fields, timestamp/expiration
// consistency, duplicate references, and invalid state combinations only
// (Phase 6). No provider validation, no network validation, no existence
// checks (this function never confirms `decisionRef`/`obligationRefs` point
// at anything real), no user-permission evaluation, no runtime-execution
// check, and no wall-clock comparison (this function has no "now" input, so
// it cannot and does not decide whether an `'active'` grant has expired).
// ---------------------------------------------------------------------------

export type EnterpriseAccessGrantValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_STATUS'
  | 'INVALID_STATUS'
  | 'MISSING_RESOURCE'
  | 'INVALID_RESOURCE_IDENTITY'
  | 'MISSING_DECISION_REF'
  | 'INVALID_DECISION_REF'
  | 'MISSING_PRINCIPAL_ID'
  | 'INVALID_PRINCIPAL_ID'
  | 'MISSING_ISSUED_AT'
  | 'INVALID_ISSUED_AT'
  | 'MISSING_EXPIRES_AT'
  | 'INVALID_EXPIRES_AT'
  | 'INVALID_EXPIRATION_ORDER'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_ISSUER_REF'
  | 'INVALID_OBLIGATION_REFS'
  | 'DUPLICATE_OBLIGATION_REF'
  | 'INVALID_AUDIT_REFS'
  | 'DUPLICATE_AUDIT_REF';

export interface EnterpriseAccessGrantValidationIssue {
  readonly code: EnterpriseAccessGrantValidationCode;
  readonly message: string;
}

export type EnterpriseAccessGrantValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseAccessGrantValidationIssue[] };

const GRANT_STATUSES: readonly EnterpriseAccessGrantStatus[] = ['active', 'revoked'];
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function findDuplicateStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function validateCanonicalIdArray(
  candidate: unknown,
  invalidCode: 'INVALID_OBLIGATION_REFS' | 'INVALID_AUDIT_REFS',
  duplicateCode: 'DUPLICATE_OBLIGATION_REF' | 'DUPLICATE_AUDIT_REF',
  fieldName: string,
  errors: EnterpriseAccessGrantValidationIssue[],
): void {
  if (!Array.isArray(candidate) || candidate.length === 0 || !candidate.every((ref) => isNonEmptyString(ref))) {
    errors.push({ code: invalidCode, message: `${fieldName} must be a non-empty array of non-empty strings when present.` });
    return;
  }
  for (const duplicate of findDuplicateStrings(candidate)) {
    errors.push({ code: duplicateCode, message: `${fieldName} contains '${duplicate}' more than once.` });
  }
}

/**
 * Validates internal consistency of a candidate grant. Accepts `unknown` so
 * it can guard deserialized/external input, not just already-typed values.
 * Never inspects `decisionRef`/`obligationRefs`/`auditRefs`/`issuerRef` for
 * existence, never contacts a provider, and never compares `expiresAt`
 * against the current time -- only shape, required-field, timestamp-format,
 * expiration-order, and duplicate-reference consistency.
 */
export function validateEnterpriseAccessGrant(candidate: unknown): EnterpriseAccessGrantValidationResult {
  const errors: EnterpriseAccessGrantValidationIssue[] = [];

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Grant must be an object.' }] };
  }

  if (candidate.schemaVersion !== ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION) {
    errors.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `schemaVersion must be '${ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION}'.`,
    });
  }

  if (!isNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (candidate.status === undefined) {
    errors.push({ code: 'MISSING_STATUS', message: 'status is required.' });
  } else if (typeof candidate.status !== 'string' || !GRANT_STATUSES.includes(candidate.status as EnterpriseAccessGrantStatus)) {
    errors.push({ code: 'INVALID_STATUS', message: `status must be one of: ${GRANT_STATUSES.join(', ')}.` });
  }

  if (!isPlainObject(candidate.resource)) {
    errors.push({ code: 'MISSING_RESOURCE', message: 'resource (a ResourceRef) is required.' });
  } else {
    const resource = candidate.resource;
    const hasKind = typeof resource.kind === 'string' && resource.kind.length > 0;
    const hasId = typeof resource.id === 'string' && resource.id.length > 0;
    if (!hasKind || !hasId) {
      errors.push({ code: 'INVALID_RESOURCE_IDENTITY', message: 'resource.kind and resource.id must both be non-empty strings.' });
    }
  }

  if (!isNonEmptyString(candidate.decisionRef)) {
    errors.push({
      code: candidate.decisionRef === undefined ? 'MISSING_DECISION_REF' : 'INVALID_DECISION_REF',
      message: 'decisionRef is required and must be a non-empty string.',
    });
  }

  if (!isNonEmptyString(candidate.principalId)) {
    errors.push({
      code: candidate.principalId === undefined ? 'MISSING_PRINCIPAL_ID' : 'INVALID_PRINCIPAL_ID',
      message: 'principalId is required and must be a non-empty string.',
    });
  }

  let issuedAtValid = false;
  if (candidate.issuedAt === undefined) {
    errors.push({ code: 'MISSING_ISSUED_AT', message: 'issuedAt is required.' });
  } else if (typeof candidate.issuedAt !== 'string' || !ISO_8601_PATTERN.test(candidate.issuedAt)) {
    errors.push({ code: 'INVALID_ISSUED_AT', message: 'issuedAt must be an ISO 8601 UTC timestamp string.' });
  } else {
    issuedAtValid = true;
  }

  let expiresAtValid = false;
  if (candidate.expiresAt === undefined) {
    errors.push({ code: 'MISSING_EXPIRES_AT', message: 'expiresAt is required.' });
  } else if (typeof candidate.expiresAt !== 'string' || !ISO_8601_PATTERN.test(candidate.expiresAt)) {
    errors.push({ code: 'INVALID_EXPIRES_AT', message: 'expiresAt must be an ISO 8601 UTC timestamp string.' });
  } else {
    expiresAtValid = true;
  }

  if (issuedAtValid && expiresAtValid && Date.parse(candidate.expiresAt as string) <= Date.parse(candidate.issuedAt as string)) {
    errors.push({ code: 'INVALID_EXPIRATION_ORDER', message: 'expiresAt must be strictly after issuedAt.' });
  }

  if (!isNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.issuerRef !== undefined && !isNonEmptyString(candidate.issuerRef)) {
    errors.push({ code: 'INVALID_ISSUER_REF', message: 'issuerRef must be a non-empty string when present.' });
  }

  if (candidate.obligationRefs !== undefined) {
    validateCanonicalIdArray(candidate.obligationRefs, 'INVALID_OBLIGATION_REFS', 'DUPLICATE_OBLIGATION_REF', 'obligationRefs', errors);
  }

  if (candidate.auditRefs !== undefined) {
    validateCanonicalIdArray(candidate.auditRefs, 'INVALID_AUDIT_REFS', 'DUPLICATE_AUDIT_REF', 'auditRefs', errors);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization -- stable, deterministic, provider-neutral, round-trip safe,
// version-friendly (Phase 7).
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseAccessGrant {
  readonly schemaVersion: string;
  readonly id: string;
  readonly status: string;
  readonly resource: {
    readonly kind: string;
    readonly id: string;
    readonly tenantId?: string;
    readonly attributes?: Readonly<Record<string, string>>;
  };
  readonly decisionRef: string;
  readonly principalId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly issuerRef?: string;
  readonly obligationRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
}

function sortedAttributes(attributes: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> | undefined {
  if (attributes === undefined) return undefined;
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(attributes).sort()) {
    sorted[key] = attributes[key] as string;
  }
  return sorted;
}

/** Projects an `EnterpriseAccessGrant` to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already a valid `EnterpriseAccessGrant` by construction. */
export function serializeEnterpriseAccessGrant(grant: EnterpriseAccessGrant): SerializedEnterpriseAccessGrant {
  const attributes = sortedAttributes(grant.resource.attributes);
  const obligationRefs = grant.obligationRefs === undefined ? undefined : [...grant.obligationRefs].sort();
  const auditRefs = grant.auditRefs === undefined ? undefined : [...grant.auditRefs].sort();

  return {
    schemaVersion: grant.schemaVersion,
    id: grant.id,
    status: grant.status,
    resource: {
      kind: grant.resource.kind,
      id: grant.resource.id,
      ...(grant.resource.tenantId === undefined ? {} : { tenantId: grant.resource.tenantId }),
      ...(attributes === undefined ? {} : { attributes }),
    },
    decisionRef: grant.decisionRef,
    principalId: grant.principalId,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
    correlationId: grant.correlationId,
    ...(grant.issuerRef === undefined ? {} : { issuerRef: grant.issuerRef }),
    ...(obligationRefs === undefined ? {} : { obligationRefs }),
    ...(auditRefs === undefined ? {} : { auditRefs }),
  };
}

/**
 * Thrown by `deserializeEnterpriseAccessGrant` when the input fails
 * `validateEnterpriseAccessGrant`. Carries the full issue list rather than
 * just the first, matching `EnterpriseAccessGrantValidationResult`.
 */
export class EnterpriseAccessGrantValidationError extends Error {
  readonly issues: readonly EnterpriseAccessGrantValidationIssue[];

  constructor(issues: readonly EnterpriseAccessGrantValidationIssue[]) {
    super(`Invalid EnterpriseAccessGrant: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseAccessGrantValidationError';
    this.issues = issues;
  }
}

/**
 * Parses and validates a candidate value (e.g. `JSON.parse` output) into an
 * `EnterpriseAccessGrant`. Every field is mapped explicitly from the
 * validated candidate -- no structural cast (`as EnterpriseAccessGrant`)
 * over unchecked input, matching the convention already established in
 * `@aoc-enterprise/resource-envelope`, `@aoc-enterprise/access-decision`, and
 * `@aoc-enterprise/access-obligation`.
 *
 * Throws `EnterpriseAccessGrantValidationError` when validation fails.
 */
export function deserializeEnterpriseAccessGrant(candidate: unknown): EnterpriseAccessGrant {
  const result = validateEnterpriseAccessGrant(candidate);
  if (!result.valid) {
    throw new EnterpriseAccessGrantValidationError(result.errors);
  }

  // Validated above: `candidate` has the required shape of a
  // SerializedEnterpriseAccessGrant. Read through a narrow local view
  // instead of casting the whole object to EnterpriseAccessGrant.
  const value = candidate as SerializedEnterpriseAccessGrant;

  const resource: ResourceRef = {
    kind: value.resource.kind,
    id: value.resource.id,
    ...(value.resource.tenantId === undefined ? {} : { tenantId: value.resource.tenantId }),
    ...(value.resource.attributes === undefined ? {} : { attributes: { ...value.resource.attributes } }),
  };

  return {
    schemaVersion: ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
    id: value.id,
    status: value.status as EnterpriseAccessGrantStatus,
    resource,
    decisionRef: value.decisionRef,
    principalId: value.principalId,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    correlationId: value.correlationId,
    ...(value.issuerRef === undefined ? {} : { issuerRef: value.issuerRef }),
    ...(value.obligationRefs === undefined ? {} : { obligationRefs: [...value.obligationRefs] }),
    ...(value.auditRefs === undefined ? {} : { auditRefs: [...value.auditRefs] }),
  };
}
