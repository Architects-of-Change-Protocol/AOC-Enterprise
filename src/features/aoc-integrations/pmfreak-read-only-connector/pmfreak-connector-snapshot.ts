import { AOC_PMFREAK_READ_ONLY_CONNECTOR_ID, AOC_PMFREAK_READ_ONLY_CONNECTOR_NAME, AOC_PMFREAK_READ_ONLY_CONNECTOR_SAFE_LABELS } from './pmfreak-read-only-connector-constants.js';
import type { AocPMFreakReadOnlyConnectorConfig } from './pmfreak-read-only-connector-config.js';
import type { AocPMFreakReadOnlyConnectorEnvironment, AocPMFreakReadOnlyConnectorSourceKind } from './pmfreak-read-only-connector-types.js';
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

export interface AocPMFreakConnectorSnapshotCounts {
  readonly projects: number;
  readonly agents: number;
  readonly milestones: number;
  readonly tasks: number;
  readonly risks: number;
  readonly evidenceReferences: number;
  readonly approvalReferences: number;
  readonly actionProposals: number;
}

/**
 * A single, immutable read of PMFreak data, normalized into AOC-safe
 * connector read models. This is a connector snapshot, not a Control Plane
 * view model and not a governance decision -- it carries no allow/deny/
 * require_evidence/require_approval verdict of any kind.
 */
export interface AocPMFreakConnectorSnapshot {
  readonly connectorId: string;
  readonly connectorName: string;
  readonly sourceKind: AocPMFreakReadOnlyConnectorSourceKind;
  readonly environment: AocPMFreakReadOnlyConnectorEnvironment;

  readonly readOnly: true;
  readonly allowMutations: false;

  readonly projects: readonly AocPMFreakProjectReadModel[];
  readonly agents: readonly AocPMFreakAgentReadModel[];
  readonly milestones: readonly AocPMFreakMilestoneReadModel[];
  readonly tasks: readonly AocPMFreakTaskReadModel[];
  readonly risks: readonly AocPMFreakRiskReadModel[];
  readonly evidenceReferences: readonly AocPMFreakEvidenceReferenceReadModel[];
  readonly approvalReferences: readonly AocPMFreakApprovalReferenceReadModel[];
  readonly actionProposals: readonly AocPMFreakActionProposalReadModel[];

  readonly counts: AocPMFreakConnectorSnapshotCounts;

  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly safeLabels: readonly string[];
}

export interface CreateAocPMFreakConnectorSnapshotInput {
  readonly config: AocPMFreakReadOnlyConnectorConfig;
  readonly projects: readonly AocPMFreakProjectReadModel[];
  readonly agents: readonly AocPMFreakAgentReadModel[];
  readonly milestones: readonly AocPMFreakMilestoneReadModel[];
  readonly tasks: readonly AocPMFreakTaskReadModel[];
  readonly risks: readonly AocPMFreakRiskReadModel[];
  readonly evidenceReferences: readonly AocPMFreakEvidenceReferenceReadModel[];
  readonly approvalReferences: readonly AocPMFreakApprovalReferenceReadModel[];
  readonly actionProposals: readonly AocPMFreakActionProposalReadModel[];
  readonly warnings?: readonly string[];
  readonly errors?: readonly string[];
}

/**
 * Builds a connector snapshot from already-read PMFreak read models. Every
 * array is copied so neither the caller's original arrays nor the
 * snapshot's arrays can be mutated into each other. Counts are derived
 * directly from the copied arrays, so they are always internally
 * consistent. This function never reads a clock, generates a random id, or
 * makes a governance decision -- given the same input, it always produces
 * the same output.
 */
export function createAocPMFreakConnectorSnapshot(input: CreateAocPMFreakConnectorSnapshotInput): AocPMFreakConnectorSnapshot {
  const projects = [...input.projects];
  const agents = [...input.agents];
  const milestones = [...input.milestones];
  const tasks = [...input.tasks];
  const risks = [...input.risks];
  const evidenceReferences = [...input.evidenceReferences];
  const approvalReferences = [...input.approvalReferences];
  const actionProposals = [...input.actionProposals];

  return {
    connectorId: AOC_PMFREAK_READ_ONLY_CONNECTOR_ID,
    connectorName: AOC_PMFREAK_READ_ONLY_CONNECTOR_NAME,
    sourceKind: input.config.sourceKind,
    environment: input.config.environment,

    readOnly: true,
    allowMutations: false,

    projects,
    agents,
    milestones,
    tasks,
    risks,
    evidenceReferences,
    approvalReferences,
    actionProposals,

    counts: {
      projects: projects.length,
      agents: agents.length,
      milestones: milestones.length,
      tasks: tasks.length,
      risks: risks.length,
      evidenceReferences: evidenceReferences.length,
      approvalReferences: approvalReferences.length,
      actionProposals: actionProposals.length,
    },

    warnings: [...(input.warnings ?? [])],
    errors: [...(input.errors ?? [])],
    safeLabels: [...AOC_PMFREAK_READ_ONLY_CONNECTOR_SAFE_LABELS],
  };
}
