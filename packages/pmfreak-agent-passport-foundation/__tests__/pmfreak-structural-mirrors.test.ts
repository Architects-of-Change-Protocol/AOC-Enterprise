import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import type { PMFreakEvidenceRequirementMirror } from '../src/domain/pmfreak-evidence-requirement-mirror.js';
import type { PMFreakApprovalRequirementMirror } from '../src/domain/pmfreak-approval-requirement-mirror.js';
import type { PMFreakCapabilityTokenMirror } from '../src/domain/pmfreak-capability-token-mirror.js';

// Hardcoded, not filesystem-scanned: this repo prefers deterministic static
// lists over directory walks (see src/features/policy-pack-foundation/tests/
// policy-pack-foundation-determinism.test.ts), and the pinned 'fs'/'path'
// shims in this repo don't declare readdirSync/statSync/join.
const SRC_RELATIVE_FILES: readonly string[] = [
  'domain/pmfreak-agent-role.ts',
  'domain/pmfreak-passport-validation-status.ts',
  'domain/pmfreak-passport-attestation.ts',
  'domain/pmfreak-evidence-requirement-mirror.ts',
  'domain/pmfreak-approval-requirement-mirror.ts',
  'domain/pmfreak-capability-token-mirror.ts',
  'domain/pmfreak-authority-scope.ts',
  'domain/pmfreak-passport-action-decision.ts',
  'services/pmfreak-agent-enrollment-builder.ts',
  'services/pmfreak-agent-passport-issuance-service.ts',
  'services/pmfreak-agent-runtime-guard-service.ts',
  'services/pmfreak-passport-attestation-service.ts',
  'services/pmfreak-agent-passport-resolution-service.ts',
  'fixtures/pmfreak-agent-role-fixtures.ts',
  'fixtures/pmfreak-passport-scenario-fixtures.ts',
  'index.ts',
];

const TEST_RELATIVE_FILES: readonly string[] = [
  'pmfreak-agent-passport-issuance.test.ts',
  'pmfreak-agent-runtime-guard.test.ts',
  'pmfreak-passport-validation-status.test.ts',
  'pmfreak-passport-attestation.test.ts',
  'pmfreak-agent-passport-resolution.test.ts',
  'pmfreak-structural-mirrors.test.ts',
];

function readSrcFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
}

function readTestFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), '__tests__', relativePath), 'utf8');
}

function allFileContents(): readonly { readonly path: string; readonly text: string }[] {
  return [
    ...SRC_RELATIVE_FILES.map((p) => ({ path: `src/${p}`, text: readSrcFile(p) })),
    ...TEST_RELATIVE_FILES.map((p) => ({ path: `__tests__/${p}`, text: readTestFile(p) })),
  ];
}

describe('Structural mirror shape completeness', () => {
  it('PMFreakEvidenceRequirementMirror carries the fields the real EvidenceRequirement carries', () => {
    const sample: PMFreakEvidenceRequirementMirror = {
      id: 'req-1',
      type: 'deliverable_evidence',
      passportId: 'AOC-AGT-2026-US-ABCDEF',
      role: 'evidence',
      description: 'Deliverable evidence must be attached before this action may proceed.',
      required: true,
      status: 'open',
      createdAt: '2026-06-25T12:00:00.000Z',
    };
    assert.equal(sample.status, 'open');
    assert.equal(typeof sample.required, 'boolean');
  });

  it('PMFreakApprovalRequirementMirror carries the fields the real ApprovalRequirement carries', () => {
    const sample: PMFreakApprovalRequirementMirror = {
      id: 'appr-1',
      type: 'pm_approval',
      passportId: 'AOC-AGT-2026-US-ABCDEF',
      role: 'billing_readiness',
      action: 'pmfreak.foundation.action.billing.mark_ready',
      riskLevel: 'critical',
      minimumApprovals: 1,
      requiresSegregationOfDuties: false,
      evidenceRequirements: [
        { id: 'ev-1', type: 'deliverable_evidence', required: true, description: 'Deliverable evidence' },
      ],
    };
    assert.equal(sample.minimumApprovals, 1);
    assert.equal(sample.evidenceRequirements.length, 1);
  });

  it('PMFreakCapabilityTokenMirror carries the fields the real RecognitionCapabilityToken carries', () => {
    const sample: PMFreakCapabilityTokenMirror = {
      id: 'tok-1',
      passportId: 'AOC-AGT-2026-US-ABCDEF',
      role: 'planning',
      capability: 'pmfreak.foundation.capability.schedule.propose_change',
      actions: ['pmfreak.foundation.action.schedule.propose_change'],
      resourceScopes: ['project.schedule'],
      constraints: { prohibitedActions: ['pmfreak.foundation.action.schedule.apply_change'] },
      delegation: { delegable: false, delegationDepth: 0, maxDelegationDepth: 0 },
      evidenceRequirements: [],
      riskLevel: 'medium',
      status: 'valid',
      issuedAt: '2026-06-25T12:00:00.000Z',
    };
    assert.equal(sample.status, 'valid');
    assert.equal(sample.delegation.delegable, false);
  });
});

