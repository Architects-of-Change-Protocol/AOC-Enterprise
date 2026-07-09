import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildPMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import type { PMFreakDemoControlPlaneFixtures } from '../../pmfreak-demo-control-plane-view/index.js';
import { createPMFreakDemoNarrativeExport } from '../pmfreak-demo-narrative-builder.js';
import { renderPMFreakDemoNarrativeMarkdown } from '../pmfreak-demo-markdown-renderer.js';
import { renderPMFreakDemoNarrativePlainText } from '../pmfreak-demo-plain-text-renderer.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from '../pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeExport } from '../pmfreak-demo-narrative-export-types.js';

let fixtures: PMFreakDemoControlPlaneFixtures;
let narrativeExport: PMFreakDemoNarrativeExport;

before(async () => {
  fixtures = await buildPMFreakDemoControlPlaneFixtures();
  narrativeExport = createPMFreakDemoNarrativeExport(fixtures.demoBillingReadinessMissingEvidenceView);
});

describe('renderPMFreakDemoNarrativeMarkdown', () => {
  it('20. includes title, export id, source scenario, decision, disclaimers, and every section in deterministic order', () => {
    const markdown = renderPMFreakDemoNarrativeMarkdown(narrativeExport);

    assert.ok(markdown.includes(narrativeExport.headline));
    assert.ok(markdown.includes(narrativeExport.exportId));
    assert.ok(markdown.includes(narrativeExport.sourceScenarioId));
    assert.ok(markdown.includes(narrativeExport.decision));
    for (const disclaimer of narrativeExport.disclaimers) assert.ok(markdown.includes(disclaimer));

    let lastIndex = -1;
    for (const section of narrativeExport.sections) {
      const index = markdown.indexOf(`## ${section.title}`);
      assert.ok(index > lastIndex, `expected section "${section.title}" to appear in order`);
      lastIndex = index;
    }
  });

  it('21. is claim-safe', () => {
    const markdown = renderPMFreakDemoNarrativeMarkdown(narrativeExport);
    // A thrown error here fails the test on its own -- no doesNotThrow wrapper needed.
    assertNoPMFreakDemoNarrativeOverclaim(markdown);
  });
});

describe('renderPMFreakDemoNarrativePlainText', () => {
  it('22. includes export id, source scenario, decision, and disclaimers', () => {
    const plainText = renderPMFreakDemoNarrativePlainText(narrativeExport);

    assert.ok(plainText.includes(narrativeExport.exportId));
    assert.ok(plainText.includes(narrativeExport.sourceScenarioId));
    assert.ok(plainText.includes(narrativeExport.decision));
    for (const disclaimer of narrativeExport.disclaimers) assert.ok(plainText.includes(disclaimer));
  });

  it('23. is claim-safe', () => {
    const plainText = renderPMFreakDemoNarrativePlainText(narrativeExport);
    // A thrown error here fails the test on its own -- no doesNotThrow wrapper needed.
    assertNoPMFreakDemoNarrativeOverclaim(plainText);
  });
});
