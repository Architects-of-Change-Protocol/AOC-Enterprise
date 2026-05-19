import type { AuthorizationGrantInput } from './authorization/grants/grant-input';
import { evaluateEnforcementPipeline } from './enforcement/authorization-pipeline';
import type {
  CapabilityClaim,
  CapabilityClaimExpectedValues,
  CapabilityClaimInput,
  CapabilityClaimPayload,
  CapabilityClaimVerificationResult,
  DelegatedAccessEvaluationInput,
  DelegatedAccessEvaluationResult,
  DelegatedCapability,
  DelegatedCapabilityPayload,
  ExecutionGrant,
  ExecutionGrantPayload,
  ExecutionGrantValidationOptions,
  ExecutionGrantValidationResult,
  LifecycleAuditEvent,
  RuntimeContext,
  RuntimeDecisionEnvelope,
  RuntimePortSet,
} from './context';

export interface AocEnterpriseRuntime {
  readonly context: RuntimeContext;
  evaluate(input: AuthorizationGrantInput): Promise<RuntimeDecisionEnvelope>;
  enforce(input: AuthorizationGrantInput): Promise<RuntimeDecisionEnvelope>;
  issueExecutionGrant(input: AuthorizationGrantInput & { expiresAt?: string }): Promise<ExecutionGrant>;
  validateExecutionGrant(grant: ExecutionGrant, options?: ExecutionGrantValidationOptions): Promise<ExecutionGrantValidationResult>;
  consumeExecutionGrant(grant: ExecutionGrant, consumedBy?: string): Promise<ExecutionGrantValidationResult>;
  revokeExecutionGrant(input: { grantId: string; reasonCode?: string }): Promise<{ revoked: boolean; reasonCodes: string[] }>;
  issueDelegatedCapability(input: Omit<DelegatedCapabilityPayload, 'issuedAt' | 'nonce'> & Partial<Pick<DelegatedCapabilityPayload, 'issuedAt' | 'nonce'>>): Promise<DelegatedCapability>;
  evaluateDelegatedAccess(input: DelegatedAccessEvaluationInput): Promise<DelegatedAccessEvaluationResult>;
  revokeDelegatedCapability(input: { delegationId: string; reasonCode?: string }): Promise<{ revoked: boolean; reasonCodes: string[] }>;
  createCapabilityClaim(input: CapabilityClaimInput): Promise<CapabilityClaim>;
  verifyCapabilityClaim(
    claim: CapabilityClaim,
    expected?: CapabilityClaimExpectedValues
  ): Promise<CapabilityClaimVerificationResult>;
}

export type AocEnterpriseRuntimeHostPorts = RuntimePortSet;

