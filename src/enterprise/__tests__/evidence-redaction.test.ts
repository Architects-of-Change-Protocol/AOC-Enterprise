import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterprise, type AocEnterprise } from '../composition/composition-root.js';
import type { GovernanceRecord, GovernanceRecordMetadata } from '../governance-store/contracts.js';
import { GOVERNANCE_REDACTED_VALUE, redactSensitiveValues } from '../governance-store/redaction.js';
import { buildEvidenceBundle, EVIDENCE_DISCLOSURE_REDACTED_VALUE } from '../evidence/projector.js';
import { FULL_DISCLOSURE_POLICY, PUBLIC_DISCLOSURE_POLICY } from '../evidence/disclosure-policies.js';
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

async function buildRealRecord(requestId: string): Promise<GovernanceRecord> {
  const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });
  openEnterprises.push(enterprise);
  const outcome = await enterprise.evaluate(buildAllowedRequestBody({ requestId }));
  assert.equal(outcome.body.status, 'allowed');
  const record = await enterprise.persistence.getByRequestId(SYSTEM, requestId);
  assert.ok(record);
  return record;
}

/** Simulates a Governance Record whose metadata was adversarially (or accidentally) stuffed with secret-shaped keys -- proving the Evidence Projector never surfaces them, regardless of what the source record happens to carry. `as` here is a type assertion over a structurally wider object, not an unsafe cast of unrelated types. */
function poisonMetadata(record: GovernanceRecord): GovernanceRecord {
  const poisoned = {
    ...record.metadata,
    apiKey: 'sk-live-should-never-appear',
    password: 'hunter2',
    nested: { authorization: 'Bearer should-never-appear', cookies: ['session=should-never-appear'] },
  } as GovernanceRecordMetadata;
  return { ...record, metadata: poisoned };
}

describe('Evidence Projector -- redaction', () => {
  it('bounded metadata never surfaces fields the projector did not explicitly derive, even when the source record carries secret-shaped keys (tokens, passwords, nested objects, arrays)', async () => {
    const record = poisonMetadata(await buildRealRecord('req-redact-metadata'));

    const bundle = buildEvidenceBundle(record, FULL_DISCLOSURE_POLICY, { now: () => '2026-01-01T00:00:00.000Z', nextId });

    const serialized = JSON.stringify(bundle);
    assert.equal(serialized.includes('sk-live-should-never-appear'), false);
    assert.equal(serialized.includes('hunter2'), false);
    assert.equal(serialized.includes('should-never-appear'), false);
    assert.deepEqual(Object.keys(bundle.evidence.metadata ?? {}).sort(), ['eventCount', 'lifecycleState', 'moduleCount', 'traceStepCount'].sort());
  });

  it('redactSensitiveValues (reused from the Governance Store) redacts tokens/passwords/secrets at any depth, including inside arrays, by key not by value', () => {
    const poisoned = {
      accessToken: 'abc123',
      nested: { apiKey: 'xyz', safe: 'value' },
      items: [{ password: 'p1' }, { sessionId: 'kept-because-id-suffix' }, { cookie: 'c1' }],
    };
    const redacted = redactSensitiveValues(poisoned) as typeof poisoned;
    assert.equal(redacted.accessToken, GOVERNANCE_REDACTED_VALUE);
    assert.equal((redacted.nested as { apiKey: string }).apiKey, GOVERNANCE_REDACTED_VALUE);
    assert.equal((redacted.nested as { safe: string }).safe, 'value');
    assert.equal((redacted.items[0] as { password: string }).password, GOVERNANCE_REDACTED_VALUE);
    assert.equal((redacted.items[1] as { sessionId: string }).sessionId, 'kept-because-id-suffix', 'an *Id suffix names a reference, not a secret');
    assert.equal((redacted.items[2] as { cookie: string }).cookie, GOVERNANCE_REDACTED_VALUE);
  });

  it('disclosure-policy redaction (EVIDENCE_DISCLOSURE_REDACTED_VALUE) is a distinct concern from secret redaction (GOVERNANCE_REDACTED_VALUE)', async () => {
    const record = await buildRealRecord('req-redact-policy-marker');
    const bundle = buildEvidenceBundle(record, PUBLIC_DISCLOSURE_POLICY, { now: () => '2026-01-01T00:00:00.000Z', nextId });

    assert.equal(bundle.subject.description, EVIDENCE_DISCLOSURE_REDACTED_VALUE);
    assert.notEqual(EVIDENCE_DISCLOSURE_REDACTED_VALUE, GOVERNANCE_REDACTED_VALUE);
  });
});
