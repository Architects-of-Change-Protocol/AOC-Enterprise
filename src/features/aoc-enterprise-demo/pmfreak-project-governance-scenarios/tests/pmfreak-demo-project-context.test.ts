import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDemoPMFreakProjectContext, demoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { demoPMFreakChangeRequests, demoPMFreakMilestones, demoPMFreakRisks } from '../pmfreak-demo-project-fixtures.js';

describe('PMFreak demo project context', () => {
  it('5. carries the documented deterministic demo workspace/project/customer/jurisdiction ids', () => {
    assert.equal(demoPMFreakProjectContext.workspaceId, 'workspace.demo.pmfreak');
    assert.equal(demoPMFreakProjectContext.projectId, 'project.demo.network-refresh');
    assert.equal(demoPMFreakProjectContext.customerId, 'customer.demo.acme');
    assert.equal(demoPMFreakProjectContext.jurisdictionCountryCode, 'CR');
    assert.ok(demoPMFreakProjectContext.jurisdictionPackIds.includes('aoc.jurisdiction.costa_rica.base.v1'));
  });

  it('carries no real Datasys/customer identifiers -- only opaque demo.* ids', () => {
    for (const id of [demoPMFreakProjectContext.workspaceId, demoPMFreakProjectContext.projectId, demoPMFreakProjectContext.customerId]) {
      assert.ok(/^(workspace|project|customer)\.demo\./.test(id));
    }
  });

  it('buildDemoPMFreakProjectContext overrides fields without mutating the base fixture', () => {
    const billingPhase = buildDemoPMFreakProjectContext({ phase: 'billing' });
    assert.equal(billingPhase.phase, 'billing');
    assert.equal(demoPMFreakProjectContext.phase, 'execution');
  });

  it('demo milestone/risk/change-request fixtures exist and reference the demo project only', () => {
    assert.equal(demoPMFreakMilestones.length, 1);
    assert.equal(demoPMFreakMilestones[0]?.milestoneId, 'milestone.demo.network-refresh.phase-1-delivery');
    assert.equal(demoPMFreakMilestones[0]?.projectId, demoPMFreakProjectContext.projectId);

    assert.equal(demoPMFreakRisks.length, 1);
    assert.equal(demoPMFreakRisks[0]?.riskId, 'risk.demo.unconfirmed-customer-acceptance');

    assert.equal(demoPMFreakChangeRequests.length, 1);
    assert.equal(demoPMFreakChangeRequests[0]?.changeRequestId, 'change.demo.scope-adjustment-request');
  });
});
