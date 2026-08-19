import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createEnterprise, type AocEnterprise } from '../composition/composition-root.js';
import { createEnterpriseServer, type EnterpriseServer } from '../host/enterprise-server.js';
import { loadEnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import { AGENT_PASSPORT_MODULE_ID } from '../modules/passport-module.js';
import { buildAllowedRequestBody, buildTestKernelProviders } from './support.js';

const openEnterprises: AocEnterprise[] = [];
const startedServers: EnterpriseServer[] = [];

after(async () => {
  await Promise.all(openEnterprises.map((enterprise) => enterprise.close().catch(() => {})));
  await Promise.all(startedServers.map((server) => server.close().catch(() => {})));
});

async function bootEnterprise(): Promise<AocEnterprise> {
  const enterprise = await createEnterprise({ kernelProviders: buildTestKernelProviders() });
  openEnterprises.push(enterprise);
  return enterprise;
}

describe('Soberanía Enterprise -- Agent Passport Runtime module registration', () => {
  it('the Passport Runtime module is registered and healthy', async () => {
    const enterprise = await bootEnterprise();
    const modules = enterprise.modules();
    const passportModule = modules.find((module) => module.id === AGENT_PASSPORT_MODULE_ID);
    assert.ok(passportModule, 'the Agent Passport Runtime module must be registered');
    assert.equal(passportModule?.state, 'ready');
    assert.ok(passportModule?.capabilities.includes('passport.issue'));
  });

  it('the Passport Store is independent of the Governance Store and the Evidence Bundle Store', async () => {
    const enterprise = await bootEnterprise();
    assert.notEqual(enterprise.passportStore, enterprise.persistence);
    assert.notEqual(enterprise.passportStore, enterprise.evidenceStore);
  });

  it('Passport telemetry counters increment on real operations', async () => {
    const enterprise = await bootEnterprise();
    const before = enterprise.telemetry.snapshot();
    await enterprise.passports.issuePassport(
      { organizationId: 'org-1', system: false },
      { subject: { agentId: 'agent-telemetry', agentType: 'autonomous_agent' }, organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' }, actorId: 'user-1', activateImmediately: true },
    );
    const after1 = enterprise.telemetry.snapshot();
    assert.equal(after1.passportIssuedCount, before.passportIssuedCount + 1);
    assert.equal(after1.passportActivationCount, before.passportActivationCount + 1);
  });
});

describe('Soberanía Enterprise -- full cross-capability scenario (Kernel -> Governance Store -> Evidence Bundle -> Agent Passport)', () => {
  it('issues a Passport, evaluates a governed action, persists the Governance Record, builds an Evidence Bundle, links both to the Passport, reconstructs, verifies, and builds a CUSTOMER view -- with no duplicated records', async () => {
    const enterprise = await bootEnterprise();
    const context = { organizationId: 'org-1', system: false } as const;

    const { passport: issued } = await enterprise.passports.issuePassport(context, {
      subject: { agentId: 'agent-e2e', agentType: 'autonomous_agent', displayName: 'End-to-End Agent' },
      organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
      actorId: 'user-1',
      activateImmediately: true,
    });

    const evaluation = await enterprise.evaluate(buildAllowedRequestBody({ requestId: 'req-e2e-passport', organization: { id: 'org-1' } }));
    assert.equal(evaluation.httpStatus, 200);

    const record = await enterprise.persistence.getByRequestId({ system: true }, 'req-e2e-passport');
    assert.ok(record);

    const bundle = await enterprise.evidence.build(undefined, { evaluationId: record.evaluation.evaluationId, level: 'AUDITOR' });

    const withGovernance = await enterprise.passports.linkGovernanceRecord(
      context,
      issued.passportId,
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
    const withEvidence = await enterprise.passports.linkEvidenceBundle(
      context,
      issued.passportId,
      {
        bundleId: bundle.bundle.bundleId,
        bundleVersion: bundle.bundle.bundleVersion,
        bundleDigest: bundle.bundle.integrity.bundleDigest,
        disclosurePolicy: bundle.bundle.disclosure.policyId,
        subjectType: bundle.bundle.subject.subjectType,
        createdAt: bundle.bundle.createdAt,
      },
      'user-1',
    );

    assert.equal(withGovernance.governanceReferences.length, 1);
    assert.equal(withEvidence.evidenceReferences.length, 1);

    const load = await enterprise.passports.getPassport(context, issued.passportId);
    assert.equal(load.status, 'complete');
    assert.equal(load.passport?.governanceReferences.length, 1);
    assert.equal(load.passport?.evidenceReferences.length, 1);

    const verification = await enterprise.passports.verifyPassport(context, issued.passportId, 'REFERENTIAL');
    assert.equal(verification.valid, true);

    const summary = await enterprise.passports.getHistorySummary(context, issued.passportId);
    assert.equal(summary.governanceEvaluationsReferenced, 1);
    assert.equal(summary.evidenceBundlesReferenced, 1);
    assert.equal(summary.allowedDecisionsReferenced, 1);

    const customerView = await enterprise.passports.buildView(context, issued.passportId, 'CUSTOMER', 'user-1');
    assert.equal(customerView.status, 'active');
    assert.equal(customerView.evidenceReferences.length, 0, 'CUSTOMER view discloses no Evidence References');

    // No duplication: the Governance Record and Evidence Bundle each exist exactly once in their own stores.
    const govQuery = await enterprise.governanceReads.query(undefined, { requestId: 'req-e2e-passport' });
    assert.equal(govQuery.records.length, 1);
    const bundlesForEvaluation = await enterprise.evidence.listByEvaluationId(undefined, record.evaluation.evaluationId);
    assert.equal(bundlesForEvaluation.length, 1);
  });
});

describe('POST/GET /api/passports (HTTP surface)', () => {
  async function startTestServer(): Promise<{ server: EnterpriseServer; baseUrl: string }> {
    const configuration = loadEnterpriseConfiguration({ AOC_ENTERPRISE_HTTP_PORT: '0', AOC_ENTERPRISE_HTTP_HOST: '127.0.0.1' });
    const server = await createEnterpriseServer({ kernelProviders: buildTestKernelProviders(), configuration });
    startedServers.push(server);
    const { port, host } = await server.listen();
    return { server, baseUrl: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}` };
  }

  it('issues, reads, activates, suspends, verifies, and builds a view for a Passport end-to-end over HTTP', async () => {
    const { baseUrl } = await startTestServer();

    const issueResponse = await fetch(`${baseUrl}/api/passports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subject: { agentId: 'agent-http', agentType: 'autonomous_agent' },
        organization: { organizationId: 'org-http', recognizedBy: 'org-http-registry' },
        actorId: 'user-1',
      }),
    });
    assert.equal(issueResponse.status, 201);
    const issueBody = await issueResponse.json();
    const passportId = issueBody.passport.passportId;
    assert.equal(issueBody.passport.status, 'draft');

    const getResponse = await fetch(`${baseUrl}/api/passports/${passportId}`);
    assert.equal(getResponse.status, 200);
    const getBody = await getResponse.json();
    assert.equal(getBody.status, 'complete');

    const activateResponse = await fetch(`${baseUrl}/api/passports/${passportId}/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actorId: 'user-1' }),
    });
    assert.equal(activateResponse.status, 200);
    const activateBody = await activateResponse.json();
    assert.equal(activateBody.status, 'active');

    const suspendResponse = await fetch(`${baseUrl}/api/passports/${passportId}/suspend`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ suspendedBy: 'user-2', reason: 'review' }),
    });
    assert.equal(suspendResponse.status, 200);

    const verifyResponse = await fetch(`${baseUrl}/api/passports/${passportId}/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(verifyResponse.status, 200);
    const verifyBody = await verifyResponse.json();
    assert.equal(verifyBody.valid, true);

    const viewResponse = await fetch(`${baseUrl}/api/passports/${passportId}/views`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ viewType: 'PUBLIC', generatedBy: 'user-1' }),
    });
    assert.equal(viewResponse.status, 201);
    const viewBody = await viewResponse.json();
    assert.equal(viewBody.viewType, 'PUBLIC');

    const eventsResponse = await fetch(`${baseUrl}/api/passports/${passportId}/events`);
    assert.equal(eventsResponse.status, 200);
    const eventsBody = await eventsResponse.json();
    assert.equal(eventsBody.events.length, 3);
  });

  it('returns 400 for a malformed issuance request and 404 for an unknown passportId', async () => {
    const { baseUrl } = await startTestServer();

    const badIssue = await fetch(`${baseUrl}/api/passports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(badIssue.status, 400);

    const notFound = await fetch(`${baseUrl}/api/passports/no-such-passport`);
    assert.equal(notFound.status, 404);
  });
});
