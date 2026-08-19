import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakGovernanceRequestIntakeConfig } from '../aoc-pmfreak-governance-intake-config.js';
import { AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_ID } from '../aoc-pmfreak-governance-intake-constants.js';

describe('Soberanía PMFreak Governance Request Intake -- config defaults', () => {
  it('defaults to a safe-by-default configuration', () => {
    const config = createAocPMFreakGovernanceRequestIntakeConfig();

    assert.equal(config.intakeId, AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_ID);
    assert.equal(config.environment, 'demo');
    assert.equal(config.evaluationMode, 'deterministic_local');
    assert.equal(config.requestMode, 'dry_run');
    assert.equal(config.allowPMFreakMutations, false);
    assert.equal(config.allowActionExecution, false);
    assert.equal(config.allowDecisionWriteback, false);
    assert.equal(config.timeoutMs, 5000);
    assert.equal(config.maxPayloadSizeKb, 256);
    assert.equal(config.redactionMode, 'safe_demo');
    assert.deepEqual(config.notes, []);
    assert.deepEqual(config.warnings, []);
  });

  it('lets safe fields be overridden', () => {
    const config = createAocPMFreakGovernanceRequestIntakeConfig({ environment: 'staging', evaluationMode: 'passport_runtime', redactionMode: 'strict', timeoutMs: 1000 });

    assert.equal(config.environment, 'staging');
    assert.equal(config.evaluationMode, 'passport_runtime');
    assert.equal(config.redactionMode, 'strict');
    assert.equal(config.timeoutMs, 1000);
  });
});

describe('Soberanía PMFreak Governance Request Intake -- config cannot enable mutation/execution/writeback', () => {
  it('forces allowPMFreakMutations to false and warns when a caller requests true', () => {
    const config = createAocPMFreakGovernanceRequestIntakeConfig({ allowPMFreakMutations: true });

    assert.equal(config.allowPMFreakMutations, false);
    assert.ok(config.warnings.some((warning) => warning.includes('allowPMFreakMutations')));
  });

  it('forces allowActionExecution to false and warns when a caller requests true', () => {
    const config = createAocPMFreakGovernanceRequestIntakeConfig({ allowActionExecution: true });

    assert.equal(config.allowActionExecution, false);
    assert.ok(config.warnings.some((warning) => warning.includes('allowActionExecution')));
  });

  it('forces allowDecisionWriteback to false and warns when a caller requests true', () => {
    const config = createAocPMFreakGovernanceRequestIntakeConfig({ allowDecisionWriteback: true });

    assert.equal(config.allowDecisionWriteback, false);
    assert.ok(config.warnings.some((warning) => warning.includes('allowDecisionWriteback')));
  });

  it('forces all three flags to false simultaneously', () => {
    const config = createAocPMFreakGovernanceRequestIntakeConfig({ allowPMFreakMutations: true, allowActionExecution: true, allowDecisionWriteback: true });

    assert.equal(config.allowPMFreakMutations, false);
    assert.equal(config.allowActionExecution, false);
    assert.equal(config.allowDecisionWriteback, false);
    assert.equal(config.warnings.length, 3);
  });
});
