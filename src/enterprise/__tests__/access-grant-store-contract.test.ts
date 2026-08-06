import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createInMemoryAccessGrantStore } from '../access-governance/in-memory-access-grant-store.js';
import { createSqliteAccessGrantStore } from '../access-governance/sqlite-access-grant-store.js';
import { AccessGovernanceError } from '../access-governance/errors.js';
import { createPendingEnforcementResult } from '../access-governance/contracts.js';
import type { AccessGrantStore } from '../access-governance/access-grant-store.js';
import type { IssueAccessGrantInput } from '../access-governance/contracts.js';

const ORG_A = { organizationId: 'org-a', system: false } as const;
const ORG_B = { organizationId: 'org-b', system: false } as const;
const SYSTEM = { system: true } as const;

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function grantInput(overrides: Partial<IssueAccessGrantInput> = {}): IssueAccessGrantInput {
  return {
    id: nextId('grant'),
    organizationId: 'org-a',
    resource: { kind: 'ipfs-object', id: 'internal-resource-1' },
    principalId: 'principal-1',
    decisionRef: 'decision-1',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-02T00:00:00.000Z',
    correlationId: nextId('corr'),
    ...overrides,
  };
}

const closers: Array<() => Promise<void>> = [];
after(async () => {
  await Promise.all(closers.map((close) => close().catch(() => {})));
});

const providers: readonly { readonly name: string; readonly build: () => Promise<AccessGrantStore> }[] = [
  { name: 'in-memory', build: async () => createInMemoryAccessGrantStore({ now: buildClock() }) },
  { name: 'sqlite (:memory:)', build: async () => createSqliteAccessGrantStore(':memory:', { now: buildClock() }) },
];

