import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PMFREAK_AGENT_ROLE_PROFILES } from '../pmfreak-agent-roles.js';
import type { PMFreakAgentRole } from '../pmfreak-agent-passport-types.js';
import { buildAllPMFreakAgentPassportFixtures, buildPMFreakAgentPassportRegistryFixture } from '../pmfreak-agent-passport-fixtures.js';
import { createPMFreakAgentPassportRegistry } from '../pmfreak-passport-registry.js';

const REQUIRED_ROLES: readonly PMFreakAgentRole[] = ['planning_agent', 'risk_agent', 'evidence_agent', 'client_communication_agent', 'billing_readiness_agent', 'change_control_agent'];

const REQUIRED_PASSPORT_IDS = [
  'aoc.passport.pmfreak.planning.demo.v1',
  'aoc.passport.pmfreak.risk.demo.v1',
  'aoc.passport.pmfreak.evidence.demo.v1',
  'aoc.passport.pmfreak.client_communication.demo.v1',
  'aoc.passport.pmfreak.billing_readiness.demo.v1',
  'aoc.passport.pmfreak.change_control.demo.v1',
];

describe('PMFreak agent role profiles', () => {
  it('2. creates all six required agent role profiles', () => {
    const roles = PMFREAK_AGENT_ROLE_PROFILES.map((profile) => profile.role);
    for (const role of REQUIRED_ROLES) assert.ok(roles.includes(role), `expected role profile "${role}"`);
    assert.equal(PMFREAK_AGENT_ROLE_PROFILES.length, REQUIRED_ROLES.length);
  });

  it('every role profile declares allowed/restricted capabilities, default requirements, and safe operating notes', () => {
    for (const profile of PMFREAK_AGENT_ROLE_PROFILES) {
      assert.ok(profile.allowedCapabilityIds.length > 0, `${profile.role} should allow at least one capability`);
      assert.ok(profile.safeOperatingNotes.length > 0, `${profile.role} should declare safe operating notes`);
    }
  });
});

describe('PMFreak agent passport fixtures', () => {
  it('3. creates deterministic passports for all six demo agents', () => {
    const passports = buildAllPMFreakAgentPassportFixtures();
    const ids = passports.map((passport) => passport.passportId);

    for (const id of REQUIRED_PASSPORT_IDS) assert.ok(ids.includes(id), `expected passport "${id}"`);
    assert.equal(passports.length, REQUIRED_PASSPORT_IDS.length);
  });

  it('every fixture passport is deterministic across repeated builds', () => {
    assert.deepEqual(buildAllPMFreakAgentPassportFixtures(), buildAllPMFreakAgentPassportFixtures());
  });
});

describe('PMFreak agent passport registry', () => {
  it('4. finds a passport by passportId', () => {
    const registry = createPMFreakAgentPassportRegistry(buildAllPMFreakAgentPassportFixtures());
    const found = registry.findByPassportId('aoc.passport.pmfreak.billing_readiness.demo.v1');

    assert.ok(found !== undefined);
    assert.equal(found?.agentId, 'pmfreak.agent.billing_readiness');
  });

  it('returns undefined for an unknown passportId', () => {
    const registry = createPMFreakAgentPassportRegistry(buildAllPMFreakAgentPassportFixtures());
    assert.equal(registry.findByPassportId('aoc.passport.pmfreak.unknown.v1'), undefined);
  });

  it('5. finds passports by agentId', () => {
    const registry = createPMFreakAgentPassportRegistry(buildAllPMFreakAgentPassportFixtures());
    const found = registry.findByAgentId('pmfreak.agent.planning');

    assert.equal(found.length, 1);
    assert.equal(found[0]?.passportId, 'aoc.passport.pmfreak.planning.demo.v1');
  });

  it('findActiveByAgentId excludes non-active passports for the same agent id', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const revoked = registry.findByPassportId('aoc.passport.pmfreak.billing_readiness.revoked.v1');
    assert.ok(revoked !== undefined);

    const active = registry.findActiveByAgentId(revoked!.agentId);
    assert.deepEqual(active, []);
  });

  it('findByRole returns every passport for a given role', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const riskPassports = registry.findByRole('risk_agent');

    assert.ok(riskPassports.length >= 2);
    for (const passport of riskPassports) assert.equal(passport.role, 'risk_agent');
  });

  it('the registry never mutates the passports it was built from', () => {
    const passports = buildAllPMFreakAgentPassportFixtures();
    const snapshot = JSON.stringify(passports);
    createPMFreakAgentPassportRegistry(passports);

    assert.equal(JSON.stringify(passports), snapshot);
  });
});
