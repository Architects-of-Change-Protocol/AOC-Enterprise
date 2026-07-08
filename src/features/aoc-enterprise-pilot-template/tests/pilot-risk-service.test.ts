import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PilotRiskService } from '../services/pilot-risk-service.js';
import { buildMinimalPilotTemplate } from '../fixtures/minimal-pilot-template.fixture.js';
import type { PilotExportPackageBindingResult } from '../services/pilot-export-package-binding-service.js';

describe('PilotRiskService', () => {
  it('1. lists pilot risks', () => {
    const service = new PilotRiskService();
    const template = buildMinimalPilotTemplate({ risks: [{ id: 'risk-b', title: 'B', description: 'd', severity: 'low', mitigation: 'm' }] });
    const result = service.evaluate(template);
    assert.deepEqual(
      result.risks.map((r) => r.id),
      ['risk-b'],
    );
  });

  it('2. validates each risk has mitigation', () => {
    const service = new PilotRiskService();
    const template = buildMinimalPilotTemplate({ risks: [{ id: 'risk-no-mitigation', title: 'T', description: 'd', severity: 'medium', mitigation: '' }] });
    const result = service.evaluate(template);
    assert.deepEqual(result.missingMitigationRiskIds, ['risk-no-mitigation']);
  });

  it('3. escalates missing legal disclaimer risk', () => {
    const service = new PilotRiskService();
    const template = buildMinimalPilotTemplate({ legalDisclaimer: '' });
    const result = service.evaluate(template);
    assert.ok(result.escalatedRiskReasonCodes.includes('MISSING_LEGAL_DISCLAIMER'));
  });

  it('4. escalates demo-only confusion risk', () => {
    const service = new PilotRiskService();
    const template = buildMinimalPilotTemplate({ nonGoals: ['unrelated non-goal'] });
    const result = service.evaluate(template);
    assert.ok(result.escalatedRiskReasonCodes.includes('DEMO_ONLY_CONFUSION_RISK'));
  });

  it('5. escalates missing export package risk', () => {
    const service = new PilotRiskService();
    const template = buildMinimalPilotTemplate();
    const missing: readonly PilotExportPackageBindingResult[] = [];
    const result = service.evaluate(template, { exportPackageBindings: missing });
    assert.ok(result.escalatedRiskReasonCodes.includes('MISSING_EXPORT_PACKAGE_RISK'));
  });

  it('6. escalates missing evidence risk', () => {
    const service = new PilotRiskService();
    const template = buildMinimalPilotTemplate();
    const withEvidenceScenario = {
      ...template,
      evidenceModel: { ...template.evidenceModel, evidenceScenarios: [{ action: 'a', requiredEvidenceTypes: ['invoice'], expectedEvidenceBehavior: 'satisfied' as const, description: 'd' }] },
    };
    const result = service.evaluate(withEvidenceScenario);
    assert.ok(result.escalatedRiskReasonCodes.includes('MISSING_EVIDENCE_RISK'));
  });

  it('7. deterministic ordering', () => {
    const service = new PilotRiskService();
    const template = buildMinimalPilotTemplate({
      risks: [
        { id: 'risk-z', title: 'Z', description: 'd', severity: 'low', mitigation: 'm' },
        { id: 'risk-a', title: 'A', description: 'd', severity: 'low', mitigation: 'm' },
      ],
    });
    const result = service.evaluate(template);
    assert.deepEqual(
      result.risks.map((r) => r.id),
      ['risk-a', 'risk-z'],
    );
  });
});
