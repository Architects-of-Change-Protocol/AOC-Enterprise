import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import { resourceRefIdentityEquals } from '@aoc-enterprise/resource-envelope';
import type { EnterpriseProviderCapability } from '@aoc-enterprise/provider-adapter';
import { ENTERPRISE_PROVIDER_CAPABILITIES } from '@aoc-enterprise/provider-adapter';

/**
 * The canonical, immutable **Provider Translation Model** (R005.B).
 *
 * `ADR-ACCESS-LIFECYCLE.md` (R005.0) names "Provider Translation" as the
 * step between an issued `EnterpriseAccessGrant` (`@aoc-enterprise/access-grant`)
 * and unmodeled, provider-specific "Provider Execution": *"the grant is
 * translated into provider-specific execution input (a presigned URL
 * request, a scoped SDK call, a SAS request)."* `ADR-PROVIDER-ADAPTER-CONTRACT.md`
 * (R005.A) then fixed the compile-time-enforced *read boundary* a Provider
 * Adapter may use to perform that translation (`EnterpriseGrantTranslationInput`,
 * `EnterpriseGrantRevocationInterpretationInput`) but deliberately defined no
 * output: *"No Provider Translation output type, and no Provider Execution
 * type, is defined anywhere in this package."*
 *
 * This package is that output type -- but only its provider-neutral,
 * pre-execution half. `EnterpriseProviderTranslation` is the immutable
 * record of *what a Provider Adapter decided a grant should become*: which
 * provider, which capability, which provider-neutral execution intent, for
 * which grant and resource. It answers *"what should the Provider Adapter
 * ask the provider to do?"* -- never *"did the provider actually do it?"*
 * (that is `EnterpriseUsageEvent`'s job, `@aoc-enterprise/usage-event`,
 * emitted only after real Provider Execution -- entirely outside this
 * package, as it always has been).
 *
 * A `EnterpriseProviderTranslation` is not provider execution, not a
 * provider SDK, not a network request, not a signed URL, not a provider
 * credential. It is the canonical intermediate artifact between Enterprise
 * and Provider execution: the last thing Enterprise-adjacent code can
 * reason about before a provider-specific, unmodeled implementation takes
 * over. Once produced, this record is never updated to reflect what a
 * provider did -- a new `EnterpriseUsageEvent` is emitted for that,
 * referencing this translation's `grantRef`, never this translation's `id`.
 *
 * This is a pure data contract: no persistence, no service, no API, no
 * provider SDK, no HTTP client, no credential, no signed/temporary URL, no
 * retry logic, no telemetry, no logging, no runtime execution, no
 * enforcement, no orchestration. See the package README for the full design
 * rationale and the R005.0/R005.A boundary this contract sits on top of.
 *
 * Ownership: Soberanía Enterprise (`@aoc-enterprise/provider-translation`).
 */
export const ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Execution intent vocabulary (R005.B Phase 4) -- provider-neutral, closed,
// and searched for reuse before being introduced. `src/features/action-enforcement/domain/execution-intent.ts`
// already defines an `ExecutionIntent` type in this repository, but it is a
// distinct, kernel-level runtime-enforcement concept (`action`, `riskLevel`,
// `sideEffectType`, `resourceScope` -- a kernel action's own shape) with no
// relationship to Access Governance grant translation; reusing it would
// conflate two unrelated domains, not avoid a duplicate. No provider-neutral
// vocabulary of "what a grant translation is asking a provider to do"
// exists anywhere else in this repository, so this is a new, minimum-required
// vocabulary, not a reuse -- built from R005.B's own named examples verbatim.
// ---------------------------------------------------------------------------

