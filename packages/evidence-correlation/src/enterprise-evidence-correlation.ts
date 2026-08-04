import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import { resourceRefIdentityEquals } from '@aoc-enterprise/resource-envelope';

/**
 * Enterprise composition over every other contract in the R004 line --
 * `EnterpriseResourceEnvelope` (R004.D), `EnterpriseAccessDecision` (R004.E),
 * `EnterpriseAccessObligation` (R004.F), `EnterpriseAccessGrant` (R004.G),
 * `EnterpriseGrantRevocation` (R004.H), and `EnterpriseUsageEvent` (R004.I)
 * -- and, by identity primitive, over AOC Protocol's `ResourceRef`.
 *
 * Every contract beneath this one is the immutable record of a single fact
 * about a governed access lifecycle: a resource was registered, a request
 * was evaluated, a condition was attached, an authorization was issued, that
 * authorization ended, that authorization was used. None of them, on its
 * own, answers a question that spans the lifecycle: *"which of these facts
 * belong together, as the record of one governed access lifecycle for one
 * resource?"* `EnterpriseEvidenceCorrelation` is the immutable, terminal,
 * graph-shaped contract that answers exactly that question -- **and only
 * that question**.
 *
 * It composes every other contract in the line **by opaque reference only**:
 * `resource: ResourceRef` (the same identity-only composition style
 * `EnterpriseAccessGrant.resource` / `EnterpriseUsageEvent.resource` already
 * establish -- never the full `EnterpriseResourceEnvelope`), `decisionRefs`
 * (pointing at `EnterpriseAccessDecision.correlationId`, since a decision has
 * no `id` field of its own -- see that package's identity-equals function),
 * `obligationRefs`/`grantRefs`/`usageRefs`/`revocationRefs` (each pointing at
 * the referenced record's own `id`, mirroring `EnterpriseGrantRevocation.grantRef`
 * / `EnterpriseUsageEvent.grantRef` / `EnterpriseAccessGrant.obligationRefs`).
 * It never embeds, imports, duplicates, or extends the shape of any of them.
 *
 * This is a pure data contract: no persistence, no service, no API, no
 * provider SDK, no provider credential, no JWT, no OAuth token, no signed
 * URL, no runtime session, no execution engine, no enforcement, no logging,
 * no storage, no audit execution, no analytics, no telemetry. It does not
 * generate evidence, collect logs, or execute providers -- it represents the
 * canonical correlation graph connecting immutable business artifacts that
 * were produced elsewhere, by other contracts, at other times.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/evidence-correlation`).
 *
 * See the package README for the full design rationale, ownership boundary,
 * and relationship to every contract in the R004 line, plus future
 * ProviderAdapters, Audit, Compliance, and SIEM consumers.
 */
export const ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION = '1.0.0' as const;

/**
 * A value carried by a correlation's `metadata` bag. Restricted to JSON
 * primitives -- never an object, array, function, or class instance -- so
 * `metadata` can never smuggle a runtime object, a provider client, or a
 * nested credential-shaped value through the one genuinely open extension
 * point this contract has, mirroring `EnterpriseUsageEventMetadataValue`
 * (`@aoc-enterprise/usage-event`) and `EnterpriseAccessObligationParameterValue`
 * (`@aoc-enterprise/access-obligation`) verbatim, plus their complementary
 * `FORBIDDEN_METADATA_KEY` guard on `metadata` key names (see
 * `validateEnterpriseEvidenceCorrelation`).
 */
export type EnterpriseEvidenceCorrelationMetadataValue = string | number | boolean;

