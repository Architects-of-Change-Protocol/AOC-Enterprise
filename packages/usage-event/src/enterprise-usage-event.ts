import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import { resourceRefIdentityEquals } from '@aoc-enterprise/resource-envelope';

/**
 * Enterprise composition over `EnterpriseAccessGrant` (`@aoc-enterprise/access-grant`,
 * R004.G) and, by identity primitive, over AOC Protocol's `ResourceRef`.
 *
 * `EnterpriseAccessGrant` answers *"what authorization was issued?"* -- an
 * immutable record produced once, at issuance, that a principal holds (or
 * once held) authorization for a resource. It is not a log of activity: a
 * grant does not grow, gain entries, or change shape every time it is used.
 * `EnterpriseUsageEvent` is the immutable record that answers a distinct,
 * repeatable question: *"what happened using that authorization, this
 * time?"* -- one record per observed usage, referencing the grant it was
 * exercised under by an opaque `grantRef: CanonicalId` (that grant's own
 * `id`), never by embedding or extending the grant.
 *
 * This is the terminal, observation-only layer of the R004 composition line
 * (`EnterpriseResourceEnvelope` -> `EnterpriseAccessDecision` ->
 * `EnterpriseAccessObligation` / `EnterpriseAccessGrant` ->
 * `EnterpriseGrantRevocation` / `EnterpriseUsageEvent`). Every layer beneath
 * it answers a question about *authorization* -- whether it should exist
 * (`EnterpriseAccessDecision`), under what conditions (`EnterpriseAccessObligation`),
 * whether it does exist (`EnterpriseAccessGrant`), and when it stopped
 * existing (`EnterpriseGrantRevocation`). `EnterpriseUsageEvent` answers a
 * question about *observed fact* instead: it records that a principal
 * exercised an issued grant, when, and in what observed category -- it never
 * re-decides, re-evaluates, or re-authorizes anything a decision or grant
 * already settled, and it never records whether a provider's own operation
 * "succeeded" (see `EnterpriseUsageEventType` below and the package README's
 * "Explicit non-responsibilities").
 *
 * This is a pure data contract: no persistence, no service, no API, no
 * provider SDK, no provider credential, no JWT, no OAuth token, no signed
 * URL, no runtime session, no execution engine, no enforcement, no policy
 * evaluation, no authorization decision. It records that a grant was
 * exercised; it never decides whether it should have been, never carries out
 * the access itself, and never reports a provider's own success/failure
 * status for that access. That interpretation belongs to a future Provider
 * Adapter -- see the package README's "Future integration path".
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/usage-event`).
 *
 * See the package README for the full design rationale, including the
 * closed `EnterpriseUsageEventType` vocabulary and why no provider, outcome,
 * or enforcement field was added despite this being the contract a Provider
 * Adapter will eventually emit.
 */
export const ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION = '1.0.0' as const;

/**
 * The canonical, minimum-required vocabulary of declarative usage-event
 * categories, taken directly from this sequence's own evidence (R004.I
 * Phase 4's "Expected examples") -- no canonical usage/activity-event
 * vocabulary already exists anywhere in this repository (searched; see the
 * package README's "Vocabulary search" section), so this is a new,
 * minimum-required vocabulary, not a reuse.
 *
 * Each value is a *category describing what was observed*, never a
 * judgment this record made itself: `'AccessAttempted'` records that a
 * principal attempted to exercise a grant, it does not record whether that
 * attempt was permitted to proceed (that determination, if re-evaluated at
 * the point of use, is a future enforcement layer's own decision -- this
 * record only observes that an attempt occurred and, separately, what
 * category of outcome was observed for it). `'AccessDenied'` records that an
 * observed attempt did not proceed -- it is not this contract re-running
 * `EnterpriseAccessDecision`'s evaluation, and it carries no reason code or
 * policy citation (that belongs to the decision or enforcement record that
 * produced the denial). `'AccessFailed'` records that an attempted access
 * did not complete -- it is not a provider status code, HTTP response, or
 * SDK error object (see "Explicit non-responsibilities": this contract
 * cannot carry `success`, `allowed`, `enforced`, or any provider-response
 * field). `'GrantConsumed'` records, generically, that the grant was
 * exercised without narrowing to a content-access shape -- for usage
 * patterns that are not "viewing", "downloading", or "streaming" content
 * (e.g. an API-scoped grant invoked programmatically). `'ContentViewed'`,
 * `'ContentDownloaded'`, and `'ContentStreamed'` record the three
 * content-access shapes this sequence's evidence names explicitly; no
 * fourth is added without repository evidence.
 *
 * Deliberately PascalCase string values, not the kebab-case used by this
 * repository's other *category*-shaped closed vocabularies
 * (`EnterpriseAccessObligationType`, `EnterpriseGrantRevocationReason`).
 * This is not an inconsistency: it matches this repository's own
 * precedent for *event-name*-shaped vocabularies specifically --
 * `EnterpriseEventType` in `src/enterprise/events/enterprise-events.ts`
 * already uses PascalCase event names (`'GovernanceEvaluationRequested'`,
 * `'GovernanceRecordCommitted'`, ...) -- and reproduces this sequence's own
 * Phase 4 examples verbatim rather than re-casing them.
 *
 * This is deliberately a closed union, not an open string, mirroring every
 * other closed vocabulary in this Enterprise contract line (see
 * "Non-negotiable rules" -- no provider-specific event, e.g. no
 * `pinata-unpin-succeeded` or `s3-get-object-200`, appears here). A future
 * category is a `schemaVersion` change, not an escape hatch.
 */