/**
 * The canonical, closed, five-value vocabulary of provider-neutral execution
 * intents a `EnterpriseProviderTranslation` may declare. Each value
 * describes *what the translation is asking a provider to realize*, never
 * *whether it succeeded* (that is `EnterpriseUsageEvent`'s job, entirely
 * outside this package): `'ProvideTemporaryAccess'` asks a provider to
 * grant time-bounded access to a resource (a presigned URL, a SAS token, a
 * scoped share link -- the provider's own, unmodeled choice, never named
 * here); `'ProvideReadOnlyAccess'` asks for the same, constrained to
 * read-only (mirroring the `'read-only'` `EnterpriseAccessObligationType`,
 * `@aoc-enterprise/access-obligation`, without embedding or redefining it);
 * `'ProvideMetadata'` asks a provider to surface descriptive metadata about
 * a resource, never the resource's bytes; `'RegisterUsage'` asks a provider
 * to record, on its own side, that a grant is being exercised, distinct
 * from the `EnterpriseUsageEvent` Enterprise itself records after the fact;
 * `'InvalidateGrant'` asks a provider to stop honoring a grant, the
 * translation-side counterpart to `EnterpriseGrantRevocation`
 * (`@aoc-enterprise/grant-revocation`) being read via
 * `EnterpriseGrantRevocationInterpretationInput`
 * (`@aoc-enterprise/provider-adapter`).
 *
 * This is deliberately a closed union, not an open string, matching every
 * other closed vocabulary in this Enterprise contract line (see
 * "Non-negotiable rules" -- no provider-specific intent, e.g. no
 * `'PinPinataObject'` or `'IssueS3PresignedUrl'`, appears here, and none
 * ever will). A future intent is a `schemaVersion` change to this package,
 * never an escape hatch.
 */
export const ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS = {
  PROVIDE_TEMPORARY_ACCESS: 'ProvideTemporaryAccess',
  PROVIDE_READ_ONLY_ACCESS: 'ProvideReadOnlyAccess',
  PROVIDE_METADATA: 'ProvideMetadata',
  REGISTER_USAGE: 'RegisterUsage',
  INVALIDATE_GRANT: 'InvalidateGrant',
} as const;

export type EnterpriseProviderTranslationExecutionIntent =
  (typeof ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS)[keyof typeof ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS];

/**
 * The pure, total mapping from an `EnterpriseProviderTranslationExecutionIntent`
 * onto the single `EnterpriseProviderCapability` (`@aoc-enterprise/provider-adapter`)
 * a Provider Adapter must have declared to realize it. This is the concrete
 * basis for `validateEnterpriseProviderTranslation`'s "capability
 * consistency" check (R005.B Phase 6): a translation whose `capability`
 * field disagrees with the capability its own `executionIntent` requires is
 * internally inconsistent, independent of whether any particular adapter
 * actually declared that capability (this package never reads an
 * `EnterpriseProviderCapabilityDeclaration` -- that cross-check, if ever
 * performed, is a future caller's job, composing both packages itself).
 *
 * `'ProvideReadOnlyAccess'` maps to the same capability as
 * `'ProvideTemporaryAccess'` (`SupportsTemporaryAccess`): both ask a
 * provider to grant access under this package's translation model, and
 * "read-only" narrows *what kind* of access, not *which capability
 * category* realizes it -- there is no dedicated read-only capability in
 * the closed `EnterpriseProviderCapability` vocabulary, by that vocabulary's
 * own design (R005.A).
 */
const REQUIRED_CAPABILITY_BY_EXECUTION_INTENT: Readonly<
  Record<EnterpriseProviderTranslationExecutionIntent, EnterpriseProviderCapability>
> = {
  ProvideTemporaryAccess: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS,
  ProvideReadOnlyAccess: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS,
  ProvideMetadata: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_PROVIDER_METADATA,
  RegisterUsage: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_USAGE_REPORTING,
  InvalidateGrant: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_GRANT_REVOCATION,
};

/**
 * The single `EnterpriseProviderCapability` a given execution intent
 * requires -- a pure, total, synchronous lookup, never a network call,
 * never a provider probe, never a read of any particular adapter's own
 * declared capability set.
 */
export function enterpriseProviderTranslationRequiredCapability(
  executionIntent: EnterpriseProviderTranslationExecutionIntent,
): EnterpriseProviderCapability {
  return REQUIRED_CAPABILITY_BY_EXECUTION_INTENT[executionIntent];
}

// ---------------------------------------------------------------------------
// Translation model (R005.B Phase 3) -- the canonical, immutable record.
// ---------------------------------------------------------------------------

