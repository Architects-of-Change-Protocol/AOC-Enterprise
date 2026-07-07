import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { completeTrustedPartnerHandshake, buildTrustedPartnerReadGuardInput } from '../fixtures/external-agent-action.fixture.js';
import { buildDatasysEnforcementFixture } from '../fixtures/datasys-enforcement.fixture.js';

describe('External Agent Handshake integration', () => {
  it('1. an external agent without a completed handshake is blocked', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(
      {
        actorId: 'external-agent-trusted-partner-research-agent',
        trustDomainId: fixture.world.trustDomainId,
        action: 'read_project_summary',
        resourceScope: 'project:HMP-14665',
        sideEffectType: 'read',
        metadata: { passportId: 'passport-trusted-partner', capabilityTokenId: 'cap-trusted-partner-read' },
      },
      () => ((ran = true), 'summary'),
    );
    assert.equal(outcome.decision.allowedToExecute, false);
    assert.equal(ran, false);
  });

  it('2. an external agent with a valid visa/ingress grant executes', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const handshake = completeTrustedPartnerHandshake(fixture);
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildTrustedPartnerReadGuardInput(handshake), () => ((ran = true), 'summary'));
    assert.equal(outcome.decision.type, 'execute_allowed');
    assert.equal(ran, true);
  });

  it('3. an external agent with an expired visa is blocked', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const handshake = completeTrustedPartnerHandshake(fixture);
    if (handshake.visa) {
      fixture.handshakeRuntime.expireAgentVisa(handshake.visa.id);
    }
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildTrustedPartnerReadGuardInput(handshake), () => ((ran = true), 'summary'));
    assert.equal(outcome.decision.allowedToExecute, false);
    assert.equal(ran, false);
  });

  it('4. an external agent with a revoked visa is blocked', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const handshake = completeTrustedPartnerHandshake(fixture);
    if (handshake.visa) {
      fixture.handshakeRuntime.revokeAgentVisa(handshake.visa.id, 'actor-datasys', 'Compliance hold.');
    }
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildTrustedPartnerReadGuardInput(handshake), () => ((ran = true), 'summary'));
    assert.equal(outcome.decision.allowedToExecute, false);
    assert.equal(ran, false);
  });

  it('5. an external agent with a scope-denied ingress is blocked', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const handshake = completeTrustedPartnerHandshake(fixture);
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(
      buildTrustedPartnerReadGuardInput(handshake, { resourceScope: 'project:GCH-15992' }),
      () => ((ran = true), 'summary'),
    );
    assert.equal(outcome.decision.allowedToExecute, false);
    assert.equal(ran, false);
  });

  it('6. handshakeProofId is included in the EnforcementProof when available', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const handshake = completeTrustedPartnerHandshake(fixture);
    const outcome = await fixture.aocGuard.enforce(buildTrustedPartnerReadGuardInput(handshake), () => 'summary');
    assert.ok(outcome.proof);
    assert.equal(outcome.decision.handshakeProofId, handshake.proof?.id);
  });
});
