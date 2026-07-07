import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterpriseDemoSuite } from '../services/index.js';
import { executorSafetyAssertion } from '../scenarios/assertion-helpers.js';
import {
  evaluateInternalAgentAllowedAssertions,
  executeInternalAgentAllowedScenario,
  INTERNAL_AGENT_ALLOWED_SCENARIO,
} from '../scenarios/internal-agent-allowed.scenario.js';
import type { ScenarioExecutionResult } from '../scenarios/scenario-runtime-types.js';

describe('DemoAssertionService', () => {
  it('validates an execute_allowed (executed) outcome', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('internal-agent-allowed');
    assert.equal(run.outcome!.status, 'executed');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });

  it('validates a blocked outcome', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('adapter-denies-dangerous-action');
    assert.equal(run.outcome!.status, 'blocked');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });

  it('validates an approval_required outcome', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('approval-required-block');
    assert.equal(run.outcome!.status, 'approval_required');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });

  it('validates an evidence_required outcome', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('evidence-required-block');
    assert.equal(run.outcome!.status, 'evidence_required');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });

  it('validates a duplicate_suppressed outcome', async () => {
    const suite = createEnterpriseDemoSuite();
    const run = await suite.runner.runScenario('idempotency-duplicate-suppressed');
    assert.equal(run.outcome!.status, 'duplicate_suppressed');
    assert.ok(run.assertions.every((assertion) => assertion.passed));
  });

  it('validates executor safety when the executor ran the expected number of times', () => {
    const result = executorSafetyAssertion('internal-agent-allowed', 'test-assertion', 'expected 1', 1, 1);
    assert.equal(result.passed, true);
  });

  it('fails executor safety when the executor ran an unexpected number of times', () => {
    const result = executorSafetyAssertion('internal-agent-allowed', 'test-assertion', 'expected 0', 0, 1);
    assert.equal(result.passed, false);
    assert.equal(result.reasonCode, 'EXECUTOR_SAFETY_VIOLATION');
  });

  it('fails the proof-chain assertion when a required proof source is missing', async () => {
    const suite = createEnterpriseDemoSuite();
    const world = suite.orchestrator.createWorld();
    const real = await executeInternalAgentAllowedScenario(world, { now: () => '2026-01-01T00:00:00.000Z' });

    const withMissingAuthorityProof: ScenarioExecutionResult = {
      ...real,
      enforcementOutcomes: real.enforcementOutcomes.map((outcome) => {
        const { authorityProofId: _omitted, ...decisionWithoutAuthorityProof } = outcome.decision;
        return { ...outcome, decision: decisionWithoutAuthorityProof };
      }),
      outcome: (() => {
        const { authorityProofId: _omitted, ...outcomeWithoutAuthorityProof } = real.outcome;
        return outcomeWithoutAuthorityProof;
      })(),
    };

    const assertions = evaluateInternalAgentAllowedAssertions(INTERNAL_AGENT_ALLOWED_SCENARIO, withMissingAuthorityProof);
    const proofChainAssertion = assertions.find((assertion) => assertion.type === 'proof_chain');
    if (proofChainAssertion === undefined) {
      throw new Error('Expected internal-agent-allowed to produce a proof_chain assertion.');
    }
    assert.equal(proofChainAssertion.passed, false);
    assert.equal(proofChainAssertion.reasonCode, 'PROOF_CHAIN_SOURCES_MISSING');
  });
});
