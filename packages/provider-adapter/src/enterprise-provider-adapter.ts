import type { CanonicalId, UtcDateTime } from '@aoc/protocol';
import type { EnterpriseAccessGrant } from '@aoc-enterprise/access-grant';
import type { EnterpriseAccessObligationType } from '@aoc-enterprise/access-obligation';
import { ENTERPRISE_ACCESS_OBLIGATION_TYPES } from '@aoc-enterprise/access-obligation';
import type { EnterpriseGrantRevocation } from '@aoc-enterprise/grant-revocation';
import type { EnterpriseUsageEventType } from '@aoc-enterprise/usage-event';
import { ENTERPRISE_USAGE_EVENT_TYPES } from '@aoc-enterprise/usage-event';

/**
 * The canonical, provider-neutral **Provider Adapter contract** (R005.A).
 *
 * This package defines only the architectural contract every future
 * Provider Adapter implementation (Pinata, S3, Azure Blob, Google Drive,
 * SharePoint, or any other) must satisfy to participate in the frozen
 * Access Governance lifecycle (`docs/architecture/ADR-ACCESS-LIFECYCLE.md`,
 * R005.0). It is not a Pinata adapter, an S3 adapter, an Azure adapter, or
 * any other provider's implementation -- none of those exist in this
 * package or this repository.
 *
 * A Provider Adapter exists **only** to translate the frozen, immutable
 * Enterprise artifacts (`EnterpriseAccessGrant`, `EnterpriseGrantRevocation`)
 * into provider-specific execution, and to report what it observed back as
 * an `EnterpriseUsageEvent` (`@aoc-enterprise/usage-event`). It never becomes
 * part of the Enterprise domain: it never evaluates policy, never grants
 * authorization, never creates an `EnterpriseAccessDecision`, and never
 * modifies a grant, an obligation, or evidence (see the package README's
 * "Explicit non-responsibilities").
 *
 * This module defines exactly three things, matching R005.0 ADR Phase 5
 * ("Provider Contract Requirements") one-for-one, and nothing beyond them:
 *
 * 1. **Capability declaration** (`EnterpriseProviderCapability`,
 *    `EnterpriseProviderCapabilityDeclaration`) -- the closed vocabulary and
 *    immutable record an adapter uses to declare, once, what it is actually
 *    capable of: capability categories only, never a provider name, SDK
 *    type, or credential.
 * 2. **Translation-input views** (`EnterpriseGrantTranslationInput`,
 *    `EnterpriseGrantRevocationInterpretationInput`, and the two pure
 *    projection functions that produce them) -- a compile-time-enforced
 *    narrowing of the frozen `EnterpriseAccessGrant`/`EnterpriseGrantRevocation`
 *    contracts to *exactly* the fields R005.0 ADR Phase 4 says a Provider
 *    Adapter may read (`resource`, `status`, `expiresAt` for a grant;
 *    `grantRef`, `reason` for a revocation) -- nothing else, and never a
 *    translation *output* (a presigned URL, a SAS token, a scoped SDK call),
 *    which is provider-specific execution this contract never models.
 * 3. **Failure vocabulary** (`EnterpriseProviderFailureReason`) and its pure
 *    mapping onto the frozen, closed `EnterpriseUsageEventType` vocabulary
 *    (`mapEnterpriseProviderFailureToUsageEventType`) -- how a Provider
 *    Adapter's own failure observation becomes the `eventType` of the
 *    `EnterpriseUsageEvent` it reports, per R005.0 ADR Phase 5 ("Failure
 *    reporting"): never a new `success`/`httpStatus`/provider-response
 *    field, which every one of the seven frozen contracts already forbids.
 *
 * This is a pure data contract: no persistence, no service, no API, no
 * provider SDK, no HTTP client, no credential, no signed/temporary URL, no
 * retry logic, no telemetry, no logging, no runtime execution, no
 * enforcement, no orchestration. See the package README for the full
 * design rationale and the R005.0 ADR's Phase 4/5/7 boundary this contract
 * implements.
 *
 * Ownership: Soberanía Enterprise (`@aoc-enterprise/provider-adapter`).
 */
