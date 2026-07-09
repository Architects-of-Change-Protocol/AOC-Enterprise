import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPMFreakPassportAttestation } from '../src/services/pmfreak-passport-attestation-service.js';
import type { CreatePMFreakPassportAttestationInput } from '../src/services/pmfreak-passport-attestation-service.js';

const BASE_INPUT: CreatePMFreakPassportAttestationInput = {
  passportId: 'AOC-AGT-2026-US-ABCDEF',
  attestedAt: '2026-06-25T12:00:00.000Z',
  attestorRole: 'security_reviewed',
  validationStatus: 'security_reviewed',
  rationale: ['Reviewed passport policy manifest tool access scope against security baseline.'],
  subject: { passportId: 'AOC-AGT-2026-US-ABCDEF', passportHash: 'sha256:deadbeef' },
};

describe('PMFreak passport attestation', () => {
  it('same input produces the same attestationId and subjectHash', () => {
    const a = createPMFreakPassportAttestation(BASE_INPUT);
    const b = createPMFreakPassportAttestation({ ...BASE_INPUT });
    assert.equal(a.attestationId, b.attestationId);
    assert.equal(a.subjectHash, b.subjectHash);
    assert.deepEqual(a, b);
  });

  it('a different subject payload produces a different subjectHash and attestationId', () => {
    const a = createPMFreakPassportAttestation(BASE_INPUT);
    const b = createPMFreakPassportAttestation({
      ...BASE_INPUT,
      subject: { passportId: 'AOC-AGT-2026-US-ABCDEF', passportHash: 'sha256:cafebabe' },
    });
    assert.notEqual(a.subjectHash, b.subjectHash);
    assert.notEqual(a.attestationId, b.attestationId);
  });

  it('a different attestedAt produces a different attestationId', () => {
    const a = createPMFreakPassportAttestation(BASE_INPUT);
    const b = createPMFreakPassportAttestation({ ...BASE_INPUT, attestedAt: '2026-06-26T12:00:00.000Z' });
    assert.notEqual(a.attestationId, b.attestationId);
  });

  it('a different attestorRole or validationStatus produces a different attestationId', () => {
    const a = createPMFreakPassportAttestation(BASE_INPUT);
    const b = createPMFreakPassportAttestation({ ...BASE_INPUT, attestorRole: 'compliance_reviewed' });
    const c = createPMFreakPassportAttestation({ ...BASE_INPUT, validationStatus: 'counsel_reviewed' });
    assert.notEqual(a.attestationId, b.attestationId);
    assert.notEqual(a.attestationId, c.attestationId);
  });

  it('subjectHash is independent of object key order (canonical JSON)', () => {
    const a = createPMFreakPassportAttestation({
      ...BASE_INPUT,
      subject: { z: 1, a: 2 },
    });
    const b = createPMFreakPassportAttestation({
      ...BASE_INPUT,
      subject: { a: 2, z: 1 },
    });
    assert.equal(a.subjectHash, b.subjectHash);
  });

  it('defaults attestationVersion to 1', () => {
    const a = createPMFreakPassportAttestation(BASE_INPUT);
    assert.equal(a.attestationVersion, 1);
  });

  it('honors an explicit attestationVersion', () => {
    const a = createPMFreakPassportAttestation({ ...BASE_INPUT, attestationVersion: 2 });
    assert.equal(a.attestationVersion, 2);
  });

  it('carries through passportId, attestedAt, attestorRole, validationStatus, and rationale verbatim', () => {
    const a = createPMFreakPassportAttestation(BASE_INPUT);
    assert.equal(a.passportId, BASE_INPUT.passportId);
    assert.equal(a.attestedAt, BASE_INPUT.attestedAt);
    assert.equal(a.attestorRole, BASE_INPUT.attestorRole);
    assert.equal(a.validationStatus, BASE_INPUT.validationStatus);
    assert.deepEqual(a.rationale, BASE_INPUT.rationale);
  });

  it('attestationId is prefixed and subjectHash is a sha256 urn', () => {
    const a = createPMFreakPassportAttestation(BASE_INPUT);
    assert.ok(a.attestationId.startsWith('PMF-ATT-'));
    assert.ok(a.subjectHash.startsWith('sha256:'));
  });
});
