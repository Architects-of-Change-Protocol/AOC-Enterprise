import type { JurisdictionCode, JurisdictionResolutionStatus } from '../domain/jurisdiction-pack-runtime-types.js';
import type { JurisdictionPackRegistry } from './jurisdiction-pack-registry.js';

export interface JurisdictionPackResolution {
  readonly status: JurisdictionResolutionStatus;
  readonly matchedPackIds: readonly string[];
}

const INACTIVE_STATUSES = new Set(['expired', 'superseded', 'disabled']);

/**
 * Deterministic, code-based lookup only -- no fuzzy matching, no geographic
 * inference, no "closest jurisdiction" heuristics. A jurisdiction code
 * either has exactly one active registered pack (`resolved`), no registered
 * pack (`unresolved`), or more than one active registered pack
 * (`ambiguous`, left for the caller to disambiguate).
 */
export function resolveJurisdictionPacks(registry: JurisdictionPackRegistry, jurisdictionCode: JurisdictionCode): JurisdictionPackResolution {
  const candidates = registry.getByJurisdictionCode(jurisdictionCode).filter((manifest) => !INACTIVE_STATUSES.has(manifest.status));

  if (candidates.length === 0) return { status: 'unresolved', matchedPackIds: [] };
  if (candidates.length === 1) return { status: 'resolved', matchedPackIds: candidates.map((manifest) => manifest.id) };
  return { status: 'ambiguous', matchedPackIds: candidates.map((manifest) => manifest.id) };
}
