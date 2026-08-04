import type { CanonicalId, PolicyDecision, UtcDateTime } from '@aoc/protocol';
import type { EnterpriseScopedAccessRequest } from '@aoc-enterprise/scoped-access';
import {
  type EnterpriseResourceEnvelope,
  type SerializedEnterpriseResourceEnvelope,
  deserializeEnterpriseResourceEnvelope,
  enterpriseResourceEnvelopeEquals,
  resourceRefIdentityEquals,
  serializeEnterpriseResourceEnvelope,
  validateEnterpriseResourceEnvelope,
} from '@aoc-enterprise/resource-envelope';

/**
 * Enterprise composition over AOC Protocol's `PolicyDecision` and Enterprise's
 * own `EnterpriseScopedAccessRequest` / `EnterpriseResourceEnvelope`.
 *
 * `PolicyDecision` (`'allow' | 'deny' | 'conditional'`) is canonical in
 * `@aoc/protocol` -- it is the sole outcome vocabulary for "the result of
 * evaluating whether something may proceed" across AOC, already referenced by
 * `PolicyDecisionResult.decision` in Protocol's own adapter surface. This
 * contract reuses it directly for `outcome` rather than inventing a second,
 * slightly different enum (contrast with the Enterprise-local
 * `EnterprisePolicyDecision` in `@aoc-enterprise/policy-runtime`, which is a
 * distinct concept -- see the package README's "Decision semantics" section
 * for why that type is not reused here).
 *
 * `EnterpriseScopedAccessRequest` (`@aoc-enterprise/scoped-access`) and
 * `EnterpriseResourceEnvelope` (`@aoc-enterprise/resource-envelope`) are both
 * composed by reference (`request`, `resource`), never duplicated or
 * extended -- the same composition style `EnterpriseResourceEnvelope` itself
 * established for `ResourceRef`. `EnterpriseAccessDecision` is a description
 * *about* a completed evaluation of a request against a resource; it is not
 * "a request with extra properties" or "a resource with extra properties."
 *
 * This is a pure data contract: no persistence, no service, no API, no
 * policy engine, no runtime execution, no provider SDK. It records the
 * immutable outcome of an evaluation that happened elsewhere -- it does not
 * perform that evaluation, and it never contacts a provider, issues a grant,
 * or evaluates a permission.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/access-decision`).
 */
export const ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION = '1.0.0' as const;

/**
 * The canonical Enterprise-owned contract for "the evaluated result of a
 * request to access a governed resource." See the package README for the
 * full design rationale, ownership boundary, and relationship to
 * `EnterpriseResourceEnvelope`, future `AccessGrant`, `UsageEvent`, and audit.
 *
 * Field groups:
 * - `request` + `resource` -- what was evaluated (the request, including its
 *   `principalId`, is `EnterpriseScopedAccessRequest`; the governed resource
 *   is the canonical `EnterpriseResourceEnvelope`). `request.resource` and
 *   `resource.resource` must refer to the same `ResourceRef` identity (see
 *   `validateEnterpriseAccessDecision`'s `RESOURCE_IDENTITY_MISMATCH`) --
 *   this is a consistency check, not a second identity mechanism.
 * - `outcome` + `evaluatedAt` + `correlationId` + `reason?` -- the decision
 *   itself: what was decided, when, how to correlate it with the rest of an
 *   audit trail, and an optional human-readable reason.
 * - `policyEvaluationRef?` + `evidenceRefs?` -- opaque pointers to the policy
 *   evaluation and evidence records that informed this decision. These are
 *   references, not embedded objects: this contract does not know or assume
 *   the shape of a policy engine's output or an evidence bundle, and does
 *   not evaluate policy or evidence itself.
 */
export interface EnterpriseAccessDecision {
  readonly schemaVersion: typeof ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION;
  readonly request: EnterpriseScopedAccessRequest;
  readonly resource: EnterpriseResourceEnvelope;
  readonly outcome: PolicyDecision;
  readonly evaluatedAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  readonly reason?: string;
  readonly policyEvaluationRef?: CanonicalId;
  readonly evidenceRefs?: readonly CanonicalId[];
}

// ---------------------------------------------------------------------------
// Identity equality -- derives from resource identity, principal, and
// evaluation instant only (Phase 7). Never a second identity mechanism: the
// resource half delegates to `resourceRefIdentityEquals`, already canonical
// for `ResourceRef` in `@aoc-enterprise/resource-envelope`.
// ---------------------------------------------------------------------------

/**
 * Whether two decisions represent the same evaluation event: the same
 * governed resource, the same requesting principal, at the same evaluation
 * instant. Two decisions can share identity while disagreeing on every other
 * field (e.g. a corrected `reason` recorded after the fact) -- this function
 * captures only the identity, not full equivalence; see
 * `enterpriseAccessDecisionEquals` for that.
 */