type LifecycleEntity = 'grant' | 'delegation' | 'claim';

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string, stableParts: string[]): string {
  return `${prefix}-${stableParts.join('-')}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isExpired(expiresAt: string | undefined): boolean {
  return typeof expiresAt === 'string' && Date.parse(expiresAt) <= Date.now();
}

function defaultExpiry(): string {
  return new Date(Date.now() + 5 * 60 * 1000).toISOString();
}

function containsExpectedScope(actual: string[] | undefined, expected: string | string[] | undefined): boolean {
  if (expected === undefined) return true;
  const expectedScopes = Array.isArray(expected) ? expected : [expected];
  return expectedScopes.every((scope) => actual?.includes(scope));
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

function scopeFor(entity: LifecycleEntity): string {
  return `${entity}:${entity === 'grant' ? 'execution' : entity === 'delegation' ? 'delegated-capability' : 'capability-claim'}`;
}

export function createAocEnterpriseRuntime(ports: AocEnterpriseRuntimeHostPorts): AocEnterpriseRuntime {
  const context: RuntimeContext = { ...ports };

  async function emitLifecycleAudit(event: Omit<LifecycleAuditEvent, 'runtimeId' | 'trustDomain' | 'timestamp'>): Promise<void> {
    const auditEvent: LifecycleAuditEvent = {
      ...event,
      runtimeId: context.metadata.runtimeId,
      trustDomain: context.metadata.trustDomain,
      timestamp: nowIso(),
    };

    try {
      await context.lifecycleAuditSink.emitLifecycleAudit(auditEvent);
    } catch (error) {
      if (event.eventType !== 'lifecycle_error') {
        await context.lifecycleAuditSink.emitLifecycleAudit({
          eventType: 'lifecycle_error',
          runtimeId: context.metadata.runtimeId,
          trustDomain: context.metadata.trustDomain,
          timestamp: nowIso(),
          reasonCodes: ['audit_emit_failed'],
          decision: 'error',
          metadata: { originalEventType: event.eventType, error: error instanceof Error ? error.message : String(error) },
        });
      }
    }
  }

  async function evaluate(input: AuthorizationGrantInput): Promise<RuntimeDecisionEnvelope> {
    const decision = await evaluateEnforcementPipeline(input, context);
    return { ...decision, metadata: context.metadata };
  }

  async function verifySignedPayload(
    payload: Record<string, unknown>,
    signature: string,
    invalidReasonCode: string
  ): Promise<string[]> {
    const signatureValid = await context.signer.verify(payload, signature, context.metadata);
    return signatureValid ? [] : [invalidReasonCode];
  }

  const runtime: AocEnterpriseRuntime = {
    context,
    evaluate,
    enforce: evaluate,
    async issueExecutionGrant(input) {
      const { expiresAt = defaultExpiry(), ...authorizationInput } = input;
      const issuedAt = nowIso();
      const payload: ExecutionGrantPayload = {
        grantId: makeId('grant', [authorizationInput.requestId, authorizationInput.actorId]),
        input: authorizationInput,
        issuedAt,
        expiresAt,
        issuer: context.metadata,
        subject: {
          actorId: authorizationInput.actorId,
          orgId: authorizationInput.orgId,
          tenantId: authorizationInput.tenantId,
        },
        nonce: makeId('nonce', [authorizationInput.requestId]),
      };
      const nonceRecorded = await context.replayProtection.recordNonce(payload.nonce, scopeFor('grant'), expiresAt);
      if (!nonceRecorded.recorded) throw new Error('grant nonce replay detected during issue');
      const grant = await signPayload(context, payload);
      await context.executionGrantStore.persistGrant(grant);
      await emitLifecycleAudit({
        eventType: 'grant_issued',
        actorId: authorizationInput.actorId,
        subjectId: authorizationInput.actorId,
        orgId: authorizationInput.orgId,
        tenantId: authorizationInput.tenantId,
        grantId: payload.grantId,
        reasonCodes: [],
        decision: 'issued',
      });
      return grant;
    },
    async validateExecutionGrant(grant, options) {
      const reasonCodes: string[] = [];
      reasonCodes.push(...(await verifySignedPayload(grant.payload, grant.signature, 'grant_signature_invalid')));
      if (isExpired(grant.payload.expiresAt)) reasonCodes.push('grant_expired');
      if (!(await context.executionGrantStore.getGrant(grant.payload.grantId))) reasonCodes.push('grant_unknown');
      if (await context.executionGrantStore.isGrantRevoked(grant.payload.grantId)) reasonCodes.push('grant_revoked');
      if (await context.executionGrantStore.isGrantConsumed(grant.payload.grantId)) reasonCodes.push('grant_replayed');
      if (!containsExpectedScope(grant.payload.input.access.scope, options?.expectedScope)) reasonCodes.push('grant_scope_mismatch');
      const valid = reasonCodes.length === 0;
      await emitLifecycleAudit({
        eventType: 'grant_validated',
        actorId: grant.payload.input.actorId,
        subjectId: grant.payload.subject.actorId,
        orgId: grant.payload.subject.orgId,
        tenantId: grant.payload.subject.tenantId,
        grantId: grant.payload.grantId,
        reasonCodes,
        decision: valid ? 'allowed' : 'denied',
      });
      return { valid, reasonCodes, grant };
    },
    async consumeExecutionGrant(grant, consumedBy = grant.payload.subject.actorId) {
      const validation = await runtime.validateExecutionGrant(grant);
      if (!validation.valid) {
        await emitLifecycleAudit({
          eventType: validation.reasonCodes.includes('grant_replayed') ? 'grant_replayed' : 'grant_validated',
          actorId: consumedBy,
          subjectId: grant.payload.subject.actorId,
          orgId: grant.payload.subject.orgId,
          tenantId: grant.payload.subject.tenantId,
          grantId: grant.payload.grantId,
          reasonCodes: validation.reasonCodes,
          decision: 'denied',
        });
        return validation;
      }
      const consumed = await context.executionGrantStore.markGrantConsumed(grant.payload.grantId, consumedBy, {
        runtimeId: context.metadata.runtimeId,
        consumedAt: nowIso(),
      });
      const reasonCodes = consumed.consumed ? [] : consumed.reasonCodes?.length ? consumed.reasonCodes : ['grant_replayed'];
      await emitLifecycleAudit({
        eventType: consumed.consumed ? 'grant_consumed' : 'grant_replayed',
        actorId: consumedBy,
        subjectId: grant.payload.subject.actorId,
        orgId: grant.payload.subject.orgId,
        tenantId: grant.payload.subject.tenantId,
        grantId: grant.payload.grantId,
        reasonCodes,
        decision: consumed.consumed ? 'consumed' : 'denied',
      });
      return { valid: consumed.consumed, reasonCodes, grant };
    },
    async revokeExecutionGrant(input) {
      await context.executionGrantStore.revokeGrant(input.grantId, input.reasonCode);
      await emitLifecycleAudit({
        eventType: 'grant_revoked',
        grantId: input.grantId,
        reasonCodes: input.reasonCode ? [input.reasonCode] : [],
        decision: 'revoked',
      });
      return { revoked: true, reasonCodes: [] };
    },
    async issueDelegatedCapability(input) {
      const issuedAt = input.issuedAt ?? nowIso();
      const payload: DelegatedCapabilityPayload = {
        ...input,
        issuedAt,
        expiresAt: input.expiresAt ?? defaultExpiry(),
        nonce: input.nonce ?? makeId('nonce', [input.delegationId]),
      };
      const nonceRecorded = await context.replayProtection.recordNonce(payload.nonce, scopeFor('delegation'), payload.expiresAt);
      if (!nonceRecorded.recorded) throw new Error('delegation nonce replay detected during issue');
      const delegation = await signPayload(context, payload);
      await context.lifecycleDelegationStore.persistDelegation(delegation);
      await emitLifecycleAudit({
        eventType: 'delegation_issued',
        actorId: payload.actorId,
        orgId: payload.orgId,
        delegationId: payload.delegationId,
        ...(payload.parentGrantId === undefined ? {} : { grantId: payload.parentGrantId }),
        reasonCodes: [],
        decision: 'issued',
      });
      return delegation;
    },
    async evaluateDelegatedAccess(input) {
      const payload = input.delegatedCapability.payload;
      const reasonCodes: string[] = [];
      reasonCodes.push(...(await verifySignedPayload(payload, input.delegatedCapability.signature, 'delegation_signature_invalid')));
      if (!(await context.lifecycleDelegationStore.getDelegation(payload.delegationId))) reasonCodes.push('delegation_invalid');
      if (await context.lifecycleDelegationStore.isDelegationRevoked(payload.delegationId)) reasonCodes.push('delegation_revoked');
      if (isExpired(payload.expiresAt)) reasonCodes.push('delegation_expired');
      if (payload.actorId !== input.actor.sub) reasonCodes.push('delegation_policy_denied');
      if (payload.orgId !== input.orgId) reasonCodes.push('delegation_policy_denied');
      const expectedScope = payload.constraints?.scope;
      if (!containsExpectedScope(input.access.scope, typeof expectedScope === 'string' || Array.isArray(expectedScope) ? expectedScope : undefined)) {
        reasonCodes.push('delegation_scope_mismatch');
      }
      if (payload.constraints?.resource !== undefined && payload.constraints.resource !== input.access.resource) {
        reasonCodes.push('delegation_scope_mismatch');
      }
      if (payload.constraints?.action !== undefined && payload.constraints.action !== input.access.action) {
        reasonCodes.push('delegation_scope_mismatch');
      }
      const delegationValid = await context.lifecycleDelegationStore.validateDelegation(input);
      if (!delegationValid.valid) reasonCodes.push(...(delegationValid.reasonCodes?.length ? delegationValid.reasonCodes : ['delegation_invalid']));
      const legacyDelegationValid = await context.delegationStore.validateDelegation(input.actor, payload.capability, input.orgId);
      if (!legacyDelegationValid) reasonCodes.push('delegation_invalid');
      const accessAllowed = await context.agentAccess.evaluateAgentAccess(input.actor, input.access, input.orgId);
      if (!accessAllowed) reasonCodes.push('delegation_policy_denied');
      const uniqueReasonCodes = [...new Set(reasonCodes)];
      const allowed = uniqueReasonCodes.length === 0;
      await emitLifecycleAudit({
        eventType: allowed ? 'delegation_validated' : 'delegation_denied',
        actorId: payload.actorId,
        orgId: payload.orgId,
        delegationId: payload.delegationId,
        ...(payload.parentGrantId === undefined ? {} : { grantId: payload.parentGrantId }),
        reasonCodes: uniqueReasonCodes,
        decision: allowed ? 'allowed' : 'denied',
      });
      return { allowed, reasonCodes: uniqueReasonCodes };
    },
    async revokeDelegatedCapability(input) {
      await context.lifecycleDelegationStore.revokeDelegation(input.delegationId, input.reasonCode);
      await emitLifecycleAudit({
        eventType: 'delegation_revoked',
        delegationId: input.delegationId,
        reasonCodes: input.reasonCode ? [input.reasonCode] : [],
        decision: 'revoked',
      });
      return { revoked: true, reasonCodes: [] };
    },
    async createCapabilityClaim(input) {
      const issuedAt = input.issuedAt ?? nowIso();
      const payload: CapabilityClaimPayload = {
        ...input,
        issuedAt,
        trustDomain: input.trustDomain ?? context.metadata.trustDomain,
        nonce: input.nonce ?? makeId('nonce', [input.claimId]),
      };
      const nonceRecorded = await context.replayProtection.recordNonce(payload.nonce, scopeFor('claim'), payload.expiresAt);
      if (!nonceRecorded.recorded) throw new Error('claim nonce replay detected during issue');
      const claim = await signPayload(context, payload);
      await emitLifecycleAudit({
        eventType: 'claim_issued',
        actorId: payload.actorId,
        orgId: payload.orgId,
        claimId: payload.claimId,
        reasonCodes: [],
        decision: 'issued',
      });
      return claim;
    },
    async verifyCapabilityClaim(claim, expected) {
      const reasonCodes: string[] = [];
      reasonCodes.push(...(await verifySignedPayload(claim.payload, claim.signature, 'claim_signature_invalid')));
      if (isExpired(claim.payload.expiresAt)) reasonCodes.push('claim_expired');
      if (expected?.actorId !== undefined && expected.actorId !== claim.payload.actorId) reasonCodes.push('actor_mismatch');
      if (expected?.orgId !== undefined && expected.orgId !== claim.payload.orgId) reasonCodes.push('org_mismatch');
      if (expected?.trustDomain !== undefined && expected.trustDomain !== claim.payload.trustDomain) reasonCodes.push('trust_domain_mismatch');
      const valid = reasonCodes.length === 0;
      await emitLifecycleAudit({
        eventType: valid ? 'claim_verified' : 'claim_denied',
        actorId: claim.payload.actorId,
        orgId: claim.payload.orgId,
        claimId: claim.payload.claimId,
        reasonCodes,
        decision: valid ? 'allowed' : 'denied',
        metadata: { claimRevocationStoreImplemented: false },
      });
      return { valid, reasonCodes };
    },
  };

  return runtime;
}
