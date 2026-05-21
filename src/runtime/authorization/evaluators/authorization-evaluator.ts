import type { AocIdentityClaims, CapabilityToken, ScopedAccessRequest } from '@aoc/protocol';
import type {
  AgentAccessEvaluatorAdapter,
  CapabilityRegistryAdapter,
  DelegationStoreAdapter,
  PolicyDecisionAdapter,
} from '../../../adapters/protocol-adapters';
import type { AuthorizationGrantInput } from '../grants/grant-input';

export interface AuthorizationEvaluationContext {
  actor: AocIdentityClaims;
  request: AuthorizationGrantInput;
}

export interface AuthorizationEvaluationDeps {
  capabilityRegistry: CapabilityRegistryAdapter;
  delegationStore: DelegationStoreAdapter;
  agentAccess: AgentAccessEvaluatorAdapter;
  policyDecision: PolicyDecisionAdapter;
}

export interface AuthorizationEvaluationResult {
  allowed: boolean;
  reasonCodes: string[];
}

async function evaluateCapability(
  actor: AocIdentityClaims,
  capability: CapabilityToken,
  orgId: string,
  capabilityRegistry: CapabilityRegistryAdapter
): Promise<boolean> {
  return capabilityRegistry.hasCapability(actor, capability, orgId);
}

async function evaluateDelegation(
  actor: AocIdentityClaims,
  capability: CapabilityToken,
  orgId: string,
  delegationStore: DelegationStoreAdapter
): Promise<boolean> {
  return delegationStore.validateDelegation(actor, capability, orgId);
}

async function evaluateAgentScope(
  actor: AocIdentityClaims,
  access: ScopedAccessRequest,
  orgId: string,
  agentAccess: AgentAccessEvaluatorAdapter
): Promise<boolean> {
  return agentAccess.evaluateAgentAccess(actor, access, orgId);
}

export async function evaluateAuthorization(
  ctx: AuthorizationEvaluationContext,
  deps: AuthorizationEvaluationDeps
): Promise<AuthorizationEvaluationResult> {
  const { actor, request } = ctx;
  const capabilityAllowed = await evaluateCapability(actor, request.capability, request.orgId, deps.capabilityRegistry);
  const delegationValid = await evaluateDelegation(actor, request.capability, request.orgId, deps.delegationStore);
  const agentAllowed = await evaluateAgentScope(actor, request.access, request.orgId, deps.agentAccess);
  const policy = await deps.policyDecision.evaluatePolicy({ ...request, actor });

  const allowed = capabilityAllowed && delegationValid && agentAllowed && policy.allowed;
  const reasonCodes = [
    ...policy.reasonCodes,
    ...(capabilityAllowed ? [] : ['capability_denied']),
    ...(delegationValid ? [] : ['delegation_invalid']),
    ...(agentAllowed ? [] : ['agent_scope_denied']),
  ];

  return { allowed, reasonCodes };
}