export function enterpriseAccessDecisionIdentityEquals(a: EnterpriseAccessDecision, b: EnterpriseAccessDecision): boolean {
  return (
    resourceRefIdentityEquals(a.resource.resource, b.resource.resource) &&
    a.request.principalId === b.request.principalId &&
    a.evaluatedAt === b.evaluatedAt
  );
}

function recordEquals(a: Readonly<Record<string, string>> | undefined, b: Readonly<Record<string, string>> | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function stringArrayEquals(a: readonly string[], b: readonly string[]): boolean {
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.length === bSorted.length && aSorted.every((value, index) => value === bSorted[index]);
}

function optionalStringArrayEquals(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return stringArrayEquals(a, b);
}

/**
 * Full structural equality of two `EnterpriseScopedAccessRequest`s. Not
 * exported by `@aoc-enterprise/scoped-access` itself, so this contract
 * defines its own -- consistent with that package composing rather than
 * reimplementing Protocol's `ScopedAccessRequest`, this reads every field
 * explicitly rather than casting.
 */
function requestEquals(a: EnterpriseScopedAccessRequest, b: EnterpriseScopedAccessRequest): boolean {
  return (
    a.principalId === b.principalId &&
    resourceRefIdentityEquals(a.resource, b.resource) &&
    recordEquals(a.resource.attributes, b.resource.attributes) &&
    stringArrayEquals(a.requestedScope, b.requestedScope) &&
    a.requestedAt === b.requestedAt &&
    a.action === b.action
  );
}

/**
 * Full structural equality: identity (via `enterpriseAccessDecisionIdentityEquals`)
 * plus every other field. `resource` equality delegates entirely to
 * `enterpriseResourceEnvelopeEquals` (already canonical for
 * `EnterpriseResourceEnvelope`) -- this module never reimplements it.
 */
export function enterpriseAccessDecisionEquals(a: EnterpriseAccessDecision, b: EnterpriseAccessDecision): boolean {
  return (
    a.schemaVersion === b.schemaVersion &&
    requestEquals(a.request, b.request) &&
    enterpriseResourceEnvelopeEquals(a.resource, b.resource) &&
    a.outcome === b.outcome &&
    a.evaluatedAt === b.evaluatedAt &&
    a.correlationId === b.correlationId &&
    a.reason === b.reason &&
    a.policyEvaluationRef === b.policyEvaluationRef &&
    optionalStringArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation -- internal consistency, required fields, and the one genuine
// impossible combination (a request and a resource envelope that disagree on
// which resource is being evaluated). No provider validation, no credential
// validation, no network validation, no existence checks, no authorization,
// no policy-correctness evaluation.
// ---------------------------------------------------------------------------

export type EnterpriseAccessDecisionValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_REQUEST'
  | 'INVALID_REQUEST_PRINCIPAL'
  | 'INVALID_REQUEST_RESOURCE'
  | 'INVALID_REQUEST_SCOPE'
  | 'INVALID_REQUEST_TIMESTAMP'
  | 'MISSING_RESOURCE_ENVELOPE'
  | 'INVALID_RESOURCE_ENVELOPE'
  | 'RESOURCE_IDENTITY_MISMATCH'
  | 'MISSING_OUTCOME'
  | 'INVALID_OUTCOME'
  | 'MISSING_EVALUATED_AT'
  | 'INVALID_EVALUATED_AT'
  | 'MISSING_CORRELATION_ID'
  | 'INVALID_EVIDENCE_REFS';

export interface EnterpriseAccessDecisionValidationIssue {
  readonly code: EnterpriseAccessDecisionValidationCode;
  readonly message: string;
}

export type EnterpriseAccessDecisionValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseAccessDecisionValidationIssue[] };

const POLICY_DECISIONS: readonly PolicyDecision[] = ['allow', 'deny', 'conditional'];
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validates internal consistency of a candidate decision. Accepts `unknown`
 * so it can guard deserialized/external input, not just already-typed
 * values. Delegates resource-envelope validation entirely to
 * `validateEnterpriseResourceEnvelope` -- this function never re-checks
 * `location`/`integrity`/`lifecycleState` shape itself.
 */
export function validateEnterpriseAccessDecision(candidate: unknown): EnterpriseAccessDecisionValidationResult {
  const errors: EnterpriseAccessDecisionValidationIssue[] = [];

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_REQUEST', message: 'Decision must be an object.' }] };
  }

  if (candidate.schemaVersion !== ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION) {
    errors.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `schemaVersion must be '${ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION}'.`,
    });
  }

  let requestResourceForConsistencyCheck: Record<string, unknown> | undefined;

  if (!isPlainObject(candidate.request)) {
    errors.push({ code: 'MISSING_REQUEST', message: 'request (an EnterpriseScopedAccessRequest) is required.' });
  } else {
    const request = candidate.request;
    if (!isNonEmptyString(request.principalId)) {
      errors.push({ code: 'INVALID_REQUEST_PRINCIPAL', message: 'request.principalId must be a non-empty string.' });
    }
    if (!isPlainObject(request.resource) || !isNonEmptyString(request.resource.kind) || !isNonEmptyString(request.resource.id)) {
      errors.push({ code: 'INVALID_REQUEST_RESOURCE', message: 'request.resource.kind and request.resource.id must both be non-empty strings.' });
    } else {
      requestResourceForConsistencyCheck = request.resource;
    }
    if (!Array.isArray(request.requestedScope) || !request.requestedScope.every((scope) => typeof scope === 'string')) {
      errors.push({ code: 'INVALID_REQUEST_SCOPE', message: 'request.requestedScope must be an array of strings.' });
    }
    if (typeof request.requestedAt !== 'string' || !ISO_8601_PATTERN.test(request.requestedAt)) {
      errors.push({ code: 'INVALID_REQUEST_TIMESTAMP', message: 'request.requestedAt must be an ISO 8601 UTC timestamp string.' });
    }
  }

  let resourceEnvelopeForConsistencyCheck: Record<string, unknown> | undefined;

  if (!isPlainObject(candidate.resource)) {
    errors.push({ code: 'MISSING_RESOURCE_ENVELOPE', message: 'resource (an EnterpriseResourceEnvelope) is required.' });
  } else {
    const envelopeResult = validateEnterpriseResourceEnvelope(candidate.resource);
    if (!envelopeResult.valid) {
      errors.push({
        code: 'INVALID_RESOURCE_ENVELOPE',
        message: `resource failed EnterpriseResourceEnvelope validation: ${envelopeResult.errors.map((issue) => issue.code).join(', ')}.`,
      });
    } else if (isPlainObject(candidate.resource.resource)) {
      resourceEnvelopeForConsistencyCheck = candidate.resource.resource;
    }
  }

  if (requestResourceForConsistencyCheck !== undefined && resourceEnvelopeForConsistencyCheck !== undefined) {
    const requestKind = requestResourceForConsistencyCheck.kind;
    const requestId = requestResourceForConsistencyCheck.id;
    const requestTenantId = requestResourceForConsistencyCheck.tenantId;
    const envelopeKind = resourceEnvelopeForConsistencyCheck.kind;
    const envelopeId = resourceEnvelopeForConsistencyCheck.id;
    const envelopeTenantId = resourceEnvelopeForConsistencyCheck.tenantId;
    if (requestKind !== envelopeKind || requestId !== envelopeId || requestTenantId !== envelopeTenantId) {
      errors.push({
        code: 'RESOURCE_IDENTITY_MISMATCH',
        message: 'request.resource and resource.resource must refer to the same ResourceRef identity (kind, id, tenantId).',
      });
    }
  }

  if (candidate.outcome === undefined) {
    errors.push({ code: 'MISSING_OUTCOME', message: 'outcome is required.' });
  } else if (typeof candidate.outcome !== 'string' || !POLICY_DECISIONS.includes(candidate.outcome as PolicyDecision)) {
    errors.push({ code: 'INVALID_OUTCOME', message: `outcome must be one of: ${POLICY_DECISIONS.join(', ')}.` });
  }

  if (candidate.evaluatedAt === undefined) {
    errors.push({ code: 'MISSING_EVALUATED_AT', message: 'evaluatedAt is required.' });
  } else if (typeof candidate.evaluatedAt !== 'string' || !ISO_8601_PATTERN.test(candidate.evaluatedAt)) {
    errors.push({ code: 'INVALID_EVALUATED_AT', message: 'evaluatedAt must be an ISO 8601 UTC timestamp string.' });
  }

  if (!isNonEmptyString(candidate.correlationId)) {
    errors.push({ code: 'MISSING_CORRELATION_ID', message: 'correlationId is required and must be a non-empty string.' });
  }

  if (candidate.evidenceRefs !== undefined) {
    if (!Array.isArray(candidate.evidenceRefs) || !candidate.evidenceRefs.every((ref) => isNonEmptyString(ref))) {
      errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization -- stable, deterministic, version-friendly, round-trip safe.
// Delegates the nested resource envelope entirely to
// `serializeEnterpriseResourceEnvelope` / `deserializeEnterpriseResourceEnvelope`
// -- this module never reimplements envelope serialization.
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseAccessDecision {
  readonly schemaVersion: string;
  readonly request: {
    readonly principalId: string;
    readonly resource: {
      readonly kind: string;
      readonly id: string;
      readonly tenantId?: string;
      readonly attributes?: Readonly<Record<string, string>>;
    };
    readonly requestedScope: readonly string[];
    readonly requestedAt: string;
    readonly action?: string;
  };
  readonly resource: SerializedEnterpriseResourceEnvelope;
  readonly outcome: string;
  readonly evaluatedAt: string;
  readonly correlationId: string;
  readonly reason?: string;
  readonly policyEvaluationRef?: string;
  readonly evidenceRefs?: readonly string[];
}

function sortedAttributes(attributes: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> | undefined {
  if (attributes === undefined) return undefined;
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(attributes).sort()) {
    sorted[key] = attributes[key] as string;
  }
  return sorted;
}

/** Projects an `EnterpriseAccessDecision` to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already a valid `EnterpriseAccessDecision` by construction. */
export function serializeEnterpriseAccessDecision(decision: EnterpriseAccessDecision): SerializedEnterpriseAccessDecision {
  const attributes = sortedAttributes(decision.request.resource.attributes);
  const evidenceRefs = decision.evidenceRefs === undefined ? undefined : [...decision.evidenceRefs].sort();

  return {
    schemaVersion: decision.schemaVersion,
    request: {
      principalId: decision.request.principalId,
      resource: {
        kind: decision.request.resource.kind,
        id: decision.request.resource.id,
        ...(decision.request.resource.tenantId === undefined ? {} : { tenantId: decision.request.resource.tenantId }),
        ...(attributes === undefined ? {} : { attributes }),
      },
      requestedScope: [...decision.request.requestedScope].sort(),
      requestedAt: decision.request.requestedAt,
      ...(decision.request.action === undefined ? {} : { action: decision.request.action }),
    },
    resource: serializeEnterpriseResourceEnvelope(decision.resource),
    outcome: decision.outcome,
    evaluatedAt: decision.evaluatedAt,
    correlationId: decision.correlationId,
    ...(decision.reason === undefined ? {} : { reason: decision.reason }),
    ...(decision.policyEvaluationRef === undefined ? {} : { policyEvaluationRef: decision.policyEvaluationRef }),
    ...(evidenceRefs === undefined ? {} : { evidenceRefs }),
  };
}

/**
 * Thrown by `deserializeEnterpriseAccessDecision` when the input fails
 * `validateEnterpriseAccessDecision`. Carries the full issue list rather than
 * just the first, matching `EnterpriseAccessDecisionValidationResult`.
 */
export class EnterpriseAccessDecisionValidationError extends Error {
  readonly issues: readonly EnterpriseAccessDecisionValidationIssue[];

  constructor(issues: readonly EnterpriseAccessDecisionValidationIssue[]) {
    super(`Invalid EnterpriseAccessDecision: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseAccessDecisionValidationError';
    this.issues = issues;
  }
}

/**
 * Parses and validates a candidate value (e.g. `JSON.parse` output) into an
 * `EnterpriseAccessDecision`. Every field is mapped explicitly from the
 * validated candidate -- no structural cast (`as EnterpriseAccessDecision`)
 * over unchecked input. The nested resource envelope is mapped via
 * `deserializeEnterpriseResourceEnvelope`, which has already validated it by
 * the time this function reaches it (see `validateEnterpriseAccessDecision`).
 *
 * Throws `EnterpriseAccessDecisionValidationError` when validation fails.
 */
export function deserializeEnterpriseAccessDecision(candidate: unknown): EnterpriseAccessDecision {
  const result = validateEnterpriseAccessDecision(candidate);
  if (!result.valid) {
    throw new EnterpriseAccessDecisionValidationError(result.errors);
  }

  // Validated above: `candidate` has the required shape of a
  // SerializedEnterpriseAccessDecision. Read through a narrow local view
  // instead of casting the whole object to EnterpriseAccessDecision.
  const value = candidate as SerializedEnterpriseAccessDecision;

  const request: EnterpriseScopedAccessRequest = {
    principalId: value.request.principalId,
    resource: {
      kind: value.request.resource.kind,
      id: value.request.resource.id,
      ...(value.request.resource.tenantId === undefined ? {} : { tenantId: value.request.resource.tenantId }),
      ...(value.request.resource.attributes === undefined ? {} : { attributes: { ...value.request.resource.attributes } }),
    },
    requestedScope: [...value.request.requestedScope],
    requestedAt: value.request.requestedAt,
    ...(value.request.action === undefined ? {} : { action: value.request.action }),
  };

  const resource = deserializeEnterpriseResourceEnvelope(value.resource);

  return {
    schemaVersion: ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION,
    request,
    resource,
    outcome: value.outcome as PolicyDecision,
    evaluatedAt: value.evaluatedAt,
    correlationId: value.correlationId,
    ...(value.reason === undefined ? {} : { reason: value.reason }),
    ...(value.policyEvaluationRef === undefined ? {} : { policyEvaluationRef: value.policyEvaluationRef }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}
