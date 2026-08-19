import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDraftClosureEmailGuardInput } from '../../action-enforcement/fixtures/allowed-action.fixture.js';
import { createDemoFixtureOrchestrator } from '../services/demo-fixture-orchestrator.js';

describe('DemoFixtureOrchestrator', () => {
  it('creates a deterministic enterprise demo world', () => {
    const orchestrator = createDemoFixtureOrchestrator();
    const world = orchestrator.createWorld();
    assert.equal(world.trustDomainId, 'trust-domain-datasys-agent-republic');
    assert.equal(world.fixture.world.trustDomain.name, 'Datasys Agent Republic');
  });

  it('includes all core personas', () => {
    const orchestrator = createDemoFixtureOrchestrator();
    const personas = orchestrator.getPersonas();
    const displayNames = personas.map((persona) => persona.displayName);
    assert.ok(displayNames.includes('Victor Valverde'));
    assert.ok(displayNames.includes('Datasys'));
    assert.ok(displayNames.includes('PMFreak Closure Agent'));
    assert.ok(displayNames.includes('Finance Approver'));
    assert.ok(displayNames.includes('Trusted Partner Research Agent'));
    assert.ok(displayNames.includes('Unknown External Agent'));
    assert.ok(displayNames.includes('Soberanía Operator'));
  });

  it('includes project:HMP-14665 and project:GCH-15992', () => {
    const orchestrator = createDemoFixtureOrchestrator();
    const world = orchestrator.createWorld();
    const scopes = orchestrator.getProjectScopes(world);
    assert.equal(scopes.primary, 'project:HMP-14665');
    assert.equal(scopes.secondary, 'project:GCH-15992');
  });

  it('creates fresh, independent fixture state per call', () => {
    const orchestrator = createDemoFixtureOrchestrator();
    const worldA = orchestrator.createWorld();
    const worldB = orchestrator.createWorld();
    assert.notEqual(worldA.fixture.enforcementRuntime, worldB.fixture.enforcementRuntime);
    assert.notEqual(worldA.fixture.recognitionRuntime, worldB.fixture.recognitionRuntime);
  });

  it('does not carry idempotency state across separately created worlds', async () => {
    const orchestrator = createDemoFixtureOrchestrator();
    const worldA = orchestrator.createWorld();
    const key = 'idempotency-key-orchestrator-isolation-test';

    const firstOutcome = await worldA.fixture.aocGuard.enforce(buildDraftClosureEmailGuardInput({ idempotencyKey: key }), () => 'draft saved');
    assert.equal(firstOutcome.decision.type, 'execute_allowed');

    const worldB = orchestrator.createWorld();
    const secondOutcome = await worldB.fixture.aocGuard.enforce(buildDraftClosureEmailGuardInput({ idempotencyKey: key }), () => 'draft saved again');
    assert.equal(secondOutcome.decision.type, 'execute_allowed');
    assert.equal(secondOutcome.result.executed, true);
  });
});
