import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAocPMFreakGovernanceIntakeError } from '../aoc-pmfreak-governance-intake-errors.js';

describe('Soberanía PMFreak Governance Request Intake -- error model', () => {
  it('builds a safe, structured error', () => {
    const error = createAocPMFreakGovernanceIntakeError('invalid_request', 'The request was missing a requestId.');
    assert.equal(error.code, 'invalid_request');
    assert.equal(error.message, 'The request was missing a requestId.');
    assert.equal(error.safe, true);
    assert.equal(error.details, undefined);
  });

  it('carries optional details when provided', () => {
    const error = createAocPMFreakGovernanceIntakeError('unsupported_runtime', 'Evaluation mode is unsupported.', { evaluationMode: 'unsupported' });
    assert.deepEqual(error.details, { evaluationMode: 'unsupported' });
  });

  it('every error code produces a valid error object', () => {
    const codes = ['invalid_config', 'invalid_request', 'evaluation_failed', 'mutation_not_allowed', 'unsafe_claim', 'redaction_failed', 'unsupported_runtime', 'unknown_error'] as const;
    for (const code of codes) {
      const error = createAocPMFreakGovernanceIntakeError(code, `message for ${code}`);
      assert.equal(error.code, code);
      assert.equal(error.safe, true);
    }
  });
});
