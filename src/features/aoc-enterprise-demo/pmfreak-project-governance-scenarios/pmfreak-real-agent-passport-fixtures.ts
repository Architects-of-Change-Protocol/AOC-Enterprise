import { createAgentRuntimeSeal, createTestSigner, transitionAgentPassportStatus } from '@aoc-enterprise/agent-governance';
import type { AgentPassport, AgentPassportSignerPort, AgentPolicyManifest, AgentRuntimeSeal } from '@aoc-enterprise/agent-governance';
import { PMFREAK_AGENT_ROLES, findPMFreakPassportScenarioFixture, issuePMFreakAgentPassport } from '@aoc-enterprise/pmfreak-agent-passport-foundation';
import type { PMFreakAgentRole } from '@aoc-enterprise/pmfreak-agent-passport-foundation';

/**
 * Real `AgentPassport` fixtures for the Project Governance Scenario Pack,
 * built on top of `@aoc-enterprise/pmfreak-agent-passport-foundation`'s
 * actual `issuePMFreakAgentPassport` -- this replaces the old
 * `src/features/aoc-enterprise-demo/pmfreak-agent-passport`
 * `buildPMFreakAgentPassportRegistryFixture()`, which only ever produced
 * hand-authored, non-cryptographic literal passport records.
 *
 * `issuePMFreakAgentPassport` is async and (via the real, upstream
 * `generateAgentPassportId`/`createTestSigner`) assigns each passport a
 * randomized id-entropy suffix and a wall-clock `signedAt` -- neither is
 * reproducible across separate issuance calls (see the foundation package's
 * README, "Determinism guarantees"). Neither field is part of
 * `PMFreakAgentPassportResolution`'s output, so it never leaks into a
 * scenario decision -- but to keep this pack's own "same input -> same
 * output" determinism tests meaningful, every consumer in a given process
 * (the scenario runner, the Control Plane view fixtures, and this pack's own
 * test suite) must reuse the *same* issued passport objects rather than
 * re-issuing fresh ones per call. `getPMFreakRealAgentPassportFixtures`
 * below is a process-local memoized singleton for exactly that reason.
 */

export interface PMFreakRealAgentPassportFixtureEntry {
  readonly passport: AgentPassport;
  readonly policyManifest: AgentPolicyManifest;
  readonly runtimeSeal: AgentRuntimeSeal;
}

export interface PMFreakRealAgentPassportFixtures {
  readonly signer: AgentPassportSignerPort;
  readonly byRole: Readonly<Record<PMFreakAgentRole, PMFreakRealAgentPassportFixtureEntry>>;
  /** A billing_readiness passport transitioned to 'revoked', for negative scenario overrides. */
  readonly revokedBillingReadinessPassport: AgentPassport;
  /** A client_communication passport transitioned to 'suspended', for negative scenario overrides. */
  readonly suspendedClientCommunicationPassport: AgentPassport;
  /** A planning passport transitioned to 'expired', for negative scenario overrides. */
  readonly expiredPlanningPassport: AgentPassport;
}

const FIXTURE_SIGNER_SECRET = 'aoc.demo.pmfreak.project_governance_scenarios.v1.fixture-signer';

async function buildPMFreakRealAgentPassportFixtures(): Promise<PMFreakRealAgentPassportFixtures> {
  const signer = createTestSigner({ secret: FIXTURE_SIGNER_SECRET });

  const entries = await Promise.all(
    PMFREAK_AGENT_ROLES.map(async (role) => {
      const fixture = findPMFreakPassportScenarioFixture(role);
      if (fixture === undefined) throw new Error(`PMFreak Project Governance Scenario Pack: no passport scenario fixture for role "${role}".`);

      const { bundle } = await issuePMFreakAgentPassport(fixture.role, fixture.enrollmentOptions, { signer });
      const activePassport = transitionAgentPassportStatus(bundle.passport, 'active');
      const runtimeSeal = await createAgentRuntimeSeal(activePassport, { signer });

      const entry: PMFreakRealAgentPassportFixtureEntry = {
        passport: activePassport,
        policyManifest: bundle.policyManifest,
        runtimeSeal,
      };
      return [role, entry] as const;
    }),
  );

  const byRole = Object.fromEntries(entries) as Record<PMFreakAgentRole, PMFreakRealAgentPassportFixtureEntry>;

  return {
    signer,
    byRole,
    revokedBillingReadinessPassport: transitionAgentPassportStatus(byRole.billing_readiness.passport, 'revoked'),
    suspendedClientCommunicationPassport: transitionAgentPassportStatus(byRole.client_communication.passport, 'suspended'),
    expiredPlanningPassport: transitionAgentPassportStatus(byRole.planning.passport, 'expired'),
  };
}

let cachedFixtures: Promise<PMFreakRealAgentPassportFixtures> | undefined;

/**
 * Returns this process's single, memoized set of real PMFreak agent passport
 * fixtures -- the first caller triggers real (async) passport issuance;
 * every subsequent caller (in this process) receives the exact same
 * already-issued objects. Never re-issues a passport once cached, so every
 * consumer within a test run or a demo session shares identical passport
 * identity.
 */
export function getPMFreakRealAgentPassportFixtures(): Promise<PMFreakRealAgentPassportFixtures> {
  if (cachedFixtures === undefined) cachedFixtures = buildPMFreakRealAgentPassportFixtures();
  return cachedFixtures;
}
