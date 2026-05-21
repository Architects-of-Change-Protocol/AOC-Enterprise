import type {
  AgentAccessEvaluatorAdapter,
  AuditSinkAdapter,
  CapabilityRegistryAdapter,
  DelegationStoreAdapter,
  IdentityResolverAdapter,
  PolicyDecisionAdapter,
} from '../../../adapters/protocol-adapters.js';
import { evaluateAuthorization } from '../../authorization/evaluators/authorization-evaluator.js';
import type { AuthorizationDecision } from '../../authorization/decisions/authorization-decision.js';
import type { AuthorizationGrantInput } from '../../authorization/grants/grant-input.js';

export interface AuthorizationOrchestrationDeps {
  identity: IdentityResolverAdapter;
  capabilityRegistry: CapabilityRegistryAdapter;
  delegationStore: DelegationStoreAdapter;
  policyDecision: PolicyDecisionAdapter;
  agentAccess: AgentAccessEvaluatorAdapter;
  auditSink: AuditSinkAdapter;
}

export async function orchestrateAuthorization(
  input: AuthorizationGrantInput,
  deps: AuthorizationOrchestrationDeps
): Promise<AuthorizationDecision> {
  const actor = await deps.identity.resolveIdentity(input.actorId, input.tenantId);
  const evaluation = await evaluateAuthorization({ actor, request: input }, deps);

  const audit = await deps.auditSink.emitAuthorizationAudit({
    requestId: input.requestId,
    tenantId: input.tenantId,
    orgId: input.orgId,
    allowed: evaluation.allowed,
    reasonCodes: evaluation.reasonCodes,
    actor,
    capability: input.capability,
    access: input.access,
  });

  return { ...evaluation, audit };
}