export const ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Capability model (R005.A Phase 5) -- behavior only, never a provider name.
// ---------------------------------------------------------------------------

/**
 * The canonical, closed vocabulary of provider-neutral capability
 * categories a Provider Adapter may declare it supports. Each value
 * describes *behavior an adapter can perform*, never *which provider*
 * performs it: `'SupportsTemporaryAccess'` records that an adapter can
 * translate a grant into time-bounded provider access (a presigned URL, a
 * SAS token, a scoped share link -- the adapter's own choice, never named
 * here); `'SupportsGrantRevocation'` records that an adapter can interpret
 * an `EnterpriseGrantRevocation` and act on its provider-side state;
 * `'SupportsUsageReporting'` records that an adapter can emit
 * `EnterpriseUsageEvent` records; `'SupportsProviderMetadata'` records that
 * an adapter can populate `EnterpriseResourceEnvelope.location`-shaped
 * provider metadata (`system`, `systemReference`, `uri`) at resource
 * registration time; `'SupportsCapabilityDiscovery'` records that an
 * adapter can produce this very declaration at runtime rather than only at
 * build time; `'SupportsExpiration'` records that an adapter compares
 * `EnterpriseAccessGrant.expiresAt` against wall-clock time itself (R005.0
 * ADR Phase 5: "none of the seven contracts perform that comparison");
 * `'SupportsCorrelation'` records that an adapter can associate its own
 * provider-side operations with `EnterpriseUsageEvent.correlationId`;
 * `'SupportsEvidenceContribution'` records that an adapter can populate
 * `EnterpriseUsageEvent.evidenceRefs` with opaque pointers to evidence it
 * observed.
 *
 * No provider-specific value (e.g. `'PinataPinning'`, `'S3PresignedUrls'`)
 * is, or will ever be, added to this vocabulary -- a new capability
 * *category* is a `schemaVersion` change to this package, never an escape
 * hatch, mirroring the closed-vocabulary convention already established by
 * `EnterpriseAccessObligationType`, `EnterpriseGrantRevocationReason`, and
 * `EnterpriseUsageEventType`.
 */
export const ENTERPRISE_PROVIDER_CAPABILITIES = {
  SUPPORTS_TEMPORARY_ACCESS: 'SupportsTemporaryAccess',
  SUPPORTS_GRANT_REVOCATION: 'SupportsGrantRevocation',
  SUPPORTS_USAGE_REPORTING: 'SupportsUsageReporting',
  SUPPORTS_PROVIDER_METADATA: 'SupportsProviderMetadata',
  SUPPORTS_CAPABILITY_DISCOVERY: 'SupportsCapabilityDiscovery',
  SUPPORTS_EXPIRATION: 'SupportsExpiration',
  SUPPORTS_CORRELATION: 'SupportsCorrelation',
  SUPPORTS_EVIDENCE_CONTRIBUTION: 'SupportsEvidenceContribution',
} as const;

export type EnterpriseProviderCapability =
  (typeof ENTERPRISE_PROVIDER_CAPABILITIES)[keyof typeof ENTERPRISE_PROVIDER_CAPABILITIES];