export const ENTERPRISE_USAGE_EVENT_TYPES = {
  ACCESS_ATTEMPTED: 'AccessAttempted',
  ACCESS_STARTED: 'AccessStarted',
  ACCESS_COMPLETED: 'AccessCompleted',
  ACCESS_DENIED: 'AccessDenied',
  ACCESS_EXPIRED: 'AccessExpired',
  ACCESS_FAILED: 'AccessFailed',
  GRANT_CONSUMED: 'GrantConsumed',
  CONTENT_VIEWED: 'ContentViewed',
  CONTENT_DOWNLOADED: 'ContentDownloaded',
  CONTENT_STREAMED: 'ContentStreamed',
} as const;

export type EnterpriseUsageEventType = (typeof ENTERPRISE_USAGE_EVENT_TYPES)[keyof typeof ENTERPRISE_USAGE_EVENT_TYPES];

/**
 * A value carried by a usage event's `metadata` bag. Restricted to JSON
 * primitives -- never an object, array, function, or class instance -- so
 * `metadata` can never smuggle a runtime object, a provider client, or a
 * nested credential-shaped value through the one genuinely open extension
 * point this contract has, mirroring `EnterpriseAccessObligationParameterValue`
 * (`@aoc-enterprise/access-obligation`) and its complementary
 * `FORBIDDEN_METADATA_KEY` guard on `metadata` key names (see
 * `validateEnterpriseUsageEvent`).
 */
export type EnterpriseUsageEventMetadataValue = string | number | boolean;

