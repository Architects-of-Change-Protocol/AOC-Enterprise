import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { redactAocPMFreakGovernanceRequest, redactAocPMFreakGovernanceRequestValue } from '../aoc-pmfreak-governance-request-redaction.js';
import { demoAocPMFreakBillingAllowedRequest } from '../aoc-pmfreak-governance-intake-fixtures.js';
import type { AocPMFreakGovernanceRequest } from '../aoc-pmfreak-governance-intake-types.js';

function buildRequestWithSensitiveMetadata(): AocPMFreakGovernanceRequest {
  return {
    ...demoAocPMFreakBillingAllowedRequest,
    actionAttempt: {
      ...demoAocPMFreakBillingAllowedRequest.actionAttempt,
      actionDescription: 'Contact pm@example.com with Bearer sk-fake-token-12345 for the connection string postgres://user:pass@host:5432/db',
      metadata: {
        contact_email: 'agent@example.com',
        api_key: 'sk-fake-secret-value',
        note: 'nothing sensitive here',
      },
    },
  };
}

describe('Soberanía PMFreak Governance Request Intake -- redaction', () => {
  it('mode "none" returns the value unchanged', () => {
    const request = buildRequestWithSensitiveMetadata();
    const redacted = redactAocPMFreakGovernanceRequest(request, 'none');
    assert.deepEqual(redacted, request);
  });

  it('safe_demo mode redacts emails, bearer tokens, and connection strings', () => {
    const request = buildRequestWithSensitiveMetadata();
    const redacted = redactAocPMFreakGovernanceRequest(request, 'safe_demo');

    assert.ok(!redacted.actionAttempt.actionDescription?.includes('pm@example.com'));
    assert.ok(!redacted.actionAttempt.actionDescription?.includes('sk-fake-token-12345'));
    assert.ok(!redacted.actionAttempt.actionDescription?.includes('postgres://user:pass@host:5432/db'));
    assert.ok(redacted.actionAttempt.actionDescription?.includes('[redacted-email]'));
  });

  it('safe_demo mode redacts secret-shaped key/value pairs in metadata', () => {
    const request = buildRequestWithSensitiveMetadata();
    const redacted = redactAocPMFreakGovernanceRequest(request, 'safe_demo');
    const metadata = redacted.actionAttempt.metadata as Record<string, unknown>;

    assert.equal(metadata.contact_email, '[redacted-email]');
    assert.ok(String(metadata.api_key).includes('[redacted]'));
    assert.equal(metadata.note, 'nothing sensitive here');
  });

  it('strict mode clears the metadata payload entirely', () => {
    const request = buildRequestWithSensitiveMetadata();
    const redacted = redactAocPMFreakGovernanceRequest(request, 'strict');

    assert.deepEqual(redacted.actionAttempt.metadata, {});
  });

  it('redactAocPMFreakGovernanceRequestValue recurses through arrays and nested objects', () => {
    const value = { a: 'reach me at agent@example.com', b: ['token=Bearer sk-fake-abc', { c: 'nested@example.com' }] };
    const redacted = redactAocPMFreakGovernanceRequestValue(value, 'safe_demo') as Record<string, unknown>;

    assert.ok(String(redacted.a).includes('[redacted-email]'));
    const nestedArray = redacted.b as unknown[];
    assert.ok(String(nestedArray[0]).includes('[redacted-token]') || String(nestedArray[0]).includes('[redacted]'));
    assert.ok(String((nestedArray[1] as Record<string, unknown>).c).includes('[redacted-email]'));
  });

  it('never mutates the original request', () => {
    const request = buildRequestWithSensitiveMetadata();
    const before = JSON.parse(JSON.stringify(request)) as unknown;
    redactAocPMFreakGovernanceRequest(request, 'strict');
    assert.deepEqual(request, before);
  });
});