/**
 * The canonical Enterprise-owned contract for **the immutable declaration of
 * what one Provider Adapter is actually capable of**. R005.0 ADR Phase 10
 * (Observation 3) names this declaration mechanism as a gap future Provider
 * Adapter work must fill; this is that mechanism.
 *
 * Field groups:
 * - `id` -- declaration identity, minted once per declared capability set.
 *   Unique within any collection of declarations (see
 *   `validateEnterpriseProviderCapabilityDeclarationSet`'s
 *   `DUPLICATE_DECLARATION_ID`). A provider adapter may redeclare (a new
 *   `id`) as its own supported capability set changes over time -- this
 *   contract does not assume a declaration is issued exactly once per
 *   `providerSystem`, mirroring `EnterpriseUsageEvent`'s "repeatable by
 *   design" precedent rather than `EnterpriseGrantRevocation`'s
 *   "at-most-once" one.
 * - `providerSystem` -- which provider system this declaration describes, a
 *   free-text identifier (never a closed enum) mirroring
 *   `EnterpriseResourceEnvelope.location.system` verbatim -- the one place
 *   already designed to hold a provider identity string. This is the
 *   contract's "provider identifier translation" responsibility (R005.A
 *   Phase 3): translating between a provider's own name and the
 *   provider-neutral identifier space Enterprise contracts already use.
 * - `capabilities` -- which capability categories this adapter supports,
 *   from the canonical, closed `EnterpriseProviderCapability` vocabulary.
 *   Required and non-empty: a capability declaration with no capabilities
 *   would be indistinguishable from no declaration at all.
 * - `supportedObligationTypes?` -- which `EnterpriseAccessObligationType`
 *   values (`@aoc-enterprise/access-obligation`) this adapter can actually
 *   enforce (e.g. `'watermark-content'`, `'read-only'`, `'no-download'`,
 *   `'time-limit'`), so Enterprise-side policy evaluation is not composing
 *   obligations no adapter can satisfy -- R005.0 ADR Phase 5's "Capability
 *   declaration" row, verbatim. References the existing, frozen obligation
 *   vocabulary by value; never redefines or duplicates it.
 * - `declaredAt` -- when this capability set was declared, as an immutable
 *   business fact. Not compared against any other record's timestamp by
 *   this contract.
 * - `correlationId` -- this declaration's own audit-trail correlation
 *   identifier, mirroring the `correlationId` pattern every other contract
 *   in the Access Governance lifecycle already establishes.
 * - `description?` -- optional human-readable documentation metadata,
 *   mirroring the `description?` precedent across this contract line.
 */
export interface EnterpriseProviderCapabilityDeclaration {
  readonly schemaVersion: typeof ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly providerSystem: string;
  readonly capabilities: readonly EnterpriseProviderCapability[];
  readonly supportedObligationTypes?: readonly EnterpriseAccessObligationType[];
  readonly declaredAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Identity equality -- derives from declaration identity alone, the same
// single-field-identity pattern `enterpriseAccessObligationIdentityEquals`
// already establishes: identity equality is always a strict subset of full
// structural equality, never a second, independently invented notion of
// "the same declaration."
// ---------------------------------------------------------------------------

/** Whether two capability declarations represent the same declared set, by `id` alone. Two declarations can share identity while disagreeing on every other field (e.g. a corrected `description` recorded after the fact) -- see `enterpriseProviderCapabilityDeclarationEquals` for full structural equality. */
export function enterpriseProviderCapabilityDeclarationIdentityEquals(
  a: EnterpriseProviderCapabilityDeclaration,
  b: EnterpriseProviderCapabilityDeclaration,
): boolean {
  return a.id === b.id;
}

function stringSetEquals(a: readonly string[], b: readonly string[]): boolean {
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.length === bSorted.length && aSorted.every((value, index) => value === bSorted[index]);
}

function optionalStringSetEquals(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return stringSetEquals(a, b);
}

/**
 * Full structural equality: identity (via
 * `enterpriseProviderCapabilityDeclarationIdentityEquals`) plus every other
 * field -- `providerSystem`, `capabilities` (compared as a set, not a
 * sequence -- declaration order carries no meaning), `supportedObligationTypes`
 * (same), `declaredAt`, `correlationId`, `description`, and `schemaVersion`.
 */
export function enterpriseProviderCapabilityDeclarationEquals(
  a: EnterpriseProviderCapabilityDeclaration,
  b: EnterpriseProviderCapabilityDeclaration,
): boolean {
  return (
    enterpriseProviderCapabilityDeclarationIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.providerSystem === b.providerSystem &&
    stringSetEquals(a.capabilities, b.capabilities) &&
    optionalStringSetEquals(a.supportedObligationTypes, b.supportedObligationTypes) &&
    a.declaredAt === b.declaredAt &&
    a.correlationId === b.correlationId &&
    a.description === b.description
  );
}

// ---------------------------------------------------------------------------
// Validation -- required fields, closed-vocabulary membership, and
// duplicate-entry consistency only. No provider validation, no network
// validation, no existence checks, no runtime-capability probing (this
// function never contacts a provider to confirm a declared capability is
// actually true -- it only checks that the declaration is internally
// well-formed).
// ---------------------------------------------------------------------------

export type EnterpriseProviderCapabilityDeclarationValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_PROVIDER_SYSTEM'
  | 'INVALID_PROVIDER_SYSTEM'
  | 'MISSING_CAPABILITIES'
  | 'INVALID_CAPABILITIES'
  | 'DUPLICATE_CAPABILITY'
  | 'INVALID_SUPPORTED_OBLIGATION_TYPES'
  | 'DUPLICATE_SUPPORTED_OBLIGATION_TYPE'
  | 'MISSING_DECLARED_AT'
  | 'INVALID_DECLARED_AT'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_CORRELATION_ID'
  | 'INVALID_DESCRIPTION';

export interface EnterpriseProviderCapabilityDeclarationValidationIssue {
  readonly code: EnterpriseProviderCapabilityDeclarationValidationCode;
  readonly message: string;
}

export type EnterpriseProviderCapabilityDeclarationValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseProviderCapabilityDeclarationValidationIssue[] };

