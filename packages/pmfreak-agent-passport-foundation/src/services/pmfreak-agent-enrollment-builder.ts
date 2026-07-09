import type { AgentEnrollmentInput, EscalationRule } from '@aoc-enterprise/agent-governance';
import type { PMFreakAgentRole, PMFreakAgentRoleProfile } from '../domain/pmfreak-agent-role.js';
import { findPMFreakAgentRoleProfile } from '../fixtures/pmfreak-agent-role-fixtures.js';

export interface BuildPMFreakAgentEnrollmentInputOptions {
  readonly agentName: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly purpose?: string;
  readonly region?: string;
  readonly jurisdiction?: string;
  readonly createdBy: string;
  /** Caller-supplied ISO-8601 timestamp. This module never reads the system clock. */
  readonly issuedAt: string;
  readonly description?: string;
  readonly publicDisplayName?: string;
  readonly externalAgentRef?: string;
  readonly modelProvider?: string;
  readonly runtimeEnvironment?: string;
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly escalationRules?: readonly EscalationRule[];
  /** Override the role profile lookup (e.g. for a test-specific variant). */
  readonly roleProfile?: PMFreakAgentRoleProfile;
}

function buildDefaultEscalationRules(role: PMFreakAgentRole): readonly EscalationRule[] {
  return [
    {
      trigger: `${role}_agent_output_flagged_for_review`,
      action: 'pause_and_notify_project_manager',
      escalateTo: 'project-manager',
    },
  ];
}

/**
 * Builds a real `AgentEnrollmentInput` (the actual, publicly exported
 * `@aoc-enterprise/agent-governance` contract) for a PMFreak agent of the
 * given role, using this package's own role-profile fixtures as defaults.
 */
export function buildPMFreakAgentEnrollmentInput(
  role: PMFreakAgentRole,
  options: BuildPMFreakAgentEnrollmentInputOptions,
): AgentEnrollmentInput {
  const profile = options.roleProfile ?? findPMFreakAgentRoleProfile(role);
  if (!profile) {
    throw new Error(`Unknown PMFreak agent role: ${role}`);
  }

  return {
    agentName: options.agentName,
    ownerId: options.ownerId,
    ownerName: options.ownerName,
    purpose: options.purpose ?? profile.description,
    ...(options.region !== undefined ? { region: options.region } : {}),
    ...(options.jurisdiction !== undefined ? { jurisdiction: options.jurisdiction } : {}),
    autonomyLevel: profile.autonomyLevel,
    riskTier: profile.riskTier,
    dataAccess: profile.dataAccessScope,
    tools: profile.toolAccessScope,
    humanOversight: { requirement: profile.humanOversightRequirement },
    prohibitedActions: profile.prohibitedActions,
    escalationRules: options.escalationRules ?? buildDefaultEscalationRules(role),
    createdBy: options.createdBy,
    issuedAt: options.issuedAt,
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.publicDisplayName !== undefined ? { publicDisplayName: options.publicDisplayName } : {}),
    ...(options.externalAgentRef !== undefined ? { externalAgentRef: options.externalAgentRef } : {}),
    ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
    ...(options.runtimeEnvironment !== undefined ? { runtimeEnvironment: options.runtimeEnvironment } : {}),
    ...(options.tags !== undefined ? { tags: options.tags } : {}),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
  };
}
