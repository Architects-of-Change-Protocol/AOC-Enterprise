import type { EnforcementTarget } from './enforcement-target.js';
import type { ExecutionIntent } from './execution-intent.js';
import type { SideEffectDescriptor } from './side-effect.js';

export type EnforcementMode = 'preflight' | 'execute' | 'dry_run';

export type EnforcementRequestStatus =
  | 'submitted'
  | 'preflight_passed'
  | 'preflight_failed'
  | 'blocked'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'cancelled';

export interface EnforcementRequest {
  readonly id: string;

  readonly mode: EnforcementMode;
  readonly status: EnforcementRequestStatus;

  readonly trustDomainId: string;

  readonly actorId: string;
  readonly principalActorId?: string;

  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;

  readonly actionRequestId?: string;

  readonly recognitionDecisionId?: string;
  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;
  readonly handshakeDecisionId?: string;
  readonly handshakeProofId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;

  readonly target: EnforcementTarget;
  readonly intent: ExecutionIntent;

  readonly idempotencyKey?: string;

  readonly sideEffects: readonly SideEffectDescriptor[];

  readonly submittedAt: string;
  readonly expiresAt?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