/**
 * A value carried by a translation's `providerMetadata` bag. Restricted to
 * JSON primitives -- never an object, array, function, or class instance --
 * so `providerMetadata` can never smuggle a runtime object, a provider
 * client, or a nested credential-shaped value through the one genuinely
 * open extension point this contract has, mirroring
 * `EnterpriseUsageEventMetadataValue` (`@aoc-enterprise/usage-event`) and
 * its complementary forbidden-key-substring guard (see
 * `validateEnterpriseProviderTranslation`).
 */
export type EnterpriseProviderTranslationMetadataValue = string | number | boolean;

/**
 * The canonical Enterprise-owned contract for **the immutable result of
 * translating an issued `EnterpriseAccessGrant` into a provider-neutral
 * execution plan**. See the package README for the full design rationale,
 * ownership boundary, and relationship to `EnterpriseAccessGrant`,
 * `EnterpriseGrantRevocation`, `@aoc-enterprise/provider-adapter`, and
 * `EnterpriseUsageEvent`.
 *
 * Field groups (R005.B Phase 3):
 * - `id` -- translation identity, minted once per translation attempt. A
 *   grant may be translated more than once over its lifetime (e.g. once at
 *   issuance, again after a capability-set change) -- this contract does
 *   not assume translation happens exactly once per `grantRef`, mirroring
 *   `EnterpriseUsageEvent`'s "repeatable by design" precedent rather than
 *   `EnterpriseGrantRevocation`'s "at-most-once" one.
 * - `providerSystem` -- which provider system this translation targets, a
 *   free-text identifier (never a closed enum) mirroring
 *   `EnterpriseResourceEnvelope.location.system` and
 *   `EnterpriseProviderCapabilityDeclaration.providerSystem` verbatim -- the
 *   provider identifier translation responsibility this model exists to
 *   carry alongside an execution intent.
 * - `capability` -- which single `EnterpriseProviderCapability`
 *   (`@aoc-enterprise/provider-adapter`) this translation exercises. A
 *   selection from the existing, closed capability vocabulary, never a
 *   redefinition of it -- "provider capability selection" (R005.B Phase 3),
 *   singular by design: one translation record realizes one execution
 *   intent via one capability.
 * - `executionIntent` -- the provider-neutral instruction this translation
 *   carries, from the closed `EnterpriseProviderTranslationExecutionIntent`
 *   vocabulary above.
 * - `grantRef` -- an opaque pointer to the `EnterpriseAccessGrant` this
 *   translation was produced from (that grant's own `id`). A reference,
 *   never an embedding, mirroring `EnterpriseUsageEvent.grantRef` /
 *   `EnterpriseGrantRevocation.grantRef`.
 * - `resource` -- which governed resource this translation targets,
 *   composing Protocol's `ResourceRef` directly (identity only -- never the
 *   full `EnterpriseResourceEnvelope`), the same identity-only composition
 *   style `EnterpriseAccessGrant.resource` / `EnterpriseUsageEvent.resource`
 *   already establish. Carried directly rather than re-derived by
 *   dereferencing `grantRef` so a translation can be reasoned about --
 *   filtered, displayed, audited -- without requiring access to the grant
 *   record it points to.
 * - `providerMetadata?` -- translation-specific, provider-neutral metadata
 *   (e.g. a `'ProvideTemporaryAccess'` translation's requested access
 *   duration, in a caller-defined unit). Restricted to JSON primitives and
 *   to key names that do not resemble a credential, token, or URL (see
 *   `validateEnterpriseProviderTranslation`), mirroring
 *   `EnterpriseUsageEvent.metadata`. This is provider-neutral *documentation
 *   about the translation itself*, never a second home for the provider
 *   location metadata `EnterpriseResourceEnvelope.location` already owns,
 *   and never a provider response, URL, or execution result.
 * - `translatedAt` -- when this translation was produced, as an immutable
 *   business fact. Not compared against any other record's timestamp by
 *   this contract, and never a provider-side execution timestamp (this
 *   contract has no execution to time).
 * - `correlationId` -- this translation's own audit-trail correlation
 *   identifier, mirroring the `correlationId` pattern every other contract
 *   in the Access Governance lifecycle already establishes.
 * - `description?` -- optional human-readable documentation metadata,
 *   mirroring the `description?` precedent across this contract line.
 */
