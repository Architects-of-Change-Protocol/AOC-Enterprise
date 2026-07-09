import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakReadOnlyConnectorDescriptor } from '../pmfreak-read-only-connector-descriptor.js';
import { AOC_PMFREAK_READ_ONLY_CONNECTOR_ID } from '../pmfreak-read-only-connector-constants.js';

describe('AOC PMFreak Read-Only Connector descriptor', () => {
  it('creates a connector descriptor with the correct connector id, mode, and capability flags', () => {
    const descriptor = createAocPMFreakReadOnlyConnectorDescriptor();

    assert.equal(descriptor.connectorId, 'aoc.integration.pmfreak.read_only_connector.v1');
    assert.equal(descriptor.connectorId, AOC_PMFREAK_READ_ONLY_CONNECTOR_ID);
    assert.equal(descriptor.mode, 'read_only');
    assert.equal(descriptor.systemId, 'pmfreak');
    assert.equal(descriptor.version, 'v1');
    assert.equal(descriptor.demoCompatible, true);
    assert.equal(descriptor.productionMutationCapable, false);
    assert.equal(descriptor.governanceDecisionCapable, false);
  });

  it('capabilities include read_projects and forbiddenOperations include update_project', () => {
    const descriptor = createAocPMFreakReadOnlyConnectorDescriptor();

    assert.ok(descriptor.capabilities.includes('read_projects'));
    assert.ok(descriptor.forbiddenOperations.includes('update_project'));
  });

  it('carries safe disclaimers stating no mutation, no decisions, no communications, no compliance certification', () => {
    const descriptor = createAocPMFreakReadOnlyConnectorDescriptor();

    assert.ok(descriptor.disclaimers.length > 0);
    const disclaimerText = descriptor.disclaimers.join(' ').toLowerCase();
    assert.ok(disclaimerText.includes('does not mutate'));
    assert.ok(disclaimerText.includes('does not execute actions'));
    assert.ok(disclaimerText.includes('does not create governance decisions'));
    assert.ok(disclaimerText.includes('does not send communications'));
    assert.ok(disclaimerText.includes('does not create invoices'));
    assert.ok(disclaimerText.includes('does not certify compliance'));
    assert.ok(disclaimerText.includes('does not provide legal advice'));
  });

  it('is a pure, deterministic function', () => {
    const first = createAocPMFreakReadOnlyConnectorDescriptor();
    const second = createAocPMFreakReadOnlyConnectorDescriptor();
    assert.deepEqual(first, second);
  });
});
