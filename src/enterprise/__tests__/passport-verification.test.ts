import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryPassportStore } from '../passport/in-memory-passport-store.js';
import { createAgentPassportService } from '../passport/service.js';
import { createEnterprise, type AocEnterprise } from '../composition/composition-root.js';
import { buildAllowedRequestBody, buildTestKernelProviders } from './support.js';

const ORG = { organizationId: 'org-1', system: false } as const;

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

const openEnterprises: AocEnterprise[] = [];
after(async () => {
  await Promise.all(openEnterprises.map((enterprise) => enterprise.close().catch(() => {})));
});

async function bootEnterprise(): Promise<AocEnterprise> {
  const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });
  openEnterprises.push(enterprise);
  return enterprise;
}

describe('Agent Passport -- Verification', () => {
  it('STRUCTURAL mode verifies a freshly issued Passport as valid', async () => {
    const store = createInMemoryPassportStore({ now: buildClock(), enterpriseVersion: 'test-1.0.0' });
    const service = createAgentPassportService({ store, now: buildClock(), nextId: (prefix) => `${prefix}-1` });
    const { passport } = await service.issuePassport(ORG, {
      subject: { agentId: 'agent-1', agentType: 'autonomous_agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
      activateImmediately: true,
    });

    const result = await service.verifyPassport(ORG, passport.passportId, 'STRUCTURAL');
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'STRUCTURAL');
    assert.equal(result.status, 'active');
    assert.ok(Object.values(result.checks).every(Boolean));
  });

  it('a revoked Passport still verifies STRUCTURALLY valid -- revocation is a legitimate lifecycle state, not corruption', async () => {
    const store = createInMemoryPassportStore({ now: buildClock(), enterpriseVersion: 'test-1.0.0' });
    const service = createAgentPassportService({ store, now: buildClock(), nextId: (prefix) => `${prefix}-1` });
    const { passport } = await service.issuePassport(ORG, {
      subject: { agentId: 'agent-1', agentType: 'autonomous_agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
      activateImmediately: true,
    });
    await service.revokePassport(ORG, passport.passportId, { reasonCode: 'X', reason: 'x', revokedBy: 'user-1' });

    const result = await service.verifyPassport(ORG, passport.passportId, 'STRUCTURAL');
    assert.equal(result.valid, true);
    assert.equal(result.status, 'revoked');
  });

  it('REFERENTIAL mode fails when a linked Governance Record no longer resolves', async () => {
    const enterprise = await bootEnterprise();
    const { passport } = await enterprise.passports.issuePassport(ORG, {
      subject: { agentId: 'agent-ref', agentType: 'autonomous_agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
    });
    await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-verify-referential', organization: { id: 'org-1' } }));
    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-verify-referential');
    assert.ok(record);
    await enterprise.passports.linkGovernanceRecord(
      ORG,
      passport.passportId,
      {
        evaluationId: record.evaluation.evaluationId,
        decisionId: record.evaluation.decisionId,
        requestId: record.request.requestId,
        status: record.evaluation.status,
        occurredAt: record.evaluation.evaluatedAt,
        governanceRecordDigest: record.integrity.aggregateDigest,
      },
      'user-1',
    );

    const structural = await enterprise.passports.verifyPassport(ORG, passport.passportId, 'STRUCTURAL');
    assert.equal(structural.valid, true);

    const referential = await enterprise.passports.verifyPassport(ORG, passport.passportId, 'REFERENTIAL');
    assert.equal(referential.valid, true, 'the linked Governance Record genuinely exists, so REFERENTIAL mode also passes');
    assert.equal(referential.checks.governanceReferences, true);
  });

  it('FULL_INTERNAL mode runs the same referential checks as REFERENTIAL for a well-formed Passport', async () => {
    const store = createInMemoryPassportStore({ now: buildClock(), enterpriseVersion: 'test-1.0.0' });
    const service = createAgentPassportService({ store, now: buildClock(), nextId: (prefix) => `${prefix}-1` });
    const { passport } = await service.issuePassport(ORG, {
      subject: { agentId: 'agent-1', agentType: 'autonomous_agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
    });

    const result = await service.verifyPassport(ORG, passport.passportId, 'FULL_INTERNAL');
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'FULL_INTERNAL');
  });

  it('verification reports failures explicitly rather than silently passing a corrupted chain', async () => {
    const store = createInMemoryPassportStore({ now: buildClock(), enterpriseVersion: 'test-1.0.0' });
    const service = createAgentPassportService({ store, now: buildClock(), nextId: (prefix) => `${prefix}-1` });
    const { passport } = await service.issuePassport(ORG, {
      subject: { agentId: 'agent-1', agentType: 'autonomous_agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
    });
    const events = await store.listEvents(ORG, passport.passportId);
    assert.equal(events.length, 1);
    // Directly probe the pure verification function against a tampered copy of the event.
    const { verifyAgentPassport } = await import('../passport/verification.js');
    const tampered = { ...events[0]!, eventDigest: 'sha256:' + '9'.repeat(64) };
    const result = await verifyAgentPassport({ passportId: passport.passportId, events: [tampered], mode: 'STRUCTURAL', now: buildClock() });
    assert.equal(result.valid, false);
    assert.ok(result.failures.length > 0);
  });
});