for (const provider of providers) {
  describe(`AccessGrantStore contract -- ${provider.name}`, () => {
    async function open(): Promise<AccessGrantStore> {
      const store = await provider.build();
      closers.push(() => store.close());
      return store;
    }

    it('issues a grant and reads it back (Test A basis)', async () => {
      const store = await open();
      const input = grantInput();
      const issued = await store.issueGrant(ORG_A, input);
      assert.equal(issued.status, 'active');
      assert.equal(issued.id, input.id);

      const fetched = await store.getGrant(ORG_A, input.id);
      assert.equal(fetched.id, input.id);
      assert.equal(fetched.resource.id, 'internal-resource-1');
    });

    it('rejects a duplicate grant id', async () => {
      const store = await open();
      const input = grantInput();
      await store.issueGrant(ORG_A, input);
      await assert.rejects(() => store.issueGrant(ORG_A, input), (error: unknown) => error instanceof AccessGovernanceError && error.code === 'ACCESS_GRANT_ALREADY_EXISTS');
    });

    it('beginRevocation flips status to revoked and persists a pending-enforcement revocation', async () => {
      const store = await open();
      const input = grantInput();
      await store.issueGrant(ORG_A, input);

      const outcome = await store.beginRevocation(ORG_A, {
        revocationId: nextId('revocation'),
        grantId: input.id,
        organizationId: 'org-a',
        revokedAt: '2026-01-01T01:00:00.000Z',
        reason: 'administrator-revoked',
        issuerRef: 'admin-1',
        correlationId: nextId('corr'),
      });
      assert.equal(outcome.kind, 'revoked');
      assert.equal(outcome.grant.status, 'revoked');
      assert.equal(outcome.revocation.enforcement.effectiveRevocationMode, 'unknown');
      assert.equal(outcome.revocation.enforcement.providerActionResult, 'skipped');

      const reread = await store.getGrant(ORG_A, input.id);
      assert.equal(reread.status, 'revoked');
    });

    it('idempotent revoke: a second beginRevocation call returns the original revocation without re-mutating it (Test B/idempotency basis)', async () => {
      const store = await open();
      const input = grantInput();
      await store.issueGrant(ORG_A, input);

      const first = await store.beginRevocation(ORG_A, {
        revocationId: nextId('revocation'),
        grantId: input.id,
        organizationId: 'org-a',
        revokedAt: '2026-01-01T01:00:00.000Z',
        reason: 'administrator-revoked',
        issuerRef: 'admin-1',
        correlationId: nextId('corr'),
      });
      const second = await store.beginRevocation(ORG_A, {
        revocationId: nextId('revocation'),
        grantId: input.id,
        organizationId: 'org-a',
        revokedAt: '2026-01-01T02:00:00.000Z',
        reason: 'security-incident',
        issuerRef: 'admin-2',
        correlationId: nextId('corr'),
      });
      assert.equal(second.kind, 'already-revoked');
      assert.equal(second.revocation.id, first.kind === 'revoked' ? first.revocation.id : undefined);
      assert.equal(second.revocation.reason, 'administrator-revoked');
    });

    it('finalizeRevocationEnforcement overwrites the placeholder with the real determination', async () => {
      const store = await open();
      const input = grantInput({ providerSystem: 'pinata', providerCid: 'QmCid1', providerFileId: 'file-1' });
      await store.issueGrant(ORG_A, input);
      await store.beginRevocation(ORG_A, {
        revocationId: nextId('revocation'),
        grantId: input.id,
        organizationId: 'org-a',
        revokedAt: '2026-01-01T01:00:00.000Z',
        reason: 'administrator-revoked',
        issuerRef: 'admin-1',
        correlationId: nextId('corr'),
      });

      const finalized = await store.finalizeRevocationEnforcement(ORG_A, {
        grantId: input.id,
        organizationId: 'org-a',
        enforcement: {
          revocationRequestedAt: '2026-01-01T01:00:01.000Z',
          providerSystem: 'pinata',
          providerActionResult: 'skipped',
          providerActionDetail: 'ttl_bounded fallback',
          effectiveRevocationMode: 'ttl_bounded',
          effectiveRevocationAt: '2026-01-02T00:00:00.000Z',
          enforcementLagSeconds: 82_799,
          outstandingCredentialExpiresAt: '2026-01-02T00:00:00.000Z',
          measured: false,
        },
      });
      assert.equal(finalized.enforcement.effectiveRevocationMode, 'ttl_bounded');
      assert.equal(finalized.enforcement.enforcementLagSeconds, 82_799);
    });

    it('recordProviderCredentialIssuance advances the outstanding-credential high-water mark, never regresses it', async () => {
      const store = await open();
      const input = grantInput();
      await store.issueGrant(ORG_A, input);

      const first = await store.recordProviderCredentialIssuance(ORG_A, { grantId: input.id, organizationId: 'org-a', expiresAt: '2026-01-01T06:00:00.000Z' });
      assert.equal(first.latestOutstandingCredentialExpiresAt, '2026-01-01T06:00:00.000Z');

      const earlier = await store.recordProviderCredentialIssuance(ORG_A, { grantId: input.id, organizationId: 'org-a', expiresAt: '2026-01-01T03:00:00.000Z' });
      assert.equal(earlier.latestOutstandingCredentialExpiresAt, '2026-01-01T06:00:00.000Z', 'must never regress to an earlier expiry');

      const later = await store.recordProviderCredentialIssuance(ORG_A, { grantId: input.id, organizationId: 'org-a', expiresAt: '2026-01-01T12:00:00.000Z' });
      assert.equal(later.latestOutstandingCredentialExpiresAt, '2026-01-01T12:00:00.000Z');
    });

    it('Test F: a different tenant cannot see or revoke another tenant\'s grant', async () => {
      const store = await open();
      const input = grantInput();
      await store.issueGrant(ORG_A, input);

      await assert.rejects(() => store.getGrant(ORG_B, input.id), (error: unknown) => error instanceof AccessGovernanceError && error.code === 'ACCESS_GRANT_ACCESS_SCOPE_VIOLATION');
      await assert.rejects(
        () =>
          store.beginRevocation(ORG_B, {
            revocationId: nextId('revocation'),
            grantId: input.id,
            organizationId: 'org-b',
            revokedAt: '2026-01-01T01:00:00.000Z',
            reason: 'administrator-revoked',
            issuerRef: 'attacker',
            correlationId: nextId('corr'),
          }),
        (error: unknown) => error instanceof AccessGovernanceError && (error.code === 'ACCESS_GRANT_ACCESS_SCOPE_VIOLATION' || error.code === 'ACCESS_GRANT_NOT_FOUND'),
      );

      // The grant must remain untouched.
      const stillActive = await store.getGrant(SYSTEM, input.id);
      assert.equal(stillActive.status, 'active');
    });

    it('a non-system caller without an organization scope is rejected', async () => {
      const store = await open();
      await assert.rejects(
        () => store.issueGrant({ system: false }, grantInput()),
        (error: unknown) => error instanceof AccessGovernanceError && error.code === 'ACCESS_GRANT_TENANT_SCOPE_REQUIRED',
      );
    });

    it('a system caller can see grants across tenants', async () => {
      const store = await open();
      const a = grantInput({ organizationId: 'org-a' });
      const b = grantInput({ organizationId: 'org-b' });
      await store.issueGrant(ORG_A, a);
      await store.issueGrant(ORG_B, b);
      assert.equal((await store.getGrant(SYSTEM, a.id)).organizationId, 'org-a');
      assert.equal((await store.getGrant(SYSTEM, b.id)).organizationId, 'org-b');
    });

    it('reports store health', async () => {
      const store = await open();
      const health = await store.health();
      assert.equal(health.status, 'healthy');
      assert.equal(health.readable, true);
      assert.equal(health.writable, true);
    });
  });
}

