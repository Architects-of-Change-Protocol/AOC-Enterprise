import { canonicalizeJson, sha256Hex } from '@aoc-enterprise/agent-governance';
import type {
  PMFreakPassportAttestation,
  PMFreakPassportAttestorRole,
} from '../domain/pmfreak-passport-attestation.js';
import type { PMFreakPassportValidationStatus } from '../domain/pmfreak-passport-validation-status.js';

export interface CreatePMFreakPassportAttestationInput {
  readonly passportId: string;
  /** Caller-supplied ISO-8601 timestamp. This module never reads the system clock. */
  readonly attestedAt: string;
  readonly attestationVersion?: number;
  readonly attestorRole: PMFreakPassportAttestorRole;
  readonly validationStatus: PMFreakPassportValidationStatus;
  readonly rationale: readonly string[];
  /**
   * The payload the attestation is computed over -- typically the issued
   * `AgentPassport` (or a subset of it). Hashed with
   * `@aoc-enterprise/agent-governance`'s real `canonicalizeJson`/`sha256Hex`,
   * the same deterministic canonical-JSON + SHA-256 scheme the passport
   * itself uses.
   */
  readonly subject: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Creates a deterministic `PMFreakPassportAttestation`. The `attestationId`
 * and `subjectHash` are both derived solely from caller-supplied input via
 * canonical JSON + SHA-256: identical input always yields an identical
 * attestation; any change to the input (including `attestedAt`) always
 * yields a different `attestationId`/`subjectHash`. No system clock,
 * randomness, network, or filesystem access is used.
 */
export function createPMFreakPassportAttestation(
  input: CreatePMFreakPassportAttestationInput,
): PMFreakPassportAttestation {
  const subjectHash = `sha256:${sha256Hex(canonicalizeJson(input.subject))}`;

  const attestationIdSeed = canonicalizeJson({
    passportId: input.passportId,
    attestedAt: input.attestedAt,
    attestorRole: input.attestorRole,
    validationStatus: input.validationStatus,
    subjectHash,
  });
  const attestationId = `PMF-ATT-${sha256Hex(attestationIdSeed).slice(0, 24).toUpperCase()}`;

  return {
    attestationId,
    passportId: input.passportId,
    attestedAt: input.attestedAt,
    attestationVersion: input.attestationVersion ?? 1,
    attestorRole: input.attestorRole,
    validationStatus: input.validationStatus,
    subjectHash,
    rationale: input.rationale,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}
