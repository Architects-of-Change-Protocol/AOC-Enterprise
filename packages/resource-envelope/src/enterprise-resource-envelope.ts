import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';

/**
 * Enterprise composition over AOC Protocol's `ResourceRef`.
 *
 * `ResourceRef` (`kind`, `id`, `tenantId?`, `attributes?`) is canonical in
 * `@aoc/protocol` -- it is the sole identity primitive for "a resource" across
 * AOC. `EnterpriseResourceEnvelope` does not extend it (contrast with
 * `EnterpriseScopedAccessRequest` in `@aoc-enterprise/scoped-access`, which
 * does extend `ScopedAccessRequest`): a governed external resource needs
 * location, integrity and lifecycle semantics that are not additive fields on
 * "the same resource" the way `action` is additive to a scoped access
 * request. Extending `ResourceRef` would blur which fields are Protocol's
 * identity and which are Enterprise's governance metadata; wrapping it in a
 * `resource: ResourceRef` property keeps that boundary explicit and makes the
 * composition trivially greppable at every call site.
 *
 * `kind`, `id`, `tenantId` and `attributes` are never duplicated here. Every
 * function in this module that needs resource identity reads it from
 * `envelope.resource`, never from a same-named field on the envelope itself.
 *
 * This is a pure data contract: no persistence, no service, no API, no
 * provider SDK, no runtime execution. It describes an externally stored
 * resource for Access Governance to reason about later (a future
 * `AccessGrant` will reference an `EnterpriseResourceEnvelope`'s `resource`;
 * a future provider adapter will populate `location`/`integrity` from a real
 * store) -- neither of those exists yet, and this contract does not assume
 * or depend on their shape.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/resource-envelope`).
 */
export const ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION = '1.0.0' as const;

/**
 * Where the resource's bytes actually live, described without any
 * provider-specific vocabulary.
 *
 * `uri` is the only required field: a provider-neutral locator (an `s3://`,
 * `ipfs://`, `https://`, or any other URI scheme the eventual adapter
 * understands). `system` is a free-text label for which external system the
 * resource lives in (e.g. `'s3'`, `'pinata'`, `'azure-blob'`,
 * `'sharepoint'`) -- deliberately a plain string, not an enum, so adding a
 * new provider never requires a change to this contract (see "Future
 * Compatibility" in the package README). `systemReference` is that system's
 * own opaque native identifier for the object (a bucket/key pair, an IPFS
 * CID, a blob path) when the URI alone does not carry it convieniently --
 * never a credential, never a temporary/signed URL.
 */
export interface EnterpriseResourceLocation {
  readonly uri: string;
  readonly system?: string;
  readonly systemReference?: string;
}

/**
 * Content-addressable integrity for the resource's bytes at the time this
 * envelope was registered. Optional: a resource can be registered before its
 * content digest is known (e.g. registration precedes upload completion).
 * When present, both `algorithm` and `value` are required together -- an
 * algorithm without a digest (or vice versa) is an invalid combination (see
 * `validateEnterpriseResourceEnvelope`).
 *
 * `sha256` is the only supported algorithm today, matching the convention
 * already used for content/proof digests elsewhere in this repository (e.g.
 * the `*-proof.ts` domain files under `src/features`). This is deliberately
 * a closed literal union, not an open string, so an unsupported algorithm is
 * a compile-time error, not a validation surprise.
 */
export interface EnterpriseResourceIntegrity {
  readonly algorithm: 'sha256';
  readonly value: string;
  readonly sizeBytes?: number;
}

/**
 * Provider-neutral descriptive metadata about the resource's content --
 * never metadata about how to reach or authorize against it (that is
 * `location`'s job, minus any authorization concept, which does not belong
 * here at all).
 */
export interface EnterpriseResourceDescriptor {
  readonly displayName?: string;
  readonly contentType?: string;
  readonly tags?: readonly string[];
}

