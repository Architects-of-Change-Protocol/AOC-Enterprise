import type { PMFreakPassportValidationStatus } from './pmfreak-passport-validation-status.js';

/**
 * The role of the party attesting to a PMFreak Agent Passport's trust
 * level. This is new work in this repository -- there is no existing
 * "AgentPassportAttestation" concept anywhere in `src/` or `packages/`
 * prior to this package.
 */
export type PMFreakPassportAttestorRole =
  | 'system_authored'
  | 'operator_reviewed'
  | 'security_reviewed'
  | 'privacy_reviewed'
  | 'compliance_reviewed'
  | 'counsel_reviewed';

/**
 * A deterministic, offline attestation that a real, issued AOC
 * `AgentPassport` (for a PMFreak agent role) has been reviewed to a
 * particular point on the `PMFreakPassportValidationStatus` trust lattice.
 *
 * This is not a signature and not a substitute for the real
 * `AgentPassportSignature`/`AgentRuntimeSeal` that `@aoc-enterprise/agent-governance`
 * already produces for the passport itself -- it is an additional,
 * independently-hashable record of *who reviewed the passport to what
 * trust level, and why*. `subjectHash` binds the attestation to the exact
 * passport (or other subject payload) it was computed over, using
 * `@aoc-enterprise/agent-governance`'s real `canonicalizeJson`/`sha256Hex`.
 */
export interface PMFreakPassportAttestation {
  readonly attestationId: string;
  readonly passportId: string;
  /** Caller-supplied ISO-8601 timestamp. This module never reads the system clock. */
  readonly attestedAt: string;
  readonly attestationVersion: number;
  readonly attestorRole: PMFreakPassportAttestorRole;
  readonly validationStatus: PMFreakPassportValidationStatus;
  readonly subjectHash: string;
  readonly rationale: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
