import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import * as intake from '../index.js';
import { AOC_PMFREAK_GOVERNANCE_INTAKE_FORBIDDEN_OPERATIONS } from '../aoc-pmfreak-governance-intake-constants.js';

// Hardcoded, not filesystem-scanned -- mirrors the sibling determinism test.
const MODULE_RELATIVE_FILES: readonly string[] = [
  'aoc-pmfreak-governance-intake-constants.ts',
  'aoc-pmfreak-governance-intake-types.ts',
  'aoc-pmfreak-governance-intake-descriptor.ts',
  'aoc-pmfreak-governance-intake-config.ts',
  'aoc-pmfreak-governance-request-compat.ts',
  'aoc-pmfreak-governance-response-compat.ts',
  'aoc-pmfreak-governance-intake-validator.ts',
  'aoc-pmfreak-governance-request-redaction.ts',
  'aoc-pmfreak-request-to-passport-adapter.ts',
  'aoc-pmfreak-governance-evaluator.ts',
  'aoc-pmfreak-governance-response-builder.ts',
  'aoc-pmfreak-governance-decision-mapping.ts',
  'aoc-pmfreak-governance-intake-client.ts',
  'aoc-pmfreak-governance-intake-errors.ts',
  'aoc-pmfreak-governance-intake-health.ts',
  'aoc-pmfreak-governance-intake-fixtures.ts',
  'aoc-pmfreak-governance-intake-claim-safety.ts',
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
  return readFileSync(resolve(process.cwd(), 'src/features/aoc-integrations/pmfreak-governance-request-intake', relativePath), 'utf8');
}

describe('Soberanía PMFreak Governance Request Intake -- no side effects', () => {
  it('exposes no PMFreak mutation, action execution, or writeback function from its public surface', () => {
    for (const exportName of Object.keys(intake)) {
      assert.ok(!/mutate|writeback|sendEmail|sendClientCommunication|postToSlack|createInvoice|certifyInvoiceValidity|certifyCustomerAcceptance|certifyCompliance/i.test(exportName), `unexpected export name suggests a side effect: ${exportName}`);
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
    for (const operation of AOC_PMFREAK_GOVERNANCE_INTAKE_FORBIDDEN_OPERATIONS) {
      assert.equal(typeof operation, 'string');
      assert.equal(typeof (intake as unknown as Record<string, unknown>)[operation], 'undefined');
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
});
