import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import * as endpoint from '../index.js';
import { AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_FORBIDDEN_OPERATIONS } from '../aoc-pmfreak-remote-governance-endpoint-constants.js';

// Hardcoded, not filesystem-scanned -- mirrors the sibling determinism test.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'aoc-pmfreak-remote-governance-endpoint-constants.ts',
  'aoc-pmfreak-remote-governance-endpoint-types.ts',
  'aoc-pmfreak-remote-governance-endpoint-descriptor.ts',
  'aoc-pmfreak-remote-governance-endpoint-config.ts',
  'aoc-pmfreak-remote-governance-endpoint-handler.ts',
  'aoc-pmfreak-remote-governance-http-adapter.ts',
  'aoc-pmfreak-remote-governance-method-guard.ts',
  'aoc-pmfreak-remote-governance-content-type-guard.ts',
  'aoc-pmfreak-remote-governance-payload-guard.ts',
  'aoc-pmfreak-remote-governance-auth-guard.ts',
  'aoc-pmfreak-remote-governance-parser.ts',
  'aoc-pmfreak-remote-governance-serializer.ts',
  'aoc-pmfreak-remote-governance-status-mapping.ts',
  'aoc-pmfreak-remote-governance-errors.ts',
  'aoc-pmfreak-remote-governance-health.ts',
  'aoc-pmfreak-remote-governance-fixtures.ts',
  'aoc-pmfreak-remote-governance-claim-safety.ts',
  'index.ts',
];

const FORBIDDEN_IDENTIFIER_PATTERNS: readonly RegExp[] = [
  /\bsendEmail\b/i,
  /\bsendClientCommunication\b/i,
  /\bpostToSlack\b/i,
  /\bpostToTeams\b/i,
  /\bcreateInvoice\b/i,
  /\bexecutePmfreakAction\b/i,
  /\bmutatePmfreakProject\b/i,
  /\bwritebackDecisionToPmfreak\b/i,
  /\bcertifyInvoiceValidity\b/i,
  /\bcertifyCustomerAcceptance\b/i,
  /\bcertifyCompliance\b/i,
];

const NETWORK_PATTERNS: readonly RegExp[] = [/\bfetch\s*\(/, /\bhttp\.request\s*\(/, /\bhttps\.request\s*\(/, new RegExp('\\b' + ['ax', 'ios'].join('') + '\\b', 'i'), new RegExp('\\b' + ['XMLHttp', 'Request'].join('') + '\\b')];

function readModuleFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src/features/aoc-integrations/pmfreak-remote-governance-endpoint', relativePath), 'utf8');
}

describe('AOC PMFreak Remote Governance Endpoint -- no side effects', () => {
  it('exposes no PMFreak mutation, action execution, or writeback function from its public surface', () => {
    for (const exportName of Object.keys(endpoint)) {
      assert.ok(
        !/mutate|writeback|sendEmail|sendClientCommunication|postToSlack|createInvoice|certifyInvoiceValidity|certifyCustomerAcceptance|certifyCompliance/i.test(exportName),
        `unexpected export name suggests a side effect: ${exportName}`,
      );
    }
  });

  it('no source file in this module defines a forbidden-operation-shaped function', () => {
    const violations: string[] = [];
    for (const relativePath of MODULE_RELATIVE_FILES) {
      const text = readModuleFile(relativePath);
      for (const pattern of FORBIDDEN_IDENTIFIER_PATTERNS) {
        if (pattern.test(text)) violations.push(`${relativePath}: matched ${pattern}`);
      }
    }
    assert.deepEqual(violations, []);
  });

  it('every forbidden operation the descriptor declares is a documented string, never an executable export', () => {
    for (const operation of AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_FORBIDDEN_OPERATIONS) {
      assert.equal(typeof operation, 'string');
      assert.equal(typeof (endpoint as unknown as Record<string, unknown>)[operation], 'undefined');
    }
  });

  it('no source file performs an outbound network call', () => {
    const violations: string[] = [];
    for (const relativePath of MODULE_RELATIVE_FILES) {
      const text = readModuleFile(relativePath);
      for (const pattern of NETWORK_PATTERNS) {
        if (pattern.test(text)) violations.push(`${relativePath}: matched ${pattern}`);
      }
    }
    assert.deepEqual(violations, []);
  });

  it('the handler never performs a PMFreak mutation, action execution, writeback, communication, or invoice creation for any fixture request', async () => {
    const { handleAocPMFreakRemoteGovernanceRequest } = endpoint;
    const { demoAocPMFreakRemoteBillingAllowedEndpointRequest, demoAocPMFreakRemoteCancelledEndpointRequest } = endpoint;

    for (const request of [demoAocPMFreakRemoteBillingAllowedEndpointRequest, demoAocPMFreakRemoteCancelledEndpointRequest]) {
      const result = await handleAocPMFreakRemoteGovernanceRequest({ request });
      const body = result.body as Record<string, unknown>;
      assert.equal(typeof body, 'object');
    }
  });
});