export interface EnterpriseProviderTranslation {
  readonly schemaVersion: typeof ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly providerSystem: string;
  readonly capability: EnterpriseProviderCapability;
  readonly executionIntent: EnterpriseProviderTranslationExecutionIntent;
  readonly grantRef: CanonicalId;
  readonly resource: ResourceRef;
  readonly providerMetadata?: Readonly<Record<string, EnterpriseProviderTranslationMetadataValue>>;
  readonly translatedAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Identity equality (R005.B Phase 8) -- derives from translation identity,
// grant reference, provider identifier, and execution intent only, never
// from `capability`, `providerMetadata`, timestamps, or any other field,
// and never from execution (this contract has no execution-shaped field to
// begin with). Resource identity, where it *does* participate (in full
// structural equality below), delegates entirely to `resourceRefIdentityEquals`,
// already canonical for `ResourceRef` in `@aoc-enterprise/resource-envelope`
// -- this module never defines a second identity algorithm.
// ---------------------------------------------------------------------------

/**
 * Whether two translations represent the same translation attempt: the same
 * translation id, for the same grant, targeting the same provider system,
 * carrying the same execution intent. Two translations can share identity
 * while disagreeing on every other field (e.g. a corrected `description`
 * recorded after the fact) -- see `enterpriseProviderTranslationEquals` for
 * full structural equality.
 */
export function enterpriseProviderTranslationIdentityEquals(
  a: EnterpriseProviderTranslation,
  b: EnterpriseProviderTranslation,
): boolean {
  return a.id === b.id && a.grantRef === b.grantRef && a.providerSystem === b.providerSystem && a.executionIntent === b.executionIntent;
}

function recordAttributesEquals(a: Readonly<Record<string, string>> | undefined, b: Readonly<Record<string, string>> | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function metadataEquals(
  a: Readonly<Record<string, EnterpriseProviderTranslationMetadataValue>> | undefined,
  b: Readonly<Record<string, EnterpriseProviderTranslationMetadataValue>> | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

/**
 * Full structural equality: identity (via
 * `enterpriseProviderTranslationIdentityEquals`) plus every other field --
 * `capability`, `resource` (identity, via `resourceRefIdentityEquals`, plus
 * `resource.attributes`), `providerMetadata`, `translatedAt`,
 * `correlationId`, `description`, and `schemaVersion`.
 */
export function enterpriseProviderTranslationEquals(
  a: EnterpriseProviderTranslation,
  b: EnterpriseProviderTranslation,
): boolean {
  return (
    enterpriseProviderTranslationIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.capability === b.capability &&
    resourceRefIdentityEquals(a.resource, b.resource) &&
    recordAttributesEquals(a.resource.attributes, b.resource.attributes) &&
    metadataEquals(a.providerMetadata, b.providerMetadata) &&
    a.translatedAt === b.translatedAt &&
    a.correlationId === b.correlationId &&
    a.description === b.description
  );
}

// ---------------------------------------------------------------------------
// Validation (R005.B Phase 6) -- required fields, translation consistency,
// capability consistency, and reference integrity for a single candidate.
// No provider validation, no network validation, no execution validation, no
// existence checks (this function never confirms `grantRef` points at
// anything real), and no wall-clock comparison. See
// `validateEnterpriseProviderTranslationSet` below for duplicate-translation
// detection across a collection, which this function -- operating on one
// candidate at a time -- cannot express.
// ---------------------------------------------------------------------------

export type EnterpriseProviderTranslationValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_PROVIDER_SYSTEM'
  | 'INVALID_PROVIDER_SYSTEM'
  | 'MISSING_CAPABILITY'
  | 'INVALID_CAPABILITY'
  | 'MISSING_EXECUTION_INTENT'
  | 'INVALID_EXECUTION_INTENT'
  | 'CAPABILITY_EXECUTION_INTENT_MISMATCH'
  | 'MISSING_GRANT_REF'
  | 'INVALID_GRANT_REF'
  | 'MISSING_RESOURCE'
  | 'INVALID_RESOURCE_IDENTITY'
  | 'INVALID_PROVIDER_METADATA'
  | 'FORBIDDEN_PROVIDER_METADATA_KEY'
  | 'MISSING_TRANSLATED_AT'
  | 'INVALID_TRANSLATED_AT'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_CORRELATION_ID'
  | 'INVALID_DESCRIPTION';

export interface EnterpriseProviderTranslationValidationIssue {
  readonly code: EnterpriseProviderTranslationValidationCode;
  readonly message: string;
}

export type EnterpriseProviderTranslationValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseProviderTranslationValidationIssue[] };

const PROVIDER_CAPABILITIES: readonly EnterpriseProviderCapability[] = Object.values(ENTERPRISE_PROVIDER_CAPABILITIES);
const EXECUTION_INTENTS: readonly EnterpriseProviderTranslationExecutionIntent[] = Object.values(
  ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS,
);
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Substrings of a `providerMetadata` key that indicate a credential, token,
 * or URL/link is being smuggled through the one open extension point this
 * contract has, mirroring `EnterpriseUsageEvent`'s identical guard
 * (`FORBIDDEN_METADATA_KEY_SUBSTRINGS`) verbatim -- `providerMetadata` is,
 * structurally, the same kind of open `Record<string, primitive>` field, and
 * this contract does not invent a second policy for the same risk. Matched
 * case-insensitively as a substring, not an exact key match.
 */
const FORBIDDEN_PROVIDER_METADATA_KEY_SUBSTRINGS = [
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
  'signature',
];

function isForbiddenProviderMetadataKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return FORBIDDEN_PROVIDER_METADATA_KEY_SUBSTRINGS.some((forbidden) => normalized.includes(forbidden));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isMetadataValue(value: unknown): value is EnterpriseProviderTranslationMetadataValue {
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

/**
 * Validates internal consistency of a candidate translation. Accepts
 * `unknown` so it can guard deserialized/external input, not just
 * already-typed values. Never inspects `grantRef` for existence
 * ("reference integrity" means a well-formed, non-empty identifier, never
 * that the referenced grant actually exists), never contacts a provider,
 * never evaluates whether Provider Execution would succeed, and never
 * compares `translatedAt` against any other record's timestamp -- only
 * shape, required-field, closed-vocabulary membership, capability/execution-intent
 * consistency, and metadata-key consistency.
 *
 * "Capability consistency" (R005.B Phase 6) is enforced by comparing
 * `capability` against `enterpriseProviderTranslationRequiredCapability(executionIntent)`
 * -- a translation whose declared capability does not match what its own
 * execution intent requires is rejected with `CAPABILITY_EXECUTION_INTENT_MISMATCH`.
 */
export function validateEnterpriseProviderTranslation(candidate: unknown): EnterpriseProviderTranslationValidationResult {
  const errors: EnterpriseProviderTranslationValidationIssue[] = [];

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Translation must be an object.' }] };
  }

  if (candidate.schemaVersion !== ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION) {
    errors.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `schemaVersion must be '${ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION}'.`,
    });
  }

