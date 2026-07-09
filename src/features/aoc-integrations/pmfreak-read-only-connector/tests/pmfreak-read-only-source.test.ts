import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryAocPMFreakReadOnlySource } from '../pmfreak-in-memory-source.js';
import { createUnsupportedAocPMFreakRealReadOnlySource } from '../pmfreak-real-source-adapter.js';

const REQUIRED_METHODS = ['listProjects', 'listAgents', 'listMilestones', 'listTasks', 'listRisks', 'listEvidenceReferences', 'listApprovalReferences', 'listActionProposals'] as const;

describe('AocPMFreakReadOnlySource contract', () => {
  it('every implementation exposes sourceKind and every required read-only list method', () => {
    const sources = [createInMemoryAocPMFreakReadOnlySource(), createUnsupportedAocPMFreakRealReadOnlySource('api')];

    for (const source of sources) {
      assert.equal(typeof source.sourceKind, 'string');
      for (const method of REQUIRED_METHODS) {
        assert.equal(typeof source[method], 'function');
      }
    }
  });

  it('the in-memory source reports sourceKind "in_memory"', () => {
    assert.equal(createInMemoryAocPMFreakReadOnlySource().sourceKind, 'in_memory');
  });
});
