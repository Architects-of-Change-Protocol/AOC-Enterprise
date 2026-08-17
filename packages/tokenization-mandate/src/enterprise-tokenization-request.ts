import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import { resourceRefIdentityEquals } from '@aoc-enterprise/resource-envelope';

import {
  ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
  ENTERPRISE_TOKENIZE_CAPABILITY,
  collectEnterpriseTokenizationTermsIssues,
  enterpriseTokenizationTermsEquals,
  isEnterpriseTokenizeCapability,
  isTokenizationCanonicalIdArray,
  isTokenizationNonEmptyString,
  isTokenizationPlainObject,
  isTokenizationTimestamp,
  readEnterpriseTokenizationTerms,
  serializeEnterpriseTokenizationTerms,
  tokenizationOptionalStringArrayEquals,
} from './enterprise-tokenization-terms.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { EnterpriseTokenizationTerms, EnterpriseTokenizationTermsValidationCode, SerializedEnterpriseTokenizationTerms } from './enterprise-tokenization-terms.js';

/**
 * The canonical Enterprise-owned contract for **an unevaluated request to
 * exercise the `TOKENIZE` capability over specified rights of an
 * already-governed asset**.
 *
 * A request is not an authorization and never becomes one by existing.
 * Submitting one asserts nothing about who owns the asset: authority is
 * evaluated by the primitives AOC already has (Authority Graph reached
 * through Recognition Runtime, and the Approval Runtime's own quorum and
 * segregation-of-duties policies), and a request whose requester holds no
 * `TOKENIZE` authority is denied by that evaluation, not by this record.
 *
 * `asset` composes Protocol's `ResourceRef` directly -- identity only, never
 * the full `EnterpriseResourceEnvelope` -- the same identity-only
 * composition style `EnterpriseAccessGrant.resource` and
 * `EnterpriseUsageEvent.resource` already establish. The asset must already
 * be governed: this contract identifies it, it does not register, protocolize,
 * or attest it.
 *
 * This is a pure data contract: no persistence, no service, no API, no policy
 * engine, no provider SDK, no execution.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/tokenization-mandate`).
 */
export interface EnterpriseTokenizationRequest {
  readonly schemaVersion: typeof ENTERPRISE_TOKENIZATION_SCHEMA_VERSION;
  readonly id: CanonicalId;
  /** Always exactly `ENTERPRISE_TOKENIZE_CAPABILITY`. Carried explicitly (rather than implied by the type) so a serialized request names the governed capability it exercises on its face, and so `PROTOCOLIZE`/`LICENSE`/`TRANSFER` payloads can never be replayed through this contract. */
  readonly capability: typeof ENTERPRISE_TOKENIZE_CAPABILITY;
  readonly asset: ResourceRef;
  readonly requestedBy: CanonicalId;
  readonly terms: EnterpriseTokenizationTerms;
  readonly requestedAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  /** The expiry the requester asks the authorization to carry. A request, not a guarantee -- the issued mandate's own `expiresAt` is authoritative. */
  readonly requestedExpiresAt?: UtcDateTime;
  readonly justification?: string;
  /** Opaque pointers to evidence records supporting this request, mirroring `EnterpriseAccessDecision.evidenceRefs`. */
  readonly evidenceRefs?: readonly CanonicalId[];
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Whether two records describe the same requested exercise: same request id, same asset, same requester. Two requests can share identity while disagreeing on every other field (e.g. a corrected `justification`). */
export function enterpriseTokenizationRequestIdentityEquals(a: EnterpriseTokenizationRequest, b: EnterpriseTokenizationRequest): boolean {
  return a.id === b.id && a.requestedBy === b.requestedBy && resourceRefIdentityEquals(a.asset, b.asset);
}

export function enterpriseTokenizationRequestEquals(a: EnterpriseTokenizationRequest, b: EnterpriseTokenizationRequest): boolean {
  return (
    enterpriseTokenizationRequestIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.capability === b.capability &&
    enterpriseTokenizationTermsEquals(a.terms, b.terms) &&
    a.requestedAt === b.requestedAt &&
    a.correlationId === b.correlationId &&
    a.requestedExpiresAt === b.requestedExpiresAt &&
    a.justification === b.justification &&
    tokenizationOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseTokenizationRequestValidationCode =
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
  | EnterpriseTokenizationTermsValidationCode;

export interface EnterpriseTokenizationRequestValidationIssue {
  readonly code: EnterpriseTokenizationRequestValidationCode;
  readonly message: string;
}

export type EnterpriseTokenizationRequestValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseTokenizationRequestValidationIssue[] };

/**
 * Validates internal consistency of a candidate request. Accepts `unknown`
 * so it can guard deserialized/external input. Never checks whether the
 * asset exists, whether the requester holds authority, or whether any
 * referenced record resolves -- none of those is a property of this record.
 */
export function validateEnterpriseTokenizationRequest(candidate: unknown): EnterpriseTokenizationRequestValidationResult {
  if (!isTokenizationPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Tokenization request must be an object.' }] };
  }

  const errors: EnterpriseTokenizationRequestValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_TOKENIZATION_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_TOKENIZATION_SCHEMA_VERSION}'.` });
  }

