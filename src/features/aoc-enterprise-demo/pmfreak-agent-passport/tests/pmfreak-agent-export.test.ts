import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePMFreakAgentPassportAction } from '../pmfreak-passport-resolver.js';
import { createPMFreakAgentPassportExportMetadata } from '../pmfreak-export-metadata.js';
import { buildPMFreakActionAttemptFixture, buildPMFreakAgentPassportRegistryFixture } from '../pmfreak-agent-passport-fixtures.js';
import { assertNoPolicyPackOverclaim } from '../../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID } from '../pmfreak-agent-passport-constants.js';

const UNSAFE_PHRASES = ['legally approved', 'compliance passed', 'guaranteed safe', 'production authorized', 'invoice-ready certified', 'contractually compliant'];

describe('PMFreak Agent Passport export metadata', () => {
  it('33. export metadata is safe and carries the required audit fields', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-export-metadata',
        agentId: 'pmfreak.agent.billing_readiness',
        passportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
        actionId: 'pmfreak.action.billing.mark_ready',
        projectPhase: 'billing',
        evidenceIds: ['pmfreak.evidence.deliverable_evidence'],
      }),
      registry,
    );

    const metadata = createPMFreakAgentPassportExportMetadata(resolution);

    assert.equal(metadata.packId, PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID);
    assert.equal(metadata.passportId, resolution.passportId);
    assert.equal(metadata.decision, resolution.decision);
    assert.deepEqual(metadata.missingEvidenceIds, resolution.missingEvidenceIds);
    assert.deepEqual(metadata.missingApprovalIds, resolution.missingApprovalIds);
    assert.equal(metadata.safeFraming.notLegalAdvice, true);
    assert.equal(metadata.safeFraming.notComplianceCertification, true);
    assert.equal(metadata.safeFraming.noCompletenessClaim, true);
    assert.equal(metadata.safeFraming.demoOnly, true);

    assertNoPolicyPackOverclaim(metadata);
    const rendered = JSON.stringify(metadata).toLowerCase();
    for (const phrase of UNSAFE_PHRASES) assert.ok(!rendered.includes(phrase), `must not include "${phrase}"`);
  });

  it('deterministically derives the exportId from the actionAttemptId', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const input = buildPMFreakActionAttemptFixture({
      actionAttemptId: 'attempt-deterministic-export-id',
      agentId: 'pmfreak.agent.planning',
      passportId: 'aoc.passport.pmfreak.planning.demo.v1',
      actionId: 'pmfreak.action.risk.create_draft',
    });

    const first = createPMFreakAgentPassportExportMetadata(resolvePMFreakAgentPassportAction(input, registry));
    const second = createPMFreakAgentPassportExportMetadata(resolvePMFreakAgentPassportAction(input, registry));

    assert.equal(first.exportId, second.exportId);
    assert.ok(first.exportId.includes('attempt-deterministic-export-id'));
  });
});
