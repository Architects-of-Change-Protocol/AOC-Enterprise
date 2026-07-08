import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PilotTemplateStore } from '../services/pilot-template-store.js';
import { PilotQueryService } from '../services/pilot-query-service.js';
import { buildMinimalPilotTemplate, buildMinimalReadinessReport } from '../fixtures/minimal-pilot-template.fixture.js';

function seedStore(): PilotTemplateStore {
  const store = new PilotTemplateStore();
  store.saveTemplate(
    buildMinimalPilotTemplate({
      id: 'datasys-project-governance',
      industry: 'technology_services',
      status: 'ready',
      primaryUseCase: 'project governance',
      targetBuyerPersonaIds: ['persona-a'],
      targetOperatorPersonaIds: ['persona-op-a'],
      capabilities: [{ id: 'cap-read', name: 'Read summary', description: 'd', action: 'read_project_summary', resourceScope: 'x', riskLevel: 'low', requiredAuthority: false, requiredApproval: false, requiredEvidence: false, policyPackSensitive: false }],
      policyModel: { policyPackIds: ['policy-pack-procurement-basic'], policyPackVersionIds: [], demoOnly: true, legalCompleteness: 'demo_policy_model', policyScenarios: [], walkthrough: [] },
      businessPain: 'PMO cannot govern autonomous agents',
    }),
  );
  store.saveTemplate(
    buildMinimalPilotTemplate({
      id: 'bank-payments-procurement-data',
      industry: 'banking',
      status: 'draft',
      primaryUseCase: 'payments and procurement',
      targetBuyerPersonaIds: ['persona-b'],
      targetOperatorPersonaIds: ['persona-op-b'],
      capabilities: [{ id: 'cap-payment', name: 'Approve payment', description: 'd', action: 'approve_payment', resourceScope: 'x', riskLevel: 'critical', requiredAuthority: true, requiredApproval: true, requiredEvidence: false, policyPackSensitive: true }],
      policyModel: { policyPackIds: ['policy-pack-payments-basic'], policyPackVersionIds: [], demoOnly: true, legalCompleteness: 'demo_policy_model', policyScenarios: [], walkthrough: [] },
      exportPackages: [{ id: 'export-audit', name: 'Audit bundle', packageType: 'audit_bundle', targetType: 'audit_scope', targetId: 'x', expectedSections: ['summary'], expectedVerificationStatus: 'verified_with_warnings', buyerPurpose: 'p' }],
      businessPain: 'Banks cannot govern payments',
      scenarios: [
        {
          id: 'bank-scenario-1',
          name: 'Bank scenario',
          description: 'd',
          actionIds: [],
          expectedOutcome: 'blocked',
          controlPlaneFocus: 'enforcement',
          exportPackageType: 'audit_bundle',
          buyerMessage: 'b',
          operatorMessage: 'o',
          technicalMessage: 't',
          acceptanceCriterionIds: [],
          successMetricIds: [],
        },
      ],
    }),
  );
  store.saveReadinessReport(buildMinimalReadinessReport({ id: 'r-datasys', templateId: 'datasys-project-governance', status: 'ready' }));
  store.saveReadinessReport(buildMinimalReadinessReport({ id: 'r-bank', templateId: 'bank-payments-procurement-data', status: 'not_ready' }));
  return store;
}

describe('PilotQueryService', () => {
  it('1. filters by industry', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({ industry: 'banking' }).map((t) => t.id),
      ['bank-payments-procurement-data'],
    );
  });

  it('2. filters by status', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({ status: 'draft' }).map((t) => t.id),
      ['bank-payments-procurement-data'],
    );
  });

  it('3. filters by use case', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({ useCase: 'payments' }).map((t) => t.id),
      ['bank-payments-procurement-data'],
    );
  });

  it('4. filters by persona', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({ personaId: 'persona-op-a' }).map((t) => t.id),
      ['datasys-project-governance'],
    );
  });

  it('5. filters by required capability', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({ requiredCapability: 'cap-payment' }).map((t) => t.id),
      ['bank-payments-procurement-data'],
    );
  });

  it('6. filters by policy pack', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({ policyPackId: 'policy-pack-procurement-basic' }).map((t) => t.id),
      ['datasys-project-governance'],
    );
  });

  it('7. filters by export package type', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({ exportPackageType: 'audit_bundle' }).map((t) => t.id),
      ['bank-payments-procurement-data'],
    );
  });

  it('8. filters by readiness status', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({ readinessStatus: 'not_ready' }).map((t) => t.id),
      ['bank-payments-procurement-data'],
    );
  });

  it('9. text search finds name', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({ text: 'Test Pilot Template' }).map((t) => t.id),
      ['bank-payments-procurement-data', 'datasys-project-governance'],
    );
  });

  it('10. text search finds business pain', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({ text: 'PMO cannot govern' }).map((t) => t.id),
      ['datasys-project-governance'],
    );
  });

  it('11. text search finds scenario', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({ text: 'Bank scenario' }).map((t) => t.id),
      ['bank-payments-procurement-data'],
    );
  });

  it('12. deterministic sorting', () => {
    const service = new PilotQueryService(seedStore());
    assert.deepEqual(
      service.query({}).map((t) => t.id),
      ['bank-payments-procurement-data', 'datasys-project-governance'],
    );
  });
});
