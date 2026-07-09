import { createAocPMFreakReadOnlyConnectorConfig } from './pmfreak-read-only-connector-config.js';
import type { AocPMFreakReadOnlyConnectorConfig, AocPMFreakReadOnlyConnectorConfigInput } from './pmfreak-read-only-connector-config.js';
import { createAocPMFreakReadOnlyConnectorDescriptor } from './pmfreak-read-only-connector-descriptor.js';
import type { AocPMFreakReadOnlyConnectorDescriptor } from './pmfreak-read-only-connector-descriptor.js';
import { createAocPMFreakConnectorSnapshot } from './pmfreak-connector-snapshot.js';
import type { AocPMFreakConnectorSnapshot } from './pmfreak-connector-snapshot.js';
import { createAocPMFreakConnectorHealth } from './pmfreak-connector-health.js';
import type { AocPMFreakConnectorHealth } from './pmfreak-connector-health.js';
import { createAocPMFreakConnectorError } from './pmfreak-connector-errors.js';
import { redactAocPMFreakConnectorSnapshot } from './pmfreak-redaction.js';
import type { AocPMFreakReadOnlySource } from './pmfreak-read-only-source.js';

export interface AocPMFreakReadOnlyConnectorClient {
  readonly descriptor: AocPMFreakReadOnlyConnectorDescriptor;
  readonly config: AocPMFreakReadOnlyConnectorConfig;

  getHealth(): Promise<AocPMFreakConnectorHealth>;

  readSnapshot(): Promise<AocPMFreakConnectorSnapshot>;
}

export interface CreateAocPMFreakReadOnlyConnectorClientInput {
  readonly config?: AocPMFreakReadOnlyConnectorConfigInput;
  readonly source: AocPMFreakReadOnlySource;
}

/**
 * Builds a read-only PMFreak connector client bound to `source`. The
 * client's `readSnapshot()` calls every read-only source method, applies
 * redaction per `config.redactionMode`, and returns a connector snapshot.
 * It never mutates source data, never calls the PMFreak Agent Passport
 * resolver or Project Governance Scenario runner, never creates a Control
 * Plane view model or Narrative Export, and never writes back to PMFreak.
 *
 * `readSnapshot()` fails closed: if any source read fails, it rejects with
 * a deterministic, safe `AocPMFreakConnectorError` (`read_failed`) rather
 * than returning a partial snapshot.
 */
export function createAocPMFreakReadOnlyConnectorClient(input: CreateAocPMFreakReadOnlyConnectorClientInput): AocPMFreakReadOnlyConnectorClient {
  const descriptor = createAocPMFreakReadOnlyConnectorDescriptor();
  const config = createAocPMFreakReadOnlyConnectorConfig(input.config);
  const source = input.source;

  async function getHealth(): Promise<AocPMFreakConnectorHealth> {
    return createAocPMFreakConnectorHealth({ config, checkedCapabilities: descriptor.capabilities });
  }

  async function readSnapshot(): Promise<AocPMFreakConnectorSnapshot> {
    let projects, agents, milestones, tasks, risks, evidenceReferences, approvalReferences, actionProposals;

    try {
      [projects, agents, milestones, tasks, risks, evidenceReferences, approvalReferences, actionProposals] = await Promise.all([
        source.listProjects(config),
        source.listAgents(config),
        source.listMilestones(config),
        source.listTasks(config),
        source.listRisks(config),
        source.listEvidenceReferences(config),
        source.listApprovalReferences(config),
        source.listActionProposals(config),
      ]);
    } catch (error) {
      if (error instanceof Error && 'code' in error && 'safe' in error) throw error;
      throw createAocPMFreakConnectorError('read_failed', 'Failed to read PMFreak data from the configured source.', {
        sourceKind: config.sourceKind,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }

    const snapshot = createAocPMFreakConnectorSnapshot({
      config,
      projects,
      agents,
      milestones,
      tasks,
      risks,
      evidenceReferences,
      approvalReferences,
      actionProposals,
      warnings: config.warnings,
    });

    return redactAocPMFreakConnectorSnapshot(snapshot, config.redactionMode);
  }

  return { descriptor, config, getHealth, readSnapshot };
}
