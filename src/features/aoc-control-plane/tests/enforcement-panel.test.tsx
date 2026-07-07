import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { EnforcementPanel } from '../components/enforcement/EnforcementPanel.js';
import { EnforcementDecisionDetail } from '../components/enforcement/EnforcementDecisionDetail.js';
import { SideEffectsTable } from '../components/enforcement/SideEffectsTable.js';
import { IdempotencyStatus } from '../components/enforcement/IdempotencyStatus.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('EnforcementPanel', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('renders enforcement requests', () => {
    const html = renderToStaticMarkup(<EnforcementPanel enforcement={model.enforcement} />);
    assert.ok(model.enforcement.requests.length > 0);
    assert.ok(html.includes(model.enforcement.requests[0]!.id));
  });

  it('renders a blocked execution', () => {
    const blocked = model.enforcement.decisions.find((decision) => decision.type === 'execution_blocked');
    assert.ok(blocked);
    const html = renderToStaticMarkup(<EnforcementDecisionDetail decision={blocked!} />);
    assert.ok(html.includes('execution_blocked'));
    assert.ok(html.includes(blocked!.reasonCode));
  });

  it('renders an executed action', () => {
    const allowed = model.enforcement.decisions.find((decision) => decision.type === 'execute_allowed');
    assert.ok(allowed);
    const html = renderToStaticMarkup(<EnforcementDecisionDetail decision={allowed!} />);
    assert.ok(html.includes('execute_allowed'));
  });

  it('renders execution results', () => {
    const html = renderToStaticMarkup(<EnforcementPanel enforcement={model.enforcement} />);
    assert.ok(html.includes('executed'));
  });

  it('renders side effects', () => {
    assert.ok(model.enforcement.sideEffects.length > 0);
    const html = renderToStaticMarkup(<SideEffectsTable sideEffects={model.enforcement.sideEffects} />);
    assert.ok(html.includes(model.enforcement.sideEffects[0]!.id));
  });

  it('renders violations', () => {
    const html = renderToStaticMarkup(<EnforcementPanel enforcement={model.enforcement} />);
    assert.ok(html.includes('adapter_denied'));
  });

  it('renders idempotency status', () => {
    const duplicateDecision = model.enforcement.decisions.find((decision) => decision.type === 'duplicate_suppressed');
    assert.ok(duplicateDecision);
    const request = model.enforcement.requests.find((r) => r.id === duplicateDecision!.enforcementRequestId)!;
    const html = renderToStaticMarkup(<IdempotencyStatus request={request} isDuplicate={true} />);
    assert.ok(html.includes('duplicate suppressed'));
  });
});
