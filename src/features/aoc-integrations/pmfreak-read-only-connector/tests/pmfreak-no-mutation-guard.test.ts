import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertAocPMFreakReadOnlyOperation, isAocPMFreakForbiddenConnectorOperation } from '../pmfreak-no-mutation-guard.js';

describe('AOC PMFreak no-mutation guard', () => {
  it('blocks forbidden operations', () => {
    for (const operation of ['update_project', 'create_invoice', 'send_email', 'writeback_decision', 'execute_action']) {
      assert.equal(isAocPMFreakForbiddenConnectorOperation(operation), true);
      assert.throws(() => assertAocPMFreakReadOnlyOperation(operation));
    }
  });

  it('throws a mutation_not_allowed connector error for a forbidden operation', () => {
    try {
      assertAocPMFreakReadOnlyOperation('update_project');
      assert.ok(false, 'expected assertAocPMFreakReadOnlyOperation to throw');
    } catch (error) {
      assert.equal((error as { code?: string }).code, 'mutation_not_allowed');
      assert.equal((error as { safe?: boolean }).safe, true);
    }
  });

  it('allows read operations', () => {
    for (const operation of ['read_projects', 'read_agents', 'read_milestones', 'read_action_proposals']) {
      assert.equal(isAocPMFreakForbiddenConnectorOperation(operation), false);
      assertAocPMFreakReadOnlyOperation(operation);
    }
  });
});
