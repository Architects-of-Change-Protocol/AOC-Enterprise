import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakGovernanceIntakeHealth } from '../aoc-pmfreak-governance-intake-health.js';
import { createAocPMFreakGovernanceRequestIntakeConfig } from '../aoc-pmfreak-governance-intake-config.js';

describe('Soberanía PMFreak Governance Request Intake -- health model', () => {
  it('reports healthy for a clean default config', () => {
    const health = createAocPMFreakGovernanceIntakeHealth(createAocPMFreakGovernanceRequestIntakeConfig());
    assert.equal(health.status, 'healthy');
    assert.deepEqual(health.warnings, []);
    assert.deepEqual(health.errors, []);
  });

  it('reports degraded when the config carries warnings', () => {
    const config = createAocPMFreakGovernanceRequestIntakeConfig({ allowPMFreakMutations: true });
    const health = createAocPMFreakGovernanceIntakeHealth(config);
    assert.equal(health.status, 'degraded');
    assert.ok(health.warnings.length > 0);
  });

  it('reports unavailable when the evaluation mode is unsupported', () => {
    const config = createAocPMFreakGovernanceRequestIntakeConfig({ evaluationMode: 'unsupported' });
    const health = createAocPMFreakGovernanceIntakeHealth(config);
    assert.equal(health.status, 'unavailable');
    assert.ok(health.errors.length > 0);
  });

  it('always reports PMFreak mutation and action execution as incapable', () => {
    const health = createAocPMFreakGovernanceIntakeHealth(createAocPMFreakGovernanceRequestIntakeConfig());
    assert.equal(health.productionMutationCapable, false);
    assert.equal(health.pmfreakMutationCapable, false);
    assert.equal(health.actionExecutionCapable, false);
  });
});
