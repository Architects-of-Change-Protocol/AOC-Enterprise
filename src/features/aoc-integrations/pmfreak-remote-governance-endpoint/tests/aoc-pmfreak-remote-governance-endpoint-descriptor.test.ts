import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakRemoteGovernanceEndpointDescriptor } from '../aoc-pmfreak-remote-governance-endpoint-descriptor.js';
import { AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH, AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID } from '../aoc-pmfreak-remote-governance-endpoint-constants.js';

describe('AOC PMFreak Remote Governance Endpoint -- descriptor', () => {
  it('carries the correct AOC-provider / PMFreak-consumer runtime direction', () => {
    const descriptor = createAocPMFreakRemoteGovernanceEndpointDescriptor();

    assert.equal(descriptor.endpointId, AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID);
    assert.equal(descriptor.providerId, 'aoc');
    assert.equal(descriptor.consumerId, 'pmfreak');
    assert.equal(descriptor.version, 'v1');
    assert.equal(descriptor.mode, 'remote_governance_endpoint');
    assert.equal(descriptor.runtimeDirection, 'pmfreak_consumes_aoc_governance');
    assert.equal(descriptor.defaultPath, AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH);
  });

  it('declares every mutation/execution/communication/invoice capability as false', () => {
    const descriptor = createAocPMFreakRemoteGovernanceEndpointDescriptor();

    assert.equal(descriptor.productionMutationCapable, false);
    assert.equal(descriptor.pmfreakMutationCapable, false);
    assert.equal(descriptor.actionExecutionCapable, false);
    assert.equal(descriptor.invoiceCreationCapable, false);
    assert.equal(descriptor.communicationCapable, false);
  });

  it('exposes non-empty capabilities, forbidden operations, safe labels, and disclaimers', () => {
    const descriptor = createAocPMFreakRemoteGovernanceEndpointDescriptor();

    assert.ok(descriptor.capabilities.length > 0);
    assert.ok(descriptor.forbiddenOperations.length > 0);
    assert.ok(descriptor.safeLabels.length > 0);
    assert.ok(descriptor.disclaimers.length > 0);
    assert.ok(descriptor.forbiddenOperations.includes('mutate_pmfreak_project'));
    assert.ok(descriptor.forbiddenOperations.includes('execute_pmfreak_action'));
    assert.ok(descriptor.forbiddenOperations.includes('writeback_decision_to_pmfreak'));
    assert.ok(descriptor.forbiddenOperations.includes('create_invoice'));
  });

  it('is deterministic across repeated calls', () => {
    assert.deepEqual(createAocPMFreakRemoteGovernanceEndpointDescriptor(), createAocPMFreakRemoteGovernanceEndpointDescriptor());
  });
});