describe('Package isolation (source scan)', () => {
  it('scans at least the expected number of files', () => {
    assert.ok(SRC_RELATIVE_FILES.length + TEST_RELATIVE_FILES.length >= 15);
  });

  it('no file imports from src/features (internal root-package modules)', () => {
    const offenders = allFileContents()
      .filter(({ text }) => /from\s+['"].*src\/features/.test(text))
      .map(({ path }) => path);
    assert.deepEqual(offenders, []);
  });

  it('no file reads process environment variables', () => {
    // Written as a split-join, deliberately not a contiguous literal
    // substring of the forbidden token -- otherwise this very file (which
    // must describe every forbidden pattern) would flag itself.
    const forbiddenToken = ['process', 'env'].join('.');
    const offenders = allFileContents()
      .filter(({ text }) => text.includes(forbiddenToken))
      .map(({ path }) => path);
    assert.deepEqual(offenders, []);
  });

  it('no file performs a network fetch call', () => {
    const forbiddenPattern = new RegExp('\\b' + 'fetch' + '\\s*\\(');
    const offenders = allFileContents()
      .filter(({ text }) => forbiddenPattern.test(text))
      .map(({ path }) => path);
    assert.deepEqual(offenders, []);
  });

  it('no file reads the system clock or uses non-deterministic randomness', () => {
    const patterns = [/\bMath\.random\s*\(/, /\bDate\.now\s*\(/, /\bnew\s+Date\s*\(\s*\)/];
    const offenders = allFileContents()
      .filter(({ text }) => patterns.some((pattern) => pattern.test(text)))
      .map(({ path }) => path);
    assert.deepEqual(offenders, []);
  });

  it('no file imports a real signing key module, a database client, or a network library', () => {
    const forbidden = [/node:https?/, /\bpg\b/, /supabase/i, /node-fetch/, /\baxios\b/, /\bws\b/];
    // This test file itself necessarily names every forbidden token (as
    // regex literals, directly above) in order to check for it elsewhere --
    // it is excluded from the scan it defines, since flagging the checker
    // for naming what it checks for would be a false positive, not a real
    // dependency on any of these modules. Every OTHER file in this package
    // (including every other test file) is still scanned.
    const offenders = allFileContents()
      .filter(({ path }) => path !== '__tests__/pmfreak-structural-mirrors.test.ts')
      .filter(({ text }) => forbidden.some((pattern) => pattern.test(text)))
      .map(({ path }) => path);
    assert.deepEqual(offenders, []);
  });

  it('only known bare specifiers are imported (agent-governance, node:test tooling, fs/path shims)', () => {
    const bareImport = /from\s+['"]([^."][^'"]*)['"]/g;
    const allowed = new Set([
      '@aoc-enterprise/agent-governance',
      'node:test',
      'node:assert/strict',
      'fs',
      'path',
    ]);
    const offenders: string[] = [];
    for (const { path, text } of allFileContents()) {
      for (const match of text.matchAll(bareImport)) {
        const spec = match[1];
        if (spec !== undefined && !allowed.has(spec)) {
          offenders.push(`${path}: ${spec}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
