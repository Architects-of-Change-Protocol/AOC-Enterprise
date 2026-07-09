import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalizeJson,
  createHashUrn,
  createTestSigner,
  verifyAgentPassport,
  verifyAgentRuntimeSeal,
  isValidAgentPassportId,
} from '@aoc-enterprise/agent-governance';

import { issuePMFreakAgentPassport } from '../src/services/pmfreak-agent-passport-issuance-service.js';
import { PMFREAK_PASSPORT_SCENARIO_FIXTURES } from '../src/fixtures/pmfreak-passport-scenario-fixtures.js';

const signer = createTestSigner({ keyId: 'pmfreak-test-key', issuer: 'PMFreak-Test-Issuer' });

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

describe('PMFreak agent passport issuance', () => {
  for (const fixture of PMFREAK_PASSPORT_SCENARIO_FIXTURES) {
    describe(`role: ${fixture.role}`, () => {
      it('issues a valid, verifiable passport with a runtime seal', async () => {
        const { bundle, role } = await issuePMFreakAgentPassport(fixture.role, fixture.enrollmentOptions, {
          signer,
          issuer: 'PMFreak-Test-Issuer',
        });

        assert.equal(role, fixture.role);
        assert.ok(isValidAgentPassportId(bundle.passport.passportId));
        assert.equal(bundle.passport.status, 'issued');
        assert.equal(bundle.passport.governanceLevel, 'constitutional');
        assert.equal(bundle.constitution.passportId, bundle.passport.passportId);
        assert.equal(bundle.policyManifest.passportId, bundle.passport.passportId);

        // Hash cores are internally consistent, matching agent-governance's own convention.
        const expectedConstitutionHash = createHashUrn(canonicalizeJson(bundle.constitution));
        assert.equal(bundle.passport.constitutionHash, expectedConstitutionHash);
        const expectedManifestHash = createHashUrn(canonicalizeJson(bundle.policyManifest));
        assert.equal(bundle.passport.policyManifestHash, expectedManifestHash);

        const passportResult = await verifyAgentPassport(bundle.passport, { signer });
        assert.ok(passportResult.valid, `Expected valid passport but got: ${JSON.stringify(passportResult.reasonCodes)}`);

        const sealResult = await verifyAgentRuntimeSeal(
          bundle.runtimeSeal,
          bundle.passport,
          { signer },
          { allowIssued: true },
        );
        assert.ok(sealResult.valid, `Expected valid runtime seal but got: ${JSON.stringify(sealResult.reasonCodes)}`);
      });

      it('emits the expected lifecycle events', async () => {
        const { bundle } = await issuePMFreakAgentPassport(fixture.role, fixture.enrollmentOptions, { signer });
        const types = bundle.events.map((event) => event.type);
        assert.ok(types.includes('agent_passport.drafted'));
        assert.ok(types.includes('agent_passport.issued'));
        assert.ok(types.includes('agent_passport.runtime_seal_created'));
        for (const event of bundle.events) {
          assert.equal(event.passportId, bundle.passport.passportId);
        }
      });
    });
  }

  it('persists the issued bundle when a store is supplied', async () => {
    const { createInMemoryAgentPassportStore } = await import('@aoc-enterprise/agent-governance');
    const store = createInMemoryAgentPassportStore();
    const fixture = must(PMFREAK_PASSPORT_SCENARIO_FIXTURES[0], 'expected at least one scenario fixture');
    const { bundle } = await issuePMFreakAgentPassport(fixture.role, fixture.enrollmentOptions, { signer, store });

    const stored = must(await store.getPassportBundle(bundle.passport.passportId), 'expected stored bundle');
    assert.equal(stored.passport.passportId, bundle.passport.passportId);

    const events = await store.listPassportEvents(bundle.passport.passportId);
    assert.equal(events.length, bundle.events.length);
  });

  it('defaults to createTestSigner when no signer is supplied', async () => {
    const fixture = must(PMFREAK_PASSPORT_SCENARIO_FIXTURES[1], 'expected a second scenario fixture');
    const { bundle } = await issuePMFreakAgentPassport(fixture.role, fixture.enrollmentOptions);
    assert.ok(bundle.passport.signature.signature.length > 0);
  });
});
