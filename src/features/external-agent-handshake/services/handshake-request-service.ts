import type { ExternalAgentDescriptor } from '../domain/external-agent-descriptor.js';
import type { ExternalAuthorityPresentation } from '../domain/external-authority-presentation.js';
import type { ExternalCapabilityRequest } from '../domain/external-capability-request.js';
import type { ExternalPassportPresentation } from '../domain/external-passport-presentation.js';
import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { HandshakeRequestNotFoundError } from '../runtime/handshake-runtime-errors.js';
import type { HandshakeLedger } from './handshake-ledger.js';
import type { HandshakeStore } from './handshake-store.js';

export interface SubmitHandshakeRequestInput {
  readonly id?: string;
  readonly localTrustDomainId: string;
  readonly externalAgent: ExternalAgentDescriptor;
  readonly passportPresentation: ExternalPassportPresentation;
  readonly authorityPresentation?: ExternalAuthorityPresentation;
  readonly requestedCapabilities: readonly ExternalCapabilityRequest[];
  readonly requestedActions: readonly string[];
  readonly requestedResourceScopes: readonly string[];
  readonly requestedDataDomains?: readonly string[];
  readonly expiresInMinutes?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const TERMINAL_STATUSES = new Set(['rejected', 'expired', 'revoked', 'cancelled']);

/**
 * Submits, cancels, expires and quarantines HandshakeRequests. Submission is
 * idempotent for an external agent already holding an active (non-terminal)
 * request for the exact same trust domain/scopes/actions -- resubmitting
 * returns that existing request deterministically instead of creating a
 * duplicate.
 */
export class HandshakeRequestService {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
    private readonly ledger: HandshakeLedger,
  ) {}

  findDuplicateActiveRequest(input: SubmitHandshakeRequestInput): HandshakeRequest | undefined {
    return this.store.queryHandshakeRequestsByExternalAgent(input.externalAgent.id).find(
      (existing) =>
        existing.localTrustDomainId === input.localTrustDomainId &&
        !TERMINAL_STATUSES.has(existing.status) &&
        sameStringSet(existing.requestedActions, input.requestedActions) &&
        sameStringSet(existing.requestedResourceScopes, input.requestedResourceScopes),
    );
  }

  submitHandshakeRequest(input: SubmitHandshakeRequestInput): HandshakeRequest {
    const duplicate = this.findDuplicateActiveRequest(input);
    if (duplicate) {
      return duplicate;
    }

    const now = this.ctx.clock.now();
    const expiresAt = input.expiresInMinutes !== undefined ? new Date(Date.parse(now) + input.expiresInMinutes * 60_000).toISOString() : undefined;

    const request: HandshakeRequest = {
      id: input.id ?? this.ctx.ids.nextId('handshake-request'),
      localTrustDomainId: input.localTrustDomainId,
      externalAgent: input.externalAgent,
      passportPresentation: input.passportPresentation,
      requestedCapabilities: input.requestedCapabilities,
      requestedActions: input.requestedActions,
      requestedResourceScopes: input.requestedResourceScopes,
      status: 'submitted',
      createdAt: now,
      ...(input.authorityPresentation !== undefined ? { authorityPresentation: input.authorityPresentation } : {}),
      ...(input.requestedDataDomains !== undefined ? { requestedDataDomains: input.requestedDataDomains } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    this.store.putHandshakeRequest(request);

    this.ledger.recordEvent({
      type: 'handshake_submitted',
      localTrustDomainId: request.localTrustDomainId,
      externalAgentId: request.externalAgent.id,
      externalIssuerId: request.externalAgent.externalIssuerId,
      handshakeRequestId: request.id,
      payload: { requestedActions: request.requestedActions, requestedResourceScopes: request.requestedResourceScopes },
    });

    return request;
  }

  getHandshakeRequest(handshakeRequestId: string): HandshakeRequest | undefined {
    return this.store.getHandshakeRequest(handshakeRequestId);
  }

  cancelHandshakeRequest(handshakeRequestId: string): HandshakeRequest {
    return this.transition(handshakeRequestId, 'cancelled');
  }

  expireHandshakeRequest(handshakeRequestId: string): HandshakeRequest {
    const request = this.transition(handshakeRequestId, 'expired');
    this.ledger.recordEvent({
      type: 'handshake_expired',
      localTrustDomainId: request.localTrustDomainId,
      externalAgentId: request.externalAgent.id,
      handshakeRequestId: request.id,
      payload: {},
    });
    return request;
  }

  quarantineHandshakeRequest(handshakeRequestId: string, reasonCode: string, reason: string): HandshakeRequest {
    const request = this.transition(handshakeRequestId, 'quarantined');
    this.ledger.recordEvent({
      type: 'handshake_quarantined',
      localTrustDomainId: request.localTrustDomainId,
      externalAgentId: request.externalAgent.id,
      handshakeRequestId: request.id,
      payload: { reasonCode, reason },
    });
    return request;
  }

  private transition(handshakeRequestId: string, status: HandshakeRequest['status']): HandshakeRequest {
    const existing = this.store.getHandshakeRequest(handshakeRequestId);
    if (!existing) {
      throw new HandshakeRequestNotFoundError(handshakeRequestId);
    }
    return this.store.updateHandshakeRequestStatus(handshakeRequestId, status);
  }
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}
