import type { AocPMFreakReadOnlyConnectorConfig } from './pmfreak-read-only-connector-config.js';
import type { AocPMFreakReadOnlyConnectorSourceKind } from './pmfreak-read-only-connector-types.js';
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

/**
 * Read-only PMFreak data source contract. Every method is a pure read: it
 * must not mutate PMFreak source data, must not call the PMFreak Agent
 * Passport resolver, must not call the PMFreak Project Governance Scenario
 * runner, and must not write back to PMFreak. Implementations include the
 * deterministic in-memory source (`createInMemoryAocPMFreakReadOnlySource`)
 * used for tests and demo/dev mode, and the unsupported real-source
 * placeholder (`createUnsupportedAocPMFreakRealReadOnlySource`) used when no
 * real PMFreak source contract is available.
 */
export interface AocPMFreakReadOnlySource {
  readonly sourceKind: AocPMFreakReadOnlyConnectorSourceKind;

  listProjects(config: AocPMFreakReadOnlyConnectorConfig): Promise<AocPMFreakProjectReadModel[]>;

  listAgents(config: AocPMFreakReadOnlyConnectorConfig): Promise<AocPMFreakAgentReadModel[]>;

  listMilestones(config: AocPMFreakReadOnlyConnectorConfig): Promise<AocPMFreakMilestoneReadModel[]>;

  listTasks(config: AocPMFreakReadOnlyConnectorConfig): Promise<AocPMFreakTaskReadModel[]>;

  listRisks(config: AocPMFreakReadOnlyConnectorConfig): Promise<AocPMFreakRiskReadModel[]>;

  listEvidenceReferences(config: AocPMFreakReadOnlyConnectorConfig): Promise<AocPMFreakEvidenceReferenceReadModel[]>;

  listApprovalReferences(config: AocPMFreakReadOnlyConnectorConfig): Promise<AocPMFreakApprovalReferenceReadModel[]>;

  listActionProposals(config: AocPMFreakReadOnlyConnectorConfig): Promise<AocPMFreakActionProposalReadModel[]>;
}
