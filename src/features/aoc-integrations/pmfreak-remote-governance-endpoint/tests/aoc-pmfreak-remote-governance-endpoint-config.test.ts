import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakRemoteGovernanceEndpointConfig } from '../aoc-pmfreak-remote-governance-endpoint-config.js';
import { AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH, AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID } from '../aoc-pmfreak-remote-governance-endpoint-constants.js';

describe('Soberanía PMFreak Remote Governance Endpoint -- config defaults', () => {
  it('defaults to a safe-by-default configuration', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig();

    assert.equal(config.endpointId, AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID);
    assert.equal(config.environment, 'demo');
    assert.equal(config.path, AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH);
    assert.equal(config.authMode, 'none_demo');
    assert.equal(config.sharedSecretHeaderName, 'x-aoc-governance-secret');
    assert.equal(config.sharedSecretValue, undefined);
    assert.equal(config.maxPayloadSizeKb, 256);
    assert.deepEqual(config.allowedMethods, ['POST']);
    assert.deepEqual(config.allowedContentTypes, ['application/json']);
    assert.equal(config.allowPMFreakMutations, false);
    assert.equal(config.allowActionExecution, false);
    assert.equal(config.allowDecisionWriteback, false);
    assert.equal(config.allowInvoiceCreation, false);
    assert.equal(config.allowCommunications, false);
    assert.equal(config.redactionMode, 'safe_demo');
    assert.deepEqual(config.notes, []);
    assert.deepEqual(config.warnings, []);
  });

  it('lets safe fields be overridden', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ environment: 'staging', authMode: 'shared_secret_header', sharedSecretValue: 'demo-secret', maxPayloadSizeKb: 64 });

    assert.equal(config.environment, 'staging');
    assert.equal(config.authMode, 'shared_secret_header');
    assert.equal(config.sharedSecretValue, 'demo-secret');
    assert.equal(config.maxPayloadSizeKb, 64);
  });
});

describe('Soberanía PMFreak Remote Governance Endpoint -- config cannot enable mutation/execution/writeback/invoicing/communications', () => {
  it('forces allowPMFreakMutations to false and warns when a caller requests true', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ allowPMFreakMutations: true });
    assert.equal(config.allowPMFreakMutations, false);
    assert.ok(config.warnings.some((warning) => warning.includes('allowPMFreakMutations')));
  });

  it('forces allowActionExecution to false and warns when a caller requests true', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ allowActionExecution: true });
    assert.equal(config.allowActionExecution, false);
    assert.ok(config.warnings.some((warning) => warning.includes('allowActionExecution')));
  });

  it('forces allowDecisionWriteback to false and warns when a caller requests true', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ allowDecisionWriteback: true });
    assert.equal(config.allowDecisionWriteback, false);
    assert.ok(config.warnings.some((warning) => warning.includes('allowDecisionWriteback')));
  });

  it('forces allowInvoiceCreation to false and warns when a caller requests true', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ allowInvoiceCreation: true });
    assert.equal(config.allowInvoiceCreation, false);
    assert.ok(config.warnings.some((warning) => warning.includes('allowInvoiceCreation')));
  });

  it('forces allowCommunications to false and warns when a caller requests true', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ allowCommunications: true });
    assert.equal(config.allowCommunications, false);
    assert.ok(config.warnings.some((warning) => warning.includes('allowCommunications')));
  });

  it('forces all five flags to false simultaneously', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({
      allowPMFreakMutations: true,
      allowActionExecution: true,
      allowDecisionWriteback: true,
      allowInvoiceCreation: true,
      allowCommunications: true,
    });

    assert.equal(config.allowPMFreakMutations, false);
    assert.equal(config.allowActionExecution, false);
    assert.equal(config.allowDecisionWriteback, false);
    assert.equal(config.allowInvoiceCreation, false);
    assert.equal(config.allowCommunications, false);
    assert.equal(config.warnings.length, 5);
  });
});

describe('Soberanía PMFreak Remote Governance Endpoint -- production safety', () => {
  it('warns when environment is production and authMode is none_demo', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ environment: 'production', authMode: 'none_demo' });
    assert.ok(config.warnings.some((warning) => warning.includes('production')));
  });

  it('does not warn about production when authMode is shared_secret_header', () => {
    const config = createAocPMFreakRemoteGovernanceEndpointConfig({ environment: 'production', authMode: 'shared_secret_header', sharedSecretValue: 'demo-secret' });
    assert.ok(!config.warnings.some((warning) => warning.includes('production')));
  });
});
