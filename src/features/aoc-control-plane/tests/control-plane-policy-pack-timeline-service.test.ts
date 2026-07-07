import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildControlPlaneDemoFixture } from '../fixtures/control-plane-demo.fixture.js';
import { buildControlPlaneReadModel } from '../services/control-plane-read-model-service.js';
import { buildPolicyPackTimeline } from '../services/control-plane-policy-pack-timeline-service.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

describe('ControlPlanePolicyPackTimelineService', () => {
  let model: AocControlPlaneReadModel;

  before(async () => {
    model = buildControlPlaneReadModel(await buildControlPlaneDemoFixture());
  });

  it('1. maps policy_pack_registered event', () => {
    const timeline = buildPolicyPackTimeline({ events: model.policyPacks.events, enforcementLinks: model.policyPacks.enforcementLinks, enforcementDecisions: model.enforcement.decisions });
    assert.ok(timeline.some((item) => item.type === 'policy_pack_registered' && item.source === 'policy'));
  });

  it('2. maps policy_pack_version_activated event', () => {
    const timeline = buildPolicyPackTimeline({ events: model.policyPacks.events, enforcementLinks: model.policyPacks.enforcementLinks, enforcementDecisions: model.enforcement.decisions });
    assert.ok(timeline.some((item) => item.type === 'policy_pack_version_activated'));
  });

  it('3. maps policy_evaluation_started event', () => {
    const timeline = buildPolicyPackTimeline({ events: model.policyPacks.events, enforcementLinks: model.policyPacks.enforcementLinks, enforcementDecisions: model.enforcement.decisions });
    assert.ok(timeline.some((item) => item.type === 'policy_evaluation_started'));
  });

  it('4. maps policy_rule_matched event', () => {
    const timeline = buildPolicyPackTimeline({ events: model.policyPacks.events, enforcementLinks: model.policyPacks.enforcementLinks, enforcementDecisions: model.enforcement.decisions });
    assert.ok(timeline.some((item) => item.type === 'policy_rule_matched'));
  });

  it('5. maps policy_decision_created event', () => {
    const timeline = buildPolicyPackTimeline({ events: model.policyPacks.events, enforcementLinks: model.policyPacks.enforcementLinks, enforcementDecisions: model.enforcement.decisions });
    assert.ok(timeline.some((item) => item.type === 'policy_decision_created'));
  });

  it('6. maps policy_proof_created event', () => {
    const timeline = buildPolicyPackTimeline({ events: model.policyPacks.events, enforcementLinks: model.policyPacks.enforcementLinks, enforcementDecisions: model.enforcement.decisions });
    assert.ok(timeline.some((item) => item.type === 'policy_proof_created'));
  });

  it('7. maps policy-blocked enforcement decision', () => {
    const timeline = buildPolicyPackTimeline({ events: model.policyPacks.events, enforcementLinks: model.policyPacks.enforcementLinks, enforcementDecisions: model.enforcement.decisions });
    const blocked = timeline.filter((item) => item.type === 'policy_pack_blocked_execution');
    assert.ok(blocked.length > 0);
    assert.ok(blocked.every((item) => item.status === 'danger'));
  });

  it('8. includes policy proof references', () => {
    const timeline = buildPolicyPackTimeline({ events: model.policyPacks.events, enforcementLinks: model.policyPacks.enforcementLinks, enforcementDecisions: model.enforcement.decisions });
    assert.ok(timeline.some((item) => item.relatedProofId !== undefined));
  });

  it('9. deterministic sorting', () => {
    const first = buildPolicyPackTimeline({ events: model.policyPacks.events, enforcementLinks: model.policyPacks.enforcementLinks, enforcementDecisions: model.enforcement.decisions });
    const second = buildPolicyPackTimeline({ events: model.policyPacks.events, enforcementLinks: model.policyPacks.enforcementLinks, enforcementDecisions: model.enforcement.decisions });
    assert.deepEqual(first, second);
    for (let i = 1; i < first.length; i++) {
      assert.ok(first[i - 1]!.timestamp >= first[i]!.timestamp, 'timeline must be sorted newest-first');
    }
  });
});
