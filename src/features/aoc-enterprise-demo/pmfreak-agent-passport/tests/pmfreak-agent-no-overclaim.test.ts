import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertNoPolicyPackOverclaim } from '../../../policy-pack-foundation/validation/policy-pack-no-overclaim.js';
import { assertNoPMFreakAgentPassportOverclaim, evaluatePMFreakAgentPassportClaimSafety } from '../pmfreak-claim-safety.js';
import { createPMFreakAgentPassportDemoPackManifest } from '../pmfreak-agent-passport-manifest.js';
import { buildAllPMFreakAgentPassportFixtures, buildPMFreakActionAttemptFixture, buildPMFreakAgentPassportRegistryFixture } from '../pmfreak-agent-passport-fixtures.js';
import { resolvePMFreakAgentPassportAction } from '../pmfreak-passport-resolver.js';
import { createPMFreakAgentPassportControlPlaneSummary } from '../pmfreak-control-plane-summary.js';
import { createPMFreakAgentPassportExportMetadata } from '../pmfreak-export-metadata.js';

describe('PMFreak Agent Passport Demo Pack passes the universal no-overclaim harness', () => {
  it('34. no-overclaim passes for the manifest and every demo passport fixture', () => {
    const manifest = createPMFreakAgentPassportDemoPackManifest();
    assertNoPolicyPackOverclaim(manifest);
    assertNoPMFreakAgentPassportOverclaim(manifest);

    const passports = buildAllPMFreakAgentPassportFixtures();
    assertNoPolicyPackOverclaim(passports);
    assertNoPMFreakAgentPassportOverclaim(passports);
  });

  it('no-overclaim passes for a resolution, Control Plane summary, and export metadata', () => {
    const registry = buildPMFreakAgentPassportRegistryFixture();
    const resolution = resolvePMFreakAgentPassportAction(
      buildPMFreakActionAttemptFixture({
        actionAttemptId: 'attempt-no-overclaim',
        agentId: 'pmfreak.agent.billing_readiness',
        passportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
        actionId: 'pmfreak.action.billing.mark_ready',
        projectPhase: 'billing',
        evidenceIds: ['pmfreak.evidence.deliverable_evidence', 'pmfreak.evidence.customer_acceptance_record'],
        approvalIds: ['pmfreak.approval.pm_approval', 'pmfreak.approval.billing_review'],
      }),
      registry,
    );

    assertNoPMFreakAgentPassportOverclaim(resolution);
    assertNoPMFreakAgentPassportOverclaim(createPMFreakAgentPassportControlPlaneSummary(resolution));
    assertNoPMFreakAgentPassportOverclaim(createPMFreakAgentPassportExportMetadata(resolution));
  });

  it('35. unsafe PMFreak claims are caught', () => {
    const unsafeClaims = ['fully trusted agent', 'certified enterprise compliant', 'risk-free execution', 'production authorized', 'invoice-ready certified'];

    for (const claim of unsafeClaims) {
      const result = evaluatePMFreakAgentPassportClaimSafety(`This PMFreak agent is a ${claim}.`);
      assert.equal(result.safe, false, `expected "${claim}" to be flagged unsafe`);
      assert.ok(result.prohibitedPhrasesFound.length > 0);
      assert.throws(() => assertNoPMFreakAgentPassportOverclaim(`This PMFreak agent is a ${claim}.`));
    }
  });

  it('36. safe PMFreak labels do not false-positive', () => {
    const safeText = 'AOC-governed agent; Not production integration; Not compliance certification; Evidence required; Approval required';
    const result = evaluatePMFreakAgentPassportClaimSafety(safeText);

    assert.equal(result.safe, true, JSON.stringify(result.prohibitedPhrasesFound));
    assert.doesNotThrow(() => assertNoPMFreakAgentPassportOverclaim(safeText));
  });
});
