import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryAocPMFreakReadOnlySource } from '../pmfreak-in-memory-source.js';
import { createAocPMFreakReadOnlyConnectorConfig } from '../pmfreak-read-only-connector-config.js';
import {
  AOC_PMFREAK_DEMO_AGENT_BILLING_READINESS_ID,
  AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID,
  AOC_PMFREAK_DEMO_PROJECT_ID,
  AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID,
} from '../pmfreak-read-only-connector-fixtures.js';

describe('AOC PMFreak read models accept deterministic demo data', () => {
  const source = createInMemoryAocPMFreakReadOnlySource();
  const config = createAocPMFreakReadOnlyConnectorConfig();

  it('project read model includes the demo network-refresh project', async () => {
    const projects = await source.listProjects(config);
    assert.ok(projects.some((project) => project.projectId === AOC_PMFREAK_DEMO_PROJECT_ID));
  });

  it('agent read model includes the demo billing readiness agent', async () => {
    const agents = await source.listAgents(config);
    assert.ok(agents.some((agent) => agent.agentId === AOC_PMFREAK_DEMO_AGENT_BILLING_READINESS_ID));
  });

  it('milestone read model includes the demo phase-1-delivery milestone', async () => {
    const milestones = await source.listMilestones(config);
    assert.ok(milestones.some((milestone) => milestone.milestoneId === AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID));
  });

  it('action proposal read model includes the demo billing-readiness mark-ready proposal', async () => {
    const actionProposals = await source.listActionProposals(config);
    assert.ok(actionProposals.some((proposal) => proposal.actionProposalId === AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID));
  });
});