  if (!isTokenizationNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (candidate.capability === undefined) {
    errors.push({ code: 'MISSING_CAPABILITY', message: `capability is required and must be '${ENTERPRISE_TOKENIZE_CAPABILITY}'.` });
  } else if (!isEnterpriseTokenizeCapability(candidate.capability)) {
    errors.push({
      code: 'CAPABILITY_MISMATCH',
      message: `capability must be exactly '${ENTERPRISE_TOKENIZE_CAPABILITY}'; TOKENIZE is a distinct governed capability and this contract never expresses any other.`,
    });
  }

  if (!isTokenizationPlainObject(candidate.asset)) {
    errors.push({ code: 'MISSING_ASSET', message: 'asset (a ResourceRef) is required.' });
  } else if (!isTokenizationNonEmptyString(candidate.asset.kind) || !isTokenizationNonEmptyString(candidate.asset.id)) {
    errors.push({ code: 'INVALID_ASSET', message: 'asset.kind and asset.id must both be non-empty strings.' });
  }

  if (!isTokenizationNonEmptyString(candidate.requestedBy)) {
    errors.push({
      code: candidate.requestedBy === undefined ? 'MISSING_REQUESTED_BY' : 'INVALID_REQUESTED_BY',
      message: 'requestedBy is required and must be a non-empty string.',
    });
  }

  errors.push(...collectEnterpriseTokenizationTermsIssues(candidate.terms));

  if (candidate.requestedAt === undefined) {
    errors.push({ code: 'MISSING_REQUESTED_AT', message: 'requestedAt is required.' });
  } else if (!isTokenizationTimestamp(candidate.requestedAt)) {
    errors.push({ code: 'INVALID_REQUESTED_AT', message: 'requestedAt must be an ISO 8601 timestamp string.' });
  }

  if (candidate.requestedExpiresAt !== undefined && !isTokenizationTimestamp(candidate.requestedExpiresAt)) {
    errors.push({ code: 'INVALID_REQUESTED_EXPIRES_AT', message: 'requestedExpiresAt must be an ISO 8601 timestamp string when present.' });
  }

  if (!isTokenizationNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.justification !== undefined && !isTokenizationNonEmptyString(candidate.justification)) {
    errors.push({ code: 'INVALID_JUSTIFICATION', message: 'justification must be a non-empty string when present.' });
  }

  if (candidate.evidenceRefs !== undefined && !isTokenizationCanonicalIdArray(candidate.evidenceRefs)) {
    errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseTokenizationRequest {
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
  readonly terms: SerializedEnterpriseTokenizationTerms;
  readonly requestedAt: string;
  readonly correlationId: string;
  readonly requestedExpiresAt?: string;
  readonly justification?: string;
  readonly evidenceRefs?: readonly string[];
}

export function serializeTokenizationResourceRef(resource: ResourceRef): SerializedEnterpriseTokenizationRequest['asset'] {
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

export function readTokenizationResourceRef(value: SerializedEnterpriseTokenizationRequest['asset']): ResourceRef {
  return {
    kind: value.kind,
    id: value.id,
    ...(value.tenantId === undefined ? {} : { tenantId: value.tenantId }),
    ...(value.attributes === undefined ? {} : { attributes: { ...value.attributes } }),
  };
}

/** Projects a request to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseTokenizationRequest(request: EnterpriseTokenizationRequest): SerializedEnterpriseTokenizationRequest {
  return {
    schemaVersion: request.schemaVersion,
    id: request.id,
    capability: request.capability,
    asset: serializeTokenizationResourceRef(request.asset),
    requestedBy: request.requestedBy,
    terms: serializeEnterpriseTokenizationTerms(request.terms),
    requestedAt: request.requestedAt,
    correlationId: request.correlationId,
    ...(request.requestedExpiresAt === undefined ? {} : { requestedExpiresAt: request.requestedExpiresAt }),
    ...(request.justification === undefined ? {} : { justification: request.justification }),
    ...(request.evidenceRefs === undefined ? {} : { evidenceRefs: [...request.evidenceRefs].sort() }),
  };
}

/** Thrown by `deserializeEnterpriseTokenizationRequest` when the input fails validation. Carries the full issue list rather than just the first. */
export class EnterpriseTokenizationRequestValidationError extends Error {
  readonly issues: readonly EnterpriseTokenizationRequestValidationIssue[];

  constructor(issues: readonly EnterpriseTokenizationRequestValidationIssue[]) {
    super(`Invalid EnterpriseTokenizationRequest: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseTokenizationRequestValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseTokenizationRequest`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseTokenizationRequest(candidate: unknown): EnterpriseTokenizationRequest {
  const result = validateEnterpriseTokenizationRequest(candidate);
  if (!result.valid) throw new EnterpriseTokenizationRequestValidationError(result.errors);

  const value = candidate as SerializedEnterpriseTokenizationRequest;
  return {
    schemaVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
    id: value.id,
    capability: ENTERPRISE_TOKENIZE_CAPABILITY,
    asset: readTokenizationResourceRef(value.asset),
    requestedBy: value.requestedBy,
    terms: readEnterpriseTokenizationTerms(value.terms),
    requestedAt: value.requestedAt,
    correlationId: value.correlationId,
    ...(value.requestedExpiresAt === undefined ? {} : { requestedExpiresAt: value.requestedExpiresAt }),
    ...(value.justification === undefined ? {} : { justification: value.justification }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}
