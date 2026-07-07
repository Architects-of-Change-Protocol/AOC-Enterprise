import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoProofChainPanel } from '../../components/DemoProofChainPanel.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoProofChain } from '../../domain/demo-proof-chain.js';

describe('DemoProofChainPanel', () => {
  let proofChain: DemoProofChain;

  before(async () => {
    const suite = createEnterpriseDemoSuite();
    proofChain = (await suite.runner.runScenario('internal-agent-allowed')).proofChain!;
  });

  it('renders proof ids', () => {
    const html = renderToStaticMarkup(<DemoProofChainPanel proofChain={proofChain} />);
    for (const proofId of proofChain.proofIds) {
      assert.ok(html.includes(proofId));
    }
  });

  it('renders proof hashes', () => {
    const html = renderToStaticMarkup(<DemoProofChainPanel proofChain={proofChain} />);
    for (const hash of proofChain.proofHashes) {
      assert.ok(html.includes(hash));
    }
  });

  it('renders the complete state badge', () => {
    const html = renderToStaticMarkup(<DemoProofChainPanel proofChain={proofChain} />);
    assert.ok(html.includes('aoc-demo-proof-chain-panel__badge--complete'));
    assert.ok(html.includes('Complete'));
  });

  it('renders missing sources when the chain is incomplete', () => {
    const incomplete: DemoProofChain = { ...proofChain, complete: false, missingSources: ['approval'] };
    const html = renderToStaticMarkup(<DemoProofChainPanel proofChain={incomplete} />);
    assert.ok(html.includes('Missing sources'));
    assert.ok(html.includes('Incomplete'));
  });

  it('renders an empty state with no proof chain', () => {
    const html = renderToStaticMarkup(<DemoProofChainPanel />);
    assert.ok(html.includes('No proof chain has been extracted'));
  });
});
