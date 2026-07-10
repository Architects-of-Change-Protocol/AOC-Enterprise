import type { ExecutionRiskLevel } from '../../features/action-enforcement/domain/execution-intent.js';
import type { SideEffectType } from '../../features/action-enforcement/domain/side-effect.js';

/**
 * Identifies the requesting actor without embedding a mutable user/agent
 * record. `principalId` mirrors `EnforcementRequest.principalActorId` --
 * present only when the actor is acting on behalf of another actor (e.g. an
 * agent acting for a human).
 */
export interface ActorReference {
  readonly id: string;
  readonly principalId?: string;
  readonly trustDomainId: string;
  readonly type?: string;
}

/**
 * Describes the action being evaluated. Fields beyond `type`/`resourceScope`
 * mirror what the wrapped engine actually consumes: `capability`/`riskLevel`/
 * `sideEffectType` feed `ExecutionIntent`; `domain`/`jurisdiction`/`country`/
 * `industry`/`customerId`/`amount`/`currency`/`counterpartyId`/`dataDomains`/
 * `evidenceIds` feed the optional Domain Policy Pack Runtime preflight
 * integration (`EnforcementPolicyEvaluationInput`) and are ignored entirely
 * when no policy pack integration is configured on the kernel.
 */
export interface ActionDescriptor {
  readonly type: string;
  readonly domain?: string;
  readonly jurisdiction?: string;
  readonly country?: string;
  readonly industry?: string;
  readonly customerId?: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly riskLevel?: ExecutionRiskLevel;
  readonly sideEffectType?: SideEffectType;
  readonly amount?: number;
  readonly currency?: string;
  readonly counterpartyId?: string;
  readonly dataDomains?: readonly string[];
  readonly evidenceIds?: readonly string[];
  readonly parameters?: Readonly<Record<string, unknown>>;
}

/** Mirrors `EnforcementTarget`. Optional -- when absent the wrapped engine defaults it from the action. */
export interface TargetReference {
  readonly id?: string;
  readonly type?: string;
  readonly name?: string;
  readonly adapterId?: string;
}

/**
 * Not a field the wrapped engine's request shape carries directly (there is
 * no `OrganizationReference` in `EnforcementRequest` -- `trustDomainId` is
 * the engine's tenant boundary). Kept as a documented, optional passthrough
 * into `context`/metadata for callers that track an organization id
 * alongside the trust domain.
 */
export interface OrganizationReference {
  readonly id: string;
  readonly name?: string;
}

export interface KernelEvaluationRequest {
  readonly requestId: string;
  readonly actor: ActorReference;
  readonly action: ActionDescriptor;
  readonly target?: TargetReference;
  readonly organization?: OrganizationReference;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly requestedAt: string;
  readonly correlationId?: string;

  /** Caller-declared references to a prior approval/handshake proof, forwarded unchanged to the wrapped engine. */
  readonly approvalProofId?: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeProofId?: string;
  readonly idempotencyKey?: string;
  readonly expiresAt?: string;
}