/**
 * The resource's own storage lifecycle -- does the external object still
 * exist, and in what form. This is deliberately unrelated to any business,
 * approval, or authorization lifecycle: an envelope's `lifecycleState` never
 * encodes whether access to the resource has been approved, granted, or
 * revoked (see the package README's "Explicit non-responsibilities" and the
 * negative tests in `__tests__/enterprise-resource-envelope.test.ts`). That
 * state belongs to a future `AccessGrant` contract, not here.
 *
 * - `registered` -- the envelope exists; the underlying object's presence in
 *   the external system has not been confirmed.
 * - `active` -- the underlying object is confirmed present and reachable at
 *   `location`.
 * - `archived` -- the underlying object has been moved to colder/long-term
 *   storage by its provider; `location` may no longer resolve the same way.
 * - `deleted` -- the underlying object no longer exists in the external
 *   system. The envelope itself is not deleted (Enterprise's own retention
 *   rules govern that); this only records that the resource it describes is
 *   gone.
 */
export type EnterpriseResourceLifecycleState = 'registered' | 'active' | 'archived' | 'deleted';

/**
 * The canonical Enterprise-owned contract for "a governed external
 * resource": a provider-neutral, non-executable description composing
 * Protocol's `ResourceRef` with the location, integrity, descriptive,
 * lifecycle and audit-correlation semantics Access Governance needs and
 * Protocol does not own. See the package README for the full design
 * rationale, ownership boundary, and relationship to `SourceDocument`,
 * future provider adapters, `AccessGrant`, and `UsageEvent`.
 */
export interface EnterpriseResourceEnvelope {
  readonly schemaVersion: typeof ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION;
  readonly resource: ResourceRef;
  readonly location: EnterpriseResourceLocation;
  readonly lifecycleState: EnterpriseResourceLifecycleState;
  readonly registeredAt: UtcDateTime;
  readonly integrity?: EnterpriseResourceIntegrity;
  readonly descriptor?: EnterpriseResourceDescriptor;
  /** Correlates this envelope's registration with an audit trail event, mirroring `AuditEventEnvelope.correlationId` in `@aoc/protocol`. */
  readonly correlationId?: CanonicalId;
}

// ---------------------------------------------------------------------------
// Identity equality -- derives from ResourceRef, never reinvented.
// ---------------------------------------------------------------------------

/** `kind`/`id`/`tenantId` equality between two `ResourceRef`s. `attributes` is descriptive, not identifying, and is intentionally excluded -- consistent with `legacyResourceIdentifier` in `@aoc-enterprise/scoped-access`, which also ignores `attributes` when forming a resource identity string. */
export function resourceRefIdentityEquals(a: ResourceRef, b: ResourceRef): boolean {
  return a.kind === b.kind && a.id === b.id && a.tenantId === b.tenantId;
}

/** Whether two envelopes describe the same governed resource. Delegates entirely to `resourceRefIdentityEquals` -- this module never defines a second identity algorithm. */
export function enterpriseResourceEnvelopeIdentityEquals(
  a: EnterpriseResourceEnvelope,
  b: EnterpriseResourceEnvelope,
): boolean {
  return resourceRefIdentityEquals(a.resource, b.resource);
}

