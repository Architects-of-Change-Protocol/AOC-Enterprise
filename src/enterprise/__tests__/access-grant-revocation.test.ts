import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryAccessGrantStore } from '../access-governance/in-memory-access-grant-store.js';
import { createAccessGrantService, type AccessGrantService } from '../access-governance/service.js';
import { revokeGrantRequest } from '../access-governance/orchestration.js';
import { AccessGovernanceError } from '../access-governance/errors.js';
import { EnterpriseHttpError } from '../api/enterprise-http-errors.js';
import { loadEnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import type { PinataProviderClient } from '@aoc-enterprise/pinata-adapter';

const ORG_A = { organizationId: 'org-a', system: false } as const;
const ORG_B = { organizationId: 'org-b', system: false } as const;

function buildClock(startIso = '2026-01-01T00:00:00.000Z', stepSeconds = 1): () => string {
  let elapsed = 0;
  return () => new Date(Date.parse(startIso) + elapsed++ * stepSeconds * 1000).toISOString();
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** A fake Pinata client — no test in this file contacts a real Pinata endpoint or requires a real credential. */
function makeFakeClient(overrides: Partial<PinataProviderClient> = {}): PinataProviderClient {
  return {
    createTemporaryAccessLink: async ({ cid, expiresInSeconds }) => ({ url: `https://gateway.pinata.cloud/files/${cid}?exp=${expiresInSeconds}` }),
    getResourceMetadata: async ({ resourceId }) => ({
      id: resourceId,
      name: null,
      cid: 'unused-in-these-tests',
      sizeBytes: 1,
      mimeType: 'application/octet-stream',
      keyvalues: {},
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
    invalidateResource: async ({ resourceId }) => ({ id: resourceId, status: 'deleted' }),
    ...overrides,
  };
}

function buildService(opts: { readonly client?: PinataProviderClient; readonly now?: () => string } = {}): AccessGrantService {
  const now = opts.now ?? buildClock();
  const store = createInMemoryAccessGrantStore({ now });
  return createAccessGrantService({ store, now, nextId, ...(opts.client !== undefined ? { pinataClient: opts.client } : {}) });
}

async function issuePinataGrant(
  service: AccessGrantService,
  overrides: { readonly expiresAt?: string; readonly providerCid?: string; readonly providerFileId?: string } = {},
) {
  return service.issueGrant(ORG_A, 'org-a', {
    resource: { kind: 'ipfs-object', id: 'internal-resource-1' },
    principalId: 'principal-1',
    decisionRef: 'decision-1',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: overrides.expiresAt ?? '2026-06-01T00:00:00.000Z',
    providerSystem: 'pinata',
    providerCid: overrides.providerCid ?? 'QmContentCid1',
    providerFileId: overrides.providerFileId ?? 'pinata-file-id-1',
  });
}

// ---------------------------------------------------------------------------
// Test C -- no future credential after revoke
// ---------------------------------------------------------------------------

describe('Test C -- revocation prevents issuance of any new provider credential', () => {
  it('denies requestProviderCredential once a grant is revoked', async () => {
    const client = makeFakeClient();
    const service = buildService({ client });
    const grant = await issuePinataGrant(service);

    const credential = await service.requestProviderCredential(ORG_A, { grantId: grant.id, requestedDurationSeconds: 3600 });
    assert.ok(credential.accessUrl.includes('QmContentCid1'));

    await service.revokeGrant(ORG_A, { grantId: grant.id, reason: 'administrator-revoked', requestedBy: 'admin-1' });

    await assert.rejects(
      () => service.requestProviderCredential(ORG_A, { grantId: grant.id, requestedDurationSeconds: 3600 }),
      (error: unknown) => error instanceof AccessGovernanceError && error.code === 'ACCESS_GRANT_NOT_ACTIVE',
    );
  });
});

// ---------------------------------------------------------------------------
// Test D -- outstanding TTL credential: Pinata cannot selectively invalidate,
// so revocation must be honestly reported as ttl_bounded, never blocked.
// ---------------------------------------------------------------------------

describe('Test D -- outstanding TTL-bounded Pinata credential', () => {
  it('reports ttl_bounded, never a false immediate/blocked result, and records the outstanding credential expiry', async () => {
    const client = makeFakeClient();
    const service = buildService({ client });
    const grant = await issuePinataGrant(service);

    const credential = await service.requestProviderCredential(ORG_A, { grantId: grant.id, requestedDurationSeconds: 300 });

    const outcome = await service.revokeGrant(ORG_A, { grantId: grant.id, reason: 'administrator-revoked', requestedBy: 'admin-1' });
    assert.equal(outcome.kind, 'revoked');
    if (outcome.kind !== 'revoked') return;

    const { enforcement } = outcome.revocation;
    assert.equal(enforcement.effectiveRevocationMode, 'ttl_bounded');
    assert.notEqual(enforcement.effectiveRevocationMode, 'immediate_selective');
    assert.notEqual(enforcement.providerActionResult, 'executed');
    assert.equal(enforcement.outstandingCredentialExpiresAt, credential.expiresAt);
    // The critical invariant: effectiveRevocationAt is never earlier than
    // the latest outstanding credential's own recorded expiry.
    assert.equal(enforcement.effectiveRevocationAt, credential.expiresAt);
    assert.ok((enforcement.enforcementLagSeconds ?? -1) >= 0);
  });

  it('never invokes files.public.delete for a non-resource-scoped reason (no blast-radius over-revocation)', async () => {
    let deleteCalled = false;
    const client = makeFakeClient({ invalidateResource: async (request) => { deleteCalled = true; return { id: request.resourceId, status: 'deleted' }; } });
    const service = buildService({ client });
    const grant = await issuePinataGrant(service);

    await service.revokeGrant(ORG_A, { grantId: grant.id, reason: 'manual-revocation', requestedBy: 'admin-1' });
    assert.equal(deleteCalled, false, 'files.public.delete must never be called merely to simulate per-grant revocation');
  });

  it('a grant with no outstanding credential is effective immediately (nothing to wait out)', async () => {
    const service = buildService({ client: makeFakeClient() });
    const grant = await issuePinataGrant(service);

    const outcome = await service.revokeGrant(ORG_A, { grantId: grant.id, reason: 'administrator-revoked', requestedBy: 'admin-1' });
    assert.equal(outcome.kind, 'revoked');
    if (outcome.kind !== 'revoked') return;
    assert.equal(outcome.revocation.enforcement.effectiveRevocationMode, 'ttl_bounded');
    assert.equal(outcome.revocation.enforcement.outstandingCredentialExpiresAt, undefined);
    assert.equal(outcome.revocation.enforcement.enforcementLagSeconds, 0);
  });
});

// ---------------------------------------------------------------------------
// resource-removed: the one reason files.public.delete is honestly invoked.
// ---------------------------------------------------------------------------

describe('resource-removed revocation reason -- resource_wide is truthful here', () => {
  it('invokes files.public.delete and reports resource_wide', async () => {
    let observedFileId: string | undefined;
    const client = makeFakeClient({
      invalidateResource: async (request) => {
        observedFileId = request.resourceId;
        return { id: request.resourceId, status: 'deleted' };
      },
    });
    const service = buildService({ client });
    const grant = await issuePinataGrant(service, { providerFileId: 'pinata-file-id-9' });

    const outcome = await service.revokeGrant(ORG_A, { grantId: grant.id, reason: 'resource-removed', requestedBy: 'admin-1' });
    assert.equal(outcome.kind, 'revoked');
    if (outcome.kind !== 'revoked') return;
    assert.equal(outcome.revocation.enforcement.effectiveRevocationMode, 'resource_wide');
    assert.equal(outcome.revocation.enforcement.providerActionResult, 'executed');
    assert.equal(observedFileId, 'pinata-file-id-9');
  });
});

// ---------------------------------------------------------------------------
// Enforcement lag / "measured" honesty
// ---------------------------------------------------------------------------

describe('measured enforcement lag', () => {
  it('is never claimed as measured (live-verified) unless independently proven', async () => {
    const service = buildService({ client: makeFakeClient() });
    const grant = await issuePinataGrant(service);
    await service.requestProviderCredential(ORG_A, { grantId: grant.id, requestedDurationSeconds: 60 });
    const outcome = await service.revokeGrant(ORG_A, { grantId: grant.id, reason: 'administrator-revoked', requestedBy: 'admin-1' });
    assert.equal(outcome.kind, 'revoked');
    if (outcome.kind !== 'revoked') return;
    assert.equal(outcome.revocation.enforcement.measured, false);
  });
});

// ---------------------------------------------------------------------------
// Idempotent revoke at the service layer
// ---------------------------------------------------------------------------

describe('idempotent revoke', () => {
  it('revoking an already-revoked grant returns the original revocation, never a second provider action', async () => {
    let deleteCalls = 0;
    const client = makeFakeClient({ invalidateResource: async (request) => { deleteCalls += 1; return { id: request.resourceId, status: 'deleted' }; } });
    const service = buildService({ client });
    const grant = await issuePinataGrant(service);

    const first = await service.revokeGrant(ORG_A, { grantId: grant.id, reason: 'resource-removed', requestedBy: 'admin-1' });
    const second = await service.revokeGrant(ORG_A, { grantId: grant.id, reason: 'security-incident', requestedBy: 'admin-2' });

    assert.equal(first.kind, 'revoked');
    assert.equal(second.kind, 'already-revoked');
    assert.equal(second.revocation.reason, 'resource-removed', 'the first revocation wins; a second call never overwrites it');
    assert.equal(deleteCalls, 1, 'the provider action must not be repeated on a redundant revoke call');
  });
});

// ---------------------------------------------------------------------------
// unknown provider
// ---------------------------------------------------------------------------

describe('a grant with no provider system', () => {
  it('reports effectiveRevocationMode unknown and never fabricates a provider claim', async () => {
    const service = buildService();
    const grant = await service.issueGrant(ORG_A, 'org-a', {
      resource: { kind: 'internal', id: 'no-provider-resource' },
      principalId: 'principal-1',
      decisionRef: 'decision-1',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-06-01T00:00:00.000Z',
    });
    const outcome = await service.revokeGrant(ORG_A, { grantId: grant.id, reason: 'administrator-revoked', requestedBy: 'admin-1' });
    assert.equal(outcome.kind, 'revoked');
    if (outcome.kind !== 'revoked') return;
    assert.equal(outcome.revocation.enforcement.effectiveRevocationMode, 'unknown');
    assert.equal(outcome.revocation.enforcement.providerSystem, undefined);
  });
});

// ---------------------------------------------------------------------------
// Test F -- cross-tenant isolation at the service layer
// ---------------------------------------------------------------------------

describe('Test F -- cross-tenant revocation is denied at the service layer', () => {
  it('tenant B cannot revoke tenant A\'s grant', async () => {
    const service = buildService({ client: makeFakeClient() });
    const grant = await issuePinataGrant(service);

    await assert.rejects(
      () => service.revokeGrant(ORG_B, { grantId: grant.id, reason: 'administrator-revoked', requestedBy: 'attacker' }),
      (error: unknown) => error instanceof AccessGovernanceError && error.code === 'ACCESS_GRANT_ACCESS_SCOPE_VIOLATION',
    );

    const stillActive = await service.getGrant({ system: true }, grant.id);
    assert.equal(stillActive.status, 'active');
  });
});

// ---------------------------------------------------------------------------
// Test H -- CID and Pinata file id remain distinct through the lifecycle
// ---------------------------------------------------------------------------

describe('Test H -- CID vs. Pinata file id identity distinctness', () => {
  it('uses providerCid for issuance and providerFileId for resource-wide invalidation -- never the same field', async () => {
    let observedCid: string | undefined;
    let observedFileId: string | undefined;
    const client = makeFakeClient({
      createTemporaryAccessLink: async (request) => {
        observedCid = request.cid;
        return { url: `https://gateway.pinata.cloud/files/${request.cid}` };
      },
      invalidateResource: async (request) => {
        observedFileId = request.resourceId;
        return { id: request.resourceId, status: 'deleted' };
      },
    });
    const service = buildService({ client });
    const grant = await issuePinataGrant(service, { providerCid: 'QmDistinctCid', providerFileId: 'distinct-file-id' });
    assert.notEqual(grant.providerCid, grant.providerFileId);

    await service.requestProviderCredential(ORG_A, { grantId: grant.id, requestedDurationSeconds: 60 });
    assert.equal(observedCid, 'QmDistinctCid');

    await service.revokeGrant(ORG_A, { grantId: grant.id, reason: 'resource-removed', requestedBy: 'admin-1' });
    assert.equal(observedFileId, 'distinct-file-id');
    assert.notEqual(observedFileId, observedCid);
  });
});

// ---------------------------------------------------------------------------
// Test G -- unauthenticated caller cannot revoke any grant
// ---------------------------------------------------------------------------

describe('Test G -- unauthenticated revocation is rejected', () => {
  it('revokeGrantRequest without a bearer token throws AUTHENTICATION_FAILED when authentication is required', async () => {
    const client = makeFakeClient();
    const service = buildService({ client });
    const grant = await issuePinataGrant(service);

    const configuration = loadEnterpriseConfiguration({ AOC_ENTERPRISE_REQUIRE_AUTH: 'true', AOC_ENTERPRISE_API_KEYS: 'valid-key:org-a' });

    await assert.rejects(
      () => revokeGrantRequest({ grantId: grant.id, reason: 'administrator-revoked', requestedBy: 'admin-1' }, { service, configuration }),
      (error: unknown) => error instanceof EnterpriseHttpError && error.code === 'AUTHENTICATION_FAILED',
    );

    const stillActive = await service.getGrant({ system: true }, grant.id);
    assert.equal(stillActive.status, 'active', 'an unauthenticated call must never mutate grant state');
  });

  it('rejects a credential scoped to a different organization than the grant', async () => {
    const client = makeFakeClient();
    const service = buildService({ client });
    const grant = await issuePinataGrant(service);
    const configuration = loadEnterpriseConfiguration({ AOC_ENTERPRISE_REQUIRE_AUTH: 'true', AOC_ENTERPRISE_API_KEYS: 'org-b-key:org-b' });

    await assert.rejects(
      () =>
        revokeGrantRequest(
          { grantId: grant.id, reason: 'administrator-revoked', requestedBy: 'admin-1', authorizationHeader: 'Bearer org-b-key' },
          { service, configuration },
        ),
      (error: unknown) => error instanceof AccessGovernanceError && error.code === 'ACCESS_GRANT_ACCESS_SCOPE_VIOLATION',
    );
  });

  it('a correctly-scoped bearer token succeeds', async () => {
    const client = makeFakeClient();
    const service = buildService({ client });
    const grant = await issuePinataGrant(service);
    const configuration = loadEnterpriseConfiguration({ AOC_ENTERPRISE_REQUIRE_AUTH: 'true', AOC_ENTERPRISE_API_KEYS: 'org-a-key:org-a' });

    const outcome = await revokeGrantRequest(
      { grantId: grant.id, reason: 'administrator-revoked', requestedBy: 'admin-1', authorizationHeader: 'Bearer org-a-key' },
      { service, configuration },
    );
    assert.equal(outcome.kind, 'revoked');
  });

  it('when authentication is not required (local/dev posture), an unscoped call succeeds -- a deployment posture, never a bypass of tenant checks', async () => {
    const client = makeFakeClient();
    const service = buildService({ client });
    const grant = await issuePinataGrant(service);
    const configuration = loadEnterpriseConfiguration({ AOC_ENTERPRISE_REQUIRE_AUTH: 'false' });

    const outcome = await revokeGrantRequest({ grantId: grant.id, reason: 'administrator-revoked', requestedBy: 'admin-1' }, { service, configuration });
    assert.equal(outcome.kind, 'revoked');
  });
});

// ---------------------------------------------------------------------------
// Governance revocation reason vocabulary
// ---------------------------------------------------------------------------

describe('revocation reason validation', () => {
  it('rejects a reason outside the canonical EnterpriseGrantRevocationReason vocabulary', async () => {
    const service = buildService({ client: makeFakeClient() });
    const grant = await issuePinataGrant(service);
    await assert.rejects(
      // @ts-expect-error -- deliberately not a member of EnterpriseGrantRevocationReason
      () => service.revokeGrant(ORG_A, { grantId: grant.id, reason: 'because-i-said-so', requestedBy: 'admin-1' }),
      (error: unknown) => error instanceof AccessGovernanceError && error.code === 'ACCESS_GRANT_VALIDATION_ERROR',
    );
  });
});

// ---------------------------------------------------------------------------
// Strict UTC timestamp validation
// ---------------------------------------------------------------------------

describe('strict UTC timestamp validation', () => {
  it('rejects issuedAt/expiresAt that are not strict UTC (e.g. a non-zero offset)', async () => {
    const service = buildService();
    await assert.rejects(
      () =>
        service.issueGrant(ORG_A, 'org-a', {
          resource: { kind: 'internal', id: 'r1' },
          principalId: 'p1',
          decisionRef: 'd1',
          issuedAt: '2026-01-01T00:00:00+02:00',
          expiresAt: '2026-01-02T00:00:00.000Z',
        }),
      (error: unknown) => error instanceof AccessGovernanceError && error.code === 'ACCESS_GRANT_INVALID_TIMESTAMP',
    );
  });
});
