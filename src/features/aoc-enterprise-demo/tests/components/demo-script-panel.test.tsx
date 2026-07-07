import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoScriptPanel } from '../../components/DemoScriptPanel.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import { createDemoScriptService } from '../../services/demo-script-service.js';
import type { DemoScript } from '../../domain/demo-script.js';

describe('DemoScriptPanel', () => {
  let scripts: readonly DemoScript[];

  before(async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    const scenario = suite.registry.getScenario('internal-agent-allowed')!;
    scripts = createDemoScriptService().buildAllAudienceScripts(scenario, run.outcome!);
  });

  it('renders the executive script', () => {
    const html = renderToStaticMarkup(<DemoScriptPanel scripts={scripts} />);
    assert.ok(html.includes('executive'));
  });

  it('renders the technical script', () => {
    const html = renderToStaticMarkup(<DemoScriptPanel scripts={scripts} />);
    assert.ok(html.includes('technical'));
  });

  it('renders the operator script', () => {
    const html = renderToStaticMarkup(<DemoScriptPanel scripts={scripts} />);
    assert.ok(html.includes('operator'));
  });

  it('renders the investor script', () => {
    const html = renderToStaticMarkup(<DemoScriptPanel scripts={scripts} />);
    assert.ok(html.includes('investor'));
  });

  it('renders an empty state with no scripts', () => {
    const html = renderToStaticMarkup(<DemoScriptPanel scripts={[]} />);
    assert.ok(html.includes('No demo scripts have been generated'));
  });
});
