import type { PMFreakAgentRole } from '../domain/pmfreak-agent-role.js';
import type { BuildPMFreakAgentEnrollmentInputOptions } from '../services/pmfreak-agent-enrollment-builder.js';

export interface PMFreakPassportScenarioFixture {
  readonly role: PMFreakAgentRole;
  readonly enrollmentOptions: BuildPMFreakAgentEnrollmentInputOptions;
}

const FIXED_ISSUED_AT = '2026-06-01T09:00:00.000Z';
const FIXED_CREATED_BY = 'user-pmfreak-admin';
const FIXED_OWNER_ID = 'org-pmfreak-001';
const FIXED_OWNER_NAME = 'PMFreak Inc.';

/**
 * A full enrollment scenario per PMFreak agent role, for use across this
 * package's own test suite. Deterministic: every timestamp is a fixed
 * literal, and no scenario reads the system clock, network, or a database.
 */
export const PMFREAK_PASSPORT_SCENARIO_FIXTURES: readonly PMFreakPassportScenarioFixture[] = [
  {
    role: 'planning',
    enrollmentOptions: {
      agentName: 'PMFreak Planning Agent',
      ownerId: FIXED_OWNER_ID,
      ownerName: FIXED_OWNER_NAME,
      region: 'US',
      createdBy: FIXED_CREATED_BY,
      issuedAt: FIXED_ISSUED_AT,
      tags: ['pmfreak', 'planning'],
    },
  },
  {
    role: 'risk',
    enrollmentOptions: {
      agentName: 'PMFreak Risk Agent',
      ownerId: FIXED_OWNER_ID,
      ownerName: FIXED_OWNER_NAME,
      region: 'US',
      createdBy: FIXED_CREATED_BY,
      issuedAt: FIXED_ISSUED_AT,
      tags: ['pmfreak', 'risk'],
    },
  },
  {
    role: 'evidence',
    enrollmentOptions: {
      agentName: 'PMFreak Evidence Agent',
      ownerId: FIXED_OWNER_ID,
      ownerName: FIXED_OWNER_NAME,
      region: 'US',
      createdBy: FIXED_CREATED_BY,
      issuedAt: FIXED_ISSUED_AT,
      tags: ['pmfreak', 'evidence'],
    },
  },
  {
    role: 'client_communication',
    enrollmentOptions: {
      agentName: 'PMFreak Client Communication Agent',
      ownerId: FIXED_OWNER_ID,
      ownerName: FIXED_OWNER_NAME,
      region: 'EU',
      createdBy: FIXED_CREATED_BY,
      issuedAt: FIXED_ISSUED_AT,
      tags: ['pmfreak', 'client_communication'],
    },
  },
  {
    role: 'billing_readiness',
    enrollmentOptions: {
      agentName: 'PMFreak Billing Readiness Agent',
      ownerId: FIXED_OWNER_ID,
      ownerName: FIXED_OWNER_NAME,
      region: 'EU',
      createdBy: FIXED_CREATED_BY,
      issuedAt: FIXED_ISSUED_AT,
      tags: ['pmfreak', 'billing_readiness'],
    },
  },
  {
    role: 'change_control',
    enrollmentOptions: {
      agentName: 'PMFreak Change Control Agent',
      ownerId: FIXED_OWNER_ID,
      ownerName: FIXED_OWNER_NAME,
      region: 'US',
      createdBy: FIXED_CREATED_BY,
      issuedAt: FIXED_ISSUED_AT,
      tags: ['pmfreak', 'change_control'],
    },
  },
];

export function findPMFreakPassportScenarioFixture(role: PMFreakAgentRole): PMFreakPassportScenarioFixture | undefined {
  return PMFREAK_PASSPORT_SCENARIO_FIXTURES.find((fixture) => fixture.role === role);
}