/**
 * The canonical Enterprise-owned contract for **the immutable record of an
 * observed usage of a previously-issued `EnterpriseAccessGrant`**. See the
 * package README for the full design rationale, ownership boundary, and
 * relationship to `EnterpriseAccessGrant`, `EnterpriseAccessDecision`,
 * `EnterprisePolicyObligation`/`EnterpriseAccessObligation`,
 * `EnterpriseGrantRevocation`, `EnterpriseResourceEnvelope`, and future
 * Provider Adapters.
 *
 * Field groups (Phase 3):
 * - `id` -- usage event identity, minted once per observed event. Unique
 *   within any collection of usage events (see
 *   `validateEnterpriseUsageEventSet`'s `DUPLICATE_EVENT_ID`). Deliberately
 *   *not* also constrained to be unique per `grantRef`: unlike a revocation
 *   (which settles a grant's validity at most once), a single grant is
 *   expected to be exercised, and observed, many times.
 * - `grantRef` -- an opaque pointer to the `EnterpriseAccessGrant` this
 *   event records usage of (that grant's own `id`). A reference, never an
 *   embedding, mirroring `EnterpriseGrantRevocation.grantRef`.
 * - `resource` -- which governed resource this usage was observed against,
 *   composing Protocol's `ResourceRef` directly (identity only -- never the
 *   full `EnterpriseResourceEnvelope`), the same identity-only composition
 *   style `EnterpriseAccessGrant.resource` already establishes. Carried
 *   directly rather than re-derived by dereferencing `grantRef` so a usage
 *   event can be reasoned about -- filtered, displayed, audited -- without
 *   requiring access to the grant record it points to.
 * - `principalId` -- who exercised the grant. Carried directly for the same
 *   reason as `resource` and mirroring `EnterpriseAccessGrant.principalId`'s
 *   own rationale: this contract composes the grant by reference, not by
 *   embedding.
 * - `occurredAt` -- the event timestamp: when this usage was observed, as an
 *   immutable business fact. Not a validity window (a usage event has no
 *   "expiry" of its own the way a grant does) and never compared against a
 *   grant's `issuedAt`/`expiresAt` by this contract -- see "Explicit
 *   non-responsibilities" in the README.
 * - `eventType` -- what category of usage was observed, from the canonical,
 *   provider-neutral `EnterpriseUsageEventType` vocabulary.
 * - `correlationId` -- this usage event's own audit-trail correlation
 *   identifier, distinct from `grantRef` (which correlates back to the
 *   *issuance* event, not this *usage* event) -- the same
 *   each-lifecycle-event-gets-its-own-correlation-id pattern
 *   `EnterpriseAccessGrant.correlationId` and `EnterpriseGrantRevocation.correlationId`
 *   already establish.
 * - `metadata?` -- usage-specific, provider-neutral metadata (e.g. a
 *   `'ContentStreamed'` event's observed duration, in a caller-defined unit).
 *   Restricted to JSON primitives and to key names that do not resemble a
 *   credential, token, or URL (see `validateEnterpriseUsageEvent`),
 *   mirroring `EnterpriseAccessObligation.parameters`.
 * - `evidenceRefs?` -- opaque pointers to evidence records associated with
 *   this usage event, mirroring `EnterpriseAccessDecision.evidenceRefs` /
 *   `EnterpriseGrantRevocation.evidenceRefs`.
 * - `description?` -- optional human-readable documentation metadata,
 *   mirroring the `reason?`/`description?` precedent across this contract
 *   line.
 */
