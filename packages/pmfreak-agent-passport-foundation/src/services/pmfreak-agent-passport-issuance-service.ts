import type {
  AgentPassportSignerPort,
  AgentPassportStorePort,
  IssuedAgentPassportBundle,
} from '@aoc-enterprise/agent-governance';
import { issueAgentPassport, createTestSigner } from '@aoc-enterprise/agent-governance';
import type { PMFreakAgentRole } from '../domain/pmfreak-agent-role.js';
import type { BuildPMFreakAgentEnrollmentInputOptions } from './pmfreak-agent-enrollment-builder.js';
import { buildPMFreakAgentEnrollmentInput } from './pmfreak-agent-enrollment-builder.js';

export interface IssuePMFreakAgentPassportDeps {
  /**
   * Defaults to `createTestSigner()` -- `@aoc-enterprise/agent-governance`'s
   * own comment marks this "for use in tests; not for production use", which
   * is appropriate here: this whole package is an intentionally
   * non-production foundation layer (see this package's README).
   */
  readonly signer?: AgentPassportSignerPort;
  readonly baseVerificationUrl?: string;
  readonly issuer?: string;
  /** When supplied, the issued bundle is persisted via this store's `savePassportBundle`. */
  readonly store?: AgentPassportStorePort;
}

export interface IssuePMFreakAgentPassportResult {
  readonly bundle: IssuedAgentPassportBundle;
  readonly role: PMFreakAgentRole;
}

/**
 * Issues a real `AgentPassport` (via `@aoc-enterprise/agent-governance`'s
 * actual `issueAgentPassport`) for a PMFreak agent of the given role.
 *
 * `issueAgentPassport` already internally calls `createAgentConstitution`,
 * `createAgentPolicyManifest`, and `createAgentRuntimeSeal` and returns all
 * three in the resulting `IssuedAgentPassportBundle` -- this service does
 * not re-invoke those functions separately, since doing so would only
 * recompute identical (deterministic) constitution/manifest/seal objects at
 * the cost of duplicated work.
 *
 * Determinism: given the same enrollment input (including the same
 * `issuedAt`), the constitution, policy manifest, and every hash derived
 * from them are byte-for-byte reproducible (they are all canonical-JSON +
 * SHA-256 over caller-supplied data). The passport's `entropy` suffix
 * (inside `passportId`) and the signer's `signedAt` timestamp are randomized
 * / wall-clock-derived by `@aoc-enterprise/agent-governance` itself
 * (`generateAgentPassportId`, `createTestSigner`) and are therefore NOT
 * reproducible across separate calls -- that is a property of the real,
 * upstream dependency, not something this service can or should override.
 */
export async function issuePMFreakAgentPassport(
  role: PMFreakAgentRole,
  enrollmentOptions: BuildPMFreakAgentEnrollmentInputOptions,
  deps: IssuePMFreakAgentPassportDeps = {},
): Promise<IssuePMFreakAgentPassportResult> {
  const enrollment = buildPMFreakAgentEnrollmentInput(role, enrollmentOptions);
  const signer = deps.signer ?? createTestSigner();

  const bundle = await issueAgentPassport(enrollment, {
    signer,
    ...(deps.baseVerificationUrl !== undefined ? { baseVerificationUrl: deps.baseVerificationUrl } : {}),
    ...(deps.issuer !== undefined ? { issuer: deps.issuer } : {}),
  });

  if (deps.store) {
    await deps.store.savePassportBundle(bundle);
  }

  return { bundle, role };
}