  if (!isNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (!isNonEmptyString(candidate.providerSystem)) {
    errors.push({
      code: candidate.providerSystem === undefined ? 'MISSING_PROVIDER_SYSTEM' : 'INVALID_PROVIDER_SYSTEM',
      message: 'providerSystem is required and must be a non-empty string.',
    });
  }

  let capabilityValid = false;
  if (candidate.capability === undefined) {
    errors.push({ code: 'MISSING_CAPABILITY', message: 'capability is required.' });
  } else if (typeof candidate.capability !== 'string' || !PROVIDER_CAPABILITIES.includes(candidate.capability as EnterpriseProviderCapability)) {
    errors.push({ code: 'INVALID_CAPABILITY', message: `capability must be one of: ${PROVIDER_CAPABILITIES.join(', ')}.` });
  } else {
    capabilityValid = true;
  }

  let executionIntentValid = false;
  if (candidate.executionIntent === undefined) {
    errors.push({ code: 'MISSING_EXECUTION_INTENT', message: 'executionIntent is required.' });
  } else if (
    typeof candidate.executionIntent !== 'string' ||
    !EXECUTION_INTENTS.includes(candidate.executionIntent as EnterpriseProviderTranslationExecutionIntent)
  ) {
    errors.push({ code: 'INVALID_EXECUTION_INTENT', message: `executionIntent must be one of: ${EXECUTION_INTENTS.join(', ')}.` });
  } else {
    executionIntentValid = true;
  }

  if (capabilityValid && executionIntentValid) {
    const requiredCapability = enterpriseProviderTranslationRequiredCapability(
      candidate.executionIntent as EnterpriseProviderTranslationExecutionIntent,
    );
    if (candidate.capability !== requiredCapability) {
      errors.push({
        code: 'CAPABILITY_EXECUTION_INTENT_MISMATCH',
        message: `executionIntent '${String(candidate.executionIntent)}' requires capability '${requiredCapability}', not '${String(candidate.capability)}'.`,
      });
    }
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

  if (candidate.providerMetadata !== undefined) {
    if (!isPlainObject(candidate.providerMetadata)) {
      errors.push({ code: 'INVALID_PROVIDER_METADATA', message: 'providerMetadata must be a plain object when present.' });
    } else {
      for (const [key, value] of Object.entries(candidate.providerMetadata)) {
        if (!isMetadataValue(value)) {
          errors.push({ code: 'INVALID_PROVIDER_METADATA', message: `providerMetadata.${key} must be a string, a finite number, or a boolean.` });
        }
        if (isForbiddenProviderMetadataKey(key)) {
          errors.push({
            code: 'FORBIDDEN_PROVIDER_METADATA_KEY',
            message: `providerMetadata key '${key}' resembles a credential, token, signature, or URL and is not permitted; translations are declarative and provider-neutral.`,
          });
        }
      }
    }
  }

  if (candidate.translatedAt === undefined) {
    errors.push({ code: 'MISSING_TRANSLATED_AT', message: 'translatedAt is required.' });
  } else if (typeof candidate.translatedAt !== 'string' || !ISO_8601_PATTERN.test(candidate.translatedAt)) {
    errors.push({ code: 'INVALID_TRANSLATED_AT', message: 'translatedAt must be an ISO 8601 UTC timestamp string.' });
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

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Duplicate detection -- operates on a collection, not a single translation
// (R005.B Phase 6: "duplicate translation identifiers"). A collection of
// translations (e.g. every translation ever produced) must not declare the
// same translation identity twice. Deliberately does not also forbid two
// translations from sharing the same `grantRef`: a grant is expected to be
// translated more than once over its lifetime (see
// `EnterpriseProviderTranslation.id`'s own field documentation).
// ---------------------------------------------------------------------------

export type EnterpriseProviderTranslationSetValidationCode = 'DUPLICATE_TRANSLATION_ID';

export interface EnterpriseProviderTranslationSetValidationIssue {
  readonly code: EnterpriseProviderTranslationSetValidationCode;
  readonly message: string;
}

export type EnterpriseProviderTranslationSetValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseProviderTranslationSetValidationIssue[] };

/**
 * Validates that no two translations in `translations` share the same `id`.
 * Deliberately a separate function from `validateEnterpriseProviderTranslation`:
 * "duplicate" is a property of a collection, not of any single translation,
 * so it cannot be expressed by that function's per-candidate signature. Does
 * not check individual translation shape -- call
 * `validateEnterpriseProviderTranslation` for that.
 */
export function validateEnterpriseProviderTranslationSet(
  translations: readonly EnterpriseProviderTranslation[],
): EnterpriseProviderTranslationSetValidationResult {
  const errors: EnterpriseProviderTranslationSetValidationIssue[] = [];

  for (const id of findDuplicateStrings(translations.map((translation) => translation.id))) {
    errors.push({ code: 'DUPLICATE_TRANSLATION_ID', message: `Translation id '${id}' appears more than once in the set.` });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization (R005.B Phase 7) -- stable, deterministic, provider-neutral,
// round-trip safe, forward compatible.
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseProviderTranslation {
  readonly schemaVersion: string;
  readonly id: string;
  readonly providerSystem: string;
  readonly capability: string;
  readonly executionIntent: string;
  readonly grantRef: string;
  readonly resource: {
    readonly kind: string;
    readonly id: string;
    readonly tenantId?: string;
    readonly attributes?: Readonly<Record<string, string>>;
  };
  readonly providerMetadata?: Readonly<Record<string, EnterpriseProviderTranslationMetadataValue>>;
  readonly translatedAt: string;
  readonly correlationId: string;
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
  metadata: Readonly<Record<string, EnterpriseProviderTranslationMetadataValue>> | undefined,
): Readonly<Record<string, EnterpriseProviderTranslationMetadataValue>> | undefined {
  if (metadata === undefined) return undefined;
  const sorted: Record<string, EnterpriseProviderTranslationMetadataValue> = {};
  for (const key of Object.keys(metadata).sort()) {
    sorted[key] = metadata[key] as EnterpriseProviderTranslationMetadataValue;
  }
  return sorted;
}

/** Projects an `EnterpriseProviderTranslation` to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already a valid translation by construction. */
export function serializeEnterpriseProviderTranslation(translation: EnterpriseProviderTranslation): SerializedEnterpriseProviderTranslation {
  const attributes = sortedAttributes(translation.resource.attributes);
  const providerMetadata = sortedMetadata(translation.providerMetadata);

  return {
    schemaVersion: translation.schemaVersion,
    id: translation.id,
    providerSystem: translation.providerSystem,
    capability: translation.capability,
    executionIntent: translation.executionIntent,
    grantRef: translation.grantRef,
    resource: {
      kind: translation.resource.kind,
      id: translation.resource.id,
      ...(translation.resource.tenantId === undefined ? {} : { tenantId: translation.resource.tenantId }),
      ...(attributes === undefined ? {} : { attributes }),
    },
    ...(providerMetadata === undefined ? {} : { providerMetadata }),
    translatedAt: translation.translatedAt,
    correlationId: translation.correlationId,
    ...(translation.description === undefined ? {} : { description: translation.description }),
  };
}

/**
 * Thrown by `deserializeEnterpriseProviderTranslation` when the input fails
 * `validateEnterpriseProviderTranslation`. Carries the full issue list
 * rather than just the first, matching `EnterpriseProviderTranslationValidationResult`.
 */
export class EnterpriseProviderTranslationValidationError extends Error {
  readonly issues: readonly EnterpriseProviderTranslationValidationIssue[];

  constructor(issues: readonly EnterpriseProviderTranslationValidationIssue[]) {
    super(`Invalid EnterpriseProviderTranslation: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseProviderTranslationValidationError';
    this.issues = issues;
  }
}

/**
 * Parses and validates a candidate value (e.g. `JSON.parse` output) into an
 * `EnterpriseProviderTranslation`. Every field is mapped explicitly from the
 * validated candidate -- no structural cast (`as EnterpriseProviderTranslation`)
 * over unchecked input, matching the convention already established across
 * this contract line.
 *
 * Throws `EnterpriseProviderTranslationValidationError` when validation
 * fails.
 */
export function deserializeEnterpriseProviderTranslation(candidate: unknown): EnterpriseProviderTranslation {
  const result = validateEnterpriseProviderTranslation(candidate);
  if (!result.valid) {
    throw new EnterpriseProviderTranslationValidationError(result.errors);
  }

  // Validated above: `candidate` has the required shape of a
  // SerializedEnterpriseProviderTranslation. Read through a narrow local
  // view instead of casting the whole object.
  const value = candidate as SerializedEnterpriseProviderTranslation;

  const resource: ResourceRef = {
    kind: value.resource.kind,
    id: value.resource.id,
    ...(value.resource.tenantId === undefined ? {} : { tenantId: value.resource.tenantId }),
    ...(value.resource.attributes === undefined ? {} : { attributes: { ...value.resource.attributes } }),
  };

  return {
    schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
    id: value.id,
    providerSystem: value.providerSystem,
    capability: value.capability as EnterpriseProviderCapability,
    executionIntent: value.executionIntent as EnterpriseProviderTranslationExecutionIntent,
    grantRef: value.grantRef,
    resource,
    ...(value.providerMetadata === undefined ? {} : { providerMetadata: { ...value.providerMetadata } }),
    translatedAt: value.translatedAt,
    correlationId: value.correlationId,
    ...(value.description === undefined ? {} : { description: value.description }),
  };
}
