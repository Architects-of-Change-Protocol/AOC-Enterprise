import type { RecognitionCapabilityToken } from '../domain/capability-token.js';
import type { Passport } from '../domain/passport.js';
import type { RevocationCheckInput, RevocationCheckResult } from '../domain/revocation.js';
import type { Actor } from '../domain/actor.js';
import type { ActorRegistry } from './actor-registry.js';
import type { CapabilityTokenService } from './capability-token-service.js';
import type { EvidenceLedger } from './evidence-ledger.js';
import type { PassportService } from './passport-service.js';

export class RevocationEngine {
  constructor(
    private readonly actorRegistry: ActorRegistry,
    private readonly passportService: PassportService,
    private readonly capabilityTokenService: CapabilityTokenService,
    private readonly evidenceLedger: EvidenceLedger,
  ) {}

  checkRevocation(input: RevocationCheckInput): RevocationCheckResult {
    const actor = this.actorRegistry.getActor(input.actorId);
    if (actor?.status === 'revoked') {
      return { revoked: true, revokedEntityType: 'actor', revokedEntityId: actor.id };
    }
    if (input.passportId !== undefined) {
      const passport = this.passportService.getPassport(input.passportId);
      if (passport?.status === 'revoked') {
        return { revoked: true, revokedEntityType: 'passport', revokedEntityId: passport.id };
      }
    }
    if (input.capabilityTokenId !== undefined) {
      const capabilityToken = this.capabilityTokenService.getCapabilityToken(input.capabilityTokenId);
      if (capabilityToken?.status === 'revoked') {
        return { revoked: true, revokedEntityType: 'capability_token', revokedEntityId: capabilityToken.id };
      }
    }
    return { revoked: false };
  }

  revokeActor(actorId: string, trustDomainId: string): Actor {
    const actor = this.actorRegistry.updateActorStatus(actorId, 'revoked');
    this.evidenceLedger.recordAuditEvent({
      eventType: 'actor_status_changed',
      actorId,
      trustDomainId,
      payload: { status: 'revoked' },
    });
    return actor;
  }

  revokePassport(passportId: string, trustDomainId: string): Passport {
    const passport = this.passportService.revokePassport(passportId);
    this.evidenceLedger.recordAuditEvent({
      eventType: 'passport_revoked',
      actorId: passport.subjectActorId,
      trustDomainId,
      passportId,
      payload: {},
    });
    return passport;
  }

  revokeCapabilityToken(capabilityTokenId: string, trustDomainId: string): RecognitionCapabilityToken {
    const capabilityToken = this.capabilityTokenService.revokeCapabilityToken(capabilityTokenId);
    this.evidenceLedger.recordAuditEvent({
      eventType: 'capability_token_revoked',
      actorId: capabilityToken.subjectActorId,
      trustDomainId,
      capabilityTokenId,
      payload: {},
    });
    return capabilityToken;
  }
}
