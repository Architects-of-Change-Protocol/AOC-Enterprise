import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterprise, type AocEnterprise } from '../composition/composition-root.js';
import { AgentPassportError } from '../passport/errors.js';
import { buildAllowedRequestBody, buildTestKernelProviders } from './support.js';

const openEnterprises: AocEnterprise[] = [];
after(async () => {
  await Promise.all(openEnterprises.map((enterprise) => enterprise.close().catch(() => {})));
});

async function bootEnterprise(): Promise<AocEnterprise> {
  const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });
  openEnterprises.push(enterprise);
  return enterprise;
}

const ORG = { organizationId: 'org-1', system: false } as const;

describe('Agent Passport -- Governance and Evidence References', () => {
  it('links a real committed Governance Record by reference, never copying its content', async () => {
    const enterprise = await bootEnterprise();
    const { passport } = await enterprise.passports.issuePassport(ORG, {
      subject: { agentId: 'agent-gov', agentType: 'autonomous_agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
    });

    const outcome = await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-passport-gov-link', organization: { id: 'org-1' } }));
    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-passport-gov-link');
    assert.ok(record);

    const linked = await enterprise.passports.linkGovernanceRecord(
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

    assert.equal(linked.governanceReferences.length, 1);
    assert.equal(linked.governanceReferences[0]?.evaluationId, record.evaluation.evaluationId);
    // The reference carries only identifiers, status, and a digest -- never the request/result payloads.
    assert.ok(!('resultPayload' in (linked.governanceReferences[0] as object)));
    void outcome;
  });

  it('linking a nonexistent Governance Record fails with PASSPORT_GOVERNANCE_RECORD_NOT_FOUND', async () => {
    const enterprise = await bootEnterprise();
    const { passport } = await enterprise.passports.issuePassport(ORG, {
      subject: { agentId: 'agent-gov-2', agentType: 'autonomous_agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
    });

    await assert.rejects(
      enterprise.passports.linkGovernanceRecord(
        ORG,
        passport.passportId,
        { evaluationId: 'no-such-eval', decisionId: 'no-such-decision', requestId: 'no-such-request', status: 'allowed', occurredAt: '2026-01-01T00:00:00.000Z', governanceRecordDigest: 'sha256:' + '0'.repeat(64) },
        'user-1',
      ),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_GOVERNANCE_RECORD_NOT_FOUND',
    );
  });

  it('linking a Governance Record from another organization fails (cross-tenant reference denied)', async () => {
    const enterprise = await bootEnterprise();
    const { passport } = await enterprise.passports.issuePassport(ORG, {
      subject: { agentId: 'agent-gov-3', agentType: 'autonomous_agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
    });
    await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-passport-cross-tenant' }));
    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-passport-cross-tenant');
    assert.ok(record);

    const otherOrgContext = { organizationId: 'org-other', system: false } as const;
    await assert.rejects(
      enterprise.passports.linkGovernanceRecord(
        otherOrgContext,
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
      ),
      (error: unknown) => error instanceof AgentPassportError,
    );
  });

  it('a digest mismatch on link is rejected with PASSPORT_REFERENCE_INVALID', async () => {
    const enterprise = await bootEnterprise();
    const { passport } = await enterprise.passports.issuePassport(ORG, {
      subject: { agentId: 'agent-gov-4', agentType: 'autonomous_agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
    });
    await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-passport-digest-mismatch', organization: { id: 'org-1' } }));
    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-passport-digest-mismatch');
    assert.ok(record);

    await assert.rejects(
      enterprise.passports.linkGovernanceRecord(
        ORG,
        passport.passportId,
        {
          evaluationId: record.evaluation.evaluationId,
          decisionId: record.evaluation.decisionId,
          requestId: record.request.requestId,
          status: record.evaluation.status,
          occurredAt: record.evaluation.evaluatedAt,
          governanceRecordDigest: 'sha256:' + '1'.repeat(64),
        },
        'user-1',
      ),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_REFERENCE_INVALID',
    );
  });

  it('links a real stored Evidence Bundle by reference, never embedding its content', async () => {
    const enterprise = await bootEnterprise();
    const { passport } = await enterprise.passports.issuePassport(ORG, {
      subject: { agentId: 'agent-ev', agentType: 'autonomous_agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
    });
    await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-passport-ev-link', organization: { id: 'org-1' } }));
    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-passport-ev-link');
    assert.ok(record);
    const stored = await enterprise.evidence.build(undefined, { evaluationId: record.evaluation.evaluationId, level: 'AUDITOR' });

    const linked = await enterprise.passports.linkEvidenceBundle(
      ORG,
      passport.passportId,
      {
        bundleId: stored.bundle.bundleId,
        bundleVersion: stored.bundle.bundleVersion,
        bundleDigest: stored.bundle.integrity.bundleDigest,
        disclosurePolicy: stored.bundle.disclosure.policyId,
        subjectType: stored.bundle.subject.subjectType,
        createdAt: stored.bundle.createdAt,
      },
      'user-1',
    );

    assert.equal(linked.evidenceReferences.length, 1);
    assert.equal(linked.evidenceReferences[0]?.bundleId, stored.bundle.bundleId);
    assert.ok(!('evidence' in (linked.evidenceReferences[0] as object)), 'no Bundle content fields leak into the reference');
  });

  it('linking a nonexistent Evidence Bundle fails with PASSPORT_EVIDENCE_NOT_FOUND', async () => {
    const enterprise = await bootEnterprise();
    const { passport } = await enterprise.passports.issuePassport(ORG, {
      subject: { agentId: 'agent-ev-2', agentType: 'autonomous_agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
    });

    await assert.rejects(
      enterprise.passports.linkEvidenceBundle(
        ORG,
        passport.passportId,
        { bundleId: 'no-such-bundle', bundleVersion: '1.0.0', bundleDigest: 'sha256:' + '0'.repeat(64), disclosurePolicy: 'AUDITOR', subjectType: 'policy_decision', createdAt: '2026-01-01T00:00:00.000Z' },
        'user-1',
      ),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_EVIDENCE_NOT_FOUND',
    );
  });
});
