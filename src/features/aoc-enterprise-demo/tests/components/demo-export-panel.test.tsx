import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoExportPanel } from '../../components/DemoExportPanel.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoExportArtifact } from '../../domain/demo-export.js';

describe('DemoExportPanel', () => {
  let artifacts: readonly DemoExportArtifact[];

  before(async () => {
    const suite = createEnterpriseDemoSuite();
    artifacts = (await suite.runner.runScenario('internal-agent-allowed')).exportArtifacts;
  });

  it('renders export artifact tabs', () => {
    const html = renderToStaticMarkup(<DemoExportPanel artifacts={artifacts} />);
    for (const artifact of artifacts) {
      assert.ok(html.includes(artifact.title));
    }
  });

  it('renders the JSON summary content by default', () => {
    const html = renderToStaticMarkup(<DemoExportPanel artifacts={artifacts} />);
    assert.ok(html.includes('internal-agent-allowed'));
  });

  it('renders the markdown script when selected', () => {
    const html = renderToStaticMarkup(<DemoExportPanel artifacts={artifacts} selectedType="markdown_script" />);
    assert.ok(html.includes('Internal Agent Allowed to Draft Closure Email'));
  });

  it('renders the sales one-pager when selected', () => {
    const html = renderToStaticMarkup(<DemoExportPanel artifacts={artifacts} selectedType="sales_one_pager" />);
    assert.ok(html.includes('Buyer pain'));
  });

  it('renders an empty state with no artifacts', () => {
    const html = renderToStaticMarkup(<DemoExportPanel artifacts={[]} />);
    assert.ok(html.includes('No export artifacts are available'));
  });
});
