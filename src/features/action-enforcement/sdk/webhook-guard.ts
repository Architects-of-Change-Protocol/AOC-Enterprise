import type { EnforcementOutcome } from '../domain/enforcement-outcome.js';
import type { AocGuard, GuardActionRequestInput } from './aoc-guard.js';

export interface WebhookInput<T> {
  readonly webhookId: string;

  /** The external agent (or external-issuer-backed actor) the webhook is acting on behalf of. */
  readonly actorId: string;
  readonly trustDomainId: string;

  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;

  /** References to a prior External Agent Handshake outcome; forwarded to Recognition Runtime during preflight. */
  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeProofId?: string;

  readonly idempotencyKey?: string;

  readonly execute: () => Promise<T> | T;
}

/**
 * Guards an inbound webhook-triggered action. The webhook's side effect
 * never runs unless enforcement confirms both recognition and (for external
 * agents) valid external standing.
 */
export class WebhookGuard {
  constructor(private readonly guard: AocGuard) {}

  async handle<T>(input: WebhookInput<T>): Promise<EnforcementOutcome<T>> {
    const guardInput: GuardActionRequestInput = {
      actorId: input.actorId,
      trustDomainId: input.trustDomainId,
      action: input.action,
      resourceScope: input.resourceScope,
      targetType: 'webhook',
      targetName: input.webhookId,
      adapterId: input.webhookId,
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.visaId !== undefined ? { visaId: input.visaId } : {}),
      ...(input.ingressGrantId !== undefined ? { ingressGrantId: input.ingressGrantId } : {}),
      ...(input.handshakeProofId !== undefined ? { handshakeProofId: input.handshakeProofId } : {}),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    };
    return this.guard.enforce(guardInput, input.execute);
  }
}

export function createWebhookGuard(guard: AocGuard): WebhookGuard {
  return new WebhookGuard(guard);
}
