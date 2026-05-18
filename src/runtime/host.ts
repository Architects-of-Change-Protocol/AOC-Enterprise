import type { AuthorizationGrantInput } from './authorization/grants/grant-input';
import { evaluateEnforcementPipeline } from './enforcement/authorization-pipeline';
import type {
  CapabilityClaim,
  CapabilityClaimExpectedValues,
  CapabilityClaimPayload,
  CapabilityClaimVerificationResult,
  DelegatedAccessEvaluationInput,
  DelegatedAccessEvaluationResult,
  DelegatedCapability,
  DelegatedCapabilityPayload,
  ExecutionGrant,
  ExecutionGrantPayload,
  ExecutionGrantValidationResult,
  RuntimeContext,
  RuntimeDecisionEnvelope,
  RuntimePortSet,
} from './context';

export interface AocEnterpriseRuntime {
  readonly context: RuntimeContext;
  evaluate(input: AuthorizationGrantInput): Promise<RuntimeDecisionEnvelope>;
  enforce(input: AuthorizationGrantInput): Promise<RuntimeDecisionEnvelope>;
  issueExecutionGrant(input: AuthorizationGrantInput & { expiresAt?: string }): Promise<ExecutionGrant>;
  validateExecutionGrant(grant: ExecutionGrant): Promise<ExecutionGrantValidationResult>;
  consumeExecutionGrant(grant: ExecutionGrant): Promise<ExecutionGrantValidationResult>;
  issueDelegatedCapability(input: DelegatedCapabilityPayload): Promise<DelegatedCapability>;
  evaluateDelegatedAccess(input: DelegatedAccessEvaluationInput): Promise<DelegatedAccessEvaluationResult>;
  revokeDelegatedCapability(input: { delegationId: string; reasonCode?: string }): Promise<{ revoked: boolean; reasonCodes: string[] }>;
  createCapabilityClaim(input: CapabilityClaimPayload): Promise<CapabilityClaim>;
  verifyCapabilityClaim(
    claim: CapabilityClaim,
    expected?: CapabilityClaimExpectedValues
  ): Promise<CapabilityClaimVerificationResult>;
}

export type AocEnterpriseRuntimeHostPorts = RuntimePortSet;

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string, stableParts: string[]): string {
  return `${prefix}-${stableParts.join('-')}-${Date.now().toString(36)}`;
}

function isExpired(expiresAt: string | undefined): boolean {
  return typeof expiresAt === 'string' && Date.parse(expiresAt) <= Date.now();
}

async function signPayload<TPayload extends Record<string, unknown>>(
  context: RuntimeContext,
  payload: TPayload
): Promise<{ payload: TPayload; signature: string; issuedAt: string; metadata: RuntimeContext['metadata'] }> {
  return {
    payload,
    signature: await context.signer.sign(payload, context.metadata),
    issuedAt: nowIso(),
    metadata: context.metadata,
  };
}

export function createAocEnterpriseRuntime(ports: AocEnterpriseRuntimeHostPorts): AocEnterpriseRuntime {
  const context: RuntimeContext = { ...ports };

  async function evaluate(input: AuthorizationGrantInput): Promise<RuntimeDecisionEnvelope> {
    const decision = await evaluateEnforcementPipeline(input, context);
    return { ...decision, metadata: context.metadata };
  }

  async function validateSignedEnvelope(
    payload: Record<string, unknown>,
    signature: string,
    expiresAt: string | undefined
  ): Promise<{ valid: boolean; reasonCodes: string[] }> {
    const reasonCodes: string[] = [];
    const signatureValid = await context.signer.verify(payload, signature, context.metadata);
    if (!signatureValid) reasonCodes.push('signature_invalid');
    if (isExpired(expiresAt)) reasonCodes.push('grant_expired');
    return { valid: reasonCodes.length === 0, reasonCodes };
  }

  return {
    context,
    evaluate,
    enforce: evaluate,
    async issueExecutionGrant(input) {
      const { expiresAt, ...authorizationInput } = input;
      const payload: ExecutionGrantPayload = {
        grantId: makeId('grant', [authorizationInput.requestId, authorizationInput.actorId]),
        input: authorizationInput,
        ...(expiresAt === undefined ? {} : { expiresAt }),
      };
      return signPayload(context, payload);
    },
    async validateExecutionGrant(grant) {
      const result = await validateSignedEnvelope(grant.payload, grant.signature, grant.payload.expiresAt);
      return { ...result, grant };
    },
    async consumeExecutionGrant(grant) {
      return this.validateExecutionGrant(grant);
    },
    async issueDelegatedCapability(input) {
      return signPayload(context, input);
    },
    async evaluateDelegatedAccess(input) {
      const verified = await context.signer.verify(
        input.delegatedCapability.payload,
        input.delegatedCapability.signature,
        context.metadata
      );
      const delegationValid = await context.delegationStore.validateDelegation(
        input.actor,
        input.delegatedCapability.payload.capability,
        input.orgId
      );
      const accessAllowed = await context.agentAccess.evaluateAgentAccess(input.actor, input.access, input.orgId);
      const expired = isExpired(input.delegatedCapability.payload.expiresAt);
      const reasonCodes = [
        ...(verified ? [] : ['signature_invalid']),
        ...(delegationValid ? [] : ['delegation_invalid']),
        ...(accessAllowed ? [] : ['agent_scope_denied']),
        ...(expired ? ['delegation_expired'] : []),
      ];
      return { allowed: reasonCodes.length === 0, reasonCodes };
    },
    async revokeDelegatedCapability() {
      return { revoked: true, reasonCodes: [] };
    },
    async createCapabilityClaim(input) {
      return signPayload(context, input);
    },
    async verifyCapabilityClaim(claim, expected) {
      const reasonCodes: string[] = [];
      const verified = await context.signer.verify(claim.payload, claim.signature, context.metadata);
      if (!verified) reasonCodes.push('signature_invalid');
      if (isExpired(claim.payload.expiresAt)) reasonCodes.push('claim_expired');
      if (expected?.actorId !== undefined && expected.actorId !== claim.payload.actorId) reasonCodes.push('actor_mismatch');
      if (expected?.orgId !== undefined && expected.orgId !== claim.payload.orgId) reasonCodes.push('org_mismatch');
      if (expected?.trustDomain !== undefined && expected.trustDomain !== context.metadata.trustDomain) {
        reasonCodes.push('trust_domain_mismatch');
      }
      return { valid: reasonCodes.length === 0, reasonCodes };
    },
  };
}
