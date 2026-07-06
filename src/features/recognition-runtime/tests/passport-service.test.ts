import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ActorRegistry } from '../services/actor-registry.js';
import { PassportService } from '../services/passport-service.js';
import { TrustDomainService } from '../services/trust-domain-service.js';
import { createManualClock, createSequentialIdGenerator } from '../runtime/runtime-context.js';
import { ActorNotFoundError, PassportNotFoundError, TrustDomainNotFoundError } from '../runtime/runtime-errors.js';

const NOW = '2026-01-01T00:00:00.000Z';

function assertThrowsInstance(fn: () => void, errorClass: new (...args: never[]) => Error): void {
  try {
    fn();
    assert.ok(false, 'expected function to throw');
  } catch (error) {
    assert.ok(error instanceof errorClass, `expected error to be an instance of ${errorClass.name}`);
  }
}

function setUp() {
  const clock = createManualClock(NOW);
  const ctx = { clock, idGenerator: createSequentialIdGenerator() };
  const actorRegistry = new ActorRegistry(ctx);
  const trustDomainService = new TrustDomainService(ctx);
  const passportService = new PassportService(ctx, actorRegistry, trustDomainService);

  const issuer = actorRegistry.registerActor({ type: 'organization', displayName: 'Issuer Org' });
  const trustDomain = trustDomainService.createTrustDomain({
    name: 'Test Domain',
    issuerActorId: issuer.id,
    acceptedIssuerIds: [issuer.id],
    acceptedActorTypes: ['human'],
  });
  const subject = actorRegistry.registerActor({ type: 'human', displayName: 'Subject Human', issuerId: issuer.id });

  return { clock, actorRegistry, trustDomainService, passportService, issuer, trustDomain, subject };
}

describe('PassportService', () => {
  it('issues a valid passport for a known actor and trust domain', () => {
    const { passportService, subject, issuer, trustDomain } = setUp();

    const passport = passportService.issuePassport({
      type: 'human_passport',
      subjectActorId: subject.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      claims: { role: 'tester' },
    });

    assert.equal(passport.status, 'valid');
    assert.equal(passport.subjectActorId, subject.id);
    assert.ok(passport.proof);

    const result = passportService.verifyPassport(passport.id);
    assert.equal(result.valid, true);
  });

  it('throws when issuing a passport for an unknown actor', () => {
    const { passportService, issuer, trustDomain } = setUp();
    assertThrowsInstance(() => {
      passportService.issuePassport({
        type: 'human_passport',
        subjectActorId: 'actor-does-not-exist',
        issuerActorId: issuer.id,
        trustDomainId: trustDomain.id,
      });
    }, ActorNotFoundError);
  });

  it('throws when issuing a passport for an unknown trust domain', () => {
    const { passportService, issuer, subject } = setUp();
    assertThrowsInstance(() => {
      passportService.issuePassport({
        type: 'human_passport',
        subjectActorId: subject.id,
        issuerActorId: issuer.id,
        trustDomainId: 'trust-domain-does-not-exist',
      });
    }, TrustDomainNotFoundError);
  });

  it('reports PASSPORT_NOT_FOUND for an unknown passport id', () => {
    const { passportService } = setUp();
    const result = passportService.verifyPassport('passport-does-not-exist');
    assert.equal(result.valid, false);
    assert.equal(result.reasonCode, 'PASSPORT_NOT_FOUND');
  });

  it('reports expiry once the clock passes expiresAt', () => {
    const { clock, passportService, subject, issuer, trustDomain } = setUp();
    const passport = passportService.issuePassport({
      type: 'human_passport',
      subjectActorId: subject.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      expiresAt: '2026-06-01T00:00:00.000Z',
    });

    assert.equal(passportService.verifyPassport(passport.id).valid, true);

    clock.advance(365 * 24 * 60 * 60 * 1000);

    const result = passportService.verifyPassport(passport.id);
    assert.equal(result.valid, false);
    assert.equal(result.reasonCode, 'PASSPORT_EXPIRED');
  });

  it('suspends and revokes a passport', () => {
    const { passportService, subject, issuer, trustDomain } = setUp();
    const passport = passportService.issuePassport({
      type: 'human_passport',
      subjectActorId: subject.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
    });

    const suspended = passportService.suspendPassport(passport.id);
    assert.equal(suspended.status, 'suspended');
    assert.equal(passportService.verifyPassport(passport.id).reasonCode, 'PASSPORT_SUSPENDED');

    const revoked = passportService.revokePassport(passport.id);
    assert.equal(revoked.status, 'revoked');
    assert.equal(passportService.verifyPassport(passport.id).reasonCode, 'PASSPORT_REVOKED');
  });

  it('throws PassportNotFoundError when revoking an unknown passport', () => {
    const { passportService } = setUp();
    assertThrowsInstance(() => passportService.revokePassport('passport-does-not-exist'), PassportNotFoundError);
  });
});