export interface EnterpriseUsageEvent {
  readonly schemaVersion: typeof ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly eventType: EnterpriseUsageEventType;
  readonly grantRef: CanonicalId;
  readonly resource: ResourceRef;
  readonly principalId: CanonicalId;
  readonly occurredAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  readonly metadata?: Readonly<Record<string, EnterpriseUsageEventMetadataValue>>;
  readonly evidenceRefs?: readonly CanonicalId[];
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Identity equality -- derives from event identity, timestamp, grant
// reference, and event type only (Phase 8's required basis: "event
// identity, timestamp, grant reference, event type"), never from `resource`,
// `principalId`, or any other field, and never from runtime execution (this
// contract has no execution-shaped field to begin with). Resource identity,
// where it *does* participate (in full structural equality below), delegates
// entirely to `resourceRefIdentityEquals`, already canonical for
// `ResourceRef` in `@aoc-enterprise/resource-envelope` -- this module never
// defines a second identity algorithm.
// ---------------------------------------------------------------------------

/**
 * Whether two usage events represent the same observed event: the same
 * event id, at the same observed instant, for the same grant, of the same
 * usage-event category. Two events can share identity while disagreeing on
 * every other field (e.g. a corrected `description` recorded after the
 * fact) -- see `enterpriseUsageEventEquals` for full structural equality.
 */
export function enterpriseUsageEventIdentityEquals(a: EnterpriseUsageEvent, b: EnterpriseUsageEvent): boolean {
  return a.id === b.id && a.occurredAt === b.occurredAt && a.grantRef === b.grantRef && a.eventType === b.eventType;
}

function recordAttributesEquals(a: Readonly<Record<string, string>> | undefined, b: Readonly<Record<string, string>> | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function metadataEquals(
  a: Readonly<Record<string, EnterpriseUsageEventMetadataValue>> | undefined,
  b: Readonly<Record<string, EnterpriseUsageEventMetadataValue>> | undefined,
): boolean {
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
 * Full structural equality: identity (via `enterpriseUsageEventIdentityEquals`)
 * plus every other field -- `resource` (identity, via `resourceRefIdentityEquals`,
 * plus `resource.attributes`), `principalId`, `correlationId`, `metadata`,
 * `evidenceRefs`, `description`, and `schemaVersion`. This satisfies Phase
 * 8's required basis and extends it to every remaining declarative field,
 * exactly as `enterpriseAccessGrantEquals`/`enterpriseGrantRevocationEquals`
 * extend their own identity functions.
 */
export function enterpriseUsageEventEquals(a: EnterpriseUsageEvent, b: EnterpriseUsageEvent): boolean {
  return (
    enterpriseUsageEventIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    resourceRefIdentityEquals(a.resource, b.resource) &&
    recordAttributesEquals(a.resource.attributes, b.resource.attributes) &&
    a.principalId === b.principalId &&
    a.correlationId === b.correlationId &&
    metadataEquals(a.metadata, b.metadata) &&
    optionalCanonicalIdArrayEquals(a.evidenceRefs, b.evidenceRefs) &&
    a.description === b.description
  );
}

// ---------------------------------------------------------------------------
// Validation -- internal consistency, required fields, reference integrity,
// timestamp consistency, and event-shape consistency for a single candidate
// (Phase 6). No provider validation, no network validation, no
// authorization/policy-correctness evaluation, no resource-existence check,
// no runtime-execution check. See `validateEnterpriseUsageEventSet` below
// for duplicate-event detection across a collection, which this function --
// operating on one candidate at a time -- cannot express.
// ---------------------------------------------------------------------------

export type EnterpriseUsageEventValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_EVENT_TYPE'
  | 'INVALID_EVENT_TYPE'
  | 'MISSING_GRANT_REF'
  | 'INVALID_GRANT_REF'
  | 'MISSING_RESOURCE'
  | 'INVALID_RESOURCE_IDENTITY'
  | 'MISSING_PRINCIPAL_ID'
  | 'INVALID_PRINCIPAL_ID'
  | 'MISSING_OCCURRED_AT'
  | 'INVALID_OCCURRED_AT'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_METADATA'
  | 'FORBIDDEN_METADATA_KEY'
  | 'INVALID_EVIDENCE_REFS'
  | 'INVALID_DESCRIPTION';

export interface EnterpriseUsageEventValidationIssue {
  readonly code: EnterpriseUsageEventValidationCode;
  readonly message: string;
}

export type EnterpriseUsageEventValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseUsageEventValidationIssue[] };

const USAGE_EVENT_TYPES: readonly EnterpriseUsageEventType[] = Object.values(ENTERPRISE_USAGE_EVENT_TYPES);
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Substrings of a `metadata` key that indicate a credential, token, or
 * URL/link is being smuggled through the one open extension point this
 * contract has, mirroring `EnterpriseAccessObligation`'s identical guard
 * (`FORBIDDEN_PARAMETER_KEY_SUBSTRINGS`) verbatim -- `metadata` is,
 * structurally, the same kind of open `Record<string, primitive>` field, and
 * this contract does not invent a second policy for the same risk. Matched
 * case-insensitively as a substring, not an exact key match.
 */
const FORBIDDEN_METADATA_KEY_SUBSTRINGS = [
  'apikey',
  'api-key',
  'token',
  'jwt',
  'credential',
  'password',
  'secret',
  'bearer',
  'url',
  'accesskey',
  'sessionid',
  'cookie',
];

function isForbiddenMetadataKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return FORBIDDEN_METADATA_KEY_SUBSTRINGS.some((forbidden) => normalized.includes(forbidden));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isMetadataValue(value: unknown): value is EnterpriseUsageEventMetadataValue {
  return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Validates internal consistency of a candidate usage event. Accepts
 * `unknown` so it can guard deserialized/external input, not just
 * already-typed values. Never inspects `grantRef`/`evidenceRefs` for
 * existence ("reference integrity" means well-formed non-empty identifiers,
 * never that the referenced grant or evidence record actually exists),
 * never contacts a provider, and never compares `occurredAt` against a
 * grant's own validity window (this contract does not know or assume the
 * shape of `EnterpriseAccessGrant`) -- only shape, required-field,
 * timestamp-format, and metadata consistency.
 */
export function validateEnterpriseUsageEvent(candidate: unknown): EnterpriseUsageEventValidationResult {
  const errors: EnterpriseUsageEventValidationIssue[] = [];

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Usage event must be an object.' }] };
  }

  if (candidate.schemaVersion !== ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION) {
    errors.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `schemaVersion must be '${ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION}'.`,
    });
  }

  if (!isNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (candidate.eventType === undefined) {
    errors.push({ code: 'MISSING_EVENT_TYPE', message: 'eventType is required.' });
  } else if (typeof candidate.eventType !== 'string' || !USAGE_EVENT_TYPES.includes(candidate.eventType as EnterpriseUsageEventType)) {
    errors.push({ code: 'INVALID_EVENT_TYPE', message: `eventType must be one of: ${USAGE_EVENT_TYPES.join(', ')}.` });
  }

  if (!isNonEmptyString(candidate.grantRef)) {
    errors.push({
      code: candidate.grantRef === undefined ? 'MISSING_GRANT_REF' : 'INVALID_GRANT_REF',
      message: 'grantRef is required and must be a non-empty string.',
    });
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

  if (!isNonEmptyString(candidate.principalId)) {
    errors.push({
      code: candidate.principalId === undefined ? 'MISSING_PRINCIPAL_ID' : 'INVALID_PRINCIPAL_ID',
      message: 'principalId is required and must be a non-empty string.',
    });
  }

  if (candidate.occurredAt === undefined) {
    errors.push({ code: 'MISSING_OCCURRED_AT', message: 'occurredAt is required.' });
  } else if (typeof candidate.occurredAt !== 'string' || !ISO_8601_PATTERN.test(candidate.occurredAt)) {
    errors.push({ code: 'INVALID_OCCURRED_AT', message: 'occurredAt must be an ISO 8601 UTC timestamp string.' });
  }

  if (!isNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.metadata !== undefined) {
    if (!isPlainObject(candidate.metadata)) {
      errors.push({ code: 'INVALID_METADATA', message: 'metadata must be a plain object when present.' });
    } else {
      for (const [key, value] of Object.entries(candidate.metadata)) {
        if (!isMetadataValue(value)) {
          errors.push({ code: 'INVALID_METADATA', message: `metadata.${key} must be a string, a finite number, or a boolean.` });
        }
        if (isForbiddenMetadataKey(key)) {
          errors.push({
            code: 'FORBIDDEN_METADATA_KEY',
            message: `metadata key '${key}' resembles a credential, token, or URL and is not permitted; usage events are declarative and provider-neutral.`,
          });
        }
      }
    }
  }

  if (candidate.evidenceRefs !== undefined) {
    if (!Array.isArray(candidate.evidenceRefs) || !candidate.evidenceRefs.every((ref) => isNonEmptyString(ref))) {
      errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
    }
  }

  if (candidate.description !== undefined && !isNonEmptyString(candidate.description)) {
    errors.push({ code: 'INVALID_DESCRIPTION', message: 'description must be a non-empty string when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Duplicate detection -- operates on a collection, not a single event (Phase
// 6: "duplicate detection"). A collection of usage events (e.g. every usage
// event ever recorded) must not declare the same event identity twice.
// Deliberately does *not* also forbid two events from sharing the same
// `grantRef`: unlike `EnterpriseGrantRevocation` (a grant is revoked at most
// once), a single grant is expected to be exercised, and observed, many
// times -- that repeatability is the entire reason this contract exists as
// a per-event record rather than a single mutable field on the grant.
// ---------------------------------------------------------------------------

export type EnterpriseUsageEventSetValidationCode = 'DUPLICATE_EVENT_ID';

export interface EnterpriseUsageEventSetValidationIssue {
  readonly code: EnterpriseUsageEventSetValidationCode;
  readonly message: string;
}

export type EnterpriseUsageEventSetValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseUsageEventSetValidationIssue[] };

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
 * Validates that no two usage events in `events` share the same `id`.
 * Deliberately a separate function from `validateEnterpriseUsageEvent`:
 * "duplicate" is a property of a collection, not of any single event, so it
 * cannot be expressed by that function's per-candidate signature. Does not
 * check individual event shape -- call `validateEnterpriseUsageEvent` for
 * that.
 */
export function validateEnterpriseUsageEventSet(events: readonly EnterpriseUsageEvent[]): EnterpriseUsageEventSetValidationResult {
  const errors: EnterpriseUsageEventSetValidationIssue[] = [];

  for (const id of findDuplicates(events.map((event) => event.id))) {
    errors.push({ code: 'DUPLICATE_EVENT_ID', message: `Usage event id '${id}' appears more than once in the set.` });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization -- stable, deterministic, provider-neutral, round-trip safe,
// forward compatible (Phase 7).
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseUsageEvent {
  readonly schemaVersion: string;
  readonly id: string;
  readonly eventType: string;
  readonly grantRef: string;
  readonly resource: {
    readonly kind: string;
    readonly id: string;
    readonly tenantId?: string;
    readonly attributes?: Readonly<Record<string, string>>;
  };
  readonly principalId: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly metadata?: Readonly<Record<string, EnterpriseUsageEventMetadataValue>>;
  readonly evidenceRefs?: readonly string[];
  readonly description?: string;
}

function sortedAttributes(attributes: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> | undefined {
  if (attributes === undefined) return undefined;
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(attributes).sort()) {
    sorted[key] = attributes[key] as string;
  }
  return sorted;
}

function sortedMetadata(
  metadata: Readonly<Record<string, EnterpriseUsageEventMetadataValue>> | undefined,
): Readonly<Record<string, EnterpriseUsageEventMetadataValue>> | undefined {
  if (metadata === undefined) return undefined;
  const sorted: Record<string, EnterpriseUsageEventMetadataValue> = {};
  for (const key of Object.keys(metadata).sort()) {
    sorted[key] = metadata[key] as EnterpriseUsageEventMetadataValue;
  }
  return sorted;
}

/** Projects an `EnterpriseUsageEvent` to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already a valid `EnterpriseUsageEvent` by construction. */
export function serializeEnterpriseUsageEvent(event: EnterpriseUsageEvent): SerializedEnterpriseUsageEvent {
  const attributes = sortedAttributes(event.resource.attributes);
  const metadata = sortedMetadata(event.metadata);
  const evidenceRefs = event.evidenceRefs === undefined ? undefined : [...event.evidenceRefs].sort();

  return {
    schemaVersion: event.schemaVersion,
    id: event.id,
    eventType: event.eventType,
    grantRef: event.grantRef,
    resource: {
      kind: event.resource.kind,
      id: event.resource.id,
      ...(event.resource.tenantId === undefined ? {} : { tenantId: event.resource.tenantId }),
      ...(attributes === undefined ? {} : { attributes }),
    },
    principalId: event.principalId,
    occurredAt: event.occurredAt,
    correlationId: event.correlationId,
    ...(metadata === undefined ? {} : { metadata }),
    ...(evidenceRefs === undefined ? {} : { evidenceRefs }),
    ...(event.description === undefined ? {} : { description: event.description }),
  };
}

/**
 * Thrown by `deserializeEnterpriseUsageEvent` when the input fails
 * `validateEnterpriseUsageEvent`. Carries the full issue list rather than
 * just the first, matching `EnterpriseUsageEventValidationResult`.
 */
export class EnterpriseUsageEventValidationError extends Error {
  readonly issues: readonly EnterpriseUsageEventValidationIssue[];

  constructor(issues: readonly EnterpriseUsageEventValidationIssue[]) {
    super(`Invalid EnterpriseUsageEvent: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseUsageEventValidationError';
    this.issues = issues;
  }
}

/**
 * Parses and validates a candidate value (e.g. `JSON.parse` output) into an
 * `EnterpriseUsageEvent`. Every field is mapped explicitly from the
 * validated candidate -- no structural cast (`as EnterpriseUsageEvent`) over
 * unchecked input, matching the convention already established in
 * `@aoc-enterprise/resource-envelope`, `@aoc-enterprise/access-decision`,
 * `@aoc-enterprise/access-obligation`, `@aoc-enterprise/access-grant`, and
 * `@aoc-enterprise/grant-revocation`.
 *
 * Throws `EnterpriseUsageEventValidationError` when validation fails.
 */
export function deserializeEnterpriseUsageEvent(candidate: unknown): EnterpriseUsageEvent {
  const result = validateEnterpriseUsageEvent(candidate);
  if (!result.valid) {
    throw new EnterpriseUsageEventValidationError(result.errors);
  }

  // Validated above: `candidate` has the required shape of a
  // SerializedEnterpriseUsageEvent. Read through a narrow local view instead
  // of casting the whole object to EnterpriseUsageEvent.
  const value = candidate as SerializedEnterpriseUsageEvent;

  const resource: ResourceRef = {
    kind: value.resource.kind,
    id: value.resource.id,
    ...(value.resource.tenantId === undefined ? {} : { tenantId: value.resource.tenantId }),
    ...(value.resource.attributes === undefined ? {} : { attributes: { ...value.resource.attributes } }),
  };

  return {
    schemaVersion: ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION,
    id: value.id,
    eventType: value.eventType as EnterpriseUsageEventType,
    grantRef: value.grantRef,
    resource,
    principalId: value.principalId,
    occurredAt: value.occurredAt,
    correlationId: value.correlationId,
    ...(value.metadata === undefined ? {} : { metadata: { ...value.metadata } }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
    ...(value.description === undefined ? {} : { description: value.description }),
  };
}