function recordEquals(a: Readonly<Record<string, string>> | undefined, b: Readonly<Record<string, string>> | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function stringArrayEquals(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.length === bSorted.length && aSorted.every((value, index) => value === bSorted[index]);
}

function integrityEquals(a: EnterpriseResourceIntegrity | undefined, b: EnterpriseResourceIntegrity | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.algorithm === b.algorithm && a.value === b.value && a.sizeBytes === b.sizeBytes;
}

function descriptorEquals(a: EnterpriseResourceDescriptor | undefined, b: EnterpriseResourceDescriptor | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.displayName === b.displayName && a.contentType === b.contentType && stringArrayEquals(a.tags, b.tags);
}

/**
 * Full structural equality: identity (via `enterpriseResourceEnvelopeIdentityEquals`)
 * plus every other field. Two envelopes can share identity while describing a
 * different location, integrity, or lifecycle state (e.g. a resource that
 * moved provider) -- this function distinguishes that case; identity equality
 * alone does not.
 */
export function enterpriseResourceEnvelopeEquals(a: EnterpriseResourceEnvelope, b: EnterpriseResourceEnvelope): boolean {
  return (
    enterpriseResourceEnvelopeIdentityEquals(a, b) &&
    recordEquals(a.resource.attributes, b.resource.attributes) &&
    a.schemaVersion === b.schemaVersion &&
    a.location.uri === b.location.uri &&
    a.location.system === b.location.system &&
    a.location.systemReference === b.location.systemReference &&
    a.lifecycleState === b.lifecycleState &&
    a.registeredAt === b.registeredAt &&
    integrityEquals(a.integrity, b.integrity) &&
    descriptorEquals(a.descriptor, b.descriptor) &&
    a.correlationId === b.correlationId
  );
}

// ---------------------------------------------------------------------------
// Validation -- internal consistency, required fields, invalid combinations
// only. No provider validation, no credential validation, no network
// validation, no existence checks, no authorization, no permission
// evaluation.
// ---------------------------------------------------------------------------

export type EnterpriseResourceEnvelopeValidationCode =
  | 'MISSING_RESOURCE'
  | 'INVALID_RESOURCE_IDENTITY'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_LOCATION'
  | 'MISSING_LOCATION_URI'
  | 'MISSING_LIFECYCLE_STATE'
  | 'INVALID_LIFECYCLE_STATE'
  | 'MISSING_REGISTERED_AT'
  | 'INVALID_REGISTERED_AT'
  | 'INCOMPLETE_INTEGRITY'
  | 'INVALID_INTEGRITY_VALUE'
  | 'UNSUPPORTED_INTEGRITY_ALGORITHM'
  | 'ORPHANED_SYSTEM_REFERENCE';

export interface EnterpriseResourceEnvelopeValidationIssue {
  readonly code: EnterpriseResourceEnvelopeValidationCode;
  readonly message: string;
}

export type EnterpriseResourceEnvelopeValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseResourceEnvelopeValidationIssue[] };

const LIFECYCLE_STATES: readonly EnterpriseResourceLifecycleState[] = ['registered', 'active', 'archived', 'deleted'];
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates internal consistency of a candidate envelope. Accepts `unknown`
 * so it can guard deserialized/external input, not just already-typed
 * values. Never inspects `location.uri` for reachability, never checks
 * `system`/`systemReference` against a known provider list, and never
 * evaluates any form of permission -- only shape, required-field, and
 * paired-field consistency.
 */