/**
 * The canonical Enterprise-owned contract for **the immutable correlation
 * graph connecting the immutable business artifacts produced across one
 * governed access lifecycle for one resource**. See the package README for
 * the full design rationale, ownership boundary, and relationship to every
 * contract in the R004 line.
 *
 * Field groups (Phase 3 -- this contract represents *only* these fields):
 * - `id` -- correlation identity, minted once per correlation graph. Unique
 *   within any collection of correlation records (see
 *   `validateEnterpriseEvidenceCorrelationSet`'s `DUPLICATE_CORRELATION_ID`).
 * - `resource` -- the correlated resource reference: which governed resource
 *   initiated this lifecycle, composing Protocol's `ResourceRef` directly
 *   (identity only -- never the full `EnterpriseResourceEnvelope`), the same
 *   identity-only composition style `EnterpriseAccessGrant.resource` /
 *   `EnterpriseUsageEvent.resource` already establish.
 * - `decisionRefs` -- correlated decision references: which
 *   `EnterpriseAccessDecision` record(s) this graph correlates, each an
 *   opaque pointer to that decision's own `correlationId` (a decision has no
 *   `id` field -- see `@aoc-enterprise/access-decision`). Required and
 *   non-empty: every governed access lifecycle in the R004 line begins with
 *   an evaluated decision: this is the one reference kind this contract
 *   cannot correlate a lifecycle without (see "Required references" in
 *   `validateEnterpriseEvidenceCorrelation`).
 * - `obligationRefs?` -- correlated obligation references: opaque pointers
 *   to `EnterpriseAccessObligation.id`. Optional: a decision can carry zero
 *   obligations.
 * - `grantRefs?` -- correlated grant references: opaque pointers to
 *   `EnterpriseAccessGrant.id`. Optional: a decision does not always result
 *   in an issued grant (e.g. `outcome: 'deny'`).
 * - `usageRefs?` -- correlated usage references: opaque pointers to
 *   `EnterpriseUsageEvent.id`. Optional: a grant may not yet have been
 *   exercised.
 * - `revocationRefs?` -- correlated revocation references: opaque pointers
 *   to `EnterpriseGrantRevocation.id`. Optional: a grant may still be
 *   active.
 * - `correlatedAt` -- the correlation timestamp: when this graph was formed,
 *   as an immutable business fact. Not compared against any referenced
 *   record's own timestamp (this contract does not know or assume the shape
 *   of any of them -- see "Explicit non-responsibilities" in the README).
 * - `metadata?` -- correlation metadata: provider-neutral, declarative
 *   metadata about the correlation itself (e.g. a caller-defined correlation
 *   basis or batch identifier). Restricted to JSON primitives and to key
 *   names that do not resemble a credential, token, or URL (see
 *   `validateEnterpriseEvidenceCorrelation`), mirroring
 *   `EnterpriseUsageEvent.metadata` / `EnterpriseAccessObligation.parameters`.
 * - `description?` -- documentation metadata: optional human-readable
 *   documentation, mirroring the `reason?`/`description?` precedent across
 *   this contract line.
 * - `schemaVersion` -- version metadata, the same `schemaVersion` pattern
 *   every other contract in this line carries.
 */
