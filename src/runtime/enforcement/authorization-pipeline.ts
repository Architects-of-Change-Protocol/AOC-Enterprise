import type {
  AuditEventEnvelope,
  CapabilityToken,
  ConsentGrant,
  ScopedAccessRequest,
} from '@aoc/protocol/contracts';

import type {
  AgentAccessEvaluatorAdapter,
  CapabilityRegistryAdapter,
  DelegationStoreAdapter,
  IdentityResolverAdapter,
  PolicyDecisionAdapter,
} from '../../adapters/protocol-adapters';
import type { AuditSinkAdapter } from '../../adapters/protocol-adapters';

export interface EnforcementEvaluationInput {
  requestId: string;
  actorId: string;
  capability: CapabilityToken;
  consentGrants: ConsentGrant[];
  access: ScopedAccessRequest;
  tenantId: string;
  orgId: string;
}

export interface EnforcementEvaluationResult {
  allowed: boolean;
  reasonCodes: string[];
  audit: AuditEventEnvelope;
}

export interface EnforcementRuntimeDeps {
  identity: IdentityResolverAdapter;
  capabilityRegistry: CapabilityRegistryAdapter;
  delegationStore: DelegationStoreAdapter;
  policyDecision: PolicyDecisionAdapter;
  agentAccess: AgentAccessEvaluatorAdapter;
  auditSink: AuditSinkAdapter;
}

export async function evaluateEnforcementPipeline(
  input: EnforcementEvaluationInput,
  deps: EnforcementRuntimeDeps
): Promise<EnforcementEvaluationResult> {
  const actor = await deps.identity.resolveIdentity(input.actorId, input.tenantId);
  const capabilityAllowed = await deps.capabilityRegistry.hasCapability(actor, input.capability, input.orgId);
  const delegationValid = await deps.delegationStore.validateDelegation(actor, input.capability, input.orgId);
  const agentAllowed = await deps.agentAccess.evaluateAgentAccess(actor, input.access, input.orgId);
  const policy = await deps.policyDecision.evaluatePolicy({ ...input, actor });

  const allowed = capabilityAllowed && delegationValid && agentAllowed && policy.allowed;
  const reasonCodes = [
    ...policy.reasonCodes,
    ...(capabilityAllowed ? [] : ['capability_denied']),
    ...(delegationValid ? [] : ['delegation_invalid']),
    ...(agentAllowed ? [] : ['agent_scope_denied']),
  ];

  const audit = await deps.auditSink.emitAuthorizationAudit({
    requestId: input.requestId,
    tenantId: input.tenantId,
    orgId: input.orgId,
    allowed,
    reasonCodes,
    actor,
    capability: input.capability,
    access: input.access,
  });

  return { allowed, reasonCodes, audit };
}
