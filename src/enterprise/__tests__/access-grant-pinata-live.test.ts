import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPinataProviderClient } from '@aoc-enterprise/pinata-adapter';
import { createInMemoryAccessGrantStore } from '../access-governance/in-memory-access-grant-store.js';
import { createAccessGrantService } from '../access-governance/service.js';

const ORG = { organizationId: 'org-live-test', system: false } as const;

/**
 * Live Pinata provider verification (Slice 1's "Live Provider Verification"
 * requirement). Runs ONLY when real credentials are present in this
 * repository's normal configured environment:
 *
 *   PINATA_JWT           -- required. A real Pinata JWT.
 *   PINATA_TEST_CID       -- required. The CID of an already-pinned,
 *                            private test resource this JWT can issue a
 *                            signed access link for.
 *   PINATA_TEST_FILE_ID   -- required. Pinata's own file id for that same
 *                            resource (distinct from the CID -- see
 *                            GAP-012). Used only if PINATA_LIVE_ALLOW_DELETE
 *                            is also set (see below).
 *   PINATA_GATEWAY        -- optional dedicated gateway domain.
 *   PINATA_LIVE_ALLOW_DELETE -- optional. Only when set to 'true' does this
 *                            suite ever call the real, destructive
 *                            files.public.delete (the resource-removed /
 *                            resource_wide path). Defaults unset: this
 *                            suite is otherwise strictly read/issue-only
 *                            against real Pinata, never destructive by
 *                            default.
 *
 * If any required variable is absent, every test in this file is skipped
 * with an explicit reason -- never silently passed, never faked. This is
 * the Slice 1 "unverified" gate: when this file's tests do not run, the
 * final report must say so plainly, not claim live verification occurred.
 */
const jwt = process.env.PINATA_JWT;
const testCid = process.env.PINATA_TEST_CID;
const testFileId = process.env.PINATA_TEST_FILE_ID;
const gateway = process.env.PINATA_GATEWAY;
const allowDelete = process.env.PINATA_LIVE_ALLOW_DELETE === 'true';

const liveConfigured = jwt !== undefined && jwt.length > 0 && testCid !== undefined && testCid.length > 0;
const skipReason = liveConfigured
  ? undefined
  : 'PINATA_JWT and PINATA_TEST_CID are not configured in this environment -- live Pinata verification is UNVERIFIED for this run (Slice 1 requirement: never fake provider evidence).';

function buildClock(): () => string {
  return () => new Date().toISOString();
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

describe('Live Pinata provider verification (Slice 1)', { skip: skipReason }, () => {
  it('issues a short-lived signed access link, verifies it works, revokes the Enterprise grant, and measures enforcement lag', async () => {
    assert.ok(jwt);
    assert.ok(testCid);

    const client = createPinataProviderClient({ jwt, ...(gateway !== undefined ? { gateway } : {}) });
    const now = buildClock();
    const store = createInMemoryAccessGrantStore({ now });
    const service = createAccessGrantService({ store, now, nextId, pinataClient: client });

    const grant = await service.issueGrant(ORG, 'org-live-test', {
      resource: { kind: 'ipfs-object', id: 'live-test-resource' },
      principalId: 'live-test-principal',
      decisionRef: 'live-test-decision',
      issuedAt: now(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      providerSystem: 'pinata',
      providerCid: testCid,
      ...(testFileId !== undefined ? { providerFileId: testFileId } : {}),
    });

    // Step: issue a short-lived access capability.
    const shortLivedSeconds = 10;
    const credential = await service.requestProviderCredential(ORG, { grantId: grant.id, requestedDurationSeconds: shortLivedSeconds });
    assert.ok(credential.accessUrl.length > 0);

    // Step: verify it works.
    const initialResponse = await fetch(credential.accessUrl, { method: 'GET' });
    assert.ok(initialResponse.ok, `Expected the freshly-issued signed URL to be usable; got HTTP ${initialResponse.status}`);

    // Step: revoke the corresponding Enterprise grant.
    const revokedAt = now();
    const outcome = await service.revokeGrant(ORG, { grantId: grant.id, reason: 'administrator-revoked', requestedBy: 'live-test-admin', revokedAt });
    assert.equal(outcome.kind, 'revoked');
    if (outcome.kind !== 'revoked') return;

    // Step: verify no NEW capability can be issued.
    await assert.rejects(() => service.requestProviderCredential(ORG, { grantId: grant.id, requestedDurationSeconds: shortLivedSeconds }));

    // Step: the already-issued capability -- record whether it remains usable.
    const enforcement = outcome.revocation.enforcement;
    assert.equal(enforcement.effectiveRevocationMode, 'ttl_bounded', 'Pinata cannot selectively invalidate an already-issued signed URL');
    const stillUsableResponse = await fetch(credential.accessUrl, { method: 'GET' });
    console.log(`[live-pinata] outstanding credential ${stillUsableResponse.ok ? 'remains usable' : 'already unusable'} immediately after revocation (HTTP ${stillUsableResponse.status}) -- expected while still within its own TTL.`);

    // Step: wait only if the TTL is short and practical (it is, by construction: shortLivedSeconds).
    const waitMs = Math.max(0, Date.parse(credential.expiresAt) - Date.now()) + 2_000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    // Step: verify it becomes unusable at the actual enforcement boundary.
    const afterExpiryResponse = await fetch(credential.accessUrl, { method: 'GET' });
    const measuredEffectiveAt = new Date().toISOString();
    const measuredLagSeconds = (Date.parse(measuredEffectiveAt) - Date.parse(revokedAt)) / 1000;
    console.log(`[live-pinata] credential HTTP status after its own expiry: ${afterExpiryResponse.status}; measured enforcement lag ~${measuredLagSeconds.toFixed(1)}s (estimate recorded by this module: ${enforcement.enforcementLagSeconds}s).`);

    assert.equal(afterExpiryResponse.ok, false, 'Expected the credential to be unusable after its own recorded expiry.');
  });

  it('resource_wide (files.public.delete) is only exercised when PINATA_LIVE_ALLOW_DELETE=true', { skip: allowDelete ? undefined : 'Set PINATA_LIVE_ALLOW_DELETE=true to run the destructive resource-removed path against a disposable test resource.' }, async () => {
    assert.ok(jwt);
    assert.ok(testFileId, 'PINATA_TEST_FILE_ID is required for the resource-removed path.');

    const client = createPinataProviderClient({ jwt, ...(gateway !== undefined ? { gateway } : {}) });
    const now = buildClock();
    const store = createInMemoryAccessGrantStore({ now });
    const service = createAccessGrantService({ store, now, nextId, pinataClient: client });

    const grant = await service.issueGrant(ORG, 'org-live-test', {
      resource: { kind: 'ipfs-object', id: 'live-test-resource-delete' },
      principalId: 'live-test-principal',
      decisionRef: 'live-test-decision',
      issuedAt: now(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      providerSystem: 'pinata',
      providerCid: testCid as string,
      providerFileId: testFileId as string,
    });

    const outcome = await service.revokeGrant(ORG, { grantId: grant.id, reason: 'resource-removed', requestedBy: 'live-test-admin' });
    assert.equal(outcome.kind, 'revoked');
    if (outcome.kind !== 'revoked') return;
    assert.equal(outcome.revocation.enforcement.providerActionResult, 'executed');
    assert.equal(outcome.revocation.enforcement.effectiveRevocationMode, 'resource_wide');
  });
});
