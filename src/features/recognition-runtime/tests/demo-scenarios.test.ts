import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RecognitionDecision } from '../domain/recognition-decision.js';
import { AocRecognitionRuntime, createAocRecognitionRuntime } from '../runtime/aoc-recognition-runtime.js';
import { createRuntimeContext } from '../runtime/runtime-context.js';
import { buildRecognizedAgentScenario } from '../fixtures/recognized-agent.fixture.js';
import { buildRogueAgentScenario } from '../fixtures/rogue-agent.fixture.js';

const DEMO_NOW = '2026-01-01T00:00:00.000Z';

function setUp() {
  const runtime = createAocRecognitionRuntime(createRuntimeContext(DEMO_NOW));
  return { runtime };
}

function assertAudited(runtime: AocRecognitionRuntime, decision: RecognitionDecision) {
  assert.ok(decision.policyResults.length > 0, 'decision must include policyResults');
  assert.ok(decision.auditEventId.length > 0, 'decision must reference an audit event');
  const trail = runtime.getAuditTrail({ requestId: decision.requestId });
  assert.equal(trail.length, 1);
  assert.equal(trail[0]?.eventHash.length, 64, 'eventHash must be a sha256 hex digest');
}

describe('demo scenarios: Datasys Agent Republic', () => {
  it('1. recognized agent can draft a closure email => allow', () => {
    const { runtime } = setUp();
    const scenario = buildRecognizedAgentScenario(runtime);
    const decision = runtime.submitActionRequest(scenario.draftClosureEmailRequest());

    assert.equal(decision.type, 'allow');
    assert.equal(decision.recognized, true);
    assertAudited(runtime, decision);
  });

  it('2. recognized agent cannot send the final invoice => policy_violation', () => {
    const { runtime } = setUp();
    const scenario = buildRecognizedAgentScenario(runtime);
    const decision = runtime.submitActionRequest(scenario.sendFinalInvoiceRequest());

    assert.equal(decision.type, 'policy_violation');
    assert.equal(decision.reasonCode, 'ACTION_PROHIBITED');
    assertAudited(runtime, decision);
  });

  it('3. recognized agent needs approval to send a client follow up => require_human_approval', () => {
    const { runtime } = setUp();
    const scenario = buildRecognizedAgentScenario(runtime);
    const decision = runtime.submitActionRequest(scenario.sendClientFollowUpRequest());

    assert.equal(decision.type, 'require_human_approval');
    assert.deepEqual(decision.requiredApproverActorIds, [scenario.world.victor.id]);
    assertAudited(runtime, decision);
  });

  it('4. unknown external agent tries to read internal documents => unrecognized_actor', () => {
    const { runtime } = setUp();
    const scenario = buildRogueAgentScenario(runtime);
    const decision = runtime.submitActionRequest(scenario.readInternalDocumentsRequest());

    assert.equal(decision.type, 'unrecognized_actor');
    assert.equal(decision.recognized, false);
    assertAudited(runtime, decision);
  });

  it('5. expired capability token => expired', () => {
    const { runtime } = setUp();
    const scenario = buildRecognizedAgentScenario(runtime);
    const decision = runtime.submitActionRequest(scenario.expiredTokenDraftRequest());

    assert.equal(decision.type, 'expired');
    assertAudited(runtime, decision);
  });

  it('6. revoked capability token => revoked', () => {
    const { runtime } = setUp();
    const scenario = buildRecognizedAgentScenario(runtime);
    const decision = runtime.submitActionRequest(scenario.revokedTokenDraftRequest());

    assert.equal(decision.type, 'revoked');
    assertAudited(runtime, decision);
  });

  it('7. agent acts outside its granted project scope => out_of_scope', () => {
    const { runtime } = setUp();
    const scenario = buildRecognizedAgentScenario(runtime);
    const decision = runtime.submitActionRequest(scenario.outOfScopeDraftRequest());

    assert.equal(decision.type, 'out_of_scope');
    assertAudited(runtime, decision);
  });

  it('8. missing required evidence => require_more_evidence', () => {
    const { runtime } = setUp();
    const scenario = buildRecognizedAgentScenario(runtime);
    const decision = runtime.submitActionRequest(scenario.missingEvidenceDraftRequest());

    assert.equal(decision.type, 'require_more_evidence');
    assert.deepEqual(decision.requiredEvidence, ['email_thread', 'project_context']);
    assertAudited(runtime, decision);
  });

  it('9. human delegates valid drafting authority to the agent => allow', () => {
    const { runtime } = setUp();
    const scenario = buildRecognizedAgentScenario(runtime);
    const decision = runtime.submitActionRequest(scenario.delegatedDraftMeetingNotesRequest());

    assert.equal(decision.type, 'allow');
    assertAudited(runtime, decision);
  });

  it('10. agent tries to redelegate authority it cannot redelegate => policy_violation', () => {
    const { runtime } = setUp();
    const scenario = buildRecognizedAgentScenario(runtime);
    const decision = runtime.submitActionRequest(scenario.forgedRedelegationRequest());

    assert.equal(decision.type, 'policy_violation');
    assert.equal(decision.reasonCode, 'DELEGATION_DEPTH_EXCEEDED');
    assertAudited(runtime, decision);
  });

  it('records every decision to the audit trail, in order, as a hash chain', () => {
    const { runtime } = setUp();
    const scenario = buildRecognizedAgentScenario(runtime);
    const before = runtime.getAuditTrail().length;

    const first = runtime.submitActionRequest(scenario.draftClosureEmailRequest());
    const second = runtime.submitActionRequest(scenario.sendFinalInvoiceRequest());

    const trail = runtime.getAuditTrail();
    assert.equal(trail.length, before + 2);
    const firstEvent = trail.find((event) => event.id === first.auditEventId);
    const secondEvent = trail.find((event) => event.id === second.auditEventId);
    assert.equal(secondEvent?.previousHash, firstEvent?.eventHash);
  });
});
