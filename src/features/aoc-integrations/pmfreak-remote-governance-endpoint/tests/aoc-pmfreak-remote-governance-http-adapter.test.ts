import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakRemoteGovernanceHttpAdapterPlaceholder } from '../aoc-pmfreak-remote-governance-http-adapter.js';
import { AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH } from '../aoc-pmfreak-remote-governance-endpoint-constants.js';

describe('Soberanía PMFreak Remote Governance Endpoint -- HTTP adapter placeholder', () => {
  it('declares itself unimplemented, with a recommended path and delegate', () => {
    const placeholder = createAocPMFreakRemoteGovernanceHttpAdapterPlaceholder();
    assert.equal(placeholder.implemented, false);
    assert.equal(placeholder.recommendedPath, AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH);
    assert.equal(placeholder.recommendedDelegate, 'handleAocPMFreakRemoteGovernanceRequest');
    assert.ok(placeholder.reason.length > 0);
    assert.ok(placeholder.notes.length > 0);
  });

  it('is deterministic across repeated calls', () => {
    assert.deepEqual(createAocPMFreakRemoteGovernanceHttpAdapterPlaceholder(), createAocPMFreakRemoteGovernanceHttpAdapterPlaceholder());
  });
});
