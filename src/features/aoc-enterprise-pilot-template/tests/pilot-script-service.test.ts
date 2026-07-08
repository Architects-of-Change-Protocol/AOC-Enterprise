import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { PilotScriptService } from '../services/pilot-script-service.js';
import { buildMinimalPilotTemplate } from '../fixtures/minimal-pilot-template.fixture.js';

const NOW = '2026-01-01T00:00:00.000Z';

const FORBIDDEN_CLAIM_PATTERNS: readonly RegExp[] = [
  /is (fully )?compliant/i,
  /proves? (legal|regulatory|production) compliance/i,
  /guarantees? compliance/i,
  /certified complian/i,
  /legally binding/i,
];

describe('PilotScriptService', () => {
  it('1. generates pilot_readme', () => {
    const service = new PilotScriptService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    const artifacts = service.generateAll(template);
    const readme = artifacts.find((a) => a.type === 'pilot_readme');
    assert.ok(readme?.content.includes(template.name));
  });

  it('2. generates demo_script', () => {
    const service = new PilotScriptService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    const artifacts = service.generateAll(template);
    const demoScript = artifacts.find((a) => a.type === 'demo_script');
    assert.ok(demoScript?.content.includes('Demo Script'));
  });

  it('3. generates technical_setup', () => {
    const service = new PilotScriptService(createPilotRuntimeContext(NOW));
    const artifacts = service.generateAll(buildMinimalPilotTemplate());
    const technicalSetup = artifacts.find((a) => a.type === 'technical_setup');
    assert.ok(technicalSetup?.content.includes('Test commands'));
  });

  it('4. generates acceptance_checklist', () => {
    const service = new PilotScriptService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    const artifacts = service.generateAll(template);
    const checklist = artifacts.find((a) => a.type === 'acceptance_checklist');
    assert.ok(checklist?.content.includes(template.acceptanceCriteria[0]?.title ?? ''));
  });

  it('5. generates buyer_summary', () => {
    const service = new PilotScriptService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    const artifacts = service.generateAll(template);
    const buyerSummary = artifacts.find((a) => a.type === 'buyer_summary');
    assert.ok(buyerSummary?.content.includes(template.businessPain));
  });

  it('6. generates operator_walkthrough', () => {
    const service = new PilotScriptService(createPilotRuntimeContext(NOW));
    const artifacts = service.generateAll(buildMinimalPilotTemplate());
    const walkthrough = artifacts.find((a) => a.type === 'operator_walkthrough');
    assert.ok(walkthrough?.content.includes('Operator Walkthrough'));
  });

  it('7. generates pilot_json', () => {
    const service = new PilotScriptService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate();
    const artifacts = service.generateAll(template);
    const pilotJson = artifacts.find((a) => a.type === 'pilot_json');
    const parsed: unknown = JSON.parse(pilotJson?.content ?? '{}');
    assert.deepEqual(parsed, JSON.parse(JSON.stringify(template)));
  });

  it('8. includes legal disclaimer', () => {
    const service = new PilotScriptService(createPilotRuntimeContext(NOW));
    const template = buildMinimalPilotTemplate({ legalDisclaimer: 'UNIQUE_DISCLAIMER_TEXT' });
    const artifacts = service.generateAll(template);
    for (const type of ['pilot_readme', 'demo_script', 'buyer_summary'] as const) {
      const artifact = artifacts.find((a) => a.type === type);
      assert.ok(artifact?.content.includes('not legal advice') || artifact?.content.includes('UNIQUE_DISCLAIMER_TEXT'), `${type} should carry a legal disclaimer`);
    }
  });

  it('9. avoids legal/compliance overclaims', () => {
    const service = new PilotScriptService(createPilotRuntimeContext(NOW));
    const artifacts = service.generateAll(buildMinimalPilotTemplate());
    for (const artifact of artifacts) {
      for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
        assert.equal(pattern.test(artifact.content), false, `${artifact.type} should not match ${pattern}`);
      }
    }
  });

  it('10. deterministic content', () => {
    const template = buildMinimalPilotTemplate();
    const first = new PilotScriptService(createPilotRuntimeContext(NOW)).generateAll(template);
    const second = new PilotScriptService(createPilotRuntimeContext(NOW)).generateAll(template);
    assert.deepEqual(
      first.map((a) => a.content),
      second.map((a) => a.content),
    );
  });

  it('11. contentHash changes when content changes', () => {
    const service = new PilotScriptService(createPilotRuntimeContext(NOW));
    const first = service.generateAll(buildMinimalPilotTemplate({ businessPain: 'pain A' }));
    const second = service.generateAll(buildMinimalPilotTemplate({ businessPain: 'pain B' }));
    const firstReadme = first.find((a) => a.type === 'buyer_summary');
    const secondReadme = second.find((a) => a.type === 'buyer_summary');
    assert.notEqual(firstReadme?.contentHash, secondReadme?.contentHash);
  });
});