// ---------------------------------------------------------------------------
// Test A / Test B: on-disk SQLite durability across process restart. A
// fresh `createSqliteAccessGrantStore` call against the SAME on-disk path,
// after the first store instance is closed, models "a grant issued in
// process A must still be recognized as revoked by process B after
// restart" -- the closest thing a single-process test suite can do to
// prove a real process restart, short of spawning a child process.
// ---------------------------------------------------------------------------

describe('AccessGrantStore durability across restart (Test A / Test B)', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'aoc-access-grant-store-'));

  it('Test A: a grant issued in process A is still readable after the store is closed and reopened from disk', async () => {
    const dbPath = join(workDir, 'durability-a.sqlite');
    const input = grantInput();

    const first = await createSqliteAccessGrantStore(dbPath, { now: buildClock() });
    await first.issueGrant(ORG_A, input);
    await first.close();

    const second = await createSqliteAccessGrantStore(dbPath, { now: buildClock() });
    const reread = await second.getGrant(ORG_A, input.id);
    assert.equal(reread.status, 'active');
    assert.equal(reread.id, input.id);
    await second.close();
  });

  it('Test B: a grant revoked in process A remains revoked in process B after restart', async () => {
    const dbPath = join(workDir, 'durability-b.sqlite');
    const input = grantInput();

    const first = await createSqliteAccessGrantStore(dbPath, { now: buildClock() });
    await first.issueGrant(ORG_A, input);
    const begun = await first.beginRevocation(ORG_A, {
      revocationId: nextId('revocation'),
      grantId: input.id,
      organizationId: 'org-a',
      revokedAt: '2026-01-01T01:00:00.000Z',
      reason: 'administrator-revoked',
      issuerRef: 'admin-1',
      correlationId: nextId('corr'),
    });
    assert.equal(begun.kind, 'revoked');
    await first.finalizeRevocationEnforcement(ORG_A, {
      grantId: input.id,
      organizationId: 'org-a',
      enforcement: createPendingEnforcementResult('2026-01-01T01:00:00.000Z'),
    });
    await first.close();

    const second = await createSqliteAccessGrantStore(dbPath, { now: buildClock() });
    const reread = await second.getGrant(ORG_A, input.id);
    assert.equal(reread.status, 'revoked', 'revocation must survive a process restart');

    const revocation = await second.getRevocation(ORG_A, input.id);
    assert.ok(revocation);
    assert.equal(revocation?.reason, 'administrator-revoked');

    // Revoking again after restart must still be idempotent, never a second mutation.
    const replay = await second.beginRevocation(ORG_A, {
      revocationId: nextId('revocation'),
      grantId: input.id,
      organizationId: 'org-a',
      revokedAt: '2026-01-01T09:00:00.000Z',
      reason: 'security-incident',
      issuerRef: 'admin-3',
      correlationId: nextId('corr'),
    });
    assert.equal(replay.kind, 'already-revoked');
    assert.equal(replay.revocation.reason, 'administrator-revoked');

    await second.close();
  });
});
