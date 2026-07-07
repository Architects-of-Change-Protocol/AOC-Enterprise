import { createDigest } from '../domain/handshake-proof.js';
import type { ExternalPassportPresentation, ExternalPassportPresentationStatus } from '../domain/external-passport-presentation.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import type { ExternalIssuerRegistry } from './external-issuer-registry.js';
import type { HandshakeStore } from './handshake-store.js';

export interface PresentPassportInput {
  readonly id?: string;
  readonly externalAgentId: string;
  readonly externalIssuerId?: string;
  readonly externalTrustDomainId?: string;
  readonly claimedPassportId: string;
  readonly localTrustDomainId: string;
  readonly subjectActorId?: string;
  readonly subjectDisplayName?: string;
  readonly issuedAt?: string;
  readonly expiresAt?: string;
  readonly proofHash?: string;
  readonly revoked?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface PassportPresentationVerification {
  readonly valid: boolean;
  readonly status: ExternalPassportPresentationStatus;
  readonly reasonCode: string;
  readonly reason: string;
}

/**
 * Validates a claimed external passport presentation. Presence of a passport
 * claim alone recognizes nothing -- this only ever proves the shape of the
 * claim is internally consistent, current and issued by an issuer this trust
 * domain accepts. It never grants local standing on its own.
 */
export class PassportPresentationService {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
    private readonly issuerRegistry: ExternalIssuerRegistry,
  ) {}

  presentPassport(input: PresentPassportInput): ExternalPassportPresentation {
    const now = this.ctx.clock.now();
    const presentationHash = createDigest({
      externalAgentId: input.externalAgentId,
      externalIssuerId: input.externalIssuerId,
      claimedPassportId: input.claimedPassportId,
      subjectActorId: input.subjectActorId,
      subjectDisplayName: input.subjectDisplayName,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      proofHash: input.proofHash,
    });

    const status = this.classifyStatus(input, now);

    const presentation: ExternalPassportPresentation = {
      id: input.id ?? this.ctx.ids.nextId('passport-presentation'),
      externalAgentId: input.externalAgentId,
      claimedPassportId: input.claimedPassportId,
      status,
      presentedAt: now,
      presentationHash,
      ...(input.externalIssuerId !== undefined ? { externalIssuerId: input.externalIssuerId } : {}),
      ...(input.externalTrustDomainId !== undefined ? { externalTrustDomainId: input.externalTrustDomainId } : {}),
      ...(input.subjectActorId !== undefined ? { subjectActorId: input.subjectActorId } : {}),
      ...(input.subjectDisplayName !== undefined ? { subjectDisplayName: input.subjectDisplayName } : {}),
      ...(input.issuedAt !== undefined ? { issuedAt: input.issuedAt } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.proofHash !== undefined ? { proofHash: input.proofHash } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    return this.store.putPassportPresentation(presentation);
  }

  private classifyStatus(input: PresentPassportInput, now: string): ExternalPassportPresentationStatus {
    if (input.revoked === true) {
      return 'revoked';
    }
    if (input.expiresAt !== undefined && Date.parse(now) >= Date.parse(input.expiresAt)) {
      return 'expired';
    }
    if (input.externalIssuerId !== undefined && !this.issuerRegistry.isIssuerAcceptedByTrustDomain(input.externalIssuerId, input.localTrustDomainId)) {
      return 'issuer_untrusted';
    }
    if (!input.claimedPassportId) {
      return 'invalid';
    }
    return 'valid';
  }

  getPassportPresentation(passportPresentationId: string): ExternalPassportPresentation | undefined {
    return this.store.getPassportPresentation(passportPresentationId);
  }

  /** Re-checks a stored presentation's effective validity at `now` (e.g. once time has advanced past its original snapshot). */
  validatePassportPresentation(presentation: ExternalPassportPresentation | undefined, now: string): PassportPresentationVerification {
    if (!presentation) {
      return { valid: false, status: 'invalid', reasonCode: 'PASSPORT_MISSING', reason: 'No passport presentation was provided.' };
    }
    if (presentation.status === 'revoked') {
      return { valid: false, status: 'revoked', reasonCode: 'PASSPORT_REVOKED', reason: `Passport presentation ${presentation.id} was revoked.` };
    }
    if (presentation.expiresAt !== undefined && Date.parse(now) >= Date.parse(presentation.expiresAt)) {
      return { valid: false, status: 'expired', reasonCode: 'PASSPORT_EXPIRED', reason: `Passport presentation ${presentation.id} expired at ${presentation.expiresAt}.` };
    }
    if (presentation.status === 'issuer_untrusted') {
      return { valid: false, status: 'issuer_untrusted', reasonCode: 'PASSPORT_ISSUER_UNTRUSTED', reason: `Passport presentation ${presentation.id} was issued by an untrusted issuer.` };
    }
    if (presentation.status === 'invalid') {
      return { valid: false, status: 'invalid', reasonCode: 'PASSPORT_INVALID', reason: `Passport presentation ${presentation.id} is invalid.` };
    }
    return { valid: true, status: 'valid', reasonCode: 'PASSPORT_VALID', reason: `Passport presentation ${presentation.id} is valid.` };
  }
}
