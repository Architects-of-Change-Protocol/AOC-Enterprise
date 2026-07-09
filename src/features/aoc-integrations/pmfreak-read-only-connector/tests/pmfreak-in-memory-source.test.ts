import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryAocPMFreakReadOnlySource } from '../pmfreak-in-memory-source.js';
import { createAocPMFreakReadOnlyConnectorConfig } from '../pmfreak-read-only-connector-config.js';
import {
  AOC_PMFREAK_DEMO_APPROVAL_BILLING_REVIEW_MISSING_ID,
  AOC_PMFREAK_DEMO_EVIDENCE_CUSTOMER_ACCEPTANCE_MISSING_ID,
  AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID,
  AOC_PMFREAK_DEMO_PROJECT_ID,
  AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID,
  AOC_PMFREAK_DEMO_RISK_UNCONFIRMED_ACCEPTANCE_ID,
  AOC_PMFREAK_DEMO_TASK_COLLECT_ACCEPTANCE_ID,
} from '../pmfreak-read-only-connector-fixtures.js';

const config = createAocPMFreakReadOnlyConnectorConfig();

describe('in-memory PMFreak read-only source', () => {
  it('has sourceKind = in_memory', () => {
    const source = createInMemoryAocPMFreakReadOnlySource();
    assert.equal(source.sourceKind, 'in_memory');
  });

  it('listProjects returns deterministic projects; repeated calls return equal data', async () => {
    const source = createInMemoryAocPMFreakReadOnlySource();
    const first = await source.listProjects(config);
    const second = await source.listProjects(config);

    assert.deepEqual(first, second);
    assert.ok(first.some((project) => project.projectId === AOC_PMFREAK_DEMO_PROJECT_ID));
  });

  it('listAgents returns deterministic agents; repeated calls return equal data', async () => {
    const source = createInMemoryAocPMFreakReadOnlySource();
    const first = await source.listAgents(config);
    const second = await source.listAgents(config);

    assert.deepEqual(first, second);
    assert.ok(first.length > 0);
  });

  it('listMilestones/listTasks/listRisks return deterministic data whose ids match the fixture graph', async () => {
    const source = createInMemoryAocPMFreakReadOnlySource();

    const milestones = await source.listMilestones(config);
    const tasks = await source.listTasks(config);
    const risks = await source.listRisks(config);

    assert.ok(milestones.some((milestone) => milestone.milestoneId === AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID));
    assert.ok(tasks.some((task) => task.taskId === AOC_PMFREAK_DEMO_TASK_COLLECT_ACCEPTANCE_ID && task.milestoneId === AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID));
    assert.ok(risks.some((risk) => risk.riskId === AOC_PMFREAK_DEMO_RISK_UNCONFIRMED_ACCEPTANCE_ID && risk.projectId === AOC_PMFREAK_DEMO_PROJECT_ID));
  });

  it('listEvidenceReferences/listApprovalReferences include a customer acceptance evidence kind and a billing review approval kind, preserving present flags', async () => {
    const source = createInMemoryAocPMFreakReadOnlySource();

    const evidenceReferences = await source.listEvidenceReferences(config);
    const approvalReferences = await source.listApprovalReferences(config);

    const customerAcceptance = evidenceReferences.find((evidenceReference) => evidenceReference.evidenceReferenceId === AOC_PMFREAK_DEMO_EVIDENCE_CUSTOMER_ACCEPTANCE_MISSING_ID);
    assert.ok(customerAcceptance);
    assert.equal(customerAcceptance?.evidenceKind, 'customer_acceptance_record');
    assert.equal(customerAcceptance?.present, false);

    const billingReview = approvalReferences.find((approvalReference) => approvalReference.approvalReferenceId === AOC_PMFREAK_DEMO_APPROVAL_BILLING_REVIEW_MISSING_ID);
    assert.ok(billingReview);
    assert.equal(billingReview?.approvalKind, 'billing_review');
    assert.equal(billingReview?.present, false);
  });

  it('listActionProposals includes the billing mark-ready proposal, category billing, with billing_sensitive/project_closure_sensitive context flags', async () => {
    const source = createInMemoryAocPMFreakReadOnlySource();
    const actionProposals = await source.listActionProposals(config);

    const markReady = actionProposals.find((proposal) => proposal.actionProposalId === AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID);
    assert.ok(markReady);
    assert.equal(markReady?.category, 'billing');
    assert.ok(markReady?.contextFlags.includes('billing_sensitive'));
    assert.ok(markReady?.contextFlags.includes('project_closure_sensitive'));
  });

  it('returns copies -- mutating a returned array/object never mutates a later read', async () => {
    const source = createInMemoryAocPMFreakReadOnlySource();

    const first = await source.listProjects(config);
    first.push({ ...first[0]!, projectId: 'project.demo.mutated' });
    (first[0]!.milestoneIds as string[]).push('milestone.demo.mutated');

    const second = await source.listProjects(config);
    assert.equal(second.length, 1);
    assert.ok(!second.some((project) => project.projectId === 'project.demo.mutated'));
    assert.ok(!second[0]!.milestoneIds.includes('milestone.demo.mutated'));
  });

  it('accepts partial fixture overrides while leaving the rest of the default graph intact', async () => {
    const source = createInMemoryAocPMFreakReadOnlySource({
      projects: [
        {
          projectId: 'project.demo.override',
          workspaceId: 'workspace.demo.pmfreak',
          milestoneIds: [],
          taskIds: [],
          riskIds: [],
          evidenceReferenceIds: [],
          approvalReferenceIds: [],
          actionProposalIds: [],
          metadata: {},
        },
      ],
    });

    const projects = await source.listProjects(config);
    const agents = await source.listAgents(config);

    assert.deepEqual(
      projects.map((project) => project.projectId),
      ['project.demo.override'],
    );
    assert.ok(agents.length > 0);
  });
});
