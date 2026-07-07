import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { ProofsPanel } from '../components/proofs/ProofsPanel.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('ProofsPanel', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('renders proof references', () => {
    const html = renderToStaticMarkup(<ProofsPanel proofs={model.proofs} auditEvents={model.recognition.auditEvents} />);
    assert.ok(html.includes('Recognition proofs'));
    assert.ok(html.includes('Authority proofs'));
    assert.ok(html.includes('Approval proofs'));
    assert.ok(html.includes('Handshake proofs'));
    assert.ok(html.includes('Enforcement proofs'));
  });

  it('renders a proof hash', () => {
    const html = renderToStaticMarkup(<ProofsPanel proofs={model.proofs} auditEvents={model.recognition.auditEvents} />);
    const someHash = model.proofs.enforcementProofs[0]!.proofHash;
    assert.ok(html.includes(someHash.slice(0, 10)));
  });

  it('renders proof chains', () => {
    const html = renderToStaticMarkup(<ProofsPanel proofs={model.proofs} auditEvents={model.recognition.auditEvents} />);
    assert.ok(html.includes('Proof chains'));
    assert.ok(model.proofs.proofChains.every((chain) => chain.complete));
    assert.ok(html.includes('complete'));
  });

  it('renders the audit trail', () => {
    const html = renderToStaticMarkup(<ProofsPanel proofs={model.proofs} auditEvents={model.recognition.auditEvents} />);
    assert.ok(html.includes('Audit trail'));
    assert.ok(html.includes(model.recognition.auditEvents[0]!.id));
  });
});
