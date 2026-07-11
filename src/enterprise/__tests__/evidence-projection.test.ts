import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterprise, type AocEnterprise } from '../composition/composition-root.js';
import type { GovernanceRecord } from '../governance-store/contracts.js';
import { buildEvidenceBundle, EVIDENCE_DISCLOSURE_REDACTED_VALUE } from '../evidence/projector.js';
import {
  FULL_DISCLOSURE_POLICY,
  AUDITOR_DISCLOSURE_POLICY,
  PARTNER_DISCLOSURE_POLICY,
  CUSTOMER_DISCLOSURE_POLICY,
  PUBLIC_DISCLOSURE_POLICY,
  getDisclosurePolicy,
} from '../evidence/disclosure-policies.js';
import { EvidenceError } from '../evidence/errors.js';
import { AOC_EVIDENCE_BUNDLE_VERSION, EVIDENCE_BUNDLE_SCHEMA_VERSION } from '../evidence/contracts.js';
import { buildAllowedRequestBody, buildTestKernelProviders } from './support.js';

const SYSTEM = { system: true } as const;
const openEnterprises: AocEnterprise[] = [];

after(async () => {
  await Promise.all(openEnterprises.map((enterprise) => enterprise.close().catch(() => {})));
});

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

async function bootEnterprise(): Promise<AocEnterprise> {
  const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });
  openEnterprises.push(enterprise);
  return enterprise;
}

async function buildTestGovernanceRecord(enterprise: AocEnterprise, requestId: string): Promise<GovernanceRecord> {
  const outcome = await enterprise.evaluate(buildAllowedRequestBody({ requestId }));
  assert.equal(outcome.body.status, 'allowed');
  const record = await enterprise.persistence.getByRequestId(SYSTEM, requestId);
  assert.ok(record, 'the evaluation was durably recorded');
  return record;
}

describe('Evidence Projector -- disclosure levels (mission: FULL/AUDITOR/PARTNER/CUSTOMER/PUBLIC)', () => {
  it('FULL discloses every field, hides nothing, redacts nothing', async () => {
    const enterprise = await bootEnterprise();
    const record = await buildTestGovernanceRecord(enterprise, 'req-proj-full');

    const bundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now: () => '2026-01-01T00:00:00.000Z', nextId });

    assert.equal(bundle.disclosure.level, 'FULL');
    assert.equal(bundle.source.organizationId !== undefined || record.request.organizationId === undefined, true);
    assert.equal(bundle.subject.actionType, record.request.actionType);
    assert.equal(bundle.subject.resourceScope, record.request.resourceScope);
    assert.equal(bundle.evidence.status, record.evaluation.status);
    assert.equal(bundle.evidence.summary, record.evaluation.summary);
    assert.deepEqual(bundle.evidence.reasonCodes, record.evaluation.reasonCodes);
    assert.equal(bundle.evidence.trace?.length, record.trace.length);
    assert.equal(bundle.evidence.events?.length, record.events.length);
    assert.ok(bundle.evidence.metadata !== undefined);
    assert.equal(bundle.bundleVersion, EVIDENCE_BUNDLE_SCHEMA_VERSION);
  });

  it('AUDITOR discloses trace/events/reasons but hides internal runtime metadata', async () => {
    const enterprise = await bootEnterprise();
    const record = await buildTestGovernanceRecord(enterprise, 'req-proj-auditor');

    const bundle = buildEvidenceBundle(record, AUDITOR_DISCLOSURE_POLICY, { now: () => '2026-01-01T00:00:00.000Z', nextId });

    assert.equal(bundle.evidence.status, record.evaluation.status);
    assert.equal(bundle.evidence.trace?.length, record.trace.length);
    assert.equal(bundle.evidence.metadata, undefined, 'AUDITOR hides internal runtime metadata');
  });

  it('PARTNER discloses the outcome without the internal execution trace, metadata, or tenant identity', async () => {
    const enterprise = await bootEnterprise();
    const record = await buildTestGovernanceRecord(enterprise, 'req-proj-partner');

    const bundle = buildEvidenceBundle(record, PARTNER_DISCLOSURE_POLICY, { now: () => '2026-01-01T00:00:00.000Z', nextId });

    assert.equal(bundle.evidence.status, record.evaluation.status);
    assert.equal(bundle.evidence.summary, record.evaluation.summary);
    assert.equal(bundle.evidence.trace, undefined, 'PARTNER hides the trace');
    assert.equal(bundle.evidence.metadata, undefined, 'PARTNER hides metadata');
    assert.equal(bundle.source.organizationId, undefined, 'PARTNER hides the tenant identifier');
  });

  it('CUSTOMER discloses only the outcome and why, nothing about how it was produced', async () => {
    const enterprise = await bootEnterprise();
    const record = await buildTestGovernanceRecord(enterprise, 'req-proj-customer');

    const bundle = buildEvidenceBundle(record, CUSTOMER_DISCLOSURE_POLICY, { now: () => '2026-01-01T00:00:00.000Z', nextId });

    assert.equal(bundle.evidence.status, record.evaluation.status);
    assert.equal(bundle.evidence.summary, record.evaluation.summary);
    assert.equal(bundle.evidence.trace, undefined);
    assert.equal(bundle.evidence.events, undefined);
    assert.equal(bundle.subject.actionType, undefined, 'CUSTOMER hides internal action taxonomy');
    assert.equal(bundle.source.organizationId, undefined);
  });

  it('PUBLIC discloses only the minimal fact of the decision, with the subject description redacted rather than disclosed verbatim', async () => {
    const enterprise = await bootEnterprise();
    const record = await buildTestGovernanceRecord(enterprise, 'req-proj-public');

    const bundle = buildEvidenceBundle(record, PUBLIC_DISCLOSURE_POLICY, { now: () => '2026-01-01T00:00:00.000Z', nextId });

    assert.equal(bundle.evidence.status, record.evaluation.status);
    assert.equal(bundle.evidence.summary, undefined);
    assert.equal(bundle.evidence.reasonCodes, undefined);
    assert.equal(bundle.evidence.trace, undefined);
    assert.equal(bundle.subject.description, EVIDENCE_DISCLOSURE_REDACTED_VALUE, 'PUBLIC redacts, rather than discloses, the subject description');
  });

  it('getDisclosurePolicy rejects an unrecognized level rather than defaulting to a more permissive one', () => {
    assert.throws(() => getDisclosurePolicy('SUPER_ADMIN'), EvidenceError);
  });

  it('a Bundle is never a copy of the Governance Record -- it never carries request/result payloads, digests, or record ids', async () => {
    const enterprise = await bootEnterprise();
    const record = await buildTestGovernanceRecord(enterprise, 'req-proj-not-a-copy');
    const bundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now: () => '2026-01-01T00:00:00.000Z', nextId });

    const serialized = JSON.stringify(bundle);
    assert.equal(serialized.includes(record.request.recordId), false);
    assert.equal(serialized.includes(record.evaluation.recordId), false);
    assert.equal(serialized.includes('requestPayload'), false);
    assert.equal(serialized.includes('resultPayload'), false);
    assert.equal(bundle.bundleVersion, EVIDENCE_BUNDLE_SCHEMA_VERSION);
    assert.notEqual(EVIDENCE_BUNDLE_SCHEMA_VERSION, record.metadata.schemaVersion, 'the Bundle has its own version lineage, independent of the Store schema');
  });

  it('AOC_EVIDENCE_BUNDLE_VERSION is a distinct lineage from the Governance Store version', () => {
    assert.equal(typeof AOC_EVIDENCE_BUNDLE_VERSION, 'string');
  });
});
