import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import { resourceRefIdentityEquals } from '@aoc-enterprise/resource-envelope';

import {
  ENTERPRISE_LICENSE_CAPABILITY,
  ENTERPRISE_LICENSE_SCHEMA_VERSION,
  collectEnterpriseLicenseTermsIssues,
  enterpriseLicenseTermsEquals,
  isEnterpriseLicenseCapability,
  isLicenseCanonicalIdArray,
  isLicenseNonEmptyString,
  isLicensePlainObject,
  isLicenseTimestamp,
  licenseOptionalStringArrayEquals,
  readEnterpriseLicenseTerms,
  serializeEnterpriseLicenseTerms,
} from './enterprise-license-terms.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { EnterpriseLicenseTerms, EnterpriseLicenseTermsValidationCode, SerializedEnterpriseLicenseTerms } from './enterprise-license-terms.js';

/**
 * The canonical Enterprise-owned contract for **an unevaluated request to
 * exercise the `LICENSE` governed action over specified rights of an
 * already-governed asset**.
 *
 * A request is not an authorization and never becomes one by existing.
 * Submitting one asserts nothing about who holds the asset's rights, nothing
 * about whether the requester may license them, and nothing about whether the
 * licensee is entitled to receive the permission: authority is evaluated by
 * the primitives Soberanía already has (Authority Graph reached through Recognition
 * Runtime, and the Approval Runtime's own quorum and segregation-of-duties
 * policies), and a request whose requester holds no `LICENSE` authority is
 * denied by that evaluation, not by this record.
 *
 * `asset` composes Protocol's `ResourceRef` directly -- identity only, never
 * the full `EnterpriseResourceEnvelope` -- the same identity-only composition
 * style `EnterpriseAccessGrant.resource`, `EnterpriseUsageEvent.resource`,
 * `EnterpriseTokenizationRequest.asset` and
 * `EnterpriseCollateralizationRequest.asset` already establish. The asset
 * must already be governed: this contract identifies it, it does not
 * register, protocolize, or attest it, and it never copies the asset into the
 * authorization.
 *
 * This is a pure data contract: no persistence, no service, no API, no policy
 * engine, no provider SDK, no execution.
 *
 * Ownership: Soberanía Enterprise (`@aoc-enterprise/license-mandate`).
 */
