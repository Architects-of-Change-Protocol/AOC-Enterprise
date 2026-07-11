import { EnterpriseHttpErrors } from './enterprise-http-errors.js';
import type { BuildEvidenceBundleInput } from '../evidence/evidence-service.js';
import type { EvidenceBundle, EvidenceBundleRecord, EvidenceBundleState, EvidenceVerificationResult } from '../evidence/contracts.js';

/** Wire shape for `POST /api/evidence/build`. */
export interface EvidenceBuildRequestBody {
  readonly evaluationId?: string;
  readonly level?: string;
  readonly createdBy?: string;
}

/** Wire shape returned from `POST /api/evidence/build` and `GET /api/evidence/{bundleId}`. */
export interface EvidenceBundleResponseBody {
  readonly bundle: EvidenceBundle;
  readonly state: EvidenceBundleState;
  readonly storedAt: string;
  readonly supersededBy?: string;
}

/** Wire shape for `POST /api/evidence/verify`. */
export interface EvidenceVerifyRequestBody {
  readonly bundleId?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** HTTP/JSON shape validation only, mirroring `validateGovernanceEvaluateRequestBody` -- the Evidence Service still validates the resolved input itself. */
export function validateEvidenceBuildRequestBody(body: unknown): BuildEvidenceBundleInput {
  if (!isPlainObject(body)) {
    throw EnterpriseHttpErrors.invalidRequest('Request body must be a JSON object.');
  }
  const violations: string[] = [];
  if (!isNonEmptyString(body.evaluationId)) violations.push('evaluationId is a required non-empty string.');
  if (!isNonEmptyString(body.level)) violations.push('level is a required non-empty string.');
  if (body.createdBy !== undefined && !isNonEmptyString(body.createdBy)) violations.push('createdBy, when present, must be a non-empty string.');
  if (violations.length > 0) {
    throw EnterpriseHttpErrors.invalidRequest('The Evidence Bundle build request failed validation.', violations);
  }
  return {
    evaluationId: body.evaluationId as string,
    level: body.level as string,
    ...(body.createdBy !== undefined ? { createdBy: body.createdBy as string } : {}),
  };
}

export function validateEvidenceVerifyRequestBody(body: unknown): { readonly bundleId: string } {
  if (!isPlainObject(body) || !isNonEmptyString(body.bundleId)) {
    throw EnterpriseHttpErrors.invalidRequest('The Evidence Bundle verify request failed validation.', ['bundleId is a required non-empty string.']);
  }
  return { bundleId: body.bundleId };
}

export function toEvidenceBundleResponseBody(record: EvidenceBundleRecord): EvidenceBundleResponseBody {
  return {
    bundle: record.bundle,
    state: record.state,
    storedAt: record.storedAt,
    ...(record.supersededBy !== undefined ? { supersededBy: record.supersededBy } : {}),
  };
}

export function toEvidenceVerifyResponseBody(result: EvidenceVerificationResult): EvidenceVerificationResult {
  return result;
}
