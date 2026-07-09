import {
  buildAocPMFreakInMemoryActionProposalFixtures,
  buildAocPMFreakInMemoryAgentFixtures,
  buildAocPMFreakInMemoryApprovalReferenceFixtures,
  buildAocPMFreakInMemoryEvidenceReferenceFixtures,
  buildAocPMFreakInMemoryMilestoneFixtures,
  buildAocPMFreakInMemoryProjectFixtures,
  buildAocPMFreakInMemoryRiskFixtures,
  buildAocPMFreakInMemoryTaskFixtures,
} from './pmfreak-read-only-connector-fixtures.js';
import type {
  AocPMFreakActionProposalReadModel,
  AocPMFreakAgentReadModel,
  AocPMFreakApprovalReferenceReadModel,
  AocPMFreakEvidenceReferenceReadModel,
  AocPMFreakMilestoneReadModel,
  AocPMFreakProjectReadModel,
  AocPMFreakRiskReadModel,
  AocPMFreakTaskReadModel,
} from './pmfreak-read-models.js';
import type { AocPMFreakReadOnlySource } from './pmfreak-read-only-source.js';

export interface AocPMFreakInMemorySourceFixtures {
  readonly projects: readonly AocPMFreakProjectReadModel[];
  readonly agents: readonly AocPMFreakAgentReadModel[];
  readonly milestones: readonly AocPMFreakMilestoneReadModel[];
  readonly tasks: readonly AocPMFreakTaskReadModel[];
  readonly risks: readonly AocPMFreakRiskReadModel[];
  readonly evidenceReferences: readonly AocPMFreakEvidenceReferenceReadModel[];
  readonly approvalReferences: readonly AocPMFreakApprovalReferenceReadModel[];
  readonly actionProposals: readonly AocPMFreakActionProposalReadModel[];
}

/**
 * Deep-clones every read model (all fields are plain JSON-safe data --
 * strings, numbers, booleans, string arrays, and a metadata record) so a
 * caller mutating a returned array or a nested field can never affect this
 * source's internal fixtures or any other caller's earlier/later reads.
 * Uses a JSON round-trip rather than `structuredClone` -- this repo's
 * TypeScript project has no DOM/Node global lib types available, and every
 * field on these read models is plain JSON-safe data, so the round-trip is
 * both sufficient and type-safe.
 */
function cloneReadModels<T>(readModels: readonly T[]): T[] {
  return JSON.parse(JSON.stringify(readModels)) as T[];
}

/**
 * Builds a deterministic, in-memory `AocPMFreakReadOnlySource`, used for
 * tests and demo/dev mode. Defaults to a fixed, opaque demo fixture graph
 * (see `pmfreak-read-only-connector-fixtures.ts`) -- pass `fixtures` to
 * override any part of it. Every `list*` call returns a fresh, independent
 * copy of the underlying read models, so neither repeated calls nor callers
 * mutating a returned array can affect this source or any other caller.
 */
export function createInMemoryAocPMFreakReadOnlySource(fixtures?: Partial<AocPMFreakInMemorySourceFixtures>): AocPMFreakReadOnlySource {
  const projects = fixtures?.projects ? [...fixtures.projects] : buildAocPMFreakInMemoryProjectFixtures();
  const agents = fixtures?.agents ? [...fixtures.agents] : buildAocPMFreakInMemoryAgentFixtures();
  const milestones = fixtures?.milestones ? [...fixtures.milestones] : buildAocPMFreakInMemoryMilestoneFixtures();
  const tasks = fixtures?.tasks ? [...fixtures.tasks] : buildAocPMFreakInMemoryTaskFixtures();
  const risks = fixtures?.risks ? [...fixtures.risks] : buildAocPMFreakInMemoryRiskFixtures();
  const evidenceReferences = fixtures?.evidenceReferences ? [...fixtures.evidenceReferences] : buildAocPMFreakInMemoryEvidenceReferenceFixtures();
  const approvalReferences = fixtures?.approvalReferences ? [...fixtures.approvalReferences] : buildAocPMFreakInMemoryApprovalReferenceFixtures();
  const actionProposals = fixtures?.actionProposals ? [...fixtures.actionProposals] : buildAocPMFreakInMemoryActionProposalFixtures();

  return {
    sourceKind: 'in_memory',

    async listProjects() {
      return cloneReadModels(projects);
    },
    async listAgents() {
      return cloneReadModels(agents);
    },
    async listMilestones() {
      return cloneReadModels(milestones);
    },
    async listTasks() {
      return cloneReadModels(tasks);
    },
    async listRisks() {
      return cloneReadModels(risks);
    },
    async listEvidenceReferences() {
      return cloneReadModels(evidenceReferences);
    },
    async listApprovalReferences() {
      return cloneReadModels(approvalReferences);
    },
    async listActionProposals() {
      return cloneReadModels(actionProposals);
    },
  };
}
