import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoScenarioTimeline } from '../../components/DemoScenarioTimeline.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoScenarioRun } from '../../domain/demo-step.js';

describe('DemoScenarioTimeline', () => {
  let run: DemoScenarioRun;

  before(async () => {
    const suite = createEnterpriseDemoSuite();
    run = await suite.runner.runScenario('internal-agent-allowed');
  });

  it('renders steps', () => {
    const html = renderToStaticMarkup(<DemoScenarioTimeline steps={run.steps} />);
    for (const step of run.steps) {
      assert.ok(html.includes(step.title), `expected step "${step.title}"`);
    }
  });

  it('renders step statuses', () => {
    const html = renderToStaticMarkup(<DemoScenarioTimeline steps={run.steps} />);
    assert.ok(html.includes('aoc-demo-step-card--passed'));
  });

  it('renders related entity and proof references', () => {
    const stepWithProof = run.steps.find((step) => step.relatedProofIds.length > 0);
    assert.ok(stepWithProof !== undefined);
    const html = renderToStaticMarkup(<DemoScenarioTimeline steps={run.steps} />);
    assert.ok(html.includes(stepWithProof!.relatedProofIds[0]!));
  });

  it('renders an empty state with no steps', () => {
    const html = renderToStaticMarkup(<DemoScenarioTimeline steps={[]} />);
    assert.ok(html.includes('This scenario has not been run yet.'));
  });
});
