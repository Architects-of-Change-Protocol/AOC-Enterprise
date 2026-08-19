import type {
  AutonomyLevel,
  RiskTier,
  HumanOversightRequirement,
} from '@aoc-enterprise/agent-governance';

/**
 * PMFreak's six conversational-brain agent roles. This foundation package
 * issues one real Soberanía `AgentPassport` per enrolled instance of one of these
 * roles -- see `services/pmfreak-agent-enrollment-builder.ts`.
 */
export type PMFreakAgentRole =
  | 'planning'
  | 'risk'
  | 'evidence'
  | 'client_communication'
  | 'billing_readiness'
  | 'change_control';

/**
 * Per-role governance metadata used to derive a real Soberanía `AgentEnrollmentInput`
 * (see `packages/agent-governance/src/enrollment/enrollment-contracts.ts`) for
 * a PMFreak agent of this role. `riskTier`, `autonomyLevel`, and
 * `humanOversightRequirement` reuse `@aoc-enterprise/agent-governance`'s real,
 * publicly exported enrollment types directly -- that dependency is real and
 * legitimate. `allowedActions`/`prohibitedActions`/`dataAccessScope`/
 * `toolAccessScope`/`humanApprovalRequiredFor` are PMFreak-domain string
 * identifiers this package defines fresh (see `fixtures/pmfreak-agent-role-fixtures.ts`);
 * they are not sourced from `src/features/aoc-enterprise-demo/pmfreak-agent-passport`.
 */
export interface PMFreakAgentRoleProfile {
  readonly role: PMFreakAgentRole;
  readonly displayName: string;
  readonly description: string;
  readonly riskTier: RiskTier;
  readonly autonomyLevel: AutonomyLevel;
  readonly humanOversightRequirement: HumanOversightRequirement;
  readonly allowedActions: readonly string[];
  readonly prohibitedActions: readonly string[];
  readonly humanApprovalRequiredFor: readonly string[];
  readonly dataAccessScope: readonly string[];
  readonly toolAccessScope: readonly string[];
}

export const PMFREAK_AGENT_ROLES: readonly PMFreakAgentRole[] = [
  'planning',
  'risk',
  'evidence',
  'client_communication',
  'billing_readiness',
  'change_control',
];