export function validateEnterpriseResourceEnvelope(candidate: unknown): EnterpriseResourceEnvelopeValidationResult {
  const errors: EnterpriseResourceEnvelopeValidationIssue[] = [];

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_RESOURCE', message: 'Envelope must be an object.' }] };
  }

  if (candidate.schemaVersion !== ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION) {
    errors.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `schemaVersion must be '${ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION}'.`,
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

  if (!isPlainObject(candidate.location)) {
    errors.push({ code: 'MISSING_LOCATION', message: 'location is required.' });
  } else {
    const location = candidate.location;
    if (typeof location.uri !== 'string' || location.uri.length === 0) {
      errors.push({ code: 'MISSING_LOCATION_URI', message: 'location.uri must be a non-empty string.' });
    }
    if (location.systemReference !== undefined && location.system === undefined) {
      errors.push({
        code: 'ORPHANED_SYSTEM_REFERENCE',
        message: 'location.systemReference is set without location.system -- a native reference must be scoped to a named system.',
      });
    }
  }

  if (candidate.lifecycleState === undefined) {
    errors.push({ code: 'MISSING_LIFECYCLE_STATE', message: 'lifecycleState is required.' });
  } else if (
    typeof candidate.lifecycleState !== 'string' ||
    !LIFECYCLE_STATES.includes(candidate.lifecycleState as EnterpriseResourceLifecycleState)
  ) {
    errors.push({
      code: 'INVALID_LIFECYCLE_STATE',
      message: `lifecycleState must be one of: ${LIFECYCLE_STATES.join(', ')}.`,
    });
  }

  if (candidate.registeredAt === undefined) {
    errors.push({ code: 'MISSING_REGISTERED_AT', message: 'registeredAt is required.' });
  } else if (typeof candidate.registeredAt !== 'string' || !ISO_8601_PATTERN.test(candidate.registeredAt)) {
    errors.push({ code: 'INVALID_REGISTERED_AT', message: 'registeredAt must be an ISO 8601 UTC timestamp string.' });
  }

  if (candidate.integrity !== undefined) {
    if (!isPlainObject(candidate.integrity)) {
      errors.push({ code: 'INCOMPLETE_INTEGRITY', message: 'integrity must be an object when present.' });
    } else {
      const integrity = candidate.integrity;
      const hasAlgorithm = integrity.algorithm !== undefined;
      const hasValue = integrity.value !== undefined;
      if (hasAlgorithm !== hasValue) {
        errors.push({
          code: 'INCOMPLETE_INTEGRITY',
          message: 'integrity.algorithm and integrity.value must both be present together.',
        });
      } else if (hasAlgorithm && hasValue) {
        if (integrity.algorithm !== 'sha256') {
          errors.push({ code: 'UNSUPPORTED_INTEGRITY_ALGORITHM', message: "integrity.algorithm must be 'sha256'." });
        } else if (typeof integrity.value !== 'string' || !SHA256_HEX_PATTERN.test(integrity.value)) {
          errors.push({ code: 'INVALID_INTEGRITY_VALUE', message: 'integrity.value must be a 64-character hex sha256 digest.' });
        }
      }
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization -- stable, deterministic, version-safe, round-trip safe.
//
// Assumptions (see package README, "Serialization" section, for the full
// write-up):
//   1. Every key is written in a fixed order (matching declaration order
//      above), so two envelopes that are `enterpriseResourceEnvelopeEquals`
//      always serialize to byte-identical JSON text via
//      `JSON.stringify(serializeEnterpriseResourceEnvelope(x))`.
//   2. `resource.attributes` keys and `descriptor.tags` are treated as
//      unordered sets and sorted before serialization -- two envelopes that
//      differ only in the construction order of an attributes map or a tags
//      array serialize identically.
//   3. Optional fields that are `undefined` are omitted from the output
//      entirely (never written as `null` or an explicit `undefined`), so
//      `deserializeEnterpriseResourceEnvelope(serializeEnterpriseResourceEnvelope(x))`
//      round-trips to an envelope `enterpriseResourceEnvelopeEquals` to `x`.
//   4. No field ever carries a provider secret or process-local runtime
//      state (a socket, a client instance, a timer) -- every field is a
//      plain string, number, or plain object of those, which is what makes
//      round-trip safety possible in the first place.
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseResourceEnvelope {
  readonly schemaVersion: string;
  readonly resource: {
    readonly kind: string;
    readonly id: string;
    readonly tenantId?: string;
    readonly attributes?: Readonly<Record<string, string>>;
  };
  readonly location: {
    readonly uri: string;
    readonly system?: string;
    readonly systemReference?: string;
  };
  readonly lifecycleState: string;
  readonly registeredAt: string;
  readonly integrity?: {
    readonly algorithm: string;
    readonly value: string;
    readonly sizeBytes?: number;
  };
  readonly descriptor?: {
    readonly displayName?: string;
    readonly contentType?: string;
    readonly tags?: readonly string[];
  };
  readonly correlationId?: string;
}

function sortedAttributes(attributes: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> | undefined {
  if (attributes === undefined) return undefined;
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(attributes).sort()) {
    sorted[key] = attributes[key] as string;
  }
  return sorted;
}

function sortedTags(tags: readonly string[] | undefined): readonly string[] | undefined {
  return tags === undefined ? undefined : [...tags].sort();
}

/** Projects an `EnterpriseResourceEnvelope` to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already a valid `EnterpriseResourceEnvelope` by construction. */
export function serializeEnterpriseResourceEnvelope(envelope: EnterpriseResourceEnvelope): SerializedEnterpriseResourceEnvelope {
  const attributes = sortedAttributes(envelope.resource.attributes);
  const tags = sortedTags(envelope.descriptor?.tags);

  return {
    schemaVersion: envelope.schemaVersion,
    resource: {
      kind: envelope.resource.kind,
      id: envelope.resource.id,
      ...(envelope.resource.tenantId === undefined ? {} : { tenantId: envelope.resource.tenantId }),
      ...(attributes === undefined ? {} : { attributes }),
    },
    location: {
      uri: envelope.location.uri,
      ...(envelope.location.system === undefined ? {} : { system: envelope.location.system }),
      ...(envelope.location.systemReference === undefined ? {} : { systemReference: envelope.location.systemReference }),
    },
    lifecycleState: envelope.lifecycleState,
    registeredAt: envelope.registeredAt,
    ...(envelope.integrity === undefined
      ? {}
      : {
          integrity: {
            algorithm: envelope.integrity.algorithm,
            value: envelope.integrity.value,
            ...(envelope.integrity.sizeBytes === undefined ? {} : { sizeBytes: envelope.integrity.sizeBytes }),
          },
        }),
    ...(envelope.descriptor === undefined
      ? {}
      : {
          descriptor: {
            ...(envelope.descriptor.displayName === undefined ? {} : { displayName: envelope.descriptor.displayName }),
            ...(envelope.descriptor.contentType === undefined ? {} : { contentType: envelope.descriptor.contentType }),
            ...(tags === undefined ? {} : { tags }),
          },
        }),
    ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
  };
}

/**
 * Thrown by `deserializeEnterpriseResourceEnvelope` when the input fails
 * `validateEnterpriseResourceEnvelope`. Carries the full issue list rather
 * than just the first, matching `EnterpriseResourceEnvelopeValidationResult`.
 */
export class EnterpriseResourceEnvelopeValidationError extends Error {
  readonly issues: readonly EnterpriseResourceEnvelopeValidationIssue[];

  constructor(issues: readonly EnterpriseResourceEnvelopeValidationIssue[]) {
    super(`Invalid EnterpriseResourceEnvelope: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseResourceEnvelopeValidationError';
    this.issues = issues;
  }
}

/**
 * Parses and validates a candidate value (e.g. `JSON.parse` output) into an
 * `EnterpriseResourceEnvelope`. Every field is mapped explicitly from the
 * validated candidate -- no structural cast (`as EnterpriseResourceEnvelope`)
 * over unchecked input, matching the explicit-mapping convention already
 * established at `packages/control-plane/audit-envelope-mapper.ts`.
 *
 * Throws `EnterpriseResourceEnvelopeValidationError` when validation fails.
 */
export function deserializeEnterpriseResourceEnvelope(candidate: unknown): EnterpriseResourceEnvelope {
  const result = validateEnterpriseResourceEnvelope(candidate);
  if (!result.valid) {
    throw new EnterpriseResourceEnvelopeValidationError(result.errors);
  }

  // Validated above: `candidate` has the required shape of a
  // SerializedEnterpriseResourceEnvelope. Read through a narrow local view
  // instead of casting the whole object to EnterpriseResourceEnvelope.
  const value = candidate as SerializedEnterpriseResourceEnvelope;

  const resource: ResourceRef = {
    kind: value.resource.kind,
    id: value.resource.id,
    ...(value.resource.tenantId === undefined ? {} : { tenantId: value.resource.tenantId }),
    ...(value.resource.attributes === undefined ? {} : { attributes: { ...value.resource.attributes } }),
  };

  const location: EnterpriseResourceLocation = {
    uri: value.location.uri,
    ...(value.location.system === undefined ? {} : { system: value.location.system }),
    ...(value.location.systemReference === undefined ? {} : { systemReference: value.location.systemReference }),
  };

  const integrity: EnterpriseResourceIntegrity | undefined =
    value.integrity === undefined
      ? undefined
      : {
          algorithm: 'sha256',
          value: value.integrity.value,
          ...(value.integrity.sizeBytes === undefined ? {} : { sizeBytes: value.integrity.sizeBytes }),
        };

  const descriptor: EnterpriseResourceDescriptor | undefined =
    value.descriptor === undefined
      ? undefined
      : {
          ...(value.descriptor.displayName === undefined ? {} : { displayName: value.descriptor.displayName }),
          ...(value.descriptor.contentType === undefined ? {} : { contentType: value.descriptor.contentType }),
          ...(value.descriptor.tags === undefined ? {} : { tags: [...value.descriptor.tags] }),
        };

  return {
    schemaVersion: ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION,
    resource,
    location,
    lifecycleState: value.lifecycleState as EnterpriseResourceLifecycleState,
    registeredAt: value.registeredAt,
    ...(integrity === undefined ? {} : { integrity }),
    ...(descriptor === undefined ? {} : { descriptor }),
    ...(value.correlationId === undefined ? {} : { correlationId: value.correlationId }),
  };
}
