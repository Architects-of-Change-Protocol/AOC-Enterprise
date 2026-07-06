import { createProof } from '../domain/proof.js';
import type { Passport, PassportType } from '../domain/passport.js';
import type { RuntimeContext } from '../runtime/runtime-context.js';
import { ActorNotFoundError, PassportNotFoundError, TrustDomainNotFoundError } from '../runtime/runtime-errors.js';
import type { ActorRegistry } from './actor-registry.js';
import type { TrustDomainService } from './trust-domain-service.js';

export interface IssuePassportInput {
  readonly id?: string;
  readonly type: PassportType;
  readonly subjectActorId: string;
  readonly issuerActorId: string;
  readonly trustDomainId: string;
  readonly jurisdiction?: string;
  readonly expiresAt?: string;
  readonly claims?: Readonly<Record<string, string>>;
}

export interface PassportVerificationResult {
  readonly valid: boolean;
  readonly passport?: Passport;
  readonly reasonCode: string;
  readonly reason: string;
}

export class PassportService {
  private readonly passports = new Map<string, Passport>();

  constructor(
    private readonly ctx: RuntimeContext,
    private readonly actorRegistry: ActorRegistry,
    private readonly trustDomainService: TrustDomainService,
  ) {}

  issuePassport(input: IssuePassportInput): Passport {
    if (!this.actorRegistry.getActor(input.subjectActorId)) {
      throw new ActorNotFoundError(input.subjectActorId);
    }
    if (!this.trustDomainService.getTrustDomain(input.trustDomainId)) {
      throw new TrustDomainNotFoundError(input.trustDomainId);
    }
    const id = input.id ?? this.ctx.idGenerator.next('passport');
    const issuedAt = this.ctx.clock.now();
    const claims = input.claims ?? {};
    const passport: Passport = {
      id,
      type: input.type,
      subjectActorId: input.subjectActorId,
      issuerActorId: input.issuerActorId,
      trustDomainId: input.trustDomainId,
      status: 'valid',
      issuedAt,
      claims,
      proof: createProof({
        signedBy: input.issuerActorId,
        signedAt: issuedAt,
        payload: { id, subjectActorId: input.subjectActorId, trustDomainId: input.trustDomainId, claims },
      }),
      ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    };
    this.passports.set(passport.id, passport);
    return passport;
  }

  getPassport(passportId: string): Passport | undefined {
    return this.passports.get(passportId);
  }

  verifyPassport(passportId: string): PassportVerificationResult {
    const passport = this.passports.get(passportId);
    if (!passport) {
      return { valid: false, reasonCode: 'PASSPORT_NOT_FOUND', reason: `No passport found for id ${passportId}.` };
    }
    if (passport.status === 'revoked') {
      return { valid: false, passport, reasonCode: 'PASSPORT_REVOKED', reason: 'Passport has been revoked.' };
    }
    if (passport.status === 'suspended') {
      return { valid: false, passport, reasonCode: 'PASSPORT_SUSPENDED', reason: 'Passport is suspended.' };
    }
    if (passport.expiresAt !== undefined && passport.expiresAt <= this.ctx.clock.now()) {
      return { valid: false, passport, reasonCode: 'PASSPORT_EXPIRED', reason: 'Passport has expired.' };
    }
    return { valid: true, passport, reasonCode: 'PASSPORT_VALID', reason: 'Passport is valid.' };
  }

  suspendPassport(passportId: string): Passport {
    return this.transitionStatus(passportId, 'suspended');
  }

  revokePassport(passportId: string): Passport {
    return this.transitionStatus(passportId, 'revoked');
  }

  private transitionStatus(passportId: string, status: Passport['status']): Passport {
    const existing = this.passports.get(passportId);
    if (!existing) {
      throw new PassportNotFoundError(passportId);
    }
    const updated: Passport = { ...existing, status };
    this.passports.set(passportId, updated);
    return updated;
  }
}
