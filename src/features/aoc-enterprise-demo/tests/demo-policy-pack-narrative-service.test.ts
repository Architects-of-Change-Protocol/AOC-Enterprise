import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDemoPolicyPackNarrativeService } from '../services/demo-policy-pack-narrative-service.js';
import { createEnterpriseDemoSuite } from '../services/index.js';
import { POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO } from '../scenarios/policy-pack-payment-approval-required.scenario.js';

const FORBIDDEN_PHRASES = [
  'proves legal compliance',
  'complies with costa rican law',
  'complies with eu/us/panama law',
  'legally complete',
];

describe('DemoPolicyPackNarrativeService', () => {
  it('1. creates executive narration', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const narrativeService = createDemoPolicyPackNarrativeService();
    const narrative = narrativeService.buildNarrative(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, run.outcome!, run.policyControlPlaneSnapshot);
    const executive = narrative.sections.find((section) => section.audience === 'executive');
    assert.ok(executive !== undefined);
    assert.ok(executive!.body.length > 0);
  });

  it('2. creates technical narration', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const narrativeService = createDemoPolicyPackNarrativeService();
    const narrative = narrativeService.buildNarrative(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, run.outcome!, run.policyControlPlaneSnapshot);
    const technical = narrative.sections.find((section) => section.audience === 'technical');
    assert.ok(technical !== undefined);
    assert.ok(technical!.body.includes(run.outcome!.policyDecisionId ?? ''));
  });

  it('3. creates operator narration', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const narrativeService = createDemoPolicyPackNarrativeService();
    const narrative = narrativeService.buildNarrative(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, run.outcome!, run.policyControlPlaneSnapshot);
    const operator = narrative.sections.find((section) => section.audience === 'operator');
    assert.ok(operator !== undefined);
    assert.ok(operator!.body.length > 0);
  });

  it('4. creates investor narration', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const narrativeService = createDemoPolicyPackNarrativeService();
    const narrative = narrativeService.buildNarrative(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, run.outcome!, run.policyControlPlaneSnapshot);
    const investor = narrative.sections.find((section) => section.audience === 'investor');
    assert.ok(investor !== undefined);
    assert.ok(investor!.body.length > 0);
  });

  it('5. includes buyer pain', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const narrativeService = createDemoPolicyPackNarrativeService();
    const narrative = narrativeService.buildNarrative(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, run.outcome!, run.policyControlPlaneSnapshot);
    assert.equal(narrative.buyerPain, POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO.buyerPain);
  });

  it('6. includes Soberanía value', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const narrativeService = createDemoPolicyPackNarrativeService();
    const narrative = narrativeService.buildNarrative(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, run.outcome!, run.policyControlPlaneSnapshot);
    assert.equal(narrative.aocValue, POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO.aocValue);
  });

  it('7. includes a Control Plane walkthrough', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const narrativeService = createDemoPolicyPackNarrativeService();
    const narrative = narrativeService.buildNarrative(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, run.outcome!, run.policyControlPlaneSnapshot);
    assert.ok(narrative.controlPlaneWalkthrough.length > 0);
    assert.ok(narrative.controlPlaneWalkthrough.includes('policy_packs'));
  });

  it('8. includes a not-legal-advice disclaimer', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const narrativeService = createDemoPolicyPackNarrativeService();
    const narrative = narrativeService.buildNarrative(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, run.outcome!, run.policyControlPlaneSnapshot);
    assert.ok(narrative.legalDisclaimer.toLowerCase().includes('not legal advice'));
    assert.ok(narrative.legalDisclaimer.toLowerCase().includes('demo pack models an enterprise policy requirement'));
  });

  it('9. avoids legal compliance overclaims', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const narrativeService = createDemoPolicyPackNarrativeService();
    const narrative = narrativeService.buildNarrative(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, run.outcome!, run.policyControlPlaneSnapshot);
    const fullText = [narrative.legalDisclaimer, narrative.controlPlaneWalkthrough, ...narrative.sections.map((section) => section.body)].join(' ').toLowerCase();
    for (const phrase of FORBIDDEN_PHRASES) {
      assert.ok(!fullText.includes(phrase), `narrative unexpectedly contains overclaim: "${phrase}"`);
    }
  });

  it('10. produces deterministic output', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.policyPackScenarioService.runScenario('policy-pack-payment-approval-required');
    const narrativeService = createDemoPolicyPackNarrativeService();
    const narrativeA = narrativeService.buildNarrative(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, run.outcome!, run.policyControlPlaneSnapshot);
    const narrativeB = narrativeService.buildNarrative(POLICY_PACK_PAYMENT_APPROVAL_REQUIRED_SCENARIO, run.outcome!, run.policyControlPlaneSnapshot);
    assert.deepEqual(narrativeA, narrativeB);
  });
});
