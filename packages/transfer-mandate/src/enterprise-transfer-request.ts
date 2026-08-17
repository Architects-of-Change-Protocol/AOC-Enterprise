import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import { resourceRefIdentityEquals } from '@aoc-enterprise/resource-envelope';

import {
  ENTERPRISE_TRANSFER_CAPABILITY,
  ENTERPRISE_TRANSFER_SCHEMA_VERSION,
  collectEnterpriseTransferTermsIssues,
  enterpriseTransferTermsEquals,
  isEnterpriseTransferCapability,
  isTransferCanonicalIdArray,
  isTransferNonEmptyString,
  isTransferPlainObject,
  isTransferTimestamp,
  readEnterpriseTransferTerms,
  serializeEnterpriseTransferTerms,
  transferOptionalStringArrayEquals,
} from './enterprise-transfer-terms.js';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { EnterpriseTransferTerms, EnterpriseTransferTermsValidationCode, SerializedEnterpriseTransferTerms } from './enterprise-transfer-terms.js';

/**
 * The canonical Enterprise-owned contract for **an unevaluated request to
 * exercise the `TRANSFER` governed action over specified rights of an
 * already-governed asset**.
 *
 * A request is not an authorization and never becomes one by existing.
 * Submitting one asserts nothing about who holds the asset's rights, nothing
 * about whether the requester may move them, nothing about whether the named
 * transferor genuinely holds them, and nothing about whether the recipient may
 * receive them: authority is evaluated by the primitives AOC already has
 * (Authority Graph reached through Recognition Runtime, and the Approval
 * Runtime's own quorum and segregation-of-duties policies), and a request whose
 * requester holds no `TRANSFER` authority is denied by that evaluation, not by
 * this record.
 *
 * In particular, naming a `transferorRef` in `terms` is a *claim about whose
 * right is moving*, never a proof that it is theirs and never a grant of
 * authority to the requester. The request records the claim so the decision can
 * be evaluated against it and so an auditor can see what was asserted.
 *
 * `asset` composes Protocol's `ResourceRef` directly -- identity only, never
 * the full `EnterpriseResourceEnvelope` -- the same identity-only composition
 * style `EnterpriseAccessGrant.resource`, `EnterpriseUsageEvent.resource`,
 * `EnterpriseTokenizationRequest.asset`,
 * `EnterpriseCollateralizationRequest.asset` and
 * `EnterpriseLicenseRequest.asset` already establish. The asset must already be
 * governed: this contract identifies it, it does not register, protocolize, or
 * attest it, and it never copies the asset into the authorization.
 *
 * This is a pure data contract: no persistence, no service, no API, no policy
 * engine, no provider SDK, no execution.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/transfer-mandate`).
 */
