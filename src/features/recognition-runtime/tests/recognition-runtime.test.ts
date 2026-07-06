import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocRecognitionRuntime } from '../runtime/aoc-recognition-runtime.js';
import { createRuntimeContext } from '../runtime/runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

describe('AocRecognitionRuntime end-to-end walkthrough', () => {
  it('supports the full definition-of-done path: register, issue, submit, decide, audit', () => {
    const runtime = createAocRecognitionRuntime(createRuntimeContext(NOW));

    const issuer = runtime.registerActor({ id: 'actor-issuer', type: 'organization', displayName: 'Acme Org' });
    const trustDomain = runtime.createTrustDomain({
      id: 'trust-domain-acme',
      name: 'Acme Trust Domain',
      issuerActorId: issuer.id,
      acceptedIssuerIds: [issuer.id],
      acceptedActorTypes: ['agent'],
    });

    const agent = runtime.registerActor({
      id: 'actor-agent',
      type: 'agent',
      displayName: 'Acme Filing Agent',
      issuerId: issuer.id,
      trustDomainId: trustDomain.id,
    });

    const passport = runtime.issuePassport({
      id: 'passport-agent',
      type: 'agent_passport',
      subjectActorId: agent.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      claims: {},
    });

    const capabilityToken = runtime.issueCapabilityToken({
      id: 'cap-agent-filing',
      subjectActorId: agent.id,
      principalActorId: issuer.id,
      issuerActorId: issuer.id,
      trustDomainId: trustDomain.id,
      capability: 'filing.submit',
      actions: ['file_report'],
      resourceScopes: ['report:Q1'],
      riskLevel: 'low',
    });

    const request = runtime.buildActionRequest({
      actorId: agent.id,
      passportId: passport.id,
      capabilityTokenId: capabilityToken.id,
      trustDomainId: trustDomain.id,
      action: 'file_report',
      resource: 'report:Q1',
    });

    const decision = runtime.submitActionRequest(request);

    assert.equal(decision.type, 'allow');
    assert.equal(decision.recognized, true);
    assert.ok(decision.policyResults.length > 0);

    const trail = runtime.getAuditTrail();
    assert.equal(trail.length, 1);
    assert.equal(trail[0]?.eventType, 'recognition_decision');

    const proof = runtime.exportActionProof(request.id);
    assert.ok(proof);
    assert.equal(proof?.events.length, 1);
    assert.equal(proof?.rootHash, trail[0]?.eventHash);
  });

  it('produces the same deterministic decision and hashes across two independently constructed runtimes', () => {
    function run() {
      const runtime = createAocRecognitionRuntime(createRuntimeContext(NOW));
      const issuer = runtime.registerActor({ id: 'actor-issuer', type: 'organization', displayName: 'Acme Org' });
      const trustDomain = runtime.createTrustDomain({
        id: 'trust-domain-acme',
        name: 'Acme Trust Domain',
        issuerActorId: issuer.id,
        acceptedIssuerIds: [issuer.id],
        acceptedActorTypes: ['agent'],
      });
      const agent = runtime.registerActor({
        id: 'actor-agent',
        type: 'agent',
        displayName: 'Acme Filing Agent',
        issuerId: issuer.id,
        trustDomainId: trustDomain.id,
      });
      const passport = runtime.issuePassport({
        id: 'passport-agent',
        type: 'agent_passport',
        subjectActorId: agent.id,
        issuerActorId: issuer.id,
        trustDomainId: trustDomain.id,
        claims: {},
      });
      const capabilityToken = runtime.issueCapabilityToken({
        id: 'cap-agent-filing',
        subjectActorId: agent.id,
        principalActorId: issuer.id,
        issuerActorId: issuer.id,
        trustDomainId: trustDomain.id,
        capability: 'filing.submit',
        actions: ['file_report'],
        resourceScopes: ['report:Q1'],
        riskLevel: 'low',
      });
      const request = runtime.buildActionRequest({
        actorId: agent.id,
        passportId: passport.id,
        capabilityTokenId: capabilityToken.id,
        trustDomainId: trustDomain.id,
        action: 'file_report',
        resource: 'report:Q1',
      });
      const decision = runtime.submitActionRequest(request);
      return { decision, trail: runtime.getAuditTrail() };
    }

    const first = run();
    const second = run();

    assert.equal(first.decision.type, second.decision.type);
    assert.equal(first.decision.reasonCode, second.decision.reasonCode);
    assert.deepEqual(first.decision.policyResults, second.decision.policyResults);
    assert.equal(first.trail[0]?.eventHash, second.trail[0]?.eventHash);
  });
});
