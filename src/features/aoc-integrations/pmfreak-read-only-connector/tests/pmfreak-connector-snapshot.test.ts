import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakConnectorSnapshot } from '../pmfreak-connector-snapshot.js';
import { createAocPMFreakReadOnlyConnectorConfig } from '../pmfreak-read-only-connector-config.js';
import { createInMemoryAocPMFreakReadOnlySource } from '../pmfreak-in-memory-source.js';

async function readAll(config = createAocPMFreakReadOnlyConnectorConfig()) {
  const source = createInMemoryAocPMFreakReadOnlySource();
  const [projects, agents, milestones, tasks, risks, evidenceReferences, approvalReferences, actionProposals] = await Promise.all([
    source.listProjects(config),
    source.listAgents(config),
    source.listMilestones(config),
    source.listTasks(config),
    source.listRisks(config),
    source.listEvidenceReferences(config),
    source.listApprovalReferences(config),
    source.listActionProposals(config),
  ]);
  return { config, projects, agents, milestones, tasks, risks, evidenceReferences, approvalReferences, actionProposals };
}

describe('AOC PMFreak connector snapshot', () => {
  it('builds a snapshot with correct counts and safe labels', async () => {
    const data = await readAll();
    const snapshot = createAocPMFreakConnectorSnapshot(data);

    assert.equal(snapshot.readOnly, true);
    assert.equal(snapshot.allowMutations, false);
    assert.equal(snapshot.counts.projects, data.projects.length);
    assert.equal(snapshot.counts.agents, data.agents.length);
    assert.equal(snapshot.counts.milestones, data.milestones.length);
    assert.equal(snapshot.counts.tasks, data.tasks.length);
    assert.equal(snapshot.counts.risks, data.risks.length);
    assert.equal(snapshot.counts.evidenceReferences, data.evidenceReferences.length);
    assert.equal(snapshot.counts.approvalReferences, data.approvalReferences.length);
    assert.equal(snapshot.counts.actionProposals, data.actionProposals.length);
    assert.ok(snapshot.safeLabels.length > 0);
  });

  it('is deterministic -- same source/config produce the same snapshot', async () => {
    const dataA = await readAll();
    const dataB = await readAll();

    const snapshotA = createAocPMFreakConnectorSnapshot(dataA);
    const snapshotB = createAocPMFreakConnectorSnapshot(dataB);

    assert.deepEqual(snapshotA, snapshotB);
  });

  it('copies arrays -- mutating original input arrays after snapshot creation does not mutate the snapshot', async () => {
    const data = await readAll();
    const projectsInput = [...data.projects];
    const snapshot = createAocPMFreakConnectorSnapshot({ ...data, projects: projectsInput });

    projectsInput.push({ ...projectsInput[0]!, projectId: 'project.demo.mutated' });

    assert.equal(snapshot.projects.length, data.projects.length);
    assert.ok(!snapshot.projects.some((project) => project.projectId === 'project.demo.mutated'));
  });
});
