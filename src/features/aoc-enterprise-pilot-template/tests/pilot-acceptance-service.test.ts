import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PilotAcceptanceService } from '../services/pilot-acceptance-service.js';
import { buildMinimalAcceptanceCriterion } from '../fixtures/minimal-pilot-template.fixture.js';
import type { PilotScenarioBindingResult } from '../services/pilot-scenario-binding-service.js';
import type { PilotExportPackageBindingResult } from '../services/pilot-export-package-binding-service.js';

function boundScenario(overrides: Partial<PilotScenarioBindingResult> = {}): PilotScenarioBindingResult {
  return { pilotScenarioId: 'scenario-1', demoScenarioId: 'internal-agent-allowed', status: 'bound', bound: true, reason: 'ok', ...overrides };
}

function boundExport(overrides: Partial<PilotExportPackageBindingResult> = {}): PilotExportPackageBindingResult {
  return { pilotExportPackageDefinitionId: 'export-1', exportPackageId: 'export-package-1', status: 'bound', bound: true, reason: 'ok', ...overrides };
}

describe('PilotAcceptanceService', () => {
  it('1. evaluates automated_test criterion', () => {
    const service = new PilotAcceptanceService();
    const result = service.evaluate({ criteria: [buildMinimalAcceptanceCriterion({ verificationMethod: 'automated_test' })], scenarioBindings: [boundScenario()], exportPackageBindings: [] });
    assert.deepEqual(result.passedCriteriaIds, ['test-acceptance-1']);
  });

  it('2. evaluates demo_walkthrough criterion', () => {
    const service = new PilotAcceptanceService();
    const result = service.evaluate({ criteria: [buildMinimalAcceptanceCriterion({ verificationMethod: 'demo_walkthrough' })], scenarioBindings: [boundScenario()], exportPackageBindings: [] });
    assert.deepEqual(result.passedCriteriaIds, ['test-acceptance-1']);
  });

  it('3. keeps operator_review pending/warning unless explicit complete', () => {
    const service = new PilotAcceptanceService();
    const pending = service.evaluate({ criteria: [buildMinimalAcceptanceCriterion({ verificationMethod: 'operator_review' })], scenarioBindings: [], exportPackageBindings: [] });
    assert.deepEqual(pending.warningCriteriaIds, ['test-acceptance-1']);

    const complete = service.evaluate({
      criteria: [buildMinimalAcceptanceCriterion({ verificationMethod: 'operator_review', metadata: { manuallyCompleted: true } })],
      scenarioBindings: [],
      exportPackageBindings: [],
    });
    assert.deepEqual(complete.passedCriteriaIds, ['test-acceptance-1']);
  });

  it('4. keeps customer_signoff pending/warning unless explicit complete', () => {
    const service = new PilotAcceptanceService();
    const pending = service.evaluate({ criteria: [buildMinimalAcceptanceCriterion({ verificationMethod: 'customer_signoff', required: false })], scenarioBindings: [], exportPackageBindings: [] });
    assert.deepEqual(pending.warningCriteriaIds, ['test-acceptance-1']);

    const complete = service.evaluate({
      criteria: [buildMinimalAcceptanceCriterion({ verificationMethod: 'customer_signoff', required: false, metadata: { manuallyCompleted: true } })],
      scenarioBindings: [],
      exportPackageBindings: [],
    });
    assert.deepEqual(complete.passedCriteriaIds, ['test-acceptance-1']);
  });

  it('5. passes export_package_verification when package verified', () => {
    const service = new PilotAcceptanceService();
    const result = service.evaluate({ criteria: [buildMinimalAcceptanceCriterion({ verificationMethod: 'export_package_verification' })], scenarioBindings: [], exportPackageBindings: [boundExport()] });
    assert.deepEqual(result.passedCriteriaIds, ['test-acceptance-1']);
  });

  it('6. fails export_package_verification when package failed', () => {
    const service = new PilotAcceptanceService();
    const result = service.evaluate({
      criteria: [buildMinimalAcceptanceCriterion({ verificationMethod: 'export_package_verification' })],
      scenarioBindings: [],
      exportPackageBindings: [boundExport({ status: 'failed_verification', bound: false })],
    });
    assert.deepEqual(result.failedCriteriaIds, ['test-acceptance-1']);
  });

  it('7. produces passed/failed/warning criteria', () => {
    const service = new PilotAcceptanceService();
    const result = service.evaluate({
      criteria: [
        buildMinimalAcceptanceCriterion({ id: 'c-pass', verificationMethod: 'automated_test' }),
        buildMinimalAcceptanceCriterion({ id: 'c-fail', verificationMethod: 'export_package_verification' }),
        buildMinimalAcceptanceCriterion({ id: 'c-warn', verificationMethod: 'operator_review' }),
      ],
      scenarioBindings: [boundScenario()],
      exportPackageBindings: [boundExport({ status: 'failed_verification', bound: false })],
    });
    assert.deepEqual(result.passedCriteriaIds, ['c-pass']);
    assert.deepEqual(result.failedCriteriaIds, ['c-fail']);
    assert.deepEqual(result.warningCriteriaIds, ['c-warn']);
  });

  it('8. deterministic output', () => {
    const service = new PilotAcceptanceService();
    const input = { criteria: [buildMinimalAcceptanceCriterion()], scenarioBindings: [boundScenario()], exportPackageBindings: [boundExport()] };
    assert.deepEqual(service.evaluate(input), service.evaluate(input));
  });
});