export interface EnterpriseTransferRequest {
  readonly schemaVersion: typeof ENTERPRISE_TRANSFER_SCHEMA_VERSION;
  readonly id: CanonicalId;
  /** Always exactly `ENTERPRISE_TRANSFER_CAPABILITY`. Carried explicitly (rather than implied by the type) so a serialized request names the governed action it exercises on its face, and so `TOKENIZE`/`COLLATERALIZE`/`LICENSE` payloads can never be replayed through this contract. */
  readonly capability: typeof ENTERPRISE_TRANSFER_CAPABILITY;
  readonly asset: ResourceRef;
  /** Who submitted the request. Deliberately distinct from `terms.transferorRef`: a delegated administrator routinely submits a transfer of a right held by the entity it acts for. */
  readonly requestedBy: CanonicalId;
  readonly terms: EnterpriseTransferTerms;
  readonly requestedAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  /** The expiry the requester asks the authorization to carry. A request, not a guarantee -- the issued mandate's own `expiresAt` is authoritative. */
  readonly requestedExpiresAt?: UtcDateTime;
  readonly justification?: string;
  /** Opaque pointers to evidence records supporting this request -- a holding record, an agreement, a consideration arrangement, a diligence record. Mirrors `EnterpriseAccessDecision.evidenceRefs`. AOC never dereferences or interprets them. */
  readonly evidenceRefs?: readonly CanonicalId[];
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/** Whether two records describe the same requested exercise: same request id, same asset, same requester. Two requests can share identity while disagreeing on every other field (e.g. a corrected `justification`). */
export function enterpriseTransferRequestIdentityEquals(a: EnterpriseTransferRequest, b: EnterpriseTransferRequest): boolean {
  return a.id === b.id && a.requestedBy === b.requestedBy && resourceRefIdentityEquals(a.asset, b.asset);
}

export function enterpriseTransferRequestEquals(a: EnterpriseTransferRequest, b: EnterpriseTransferRequest): boolean {
  return (
    enterpriseTransferRequestIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.capability === b.capability &&
    enterpriseTransferTermsEquals(a.terms, b.terms) &&
    a.requestedAt === b.requestedAt &&
    a.correlationId === b.correlationId &&
    a.requestedExpiresAt === b.requestedExpiresAt &&
    a.justification === b.justification &&
    transferOptionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseTransferRequestValidationCode =
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
  | EnterpriseTransferTermsValidationCode;

export interface EnterpriseTransferRequestValidationIssue {
  readonly code: EnterpriseTransferRequestValidationCode;
  readonly message: string;
}

export type EnterpriseTransferRequestValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseTransferRequestValidationIssue[] };

/**
 * Validates internal consistency of a candidate request. Accepts `unknown` so
 * it can guard deserialized/external input. Never checks whether the asset
 * exists, whether the requester holds authority, whether the transferor
 * genuinely holds the right, whether the recipient is a real party, whether
 * the right is transferable under any legal system, or whether any referenced
 * record exists -- none of those is a property of this record.
 */
export function validateEnterpriseTransferRequest(candidate: unknown): EnterpriseTransferRequestValidationResult {
  if (!isTransferPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Transfer request must be an object.' }] };
  }

  const errors: EnterpriseTransferRequestValidationIssue[] = [];

  if (candidate.schemaVersion !== ENTERPRISE_TRANSFER_SCHEMA_VERSION) {
    errors.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', message: `schemaVersion must be '${ENTERPRISE_TRANSFER_SCHEMA_VERSION}'.` });
  }

  if (!isTransferNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (candidate.capability === undefined) {
    errors.push({ code: 'MISSING_CAPABILITY', message: `capability is required and must be '${ENTERPRISE_TRANSFER_CAPABILITY}'.` });
  } else if (!isEnterpriseTransferCapability(candidate.capability)) {
    errors.push({
      code: 'CAPABILITY_MISMATCH',
      message: `capability must be exactly '${ENTERPRISE_TRANSFER_CAPABILITY}'; TRANSFER is a distinct governed action and this contract never expresses any other.`,
    });
  }

  if (!isTransferPlainObject(candidate.asset)) {
    errors.push({ code: 'MISSING_ASSET', message: 'asset (a ResourceRef) is required.' });
  } else if (!isTransferNonEmptyString(candidate.asset.kind) || !isTransferNonEmptyString(candidate.asset.id)) {
    errors.push({ code: 'INVALID_ASSET', message: 'asset.kind and asset.id must both be non-empty strings.' });
  }

  if (!isTransferNonEmptyString(candidate.requestedBy)) {
    errors.push({
      code: candidate.requestedBy === undefined ? 'MISSING_REQUESTED_BY' : 'INVALID_REQUESTED_BY',
      message: 'requestedBy is required and must be a non-empty string.',
    });
  }

  errors.push(...collectEnterpriseTransferTermsIssues(candidate.terms));

  if (candidate.requestedAt === undefined) {
    errors.push({ code: 'MISSING_REQUESTED_AT', message: 'requestedAt is required.' });
  } else if (!isTransferTimestamp(candidate.requestedAt)) {
    errors.push({ code: 'INVALID_REQUESTED_AT', message: 'requestedAt must be an ISO 8601 timestamp string.' });
  }

  if (candidate.requestedExpiresAt !== undefined && !isTransferTimestamp(candidate.requestedExpiresAt)) {
    errors.push({ code: 'INVALID_REQUESTED_EXPIRES_AT', message: 'requestedExpiresAt must be an ISO 8601 timestamp string when present.' });
  }

  if (!isTransferNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.justification !== undefined && !isTransferNonEmptyString(candidate.justification)) {
    errors.push({ code: 'INVALID_JUSTIFICATION', message: 'justification must be a non-empty string when present.' });
  }

  if (candidate.evidenceRefs !== undefined && !isTransferCanonicalIdArray(candidate.evidenceRefs)) {
    errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseTransferRequest {
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
  readonly terms: SerializedEnterpriseTransferTerms;
  readonly requestedAt: string;
  readonly correlationId: string;
  readonly requestedExpiresAt?: string;
  readonly justification?: string;
  readonly evidenceRefs?: readonly string[];
}

export function serializeTransferResourceRef(resource: ResourceRef): SerializedEnterpriseTransferRequest['asset'] {
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

export function readTransferResourceRef(value: SerializedEnterpriseTransferRequest['asset']): ResourceRef {
  return {
    kind: value.kind,
    id: value.id,
    ...(value.tenantId === undefined ? {} : { tenantId: value.tenantId }),
    ...(value.attributes === undefined ? {} : { attributes: { ...value.attributes } }),
  };
}

/** Projects a request to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseTransferRequest(request: EnterpriseTransferRequest): SerializedEnterpriseTransferRequest {
  return {
    schemaVersion: request.schemaVersion,
    id: request.id,
    capability: request.capability,
    asset: serializeTransferResourceRef(request.asset),
    requestedBy: request.requestedBy,
    terms: serializeEnterpriseTransferTerms(request.terms),
    requestedAt: request.requestedAt,
    correlationId: request.correlationId,
    ...(request.requestedExpiresAt === undefined ? {} : { requestedExpiresAt: request.requestedExpiresAt }),
    ...(request.justification === undefined ? {} : { justification: request.justification }),
    ...(request.evidenceRefs === undefined ? {} : { evidenceRefs: [...request.evidenceRefs].sort() }),
  };
}

/** Thrown by `deserializeEnterpriseTransferRequest` when the input fails validation. Carries the full issue list rather than just the first. */
export class EnterpriseTransferRequestValidationError extends Error {
  readonly issues: readonly EnterpriseTransferRequestValidationIssue[];

  constructor(issues: readonly EnterpriseTransferRequestValidationIssue[]) {
    super(`Invalid EnterpriseTransferRequest: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseTransferRequestValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a candidate value into an `EnterpriseTransferRequest`. Every field is mapped explicitly -- no structural cast over unchecked input. */
export function deserializeEnterpriseTransferRequest(candidate: unknown): EnterpriseTransferRequest {
  const result = validateEnterpriseTransferRequest(candidate);
  if (!result.valid) throw new EnterpriseTransferRequestValidationError(result.errors);

  const value = candidate as SerializedEnterpriseTransferRequest;
  return {
    schemaVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
    id: value.id,
    capability: ENTERPRISE_TRANSFER_CAPABILITY,
    asset: readTransferResourceRef(value.asset),
    requestedBy: value.requestedBy,
    terms: readEnterpriseTransferTerms(value.terms),
    requestedAt: value.requestedAt,
    correlationId: value.correlationId,
    ...(value.requestedExpiresAt === undefined ? {} : { requestedExpiresAt: value.requestedExpiresAt }),
    ...(value.justification === undefined ? {} : { justification: value.justification }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}