export interface EnterpriseEvidenceCorrelation {
  readonly schemaVersion: typeof ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly resource: ResourceRef;
  readonly decisionRefs: readonly CanonicalId[];
  readonly correlatedAt: UtcDateTime;
  readonly obligationRefs?: readonly CanonicalId[];
  readonly grantRefs?: readonly CanonicalId[];
  readonly usageRefs?: readonly CanonicalId[];
  readonly revocationRefs?: readonly CanonicalId[];
  readonly metadata?: Readonly<Record<string, EnterpriseEvidenceCorrelationMetadataValue>>;
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Identity equality -- derives from correlation identity, resource, and
// graph composition (Phase 8's required basis: "correlation identity,
// resource, graph composition"), never from `correlatedAt`, `metadata`,
// `description`, or runtime execution (this contract has no
// execution-shaped field to begin with). Resource identity delegates
// entirely to `resourceRefIdentityEquals`, already canonical for
// `ResourceRef` in `@aoc-enterprise/resource-envelope` -- this module never
// defines a second identity algorithm.
// ---------------------------------------------------------------------------

function canonicalIdSetEquals(a: readonly string[], b: readonly string[]): boolean {
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.length === bSorted.length && aSorted.every((value, index) => value === bSorted[index]);
}

function optionalCanonicalIdSetEquals(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return canonicalIdSetEquals(a, b);
}

/**
 * Whether two correlation graphs represent the same correlated lifecycle:
 * the same correlation identity, for the same resource, connecting the same
 * set of decision/obligation/grant/usage/revocation references ("graph
 * composition" -- compared as sets, not sequences, since reference
 * construction order carries no meaning). Two graphs can share identity
 * while disagreeing on every other field (e.g. a corrected `description`
 * recorded after the fact) -- see `enterpriseEvidenceCorrelationEquals` for
 * full structural equality.
 */
export function enterpriseEvidenceCorrelationIdentityEquals(
  a: EnterpriseEvidenceCorrelation,
  b: EnterpriseEvidenceCorrelation,
): boolean {
  return (
    a.id === b.id &&
    resourceRefIdentityEquals(a.resource, b.resource) &&
    canonicalIdSetEquals(a.decisionRefs, b.decisionRefs) &&
    optionalCanonicalIdSetEquals(a.obligationRefs, b.obligationRefs) &&
    optionalCanonicalIdSetEquals(a.grantRefs, b.grantRefs) &&
    optionalCanonicalIdSetEquals(a.usageRefs, b.usageRefs) &&
    optionalCanonicalIdSetEquals(a.revocationRefs, b.revocationRefs)
  );
}

function recordEquals(a: Readonly<Record<string, string>> | undefined, b: Readonly<Record<string, string>> | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function metadataEquals(
  a: Readonly<Record<string, EnterpriseEvidenceCorrelationMetadataValue>> | undefined,
  b: Readonly<Record<string, EnterpriseEvidenceCorrelationMetadataValue>> | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

/**
 * Full structural equality: identity (via
 * `enterpriseEvidenceCorrelationIdentityEquals`) plus every other field --
 * `schemaVersion`, `correlatedAt`, `metadata`, `description`, and
 * `resource.attributes` (descriptive, excluded from identity the same way
 * `resourceRefIdentityEquals` excludes it). This satisfies Phase 8's basis
 * and extends it to every remaining declarative field, exactly as
 * `enterpriseAccessGrantEquals`/`enterpriseUsageEventEquals` extend their
 * own identity functions.
 */
export function enterpriseEvidenceCorrelationEquals(a: EnterpriseEvidenceCorrelation, b: EnterpriseEvidenceCorrelation): boolean {
  return (
    enterpriseEvidenceCorrelationIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    recordEquals(a.resource.attributes, b.resource.attributes) &&
    a.correlatedAt === b.correlatedAt &&
    metadataEquals(a.metadata, b.metadata) &&
    a.description === b.description
  );
}

// ---------------------------------------------------------------------------
// Validation -- required references, duplicate references, graph
// consistency, timestamp consistency, and reference integrity only (Phase
// 6). No provider availability, no network, no storage, no authorization, no
// runtime execution, no existence checks (this function never confirms that
// a referenced decision/obligation/grant/usage/revocation record actually
// exists -- "reference integrity" here means well-formed non-empty
// identifiers, the same meaning it carries in every other contract in this
// line).
// ---------------------------------------------------------------------------

export type EnterpriseEvidenceCorrelationValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_RESOURCE'
  | 'INVALID_RESOURCE_IDENTITY'
  | 'MISSING_DECISION_REFS'
  | 'INVALID_DECISION_REFS'
  | 'DUPLICATE_DECISION_REF'
  | 'INVALID_OBLIGATION_REFS'
  | 'DUPLICATE_OBLIGATION_REF'
  | 'INVALID_GRANT_REFS'
  | 'DUPLICATE_GRANT_REF'
  | 'INVALID_USAGE_REFS'
  | 'DUPLICATE_USAGE_REF'
  | 'INVALID_REVOCATION_REFS'
  | 'DUPLICATE_REVOCATION_REF'
  | 'USAGE_WITHOUT_GRANT'
  | 'REVOCATION_WITHOUT_GRANT'
  | 'MISSING_CORRELATED_AT'
  | 'INVALID_CORRELATED_AT'
  | 'INVALID_METADATA'
  | 'FORBIDDEN_METADATA_KEY'
  | 'INVALID_DESCRIPTION';

export interface EnterpriseEvidenceCorrelationValidationIssue {
  readonly code: EnterpriseEvidenceCorrelationValidationCode;
  readonly message: string;
}

export type EnterpriseEvidenceCorrelationValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseEvidenceCorrelationValidationIssue[] };

const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Substrings of a `metadata` key that indicate a credential, token, or
 * URL/link is being smuggled through the one open extension point this
 * contract has, mirroring `EnterpriseUsageEvent`'s identical guard
 * (`FORBIDDEN_METADATA_KEY_SUBSTRINGS`) verbatim -- `metadata` is,
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

function isMetadataValue(value: unknown): value is EnterpriseEvidenceCorrelationMetadataValue {
  return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
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

function validateRequiredCanonicalIdArray(
  candidate: unknown,
  missingCode: 'MISSING_DECISION_REFS',
  invalidCode: 'INVALID_DECISION_REFS',
  duplicateCode: 'DUPLICATE_DECISION_REF',
  fieldName: string,
  errors: EnterpriseEvidenceCorrelationValidationIssue[],
): void {
  if (candidate === undefined) {
    errors.push({ code: missingCode, message: `${fieldName} is required and must be a non-empty array of non-empty strings.` });
    return;
  }
  if (!Array.isArray(candidate) || candidate.length === 0 || !candidate.every((ref) => isNonEmptyString(ref))) {
    errors.push({ code: invalidCode, message: `${fieldName} must be a non-empty array of non-empty strings.` });
    return;
  }
  for (const duplicate of findDuplicateStrings(candidate)) {
    errors.push({ code: duplicateCode, message: `${fieldName} contains '${duplicate}' more than once.` });
  }
}

function validateOptionalCanonicalIdArray(
  candidate: unknown,
  invalidCode:
    | 'INVALID_OBLIGATION_REFS'
    | 'INVALID_GRANT_REFS'
    | 'INVALID_USAGE_REFS'
    | 'INVALID_REVOCATION_REFS',
  duplicateCode:
    | 'DUPLICATE_OBLIGATION_REF'
    | 'DUPLICATE_GRANT_REF'
    | 'DUPLICATE_USAGE_REF'
    | 'DUPLICATE_REVOCATION_REF',
  fieldName: string,
  errors: EnterpriseEvidenceCorrelationValidationIssue[],
): void {
  if (candidate === undefined) return;
  if (!Array.isArray(candidate) || candidate.length === 0 || !candidate.every((ref) => isNonEmptyString(ref))) {
    errors.push({ code: invalidCode, message: `${fieldName} must be a non-empty array of non-empty strings when present.` });
    return;
  }
  for (const duplicate of findDuplicateStrings(candidate)) {
    errors.push({ code: duplicateCode, message: `${fieldName} contains '${duplicate}' more than once.` });
  }
}

/**
 * Validates internal consistency of a candidate correlation graph. Accepts
 * `unknown` so it can guard deserialized/external input, not just
 * already-typed values. Never inspects any reference field for existence
 * (whether the referenced decision/obligation/grant/usage/revocation record
 * actually exists is out of scope -- "reference integrity" means well-formed
 * non-empty identifiers only), never contacts a provider, and never
 * evaluates whether the correlation is "correct" in any authorization or
 * policy sense -- only required-field, duplicate-reference,
 * graph-consistency, and timestamp-format consistency.
 *
 * "Graph consistency" (Phase 6) is checked as two purely structural
 * implications, never as an existence check against any other record: a
 * usage record cannot be correlated without also correlating the grant it
 * reports usage of (`USAGE_WITHOUT_GRANT`), and a revocation record cannot
 * be correlated without also correlating the grant it revokes
 * (`REVOCATION_WITHOUT_GRANT`) -- mirroring the R004 composition line's own
 * reference relationships (`EnterpriseUsageEvent.grantRef`,
 * `EnterpriseGrantRevocation.grantRef`).
 */
export function validateEnterpriseEvidenceCorrelation(candidate: unknown): EnterpriseEvidenceCorrelationValidationResult {
  const errors: EnterpriseEvidenceCorrelationValidationIssue[] = [];

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Correlation graph must be an object.' }] };
  }

  if (candidate.schemaVersion !== ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION) {
    errors.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `schemaVersion must be '${ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION}'.`,
    });
  }

