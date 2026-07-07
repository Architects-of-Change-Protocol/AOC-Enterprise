import type { ExternalAgentDescriptor } from './external-agent-descriptor.js';
import type { ExternalAuthorityPresentation } from './external-authority-presentation.js';
import type { ExternalCapabilityRequest } from './external-capability-request.js';
import type { ExternalPassportPresentation } from './external-passport-presentation.js';

export type HandshakeRequestStatus =
  | 'submitted'
  | 'challenged'
  | 'verifying'
  | 'accepted'
  | 'accepted_limited'
  | 'requires_approval'
  | 'rejected'
  | 'quarantined'
  | 'expired'
  | 'revoked'
  | 'cancelled';

export interface HandshakeRequest {
  readonly id: string;

  readonly localTrustDomainId: string;

  readonly externalAgent: ExternalAgentDescriptor;

  readonly passportPresentation: ExternalPassportPresentation;

  readonly authorityPresentation?: ExternalAuthorityPresentation;

  readonly requestedCapabilities: readonly ExternalCapabilityRequest[];

  readonly requestedActions: readonly string[];
  readonly requestedResourceScopes: readonly string[];

  readonly requestedDataDomains?: readonly string[];

  readonly status: HandshakeRequestStatus;

  readonly challengeId?: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly approvalProofId?: string;

  readonly createdAt: string;
  readonly expiresAt?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