const PROVIDER_CAPABILITIES: readonly EnterpriseProviderCapability[] = Object.values(ENTERPRISE_PROVIDER_CAPABILITIES);
const ACCESS_OBLIGATION_TYPES: readonly EnterpriseAccessObligationType[] = Object.values(ENTERPRISE_ACCESS_OBLIGATION_TYPES);
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

/**
 * Validates internal consistency of a candidate capability declaration.
 * Accepts `unknown` so it can guard deserialized/external input, not just
 * already-typed values. Never contacts a provider to confirm a declared
 * capability is actually true, never checks `providerSystem` against a
 * closed list of known providers (it is free text, by design -- see
 * `EnterpriseResourceEnvelope.location.system`), and never evaluates
 * whether `supportedObligationTypes` is "enough" for any particular
 * decision -- only shape, required-field, closed-vocabulary membership, and
 * duplicate-entry consistency.
 */
export function validateEnterpriseProviderCapabilityDeclaration(
  candidate: unknown,
): EnterpriseProviderCapabilityDeclarationValidationResult {
  const errors: EnterpriseProviderCapabilityDeclarationValidationIssue[] = [];

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Capability declaration must be an object.' }] };
  }

  if (candidate.schemaVersion !== ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION) {
    errors.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `schemaVersion must be '${ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION}'.`,
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

  if (candidate.capabilities === undefined) {
    errors.push({ code: 'MISSING_CAPABILITIES', message: 'capabilities is required and must be a non-empty array.' });
  } else if (
    !Array.isArray(candidate.capabilities) ||
    candidate.capabilities.length === 0 ||
    !candidate.capabilities.every((value) => typeof value === 'string' && PROVIDER_CAPABILITIES.includes(value as EnterpriseProviderCapability))
  ) {
    errors.push({
      code: 'INVALID_CAPABILITIES',
      message: `capabilities must be a non-empty array whose values are each one of: ${PROVIDER_CAPABILITIES.join(', ')}.`,
    });
  } else {
    for (const duplicate of findDuplicateStrings(candidate.capabilities)) {
      errors.push({ code: 'DUPLICATE_CAPABILITY', message: `capabilities contains '${duplicate}' more than once.` });
    }
  }

  if (candidate.supportedObligationTypes !== undefined) {
    if (
      !Array.isArray(candidate.supportedObligationTypes) ||
      candidate.supportedObligationTypes.length === 0 ||
      !candidate.supportedObligationTypes.every(
        (value) => typeof value === 'string' && ACCESS_OBLIGATION_TYPES.includes(value as EnterpriseAccessObligationType),
      )
    ) {
      errors.push({
        code: 'INVALID_SUPPORTED_OBLIGATION_TYPES',
        message: `supportedObligationTypes must be a non-empty array whose values are each one of: ${ACCESS_OBLIGATION_TYPES.join(', ')}, when present.`,
      });
    } else {
      for (const duplicate of findDuplicateStrings(candidate.supportedObligationTypes)) {
        errors.push({ code: 'DUPLICATE_SUPPORTED_OBLIGATION_TYPE', message: `supportedObligationTypes contains '${duplicate}' more than once.` });
      }
    }
  }

  if (candidate.declaredAt === undefined) {
    errors.push({ code: 'MISSING_DECLARED_AT', message: 'declaredAt is required.' });
  } else if (typeof candidate.declaredAt !== 'string' || !ISO_8601_PATTERN.test(candidate.declaredAt)) {
    errors.push({ code: 'INVALID_DECLARED_AT', message: 'declaredAt must be an ISO 8601 UTC timestamp string.' });
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
// Duplicate detection -- operates on a collection, not a single declaration.
// A collection of capability declarations (e.g. every declaration ever
// recorded) must not declare the same declaration identity twice.
// Deliberately does not also forbid two declarations from sharing the same
// `providerSystem`: a provider adapter's declared capability set is expected
// to be redeclared over time as the adapter itself evolves, the same
// repeatability `EnterpriseUsageEvent` already establishes for its own
// `grantRef`.
// ---------------------------------------------------------------------------

export type EnterpriseProviderCapabilityDeclarationSetValidationCode = 'DUPLICATE_DECLARATION_ID';

export interface EnterpriseProviderCapabilityDeclarationSetValidationIssue {
  readonly code: EnterpriseProviderCapabilityDeclarationSetValidationCode;
  readonly message: string;
}

export type EnterpriseProviderCapabilityDeclarationSetValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseProviderCapabilityDeclarationSetValidationIssue[] };

/**
 * Validates that no two capability declarations in `declarations` share the
 * same `id`. Deliberately a separate function from
 * `validateEnterpriseProviderCapabilityDeclaration`: "duplicate" is a
 * property of a collection, not of any single declaration.
 */
export function validateEnterpriseProviderCapabilityDeclarationSet(
  declarations: readonly EnterpriseProviderCapabilityDeclaration[],
): EnterpriseProviderCapabilityDeclarationSetValidationResult {
  const errors: EnterpriseProviderCapabilityDeclarationSetValidationIssue[] = [];

  for (const id of findDuplicateStrings(declarations.map((declaration) => declaration.id))) {
    errors.push({ code: 'DUPLICATE_DECLARATION_ID', message: `Capability declaration id '${id}' appears more than once in the set.` });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Whether a declared capability set can enforce a given obligation type --
 * a pure, total lookup over `supportedObligationTypes`, never a network
 * call, never a provider probe. Returns `false` when
 * `supportedObligationTypes` is absent: a declaration that does not state
 * which obligation types it supports is treated as supporting none, never
 * assumed to support all of them.
 */
export function enterpriseProviderCapabilityDeclarationSupportsObligation(
  declaration: EnterpriseProviderCapabilityDeclaration,
  obligationType: EnterpriseAccessObligationType,
): boolean {
  return declaration.supportedObligationTypes?.includes(obligationType) ?? false;
}

/**
 * Whether a declared capability set includes a given capability category --
 * a pure, total lookup over `capabilities`, never a network call, never a
 * provider probe.
 */
export function enterpriseProviderCapabilityDeclarationHasCapability(
  declaration: EnterpriseProviderCapabilityDeclaration,
  capability: EnterpriseProviderCapability,
): boolean {
  return declaration.capabilities.includes(capability);
}

// ---------------------------------------------------------------------------
// Serialization -- stable, deterministic, provider-neutral, round-trip safe,
// version-friendly.
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseProviderCapabilityDeclaration {
  readonly schemaVersion: string;
  readonly id: string;
  readonly providerSystem: string;
  readonly capabilities: readonly string[];
  readonly supportedObligationTypes?: readonly string[];
  readonly declaredAt: string;
  readonly correlationId: string;
  readonly description?: string;
}

/** Projects an `EnterpriseProviderCapabilityDeclaration` to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already a valid declaration by construction. */
export function serializeEnterpriseProviderCapabilityDeclaration(
  declaration: EnterpriseProviderCapabilityDeclaration,
): SerializedEnterpriseProviderCapabilityDeclaration {
  const supportedObligationTypes =
    declaration.supportedObligationTypes === undefined ? undefined : [...declaration.supportedObligationTypes].sort();

  return {
    schemaVersion: declaration.schemaVersion,
    id: declaration.id,
    providerSystem: declaration.providerSystem,
    capabilities: [...declaration.capabilities].sort(),
    ...(supportedObligationTypes === undefined ? {} : { supportedObligationTypes }),
    declaredAt: declaration.declaredAt,
    correlationId: declaration.correlationId,
    ...(declaration.description === undefined ? {} : { description: declaration.description }),
  };
}

/**
 * Thrown by `deserializeEnterpriseProviderCapabilityDeclaration` when the
 * input fails `validateEnterpriseProviderCapabilityDeclaration`. Carries the
 * full issue list rather than just the first.
 */
export class EnterpriseProviderCapabilityDeclarationValidationError extends Error {
  readonly issues: readonly EnterpriseProviderCapabilityDeclarationValidationIssue[];

  constructor(issues: readonly EnterpriseProviderCapabilityDeclarationValidationIssue[]) {
    super(`Invalid EnterpriseProviderCapabilityDeclaration: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseProviderCapabilityDeclarationValidationError';
    this.issues = issues;
  }
}

/**
 * Parses and validates a candidate value (e.g. `JSON.parse` output) into an
 * `EnterpriseProviderCapabilityDeclaration`. Every field is mapped
 * explicitly from the validated candidate -- no structural cast (`as
 * EnterpriseProviderCapabilityDeclaration`) over unchecked input, matching
 * the convention already established across this contract line.
 *
 * Throws `EnterpriseProviderCapabilityDeclarationValidationError` when
 * validation fails.
 */
export function deserializeEnterpriseProviderCapabilityDeclaration(candidate: unknown): EnterpriseProviderCapabilityDeclaration {
  const result = validateEnterpriseProviderCapabilityDeclaration(candidate);
  if (!result.valid) {
    throw new EnterpriseProviderCapabilityDeclarationValidationError(result.errors);
  }

  // Validated above: `candidate` has the required shape of a
  // SerializedEnterpriseProviderCapabilityDeclaration. Read through a narrow
  // local view instead of casting the whole object.
  const value = candidate as SerializedEnterpriseProviderCapabilityDeclaration;

  return {
    schemaVersion: ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION,
    id: value.id,
    providerSystem: value.providerSystem,
    capabilities: [...value.capabilities] as readonly EnterpriseProviderCapability[],
    ...(value.supportedObligationTypes === undefined
      ? {}
      : { supportedObligationTypes: [...value.supportedObligationTypes] as readonly EnterpriseAccessObligationType[] }),
    declaredAt: value.declaredAt,
    correlationId: value.correlationId,
    ...(value.description === undefined ? {} : { description: value.description }),
  };
}

// ---------------------------------------------------------------------------
// Translation model (R005.A Phase 6) -- the canonical, compile-time-enforced
// read boundary between Enterprise and Provider Adapters. Enterprise Grant
// -> Provider Translation -> Provider Execution: only the first arrow is
// modeled here, as a pure narrowing projection of already-frozen contracts.
// Provider Translation's *output* and Provider Execution are never modeled
// -- both are provider-specific and explicitly out of scope (R005.0 ADR
// Phase 4/8: only Provider Translation/Execution vary per provider; every
// frozen contract, and this narrowing of it, stays identical).
// ---------------------------------------------------------------------------

/**
 * The *only* fields of `EnterpriseAccessGrant` (`@aoc-enterprise/access-grant`)
 * a Provider Adapter's grant translation may read, per R005.0 ADR Phase 4:
 * "`EnterpriseAccessGrant` (`resource`, `status`, `expiresAt`) is the ONLY
 * input a Provider Adapter reads from Enterprise's owned contracts." A
 * `Pick`, not a redefinition: this type can never drift from
 * `EnterpriseAccessGrant`'s own field types, and can never gain a field that
 * type does not also have.
 *
 * Deliberately excludes `id`, `decisionRef`, `principalId`, `issuedAt`,
 * `correlationId`, `issuerRef`, `obligationRefs`, and `auditRefs` -- every
 * one of those is Enterprise-owned audit/identity metadata a translation has
 * no need to read (`principalId` in particular: a Provider Adapter
 * translates *what* was granted and *until when*, never *who* on the
 * provider's own side, which is out of scope for a provider-neutral
 * contract to standardize).
 */
export type EnterpriseGrantTranslationInput = Pick<EnterpriseAccessGrant, 'resource' | 'status' | 'expiresAt'>;

/**
 * Projects a full `EnterpriseAccessGrant` down to exactly the fields
 * `EnterpriseGrantTranslationInput` permits. A pure, total, non-throwing
 * narrowing function -- it performs no execution, contacts no provider, and
 * produces no provider-specific output (a presigned URL, a SAS token, a
 * scoped SDK call); it only enforces, in code rather than only in
 * documentation, which fields a translation may read.
 */
export function toEnterpriseGrantTranslationInput(grant: EnterpriseAccessGrant): EnterpriseGrantTranslationInput {
  return { resource: grant.resource, status: grant.status, expiresAt: grant.expiresAt };
}

/**
 * The *only* fields of `EnterpriseGrantRevocation`
 * (`@aoc-enterprise/grant-revocation`) a Provider Adapter's revocation
 * interpretation may read, per R005.0 ADR Phase 5: "The adapter reads
 * `EnterpriseGrantRevocation.reason` ... and decides what, if anything, to
 * do on the provider's own side." `grantRef` is included because a
 * revocation interpretation is meaningless without knowing which grant it
 * revokes.
 *
 * Deliberately excludes `id`, `revokedAt`, `issuerRef`, `correlationId`,
 * `evidenceRefs`, and `description` -- audit/identity metadata a Provider
 * Adapter's own provider-side action does not need to read to decide what
 * `reason` implies.
 */
export type EnterpriseGrantRevocationInterpretationInput = Pick<EnterpriseGrantRevocation, 'grantRef' | 'reason'>;

/**
 * Projects a full `EnterpriseGrantRevocation` down to exactly the fields
 * `EnterpriseGrantRevocationInterpretationInput` permits. A pure, total,
 * non-throwing narrowing function -- it never decides, on its own, what a
 * Provider Adapter should do with `reason` (unpin an IPFS object, revoke a
 * presigned URL, remove a share permission, ...); that interpretation is
 * entirely a future adapter's own, provider-specific code.
 */
export function toEnterpriseGrantRevocationInterpretationInput(
  revocation: EnterpriseGrantRevocation,
): EnterpriseGrantRevocationInterpretationInput {
  return { grantRef: revocation.grantRef, reason: revocation.reason };
}

// ---------------------------------------------------------------------------
// Failure contract (R005.A Phase 7) -- a closed, provider-neutral failure
// vocabulary, and its pure mapping onto the frozen EnterpriseUsageEventType
// vocabulary. No retry logic, no networking, no timers: a Provider Adapter
// decides on its own, in its own code, when a failure occurred; this module
// only fixes what categories of failure exist and how each is reported.
// ---------------------------------------------------------------------------

/**
 * The canonical, closed vocabulary of provider-neutral failure categories a
 * Provider Adapter may observe while translating or executing against a
 * grant. Each value is a *category describing what went wrong*, never a
 * `success`/`httpStatus`/provider-response field (every one of the seven
 * frozen Access Governance contracts already forbids that): `'provider-unavailable'`
 * records that the provider could not be reached at all;
 * `'capability-unsupported'` records that the requested behavior is outside
 * this adapter's own declared `EnterpriseProviderCapability` set;
 * `'execution-rejected'` records that the provider was reached but declined
 * to carry out the translated request; `'grant-expired'` records that the
 * adapter itself compared `EnterpriseAccessGrant.expiresAt` against
 * wall-clock time (R005.0 ADR Phase 5/7) and refused to translate or honor a
 * lapsed grant; `'provider-timeout'` records that the provider did not
 * respond within whatever bound the adapter itself enforces (this contract
 * defines no timeout value or retry policy); `'unexpected-provider-failure'`
 * records any other provider-side failure that does not fit the other five
 * categories.
 *
 * This is deliberately a closed union, not an open string, mirroring every
 * other closed vocabulary in this Enterprise contract line. A future
 * category is a `schemaVersion` change to this package, not an escape
 * hatch. No provider-specific failure (e.g. `'pinata-pin-limit-exceeded'`,
 * `'s3-access-denied'`) is, or will ever be, added here.
 */
export const ENTERPRISE_PROVIDER_FAILURE_REASONS = {
  PROVIDER_UNAVAILABLE: 'provider-unavailable',
  CAPABILITY_UNSUPPORTED: 'capability-unsupported',
  EXECUTION_REJECTED: 'execution-rejected',
  GRANT_EXPIRED: 'grant-expired',
  PROVIDER_TIMEOUT: 'provider-timeout',
  UNEXPECTED_PROVIDER_FAILURE: 'unexpected-provider-failure',
} as const;

export type EnterpriseProviderFailureReason =
  (typeof ENTERPRISE_PROVIDER_FAILURE_REASONS)[keyof typeof ENTERPRISE_PROVIDER_FAILURE_REASONS];

/**
 * The subset of the frozen `EnterpriseUsageEventType` vocabulary
 * (`@aoc-enterprise/usage-event`) a provider failure is ever reported as.
 * Per R005.0 ADR Phase 5 ("Failure reporting"): "A provider-side failure
 * ... is reported as an `EnterpriseUsageEvent` with `eventType:
 * 'AccessFailed'` ... or `'AccessDenied'` ... never as a
 * `success`/`httpStatus`/provider-response field." `'AccessExpired'` is
 * included alongside those two because R005.0 ADR Phase 9.5 ("Expired
 * grant") shows an adapter-observed expiration reported as either
 * `'AccessExpired'` or `'AccessDenied'`, and `'grant-expired'` is this
 * vocabulary's own, more specific category for exactly that case.
 */
export type EnterpriseProviderFailureUsageEventType = Extract<EnterpriseUsageEventType, 'AccessFailed' | 'AccessDenied' | 'AccessExpired'>;

/**
 * Maps a Provider Adapter's own failure observation onto the one frozen
 * `EnterpriseUsageEventType` value it must be reported as -- a pure, total,
 * deterministic function, never a network call, never a retry, never a
 * timer. This is the concrete "translation" this package's failure contract
 * performs: it does not invent a new field for failure reporting (every
 * frozen contract in the Access Governance lifecycle already forbids a
 * `success`/`httpStatus`/provider-response field); it only fixes which of
 * the three already-canonical, negative `EnterpriseUsageEventType` values
 * each failure category becomes.
 */
export function mapEnterpriseProviderFailureToUsageEventType(
  reason: EnterpriseProviderFailureReason,
): EnterpriseProviderFailureUsageEventType {
  switch (reason) {
    case ENTERPRISE_PROVIDER_FAILURE_REASONS.GRANT_EXPIRED:
      return ENTERPRISE_USAGE_EVENT_TYPES.ACCESS_EXPIRED;
    case ENTERPRISE_PROVIDER_FAILURE_REASONS.CAPABILITY_UNSUPPORTED:
    case ENTERPRISE_PROVIDER_FAILURE_REASONS.EXECUTION_REJECTED:
      return ENTERPRISE_USAGE_EVENT_TYPES.ACCESS_DENIED;
    case ENTERPRISE_PROVIDER_FAILURE_REASONS.PROVIDER_UNAVAILABLE:
    case ENTERPRISE_PROVIDER_FAILURE_REASONS.PROVIDER_TIMEOUT:
    case ENTERPRISE_PROVIDER_FAILURE_REASONS.UNEXPECTED_PROVIDER_FAILURE:
      return ENTERPRISE_USAGE_EVENT_TYPES.ACCESS_FAILED;
    default: {
      const exhaustive: never = reason;
      throw new Error(`Unhandled EnterpriseProviderFailureReason: ${String(exhaustive)}`);
    }
  }
}