  if (!isNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
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

  validateRequiredCanonicalIdArray(candidate.decisionRefs, 'MISSING_DECISION_REFS', 'INVALID_DECISION_REFS', 'DUPLICATE_DECISION_REF', 'decisionRefs', errors);
  validateOptionalCanonicalIdArray(candidate.obligationRefs, 'INVALID_OBLIGATION_REFS', 'DUPLICATE_OBLIGATION_REF', 'obligationRefs', errors);
  validateOptionalCanonicalIdArray(candidate.grantRefs, 'INVALID_GRANT_REFS', 'DUPLICATE_GRANT_REF', 'grantRefs', errors);
  validateOptionalCanonicalIdArray(candidate.usageRefs, 'INVALID_USAGE_REFS', 'DUPLICATE_USAGE_REF', 'usageRefs', errors);
  validateOptionalCanonicalIdArray(candidate.revocationRefs, 'INVALID_REVOCATION_REFS', 'DUPLICATE_REVOCATION_REF', 'revocationRefs', errors);

  const hasGrantRefs = Array.isArray(candidate.grantRefs) && candidate.grantRefs.length > 0;
  if (Array.isArray(candidate.usageRefs) && candidate.usageRefs.length > 0 && !hasGrantRefs) {
    errors.push({
      code: 'USAGE_WITHOUT_GRANT',
      message: 'usageRefs is populated but grantRefs is not -- a correlated usage record must correlate the grant it reports usage of.',
    });
  }
  if (Array.isArray(candidate.revocationRefs) && candidate.revocationRefs.length > 0 && !hasGrantRefs) {
    errors.push({
      code: 'REVOCATION_WITHOUT_GRANT',
      message: 'revocationRefs is populated but grantRefs is not -- a correlated revocation record must correlate the grant it revokes.',
    });
  }

  if (candidate.correlatedAt === undefined) {
    errors.push({ code: 'MISSING_CORRELATED_AT', message: 'correlatedAt is required.' });
  } else if (typeof candidate.correlatedAt !== 'string' || !ISO_8601_PATTERN.test(candidate.correlatedAt)) {
    errors.push({ code: 'INVALID_CORRELATED_AT', message: 'correlatedAt must be an ISO 8601 UTC timestamp string.' });
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
            message: `metadata key '${key}' resembles a credential, token, or URL and is not permitted; correlation graphs are declarative and provider-neutral.`,
          });
        }
      }
    }
  }

  if (candidate.description !== undefined && !isNonEmptyString(candidate.description)) {
    errors.push({ code: 'INVALID_DESCRIPTION', message: 'description must be a non-empty string when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Duplicate detection -- operates on a collection, not a single graph (Phase
// 6: "duplicate references" at the collection level). A collection of
// correlation graphs (e.g. every correlation ever recorded) must not declare
// the same correlation identity twice.
// ---------------------------------------------------------------------------

export type EnterpriseEvidenceCorrelationSetValidationCode = 'DUPLICATE_CORRELATION_ID';

export interface EnterpriseEvidenceCorrelationSetValidationIssue {
  readonly code: EnterpriseEvidenceCorrelationSetValidationCode;
  readonly message: string;
}

export type EnterpriseEvidenceCorrelationSetValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseEvidenceCorrelationSetValidationIssue[] };

/**
 * Validates that no two correlation graphs in `correlations` share the same
 * `id`. Deliberately a separate function from
 * `validateEnterpriseEvidenceCorrelation`: "duplicate" is a property of a
 * collection, not of any single graph, so it cannot be expressed by that
 * function's per-candidate signature. Does not check individual graph
 * shape -- call `validateEnterpriseEvidenceCorrelation` for that.
 */
export function validateEnterpriseEvidenceCorrelationSet(
  correlations: readonly EnterpriseEvidenceCorrelation[],
): EnterpriseEvidenceCorrelationSetValidationResult {
  const errors: EnterpriseEvidenceCorrelationSetValidationIssue[] = [];

  for (const id of findDuplicateStrings(correlations.map((correlation) => correlation.id))) {
    errors.push({ code: 'DUPLICATE_CORRELATION_ID', message: `Correlation id '${id}' appears more than once in the set.` });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization -- stable, deterministic, provider-neutral, round-trip safe,
// forward compatible (Phase 7).
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseEvidenceCorrelation {
  readonly schemaVersion: string;
  readonly id: string;
  readonly resource: {
    readonly kind: string;
    readonly id: string;
    readonly tenantId?: string;
    readonly attributes?: Readonly<Record<string, string>>;
  };
  readonly decisionRefs: readonly string[];
  readonly correlatedAt: string;
  readonly obligationRefs?: readonly string[];
  readonly grantRefs?: readonly string[];
  readonly usageRefs?: readonly string[];
  readonly revocationRefs?: readonly string[];
  readonly metadata?: Readonly<Record<string, EnterpriseEvidenceCorrelationMetadataValue>>;
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
  metadata: Readonly<Record<string, EnterpriseEvidenceCorrelationMetadataValue>> | undefined,
): Readonly<Record<string, EnterpriseEvidenceCorrelationMetadataValue>> | undefined {
  if (metadata === undefined) return undefined;
  const sorted: Record<string, EnterpriseEvidenceCorrelationMetadataValue> = {};
  for (const key of Object.keys(metadata).sort()) {
    sorted[key] = metadata[key] as EnterpriseEvidenceCorrelationMetadataValue;
  }
  return sorted;
}

/** Projects an `EnterpriseEvidenceCorrelation` to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already a valid `EnterpriseEvidenceCorrelation` by construction. */
export function serializeEnterpriseEvidenceCorrelation(correlation: EnterpriseEvidenceCorrelation): SerializedEnterpriseEvidenceCorrelation {
  const attributes = sortedAttributes(correlation.resource.attributes);
  const metadata = sortedMetadata(correlation.metadata);
  const obligationRefs = correlation.obligationRefs === undefined ? undefined : [...correlation.obligationRefs].sort();
  const grantRefs = correlation.grantRefs === undefined ? undefined : [...correlation.grantRefs].sort();
  const usageRefs = correlation.usageRefs === undefined ? undefined : [...correlation.usageRefs].sort();
  const revocationRefs = correlation.revocationRefs === undefined ? undefined : [...correlation.revocationRefs].sort();

  return {
    schemaVersion: correlation.schemaVersion,
    id: correlation.id,
    resource: {
      kind: correlation.resource.kind,
      id: correlation.resource.id,
      ...(correlation.resource.tenantId === undefined ? {} : { tenantId: correlation.resource.tenantId }),
      ...(attributes === undefined ? {} : { attributes }),
    },
    decisionRefs: [...correlation.decisionRefs].sort(),
    correlatedAt: correlation.correlatedAt,
    ...(obligationRefs === undefined ? {} : { obligationRefs }),
    ...(grantRefs === undefined ? {} : { grantRefs }),
    ...(usageRefs === undefined ? {} : { usageRefs }),
    ...(revocationRefs === undefined ? {} : { revocationRefs }),
    ...(metadata === undefined ? {} : { metadata }),
    ...(correlation.description === undefined ? {} : { description: correlation.description }),
  };
}

/**
 * Thrown by `deserializeEnterpriseEvidenceCorrelation` when the input fails
 * `validateEnterpriseEvidenceCorrelation`. Carries the full issue list rather
 * than just the first, matching `EnterpriseEvidenceCorrelationValidationResult`.
 */
export class EnterpriseEvidenceCorrelationValidationError extends Error {
  readonly issues: readonly EnterpriseEvidenceCorrelationValidationIssue[];

  constructor(issues: readonly EnterpriseEvidenceCorrelationValidationIssue[]) {
    super(`Invalid EnterpriseEvidenceCorrelation: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseEvidenceCorrelationValidationError';
    this.issues = issues;
  }
}

/**
 * Parses and validates a candidate value (e.g. `JSON.parse` output) into an
 * `EnterpriseEvidenceCorrelation`. Every field is mapped explicitly from the
 * validated candidate -- no structural cast (`as EnterpriseEvidenceCorrelation`)
 * over unchecked input, matching the convention already established in
 * `@aoc-enterprise/resource-envelope`, `@aoc-enterprise/access-decision`,
 * `@aoc-enterprise/access-obligation`, `@aoc-enterprise/access-grant`,
 * `@aoc-enterprise/grant-revocation`, and `@aoc-enterprise/usage-event`.
 *
 * Throws `EnterpriseEvidenceCorrelationValidationError` when validation
 * fails.
 */
export function deserializeEnterpriseEvidenceCorrelation(candidate: unknown): EnterpriseEvidenceCorrelation {
  const result = validateEnterpriseEvidenceCorrelation(candidate);
  if (!result.valid) {
    throw new EnterpriseEvidenceCorrelationValidationError(result.errors);
  }

  // Validated above: `candidate` has the required shape of a
  // SerializedEnterpriseEvidenceCorrelation. Read through a narrow local view
  // instead of casting the whole object to EnterpriseEvidenceCorrelation.
  const value = candidate as SerializedEnterpriseEvidenceCorrelation;

  const resource: ResourceRef = {
    kind: value.resource.kind,
    id: value.resource.id,
    ...(value.resource.tenantId === undefined ? {} : { tenantId: value.resource.tenantId }),
    ...(value.resource.attributes === undefined ? {} : { attributes: { ...value.resource.attributes } }),
  };

  return {
    schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
    id: value.id,
    resource,
    decisionRefs: [...value.decisionRefs],
    correlatedAt: value.correlatedAt,
    ...(value.obligationRefs === undefined ? {} : { obligationRefs: [...value.obligationRefs] }),
    ...(value.grantRefs === undefined ? {} : { grantRefs: [...value.grantRefs] }),
    ...(value.usageRefs === undefined ? {} : { usageRefs: [...value.usageRefs] }),
    ...(value.revocationRefs === undefined ? {} : { revocationRefs: [...value.revocationRefs] }),
    ...(value.metadata === undefined ? {} : { metadata: { ...value.metadata } }),
    ...(value.description === undefined ? {} : { description: value.description }),
  };
}
