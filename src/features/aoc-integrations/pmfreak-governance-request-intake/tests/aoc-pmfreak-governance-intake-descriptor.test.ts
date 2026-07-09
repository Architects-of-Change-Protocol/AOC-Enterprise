import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakGovernanceRequestIntakeDescriptor } from '../aoc-pmfreak-governance-intake-descriptor.js';
import { AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_ID } from '../aoc-pmfreak-governance-intake-constants.js';

describe('AOC PMFreak Governance Request Intake -- descriptor', () => {
  it('carries the correct AOC provider / PMFreak consumer runtime direction', () => {
    const descriptor = createAocPMFreakGovernanceRequestIntakeDescriptor();

    assert.equal(descriptor.providerId, 'aoc');
    assert.equal(descriptor.consumerId, 'pmfreak');
    assert.equal(descriptor.runtimeDirection, 'pmfreak_consumes_aoc_governance');
  });

  it('carries the correct intake id and mode', () => {
    const descriptor = createAocPMFreakGovernanceRequestIntakeDescriptor();

    assert.equal(descriptor.intakeId, AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_ID);
    assert.equal(descriptor.intakeId, 'aoc.integration.pmfreak.governance_request_intake.v1');
    assert.equal(descriptor.mode, 'governance_request_intake');
    assert.equal(descriptor.version, 'v1');
  });

  it('declares itself incapable of production mutation, PMFreak mutation, or action execution', () => {
    const descriptor = createAocPMFreakGovernanceRequestIntakeDescriptor();

    assert.equal(descriptor.productionMutationCapable, false);
    assert.equal(descriptor.pmfreakMutationCapable, false);
    assert.equal(descriptor.actionExecutionCapable, false);
  });

  it('states every required safety disclaimer', () => {
    const descriptor = createAocPMFreakGovernanceRequestIntakeDescriptor();
    const joined = descriptor.disclaimers.join(' ');

    for (const fragment of [
      'receives PMFreak governance requests',
      'evaluates requests for AOC governance decisions',
      'returns governed decisions to PMFreak',
      'does not mutate PMFreak data',
      'does not execute PMFreak actions',
      'does not write back to PMFreak',
      'does not send communications',
      'does not create invoices',
      'does not certify compliance',
      'does not certify customer acceptance',
      'does not certify invoice validity',
      'does not provide legal advice',
    ]) {
      assert.ok(joined.includes(fragment), `expected disclaimers to include "${fragment}"`);
    }
  });

  it('carries every required safe label', () => {
    const descriptor = createAocPMFreakGovernanceRequestIntakeDescriptor();

    for (const label of [
      'AOC Governance intake',
      'PMFreak consumes AOC Governance',
      'No PMFreak mutation performed',
      'No action execution performed',
      'No invoice validity claimed',
      'No customer acceptance certification',
      'Not compliance certification',
      'Not legal advice',
    ]) {
      assert.ok(descriptor.safeLabels.includes(label), `expected safeLabels to include "${label}"`);
    }
  });

  it('declares every capability and forbidden operation', () => {
    const descriptor = createAocPMFreakGovernanceRequestIntakeDescriptor();

    assert.ok(descriptor.capabilities.includes('receive_governance_request'));
    assert.ok(descriptor.capabilities.includes('evaluate_governance_request'));
    assert.ok(descriptor.forbiddenOperations.includes('mutate_pmfreak_project'));
    assert.ok(descriptor.forbiddenOperations.includes('execute_pmfreak_action'));
    assert.ok(descriptor.forbiddenOperations.includes('writeback_decision_to_pmfreak'));
    assert.ok(descriptor.forbiddenOperations.includes('certify_invoice_validity'));
  });
});