export interface EnterpriseLicenseRequest {
  readonly schemaVersion: typeof ENTERPRISE_LICENSE_SCHEMA_VERSION;
  readonly id: CanonicalId;
  /** Always exactly `ENTERPRISE_LICENSE_CAPABILITY`. Carried explicitly (rather than implied by the type) so a serialized request names the governed action it exercises on its face, and so `TOKENIZE`/`COLLATERALIZE`/`TRANSFER` payloads can never be replayed through this contract. */
  readonly capability: typeof ENTERPRISE_LICENSE_CAPABILITY;
  readonly asset: ResourceRef;
  readonly requestedBy: CanonicalId;
  readonly terms: EnterpriseLicenseTerms;
  readonly requestedAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  /** The expiry the requester asks the authorization to carry. A request, not a guarantee -- the issued mandate's own `expiresAt` is authoritative, and neither bounds the external license's own term. */
  readonly requestedExpiresAt?: UtcDateTime;
  readonly justification?: string;
  /** Opaque pointers to evidence records supporting this request -- an external agreement, a payment or royalty arrangement, a diligence record. Mirrors `EnterpriseAccessDecision.evidenceRefs`. Soberanía never dereferences or interprets them. */
  readonly evidenceRefs?: readonly CanonicalId[];
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Whether two records describe the same requested exercise: same request id, same asset, same requester. Two requests can share identity while disagreeing on every other field (e.g. a corrected `justification`). */
export function enterpriseLicenseRequestIdentityEquals(a: EnterpriseLicenseRequest, b: EnterpriseLicenseRequest): boolean {
  return a.id === b.id && a.requestedBy === b.requestedBy && resourceRefIdentityEquals(a.asset, b.asset);
}

export function enterpriseLicenseRequestEquals(a: EnterpriseLicenseRequest, b: EnterpriseLicenseRequest): boolean {
  return (
    enterpriseLicenseRequestIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.capability === b.capability &&
    enterpriseLicenseTermsEquals(a.terms, b.terms) &&
    a.requestedAt === b.requestedAt &&
    a.correlationId === b.correlationId &&
    a.requestedExpiresAt === b.requestedExpiresAt &&
    a.justification === b.justification &&
    licenseOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseLicenseRequestValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_CAPABILITY'
  | 'CAPABILITY_MISMATCH'
  | 'MISSING_ASSET'
  | 'INVALID_ASSET'
  | 'MISSING_REQUESTED_BY'
  | 'INVALID_REQUESTED_BY'
  | 'MISSING_REQUESTED_AT'
  | 'INVALID_REQUESTED_AT'
  | 'INVALID_REQUESTED_EXPIRES_AT'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_JUSTIFICATION'
  | 'INVALID_EVIDENCE_REFS'
  | EnterpriseLicenseTermsValidationCode;

export interface EnterpriseLicenseRequestValidationIssue {
  readonly code: EnterpriseLicenseRequestValidationCode;
  readonly message: string;
}

export type EnterpriseLicenseRequestValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseLicenseRequestValidationIssue[] };

/**
 * Validates internal consistency of a candidate request. Accepts `unknown` so
 * it can guard deserialized/external input. Never checks whether the asset
 * exists, whether the requester holds authority, whether the licensee is a
 * real party, whether the underlying right subsists or is licensable, or
 * whether any referenced record exists -- none of those is a property of this
 * record.
 */
export function validateEnterpriseLicenseRequest(candidate: unknown): EnterpriseLicenseRequestValidationResult {
  if (!isLicensePlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'License request must be an object.' }] };
  }

  const errors: EnterpriseLicenseRequestValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_LICENSE_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_LICENSE_SCHEMA_VERSION}'.` });
  }

  if (!isLicenseNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (candidate.capability === undefined) {
    errors.push({ code: 'MISSING_CAPABILITY', message: `capability is required and must be '${ENTERPRISE_LICENSE_CAPABILITY}'.` });
  } else if (!isEnterpriseLicenseCapability(candidate.capability)) {
    errors.push({
      code: 'CAPABILITY_MISMATCH',
      message: `capability must be exactly '${ENTERPRISE_LICENSE_CAPABILITY}'; LICENSE is a distinct governed action and this contract never expresses any other.`,
    });
  }

  if (!isLicensePlainObject(candidate.asset)) {
    errors.push({ code: 'MISSING_ASSET', message: 'asset (a ResourceRef) is required.' });
  } else if (!isLicenseNonEmptyString(candidate.asset.kind) || !isLicenseNonEmptyString(candidate.asset.id)) {
    errors.push({ code: 'INVALID_ASSET', message: 'asset.kind and asset.id must both be non-empty strings.' });
  }

  if (!isLicenseNonEmptyString(candidate.requestedBy)) {
    errors.push({
      code: candidate.requestedBy === undefined ? 'MISSING_REQUESTED_BY' : 'INVALID_REQUESTED_BY',
      message: 'requestedBy is required and must be a non-empty string.',
    });
  }

  errors.push(...collectEnterpriseLicenseTermsIssues(candidate.terms));

  if (candidate.requestedAt === undefined) {
    errors.push({ code: 'MISSING_REQUESTED_AT', message: 'requestedAt is required.' });
  } else if (!isLicenseTimestamp(candidate.requestedAt)) {
    errors.push({ code: 'INVALID_REQUESTED_AT', message: 'requestedAt must be an ISO 8601 timestamp string.' });
  }

  if (candidate.requestedExpiresAt !== undefined && !isLicenseTimestamp(candidate.requestedExpiresAt)) {
    errors.push({ code: 'INVALID_REQUESTED_EXPIRES_AT', message: 'requestedExpiresAt must be an ISO 8601 timestamp string when present.' });
  }

  if (!isLicenseNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.justification !== undefined && !isLicenseNonEmptyString(candidate.justification)) {
    errors.push({ code: 'INVALID_JUSTIFICATION', message: 'justification must be a non-empty string when present.' });
  }

  if (candidate.evidenceRefs !== undefined && !isLicenseCanonicalIdArray(candidate.evidenceRefs)) {
    errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseLicenseRequest {
  readonly schemaVersion: string;
  readonly id: string;
  readonly capability: string;
  readonly asset: {
    readonly kind: string;
    readonly id: string;
    readonly tenantId?: string;
    readonly attributes?: Readonly<Record<string, string>>;
  };
  readonly requestedBy: string;
  readonly terms: SerializedEnterpriseLicenseTerms;
  readonly requestedAt: string;
  readonly correlationId: string;
  readonly requestedExpiresAt?: string;
  readonly justification?: string;
  readonly evidenceRefs?: readonly string[];
}

export function serializeLicenseResourceRef(resource: ResourceRef): SerializedEnterpriseLicenseRequest['asset'] {
  const attributes = resource.attributes;
  let sortedAttributes: Record<string, string> | undefined;
  if (attributes !== undefined) {
    sortedAttributes = {};
    for (const key of Object.keys(attributes).sort()) sortedAttributes[key] = attributes[key] as string;
  }
  return {
    kind: resource.kind,
    id: resource.id,
    ...(resource.tenantId === undefined ? {} : { tenantId: resource.tenantId }),
    ...(sortedAttributes === undefined ? {} : { attributes: sortedAttributes }),
  };
}

export function readLicenseResourceRef(value: SerializedEnterpriseLicenseRequest['asset']): ResourceRef {
  return {
    kind: value.kind,
    id: value.id,
    ...(value.tenantId === undefined ? {} : { tenantId: value.tenantId }),
    ...(value.attributes === undefined ? {} : { attributes: { ...value.attributes } }),
  };
}

/** Projects a request to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseLicenseRequest(request: EnterpriseLicenseRequest): SerializedEnterpriseLicenseRequest {
  return {
    schemaVersion: request.schemaVersion,
    id: request.id,
    capability: request.capability,
    asset: serializeLicenseResourceRef(request.asset),
    requestedBy: request.requestedBy,
    terms: serializeEnterpriseLicenseTerms(request.terms),
    requestedAt: request.requestedAt,
    correlationId: request.correlationId,
    ...(request.requestedExpiresAt === undefined ? {} : { requestedExpiresAt: request.requestedExpiresAt }),
    ...(request.justification === undefined ? {} : { justification: request.justification }),
    ...(request.evidenceRefs === undefined ? {} : { evidenceRefs: [...request.evidenceRefs].sort() }),
  };
}

/** Thrown by `deserializeEnterpriseLicenseRequest` when the input fails validation. Carries the full issue list rather than just the first. */
export class EnterpriseLicenseRequestValidationError extends Error {
  readonly issues: readonly EnterpriseLicenseRequestValidationIssue[];

  constructor(issues: readonly EnterpriseLicenseRequestValidationIssue[]) {
    super(`Invalid EnterpriseLicenseRequest: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseLicenseRequestValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseLicenseRequest`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseLicenseRequest(candidate: unknown): EnterpriseLicenseRequest {
  const result = validateEnterpriseLicenseRequest(candidate);
  if (!result.valid) throw new EnterpriseLicenseRequestValidationError(result.errors);

  const value = candidate as SerializedEnterpriseLicenseRequest;
  return {
    schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
    id: value.id,
    capability: ENTERPRISE_LICENSE_CAPABILITY,
    asset: readLicenseResourceRef(value.asset),
    requestedBy: value.requestedBy,
    terms: readEnterpriseLicenseTerms(value.terms),
    requestedAt: value.requestedAt,
    correlationId: value.correlationId,
    ...(value.requestedExpiresAt === undefined ? {} : { requestedExpiresAt: value.requestedExpiresAt }),
    ...(value.justification === undefined ? {} : { justification: value.justification }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}
