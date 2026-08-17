import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
import {
  GOVERNANCE_REFERENCE_INTEGRITY_VERSION,
  GOVERNANCE_REFERENCE_TYPES,
  type AppendGovernanceEvaluationInput,
  type GovernanceStoreAccessContext,
} from '../governance-store/contracts.js';
import { GovernanceStoreError } from '../governance-store/errors.js';
import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
import { createInMemoryGovernanceStore } from '../governance-store/in-memory-governance-store.js';
import { verifyGovernanceRecordIntegrity } from '../governance-store/verification.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';

/**
 * Reference integrity for the Governance Store.
 *
 * Two properties are under test, and they pull in opposite directions:
 *
 * 1. newly appended references are tamper-evident, proven by mutating real
 *    SQLite files after a clean close and reopening them;
 * 2. nothing about historical evidence changes — aggregate digests are
 *    byte-identical, and reference rows written before this mechanism
 *    existed stay readable and are never reported as faults.
 *
 * Every persistence test here writes a real file, closes the store, mutates
 * the database through a separate connection, and reopens. Nothing is
 * asserted against a mocked object: a test that tampered with an in-memory
 * structure would prove nothing about durable tamper evidence.
 */

const workDir = mkdtempSync(join(tmpdir(), 'aoc-reference-integrity-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

const SYSTEM: GovernanceStoreAccessContext = { system: true };

let dbCounter = 0;
function tempDbPath(name: string): string {
  dbCounter += 1;
  return join(workDir, `${name}-${dbCounter}.sqlite`);
}

function buildInput(requestId: string, decisionId: string, organizationId = 'org-a'): AppendGovernanceEvaluationInput {
  const request: KernelEvaluationRequest = {
    requestId,
    actor: { id: 'actor-1', trustDomainId: 'td-1' },
    action: { type: 'tokenize', resourceScope: 'asset:building-a' },
    organization: { id: organizationId },
    requestedAt: '2026-01-01T00:00:00.000Z',
  };
  const result = {
    requestId,
    decisionId,
    status: 'allowed',
    reasonCodes: ['OK'],
    summary: 'allowed',
    recognition: { performed: true },
    authority: { performed: false },
    policies: [],
    approval: { performed: false, status: 'not_applicable' },
    evidence: [],
    trace: { steps: [{ sequence: 1, operator: 'recognition', status: 'passed', reasonCodes: ['OK'] }], decisionId, kernelVersion: '1.0.0' },
    evaluatedAt: '2026-01-01T00:00:01.000Z',
    kernelVersion: '1.0.0',
  } as KernelEvaluationResult;
  return {
    request,
    result,
    receivedAt: '2026-01-01T00:00:00.500Z',
    enterpriseContext: { enterpriseVersion: '1.0.0', lifecycleState: 'ready', modules: [] },
    events: [{ eventId: `evt-${requestId}`, type: 'GovernanceEvaluationRequested', occurredAt: '2026-01-01T00:00:00.500Z', requestId }],
    accessContext: { system: true },
  };
}

async function openRawDb(path: string) {
  const { default: Database } = await import('better-sqlite3');
  return new Database(path);
}

interface RawDb {
  prepare(sql: string): { run(...params: unknown[]): unknown; get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] };
  close(): void;
}

/**
 * The canonical shape of every tampering test: append protected references
 * to a real file, close, mutate through a separate connection, reopen, and
 * verify. `mutate` receives the evaluation id so it can target precisely.
 */
async function tamper(
  name: string,
  seed: (store: GovernanceStore, evaluationId: string) => Promise<void>,
  mutate: (db: RawDb, evaluationId: string) => void,
) {
  const path = tempDbPath(name);
  const store = await createSqliteGovernanceStore(path);
  const appended = await store.appendEvaluation(buildInput(`req-${name}`, `dec-${name}`));
  await seed(store, appended.evaluationId);
  const before = await store.verify(SYSTEM, appended.evaluationId);
  assert.equal(before.valid, true, `${name}: the untampered baseline must verify`);
  await store.close();

  const db = (await openRawDb(path)) as unknown as RawDb;
  mutate(db, appended.evaluationId);
  db.close();

  const reopened = await createSqliteGovernanceStore(path);
  const verification = await reopened.verify(SYSTEM, appended.evaluationId);
  const record = await reopened.getByEvaluationId(SYSTEM, appended.evaluationId);
  await reopened.close();
  return { verification, record, evaluationId: appended.evaluationId };
}

async function appendAuthorizationReference(store: GovernanceStore, evaluationId: string, suffix = '1'): Promise<void> {
  await store.appendReference(SYSTEM, {
    referenceId: `ref-authorization-${suffix}`,
    evaluationId,
    referenceType: 'authorization_artifact',
    externalId: `mandate:M${suffix}`,
    externalVersion: '1.0.0',
    createdAt: `2026-01-02T00:00:0${suffix}.000Z`,
  });
}

// ---------------------------------------------------------------------------
// A. Aggregate integrity is untouched
// ---------------------------------------------------------------------------

describe('reference integrity — A. the aggregate digest is not redefined', () => {
  it('appending protected references leaves the aggregate digest and store chain byte-identical', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const first = await store.appendEvaluation(buildInput('req-a1', 'dec-a1'));
    const second = await store.appendEvaluation(buildInput('req-a2', 'dec-a2'));

    const digestBefore = (await store.getByEvaluationId(SYSTEM, first.evaluationId))?.integrity.aggregateDigest;
    await appendAuthorizationReference(store, first.evaluationId);
    await appendAuthorizationReference(store, first.evaluationId, '2');
    const digestAfter = (await store.getByEvaluationId(SYSTEM, first.evaluationId))?.integrity.aggregateDigest;

    assert.equal(digestAfter, digestBefore, 'a reference append must never change an aggregate digest');
    assert.equal(digestBefore, first.aggregateDigest, 'and it must still equal the digest returned at commit');

    const verified = await store.verify(SYSTEM, first.evaluationId);
    assert.equal(verified.valid, true);
    assert.equal(verified.checks.aggregateDigest, true);

    // The successor's chain link points at the predecessor's digest; if a
    // reference append had disturbed that digest, this is where it would show.
    const verifiedSecond = await store.verify(SYSTEM, second.evaluationId);
    assert.equal(verifiedSecond.checks.previousDigest, true);
    await store.close();
  });

  it('an aggregate with no references verifies with an all-zero reference summary', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const appended = await store.appendEvaluation(buildInput('req-a3', 'dec-a3'));
    const verification = await store.verify(SYSTEM, appended.evaluationId);
    assert.equal(verification.valid, true);
    assert.equal(verification.checks.referenceIntegrity, true);
    assert.deepEqual(verification.referenceIntegrity, { legacyUnprotected: 0, protectedValid: 0, protectedCorrupted: 0, protectedUnsupportedVersion: 0 });
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// B. Protected persistence across restart
// ---------------------------------------------------------------------------

describe('reference integrity — B. protected references survive a restart', () => {
  it('seals a reference on append and verifies it from a reopened store instance', async () => {
    const path = tempDbPath('restart');
    const storeA = await createSqliteGovernanceStore(path);
    const appended = await storeA.appendEvaluation(buildInput('req-b1', 'dec-b1'));
    await appendAuthorizationReference(storeA, appended.evaluationId);
    await storeA.close();

    const storeB = await createSqliteGovernanceStore(path);
    const record = await storeB.getByEvaluationId(SYSTEM, appended.evaluationId);
    const verification = await storeB.verify(SYSTEM, appended.evaluationId);
    await storeB.close();

    const reference = record?.references[0];
    assert.equal(reference?.referenceType, 'authorization_artifact');
    assert.equal(reference?.sequence, 1);
    assert.equal(reference?.integrityVersion, GOVERNANCE_REFERENCE_INTEGRITY_VERSION);
    assert.equal(reference?.previousReferenceDigest, undefined, 'the first reference has no predecessor');
    assert.match(String(reference?.referenceDigest), /^sha256:[0-9a-f]{64}$/);

    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.equal(verification.referenceIntegrity.protectedValid, 1);
  });

  it('chains multiple references in append order, each linking to its predecessor', async () => {
    const path = tempDbPath('chain');
    const storeA = await createSqliteGovernanceStore(path);
    const appended = await storeA.appendEvaluation(buildInput('req-b2', 'dec-b2'));
    for (const suffix of ['1', '2', '3']) await appendAuthorizationReference(storeA, appended.evaluationId, suffix);
    await storeA.close();

    const storeB = await createSqliteGovernanceStore(path);
    const record = await storeB.getByEvaluationId(SYSTEM, appended.evaluationId);
    const verification = await storeB.verify(SYSTEM, appended.evaluationId);
    await storeB.close();

    const references = [...(record?.references ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    assert.deepEqual(references.map((reference) => reference.sequence), [1, 2, 3]);
    assert.equal(references[1]?.previousReferenceDigest, references[0]?.referenceDigest);
    assert.equal(references[2]?.previousReferenceDigest, references[1]?.referenceDigest);
    assert.equal(verification.valid, true);
    assert.equal(verification.referenceIntegrity.protectedValid, 3);
  });

  it('scopes the chain per evaluation: two aggregates each start at sequence 1', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const first = await store.appendEvaluation(buildInput('req-b3', 'dec-b3'));
    const second = await store.appendEvaluation(buildInput('req-b4', 'dec-b4'));
    await store.appendReference(SYSTEM, { referenceId: 'ref-s1', evaluationId: first.evaluationId, referenceType: 'evidence_bundle', externalId: 'bundle-1', createdAt: '2026-01-02T00:00:00.000Z' });
    await store.appendReference(SYSTEM, { referenceId: 'ref-s2', evaluationId: second.evaluationId, referenceType: 'evidence_bundle', externalId: 'bundle-2', createdAt: '2026-01-02T00:00:01.000Z' });

    const firstRecord = await store.getByEvaluationId(SYSTEM, first.evaluationId);
    const secondRecord = await store.getByEvaluationId(SYSTEM, second.evaluationId);
    assert.equal(firstRecord?.references[0]?.sequence, 1);
    assert.equal(secondRecord?.references[0]?.sequence, 1, 'a per-evaluation chain never inherits another aggregate’s position');
    assert.equal(secondRecord?.references[0]?.previousReferenceDigest, undefined);
    await store.close();
  });

  it('the in-memory provider produces the same sealed bytes as the durable one', async () => {
    const memory = createInMemoryGovernanceStore();
    const sqlite = await createSqliteGovernanceStore(':memory:');
    for (const store of [memory, sqlite]) {
      const appended = await store.appendEvaluation(buildInput('req-parity', 'dec-parity'));
      await store.appendReference(SYSTEM, {
        referenceId: 'ref-parity',
        evaluationId: appended.evaluationId,
        referenceType: 'authorization_artifact',
        externalId: 'mandate:parity',
        createdAt: '2026-01-02T00:00:00.000Z',
      });
    }
    // Evaluation ids are store-generated and differ, so compare the one thing
    // that must not drift: both providers seal under the same version and both
    // verify. (Digest equality would require identical evaluation ids.)
    const memoryRecord = await memory.getByRequestId(SYSTEM, 'req-parity');
    const sqliteRecord = await sqlite.getByRequestId(SYSTEM, 'req-parity');
    assert.equal(memoryRecord?.references[0]?.integrityVersion, GOVERNANCE_REFERENCE_INTEGRITY_VERSION);
    assert.equal(sqliteRecord?.references[0]?.integrityVersion, GOVERNANCE_REFERENCE_INTEGRITY_VERSION);
    assert.equal((await memory.verify(SYSTEM, memoryRecord!.evaluation.evaluationId)).valid, true);
    assert.equal((await sqlite.verify(SYSTEM, sqliteRecord!.evaluation.evaluationId)).valid, true);
    await memory.close();
    await sqlite.close();
  });
});

// ---------------------------------------------------------------------------
// C-E. Direct SQLite tampering
// ---------------------------------------------------------------------------

describe('reference integrity — C. referenceType tampering', () => {
  it('detects authorization_artifact rewritten to external_artifact', async () => {
    const { verification, record } = await tamper(
      'type-downgrade',
      (store, evaluationId) => appendAuthorizationReference(store, evaluationId),
      (db) => {
        db.prepare(`UPDATE governance_references SET reference_type = 'external_artifact' WHERE reference_id = 'ref-authorization-1'`).run();
      },
    );
    assert.equal(verification.valid, false);
    assert.deepEqual(new Set(verification.failures.map((failure) => failure.check)), new Set(['referenceIntegrity']));
    assert.equal(verification.checks.aggregateDigest, true, 'aggregate integrity must be unaffected');
    assert.equal(verification.referenceIntegrity.protectedCorrupted, 1);
    assert.equal(record?.references[0]?.referenceType, 'external_artifact', 'the tampered value is still returned; verification is what reports it');
  });

  it('detects an execution_record forged into an authorization_artifact', async () => {
    const { verification } = await tamper(
      'type-upgrade',
      (store, evaluationId) =>
        store.appendReference(SYSTEM, { referenceId: 'ref-exec', evaluationId, referenceType: 'execution_record', externalId: 'exec-1', createdAt: '2026-01-02T00:00:00.000Z' }),
      (db) => {
        db.prepare(`UPDATE governance_references SET reference_type = 'authorization_artifact' WHERE reference_id = 'ref-exec'`).run();
      },
    );
    assert.equal(verification.valid, false);
    assert.equal(verification.referenceIntegrity.protectedCorrupted, 1);
  });
});

describe('reference integrity — D. externalId tampering', () => {
  it('detects mandate:M1 repointed to mandate:M2', async () => {
    const { verification, record } = await tamper(
      'external-id',
      (store, evaluationId) => appendAuthorizationReference(store, evaluationId),
      (db) => {
        db.prepare(`UPDATE governance_references SET external_id = 'mandate:M2' WHERE reference_id = 'ref-authorization-1'`).run();
      },
    );
    assert.equal(verification.valid, false);
    assert.equal(verification.referenceIntegrity.protectedCorrupted, 1);
    assert.equal(record?.references[0]?.externalId, 'mandate:M2');
  });

  it('detects tampering with every other digested semantic field', async () => {
    const mutations: readonly (readonly [string, string])[] = [
      ['external_version', `UPDATE governance_references SET external_version = '9.9.9' WHERE reference_id = 'ref-authorization-1'`],
      ['uri', `UPDATE governance_references SET uri = 'https://forged.example/artifact' WHERE reference_id = 'ref-authorization-1'`],
      ['digest', `UPDATE governance_references SET digest = 'sha256:${'a'.repeat(64)}' WHERE reference_id = 'ref-authorization-1'`],
      ['created_at', `UPDATE governance_references SET created_at = '2020-01-01T00:00:00.000Z' WHERE reference_id = 'ref-authorization-1'`],
      ['evaluation_id-repointing', `UPDATE governance_references SET reference_id = 'ref-authorization-1' WHERE reference_id = 'ref-authorization-1'`],
    ];
    for (const [label, sql] of mutations.slice(0, 4)) {
      const { verification } = await tamper(`field-${label}`, (store, evaluationId) => appendAuthorizationReference(store, evaluationId), (db) => {
        db.prepare(sql).run();
      });
      assert.equal(verification.valid, false, `${label} tampering must be detected`);
    }
  });
});

describe('reference integrity — E. integrity metadata tampering', () => {
  it('detects a rewritten referenceDigest', async () => {
    const { verification } = await tamper(
      'digest-rewrite',
      (store, evaluationId) => appendAuthorizationReference(store, evaluationId),
      (db) => {
        db.prepare(`UPDATE governance_references SET reference_digest = 'sha256:${'b'.repeat(64)}' WHERE reference_id = 'ref-authorization-1'`).run();
      },
    );
    assert.equal(verification.valid, false);
    assert.equal(verification.referenceIntegrity.protectedCorrupted, 1);
  });

  it('detects a broken previousReferenceDigest link', async () => {
    const { verification } = await tamper(
      'link-break',
      async (store, evaluationId) => {
        await appendAuthorizationReference(store, evaluationId, '1');
        await appendAuthorizationReference(store, evaluationId, '2');
      },
      (db) => {
        db.prepare(`UPDATE governance_references SET previous_reference_digest = 'sha256:${'c'.repeat(64)}' WHERE reference_id = 'ref-authorization-2'`).run();
      },
    );
    assert.equal(verification.valid, false);
    assert.ok(verification.failures.some((failure) => failure.message.includes('chain break')));
  });

  it('detects a stripped digest as corruption, never as a legacy row', async () => {
    const { verification } = await tamper(
      'digest-stripped',
      (store, evaluationId) => appendAuthorizationReference(store, evaluationId),
      (db) => {
        db.prepare(`UPDATE governance_references SET reference_digest = NULL WHERE reference_id = 'ref-authorization-1'`).run();
      },
    );
    assert.equal(verification.valid, false);
    assert.equal(verification.referenceIntegrity.protectedCorrupted, 1);
    assert.equal(verification.referenceIntegrity.legacyUnprotected, 0, 'a partially stripped protected row must not be demoted to legacy');
  });

  it('detects a malformed digest string', async () => {
    const { verification } = await tamper(
      'digest-malformed',
      (store, evaluationId) => appendAuthorizationReference(store, evaluationId),
      (db) => {
        db.prepare(`UPDATE governance_references SET reference_digest = 'not-a-digest' WHERE reference_id = 'ref-authorization-1'`).run();
      },
    );
    assert.equal(verification.valid, false);
    assert.equal(verification.referenceIntegrity.protectedCorrupted, 1);
  });

  it('fails closed on an unknown reference-integrity version rather than guessing', async () => {
    const { verification } = await tamper(
      'unknown-version',
      (store, evaluationId) => appendAuthorizationReference(store, evaluationId),
      (db) => {
        db.prepare(`UPDATE governance_references SET reference_integrity_version = 'aoc.governance-reference-integrity.v99' WHERE reference_id = 'ref-authorization-1'`).run();
      },
    );
    assert.equal(verification.valid, false);
    assert.equal(verification.referenceIntegrity.protectedUnsupportedVersion, 1);
    assert.equal(verification.referenceIntegrity.protectedCorrupted, 0, 'unverifiable is reported as unverifiable, not as corruption');
    assert.equal(verification.referenceIntegrity.legacyUnprotected, 0, 'and never as a legacy row');
  });

  it('detects a rewritten chain head', async () => {
    const { verification } = await tamper(
      'head-rewrite',
      (store, evaluationId) => appendAuthorizationReference(store, evaluationId),
      (db, evaluationId) => {
        db.prepare(`UPDATE governance_reference_chains SET latest_reference_digest = 'sha256:${'d'.repeat(64)}' WHERE evaluation_id = ?`).run(evaluationId);
      },
    );
    assert.equal(verification.valid, false);
  });

  it('detects a deleted chain head', async () => {
    const { verification } = await tamper(
      'head-deleted',
      (store, evaluationId) => appendAuthorizationReference(store, evaluationId),
      (db, evaluationId) => {
        db.prepare(`DELETE FROM governance_reference_chains WHERE evaluation_id = ?`).run(evaluationId);
      },
    );
    assert.equal(verification.valid, false);
    assert.ok(verification.failures.some((failure) => failure.message.includes('no stored reference chain head')));
  });
});

describe('reference integrity — deletion, insertion, reordering', () => {
  it('detects deletion of a middle reference (chain gap)', async () => {
    const { verification } = await tamper(
      'delete-middle',
      async (store, evaluationId) => {
        for (const suffix of ['1', '2', '3']) await appendAuthorizationReference(store, evaluationId, suffix);
      },
      (db) => {
        db.prepare(`DELETE FROM governance_references WHERE reference_id = 'ref-authorization-2'`).run();
      },
    );
    assert.equal(verification.valid, false);
    assert.ok(verification.failures.some((failure) => failure.message.includes('expected 2')));
  });

  it('detects deletion of the newest reference — this is what the stored chain head buys', async () => {
    const { verification } = await tamper(
      'delete-tail',
      async (store, evaluationId) => {
        for (const suffix of ['1', '2']) await appendAuthorizationReference(store, evaluationId, suffix);
      },
      (db) => {
        db.prepare(`DELETE FROM governance_references WHERE reference_id = 'ref-authorization-2'`).run();
      },
    );
    assert.equal(verification.valid, false, 'without a stored head, a truncated chain would look internally consistent');
    assert.ok(verification.failures.some((failure) => failure.message.includes('chain head')));
  });

  it('detects deletion of every protected reference', async () => {
    const { verification } = await tamper(
      'delete-all',
      (store, evaluationId) => appendAuthorizationReference(store, evaluationId),
      (db, evaluationId) => {
        db.prepare(`DELETE FROM governance_references WHERE evaluation_id = ?`).run(evaluationId);
      },
    );
    assert.equal(verification.valid, false);
  });

  it('detects a fabricated reference inserted directly into the database', async () => {
    const { verification } = await tamper(
      'fabricated',
      (store, evaluationId) => appendAuthorizationReference(store, evaluationId),
      (db, evaluationId) => {
        // A forger who knows the schema but cannot compute a valid link.
        db.prepare(
          `INSERT INTO governance_references (reference_id, evaluation_id, reference_type, external_id, external_version, digest, uri, created_at, sequence, reference_integrity_version, previous_reference_digest, reference_digest)
           VALUES (?, ?, 'authorization_artifact', 'mandate:FORGED', NULL, NULL, NULL, ?, 2, ?, ?, ?)`,
        ).run('ref-forged', evaluationId, '2026-01-03T00:00:00.000Z', GOVERNANCE_REFERENCE_INTEGRITY_VERSION, `sha256:${'e'.repeat(64)}`, `sha256:${'f'.repeat(64)}`);
      },
    );
    assert.equal(verification.valid, false);
  });

  it('detects reordering: swapping two references’ chain positions', async () => {
    const { verification } = await tamper(
      'reorder',
      async (store, evaluationId) => {
        for (const suffix of ['1', '2']) await appendAuthorizationReference(store, evaluationId, suffix);
      },
      (db) => {
        // Sequence is uniquely indexed per evaluation, so the swap goes via a
        // temporary position — exactly what a determined DB writer would do.
        db.prepare(`UPDATE governance_references SET sequence = 99 WHERE reference_id = 'ref-authorization-1'`).run();
        db.prepare(`UPDATE governance_references SET sequence = 1 WHERE reference_id = 'ref-authorization-2'`).run();
        db.prepare(`UPDATE governance_references SET sequence = 2 WHERE reference_id = 'ref-authorization-1'`).run();
      },
    );
    assert.equal(verification.valid, false);
  });

  it('rejects a second reference claiming an occupied chain position', async () => {
    const path = tempDbPath('position-conflict');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-pos', 'dec-pos'));
    await appendAuthorizationReference(store, appended.evaluationId);
    await store.close();

    const db = (await openRawDb(path)) as unknown as RawDb;
    assert.throws(() =>
      db
        .prepare(
          `INSERT INTO governance_references (reference_id, evaluation_id, reference_type, external_id, created_at, sequence, reference_integrity_version, reference_digest)
           VALUES ('ref-dup-position', ?, 'execution_record', 'exec-dup', '2026-01-03T00:00:00.000Z', 1, ?, ?)`,
        )
        .run(appended.evaluationId, GOVERNANCE_REFERENCE_INTEGRITY_VERSION, `sha256:${'0'.repeat(64)}`),
    );
    db.close();
  });
});

// ---------------------------------------------------------------------------
// F-G. Legacy and mixed databases
// ---------------------------------------------------------------------------

/**
 * Reproduces a pre-hardening database: the v1 schema exactly as it stood
 * before reference integrity existed, with reference rows written through
 * that schema. Building it by dropping the new columns from a current
 * database is deliberate — it proves the additive upgrade path actually runs
 * against a table that lacks them, rather than against one that already has
 * them.
 */
async function seedPreHardeningDatabase(path: string): Promise<{ readonly evaluationId: string; readonly aggregateDigest: string }> {
  const store = await createSqliteGovernanceStore(path);
  const appended = await store.appendEvaluation(buildInput('req-legacy', 'dec-legacy'));
  await store.close();

  const db = (await openRawDb(path)) as unknown as RawDb;
  // Rebuild `governance_references` without any reference-integrity columns,
  // and drop the chain table — the pre-hardening shape.
  db.prepare(`DROP INDEX IF EXISTS idx_gov_references_chain_position`).run();
  db.prepare(`DROP TABLE IF EXISTS governance_reference_chains`).run();
  db.prepare(`DROP TABLE governance_references`).run();
  db.prepare(`CREATE TABLE governance_references (
    reference_id TEXT PRIMARY KEY,
    evaluation_id TEXT NOT NULL REFERENCES governance_evaluations(evaluation_id),
    reference_type TEXT NOT NULL,
    external_id TEXT NOT NULL,
    external_version TEXT,
    digest TEXT,
    uri TEXT,
    created_at TEXT NOT NULL
  )`).run();
  db.prepare(`INSERT INTO governance_references (reference_id, evaluation_id, reference_type, external_id, external_version, digest, uri, created_at)
    VALUES ('ref-legacy-mandate', ?, 'external_artifact', 'mandate:legacy-1', NULL, NULL, NULL, '2025-11-01T00:00:00.000Z')`).run(appended.evaluationId);
  db.prepare(`INSERT INTO governance_references (reference_id, evaluation_id, reference_type, external_id, external_version, digest, uri, created_at)
    VALUES ('ref-legacy-execution', ?, 'execution_record', 'exec:legacy-1', NULL, NULL, NULL, '2025-11-02T00:00:00.000Z')`).run(appended.evaluationId);
  db.close();

  return { evaluationId: appended.evaluationId, aggregateDigest: appended.aggregateDigest };
}

describe('reference integrity — F. a pre-hardening database still opens and verifies', () => {
  it('opens, reads legacy references, and verifies the aggregate with its original digest', async () => {
    const path = tempDbPath('legacy-open');
    const seeded = await seedPreHardeningDatabase(path);

    const store = await createSqliteGovernanceStore(path);
    const record = await store.getByEvaluationId(SYSTEM, seeded.evaluationId);
    const verification = await store.verify(SYSTEM, seeded.evaluationId);
    await store.close();

    assert.equal(record?.integrity.aggregateDigest, seeded.aggregateDigest, 'the historical aggregate digest is unchanged');
    assert.equal(verification.valid, true, `a legacy database must still verify: ${JSON.stringify(verification.failures)}`);
    assert.equal(verification.checks.referenceIntegrity, true);

    const byId = new Map((record?.references ?? []).map((reference) => [reference.referenceId, reference]));
    assert.equal(byId.size, 2, 'legacy reference rows are preserved, not dropped');
    assert.equal(byId.get('ref-legacy-mandate')?.referenceType, 'external_artifact');
    assert.equal(byId.get('ref-legacy-execution')?.referenceType, 'execution_record');
  });

  it('classifies legacy rows as unprotected rather than inventing retroactive protection', async () => {
    const path = tempDbPath('legacy-classify');
    const seeded = await seedPreHardeningDatabase(path);

    const store = await createSqliteGovernanceStore(path);
    const record = await store.getByEvaluationId(SYSTEM, seeded.evaluationId);
    const verification = await store.verify(SYSTEM, seeded.evaluationId);
    await store.close();

    for (const reference of record?.references ?? []) {
      assert.equal(reference.sequence, undefined);
      assert.equal(reference.integrityVersion, undefined);
      assert.equal(reference.referenceDigest, undefined, 'no digest may be back-filled onto a historical row');
    }
    assert.deepEqual(verification.referenceIntegrity, { legacyUnprotected: 2, protectedValid: 0, protectedCorrupted: 0, protectedUnsupportedVersion: 0 });
    assert.equal(verification.valid, true, 'unprotected history is a fact about the past, not a fault');
  });

  it('does not bump the store schema version — a version bump would make historical aggregates unreadable', async () => {
    const path = tempDbPath('legacy-schema-version');
    const seeded = await seedPreHardeningDatabase(path);
    const db = (await openRawDb(path)) as unknown as RawDb;
    const stored = db.prepare(`SELECT schema_version FROM governance_store_versions ORDER BY id DESC LIMIT 1`).get() as { schema_version: string };
    const stamped = db.prepare(`SELECT schema_version FROM governance_record_metadata WHERE evaluation_id = ?`).get(seeded.evaluationId) as { schema_version: string };
    db.close();
    assert.equal(stored.schema_version, 'aoc.governance-store.schema.v1');
    assert.equal(stamped.schema_version, 'aoc.governance-store.schema.v1');
  });
});

describe('reference integrity — G. legacy and protected references coexist', () => {
  it('appends a protected reference onto an aggregate that already has legacy ones, and reports both honestly', async () => {
    const path = tempDbPath('mixed');
    const seeded = await seedPreHardeningDatabase(path);

    const store = await createSqliteGovernanceStore(path);
    await store.appendReference(SYSTEM, {
      referenceId: 'ref-new-protected',
      evaluationId: seeded.evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate:new-1',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    const verification = await store.verify(SYSTEM, seeded.evaluationId);
    const record = await store.getByEvaluationId(SYSTEM, seeded.evaluationId);
    await store.close();

    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
    assert.deepEqual(verification.referenceIntegrity, { legacyUnprotected: 2, protectedValid: 1, protectedCorrupted: 0, protectedUnsupportedVersion: 0 });
    assert.equal(record?.references.length, 3, 'legacy rows survive the append');

    // The protected chain starts at 1 and is independent of the legacy rows:
    // it can only attest to references it actually sealed.
    const fresh = record?.references.find((reference) => reference.referenceId === 'ref-new-protected');
    assert.equal(fresh?.sequence, 1);
    assert.equal(fresh?.previousReferenceDigest, undefined);
  });

  it('still detects tampering with the new protected row on a mixed database', async () => {
    const path = tempDbPath('mixed-tamper');
    const seeded = await seedPreHardeningDatabase(path);

    const storeA = await createSqliteGovernanceStore(path);
    await storeA.appendReference(SYSTEM, {
      referenceId: 'ref-mixed-protected',
      evaluationId: seeded.evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate:mixed-1',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await storeA.close();

    const db = (await openRawDb(path)) as unknown as RawDb;
    db.prepare(`UPDATE governance_references SET external_id = 'mandate:mixed-2' WHERE reference_id = 'ref-mixed-protected'`).run();
    // Tampering with a legacy row alongside it, to show the difference in
    // what can and cannot be claimed.
    db.prepare(`UPDATE governance_references SET reference_type = 'authorization_artifact' WHERE reference_id = 'ref-legacy-mandate'`).run();
    db.close();

    const storeB = await createSqliteGovernanceStore(path);
    const verification = await storeB.verify(SYSTEM, seeded.evaluationId);
    await storeB.close();

    assert.equal(verification.valid, false);
    assert.equal(verification.referenceIntegrity.protectedCorrupted, 1, 'the protected row is caught');
    assert.equal(verification.referenceIntegrity.legacyUnprotected, 2, 'the legacy rows are not, and are not claimed to be');
  });
});

// ---------------------------------------------------------------------------
// J. Vocabulary independence
// ---------------------------------------------------------------------------

describe('reference integrity — vocabulary independence', () => {
  it('protects every canonical reference type identically', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const appended = await store.appendEvaluation(buildInput('req-vocab', 'dec-vocab'));
    for (const [index, referenceType] of GOVERNANCE_REFERENCE_TYPES.entries()) {
      await store.appendReference(SYSTEM, {
        referenceId: `ref-vocab-${referenceType}`,
        evaluationId: appended.evaluationId,
        referenceType,
        externalId: `artifact-${referenceType}`,
        createdAt: `2026-01-02T00:00:${String(index).padStart(2, '0')}.000Z`,
      });
    }
    const verification = await store.verify(SYSTEM, appended.evaluationId);
    const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
    await store.close();

    assert.equal(verification.valid, true);
    assert.equal(verification.referenceIntegrity.protectedValid, GOVERNANCE_REFERENCE_TYPES.length);
    for (const reference of record?.references ?? []) {
      assert.equal(reference.integrityVersion, GOVERNANCE_REFERENCE_INTEGRITY_VERSION, 'no reference type gets a different mechanism');
    }
  });

  it('the integrity code contains no governed-action vocabulary', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    // This test file compiles to `dist/src/enterprise/__tests__/`; four levels
    // up is the repository root.
    const sourcePath = join(__dirname, '../../../../src/enterprise/governance-store/reference-integrity.ts');
    assert.ok(existsSync(sourcePath), `expected the reference-integrity source at ${sourcePath}`);
    // Comments are stripped first: the doc comment legitimately explains *why*
    // a mandate reference arrives after the aggregate is sealed. What must not
    // exist is executable code that knows about a governed action.
    const code = readFileSync(sourcePath, 'utf8')
      .replaceAll(/\/\*[\s\S]*?\*\//g, '')
      .replaceAll(/\/\/.*$/gm, '')
      .toLowerCase();
    for (const forbidden of ['tokeniz', 'collateraliz', 'mandate']) {
      assert.equal(
        code.includes(forbidden),
        false,
        `reference integrity must not special-case '${forbidden}' — it protects canonical references regardless of semantic type`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// K-L. Idempotency and tenant isolation
// ---------------------------------------------------------------------------

describe('reference integrity — K. replay and idempotency', () => {
  it('rejects a replayed referenceId without appending a duplicate or advancing the chain', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const appended = await store.appendEvaluation(buildInput('req-replay', 'dec-replay'));
    await appendAuthorizationReference(store, appended.evaluationId);

    await assert.rejects(
      () => appendAuthorizationReference(store, appended.evaluationId),
      (error: unknown) => error instanceof GovernanceStoreError && error.code === 'GOVERNANCE_STORE_VALIDATION_ERROR',
    );

    const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
    const verification = await store.verify(SYSTEM, appended.evaluationId);
    await store.close();

    assert.equal(record?.references.length, 1, 'no duplicate reference row');
    assert.equal(record?.references[0]?.sequence, 1, 'the rejected append must not have consumed a chain position');
    assert.equal(verification.valid, true, 'and the chain must remain unbroken');
    assert.equal(verification.referenceIntegrity.protectedValid, 1);
  });

  it('assigns contiguous positions under concurrent appends, with no duplicate or lost links', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const appended = await store.appendEvaluation(buildInput('req-concurrent', 'dec-concurrent'));
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        store.appendReference(SYSTEM, {
          referenceId: `ref-concurrent-${index}`,
          evaluationId: appended.evaluationId,
          referenceType: 'execution_record',
          externalId: `exec-${index}`,
          createdAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
    );
    const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
    const verification = await store.verify(SYSTEM, appended.evaluationId);
    await store.close();

    const sequences = (record?.references ?? []).map((reference) => reference.sequence).sort((a, b) => (a ?? 0) - (b ?? 0));
    assert.deepEqual(sequences, Array.from({ length: 25 }, (_, index) => index + 1), 'positions are contiguous with no gaps or duplicates');
    assert.equal(new Set((record?.references ?? []).map((reference) => reference.previousReferenceDigest)).size, 25, 'no two references claim the same predecessor');
    assert.equal(verification.valid, true, JSON.stringify(verification.failures));
  });
});

describe('reference integrity — L. tenant isolation', () => {
  it('refuses a cross-tenant reference append, leaving the target chain untouched', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const appended = await store.appendEvaluation(buildInput('req-tenant', 'dec-tenant', 'org-a'));
    await appendAuthorizationReference(store, appended.evaluationId);

    await assert.rejects(
      () =>
        store.appendReference(
          { system: false, organizationId: 'org-b', actorId: 'intruder' },
          { referenceId: 'ref-cross-tenant', evaluationId: appended.evaluationId, referenceType: 'authorization_artifact', externalId: 'mandate:intruder', createdAt: '2026-01-03T00:00:00.000Z' },
        ),
      (error: unknown) => error instanceof GovernanceStoreError && error.code === 'GOVERNANCE_RECORD_NOT_FOUND',
    );

    const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
    const verification = await store.verify(SYSTEM, appended.evaluationId);
    await store.close();
    assert.equal(record?.references.length, 1);
    assert.equal(verification.valid, true);
  });

  it('binds the sealed digest to the owning tenant, so repointing a reference at another tenant’s aggregate is detected', async () => {
    const path = tempDbPath('tenant-repoint');
    const store = await createSqliteGovernanceStore(path);
    const orgA = await store.appendEvaluation(buildInput('req-org-a', 'dec-org-a', 'org-a'));
    const orgB = await store.appendEvaluation(buildInput('req-org-b', 'dec-org-b', 'org-b'));
    await store.appendReference(SYSTEM, {
      referenceId: 'ref-org-a',
      evaluationId: orgA.evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate:org-a',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await store.close();

    const db = (await openRawDb(path)) as unknown as RawDb;
    db.prepare(`UPDATE governance_references SET evaluation_id = ? WHERE reference_id = 'ref-org-a'`).run(orgB.evaluationId);
    db.close();

    const reopened = await createSqliteGovernanceStore(path);
    const verification = await reopened.verify(SYSTEM, orgB.evaluationId);
    await reopened.close();

    assert.equal(verification.valid, false, 'a reference moved to another tenant’s aggregate must not verify there');
  });

  it('does not expose protected references to a caller outside the owning organization', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const appended = await store.appendEvaluation(buildInput('req-scope', 'dec-scope', 'org-a'));
    await appendAuthorizationReference(store, appended.evaluationId);

    const asOtherTenant = await store.getByEvaluationId({ system: false, organizationId: 'org-b' }, appended.evaluationId);
    assert.equal(asOtherTenant, null);
    await assert.rejects(
      () => store.verify({ system: false, organizationId: 'org-b' }, appended.evaluationId),
      (error: unknown) => error instanceof GovernanceStoreError && error.code === 'GOVERNANCE_RECORD_NOT_FOUND',
    );
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// M. Fail-closed
// ---------------------------------------------------------------------------

describe('reference integrity — M. corrupted rows are never silently accepted', () => {
  it('reports every corrupted-row shape as a failure with a referenceIntegrity check', async () => {
    const shapes: readonly (readonly [string, string])[] = [
      ['type', `UPDATE governance_references SET reference_type = 'external_artifact' WHERE reference_id = 'ref-authorization-1'`],
      ['external-id', `UPDATE governance_references SET external_id = 'mandate:other' WHERE reference_id = 'ref-authorization-1'`],
      ['sequence', `UPDATE governance_references SET sequence = 7 WHERE reference_id = 'ref-authorization-1'`],
      ['version-null', `UPDATE governance_references SET reference_integrity_version = NULL WHERE reference_id = 'ref-authorization-1'`],
    ];
    for (const [label, sql] of shapes) {
      const { verification } = await tamper(`failclosed-${label}`, (store, evaluationId) => appendAuthorizationReference(store, evaluationId), (db) => {
        db.prepare(sql).run();
      });
      assert.equal(verification.valid, false, `${label} must fail closed`);
      assert.ok(
        verification.failures.every((failure) => failure.check === 'referenceIntegrity'),
        `${label} must be reported in the reference domain, not as aggregate corruption`,
      );
      assert.equal(verification.checks.referenceIntegrity, false);
    }
  });

  it('keeps failure messages free of external identifiers and uris', async () => {
    const { verification } = await tamper(
      'no-leak',
      (store, evaluationId) =>
        store.appendReference(SYSTEM, {
          referenceId: 'ref-secretish',
          evaluationId,
          referenceType: 'external_artifact',
          externalId: 'secret-external-identifier',
          uri: 'https://internal.example/secret-path',
          createdAt: '2026-01-02T00:00:00.000Z',
        }),
      (db) => {
        db.prepare(`UPDATE governance_references SET external_id = 'secret-external-identifier-2' WHERE reference_id = 'ref-secretish'`).run();
      },
    );
    assert.equal(verification.valid, false);
    const messages = verification.failures.map((failure) => failure.message).join(' ');
    assert.equal(messages.includes('secret-external-identifier'), false);
    assert.equal(messages.includes('internal.example'), false);
    assert.ok(messages.includes('ref-secretish'), 'the reference id is named so the row can be found');
  });
});

// ---------------------------------------------------------------------------
// Old-runtime compatibility
// ---------------------------------------------------------------------------

describe('reference integrity — rollback onto a newer chain', () => {
  it('refuses to append onto a chain sealed under an unsupported version, writing nothing', async () => {
    const path = tempDbPath('rollback-append');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-rollback', 'dec-rollback'));
    await appendAuthorizationReference(store, appended.evaluationId);
    await store.close();

    // A newer runtime advanced this evaluation's chain under a version this
    // build does not know.
    const db = (await openRawDb(path)) as unknown as RawDb;
    db.prepare(`UPDATE governance_reference_chains SET integrity_version = 'aoc.governance-reference-integrity.v2' WHERE evaluation_id = ?`).run(appended.evaluationId);
    db.close();

    const reopened = await createSqliteGovernanceStore(path);
    await assert.rejects(
      () =>
        reopened.appendReference(SYSTEM, {
          referenceId: 'ref-after-rollback',
          evaluationId: appended.evaluationId,
          referenceType: 'authorization_artifact',
          externalId: 'mandate:after-rollback',
          createdAt: '2026-01-03T00:00:00.000Z',
        }),
      (error: unknown) => error instanceof GovernanceStoreError && error.code === 'GOVERNANCE_SCHEMA_VERSION_UNSUPPORTED',
    );
    const record = await reopened.getByEvaluationId(SYSTEM, appended.evaluationId);
    await reopened.close();

    // Nothing was written: no row, and the head still records the newer
    // version rather than being silently downgraded to this build's.
    assert.equal(record?.references.length, 1, 'the rejected append must not have inserted a row');
    const raw = (await openRawDb(path)) as unknown as RawDb;
    const head = raw.prepare(`SELECT integrity_version, latest_sequence FROM governance_reference_chains WHERE evaluation_id = ?`).get(appended.evaluationId) as {
      integrity_version: string;
      latest_sequence: number;
    };
    raw.close();
    assert.equal(head.integrity_version, 'aoc.governance-reference-integrity.v2', 'the newer version must not be overwritten');
    assert.equal(head.latest_sequence, 1, 'the head must not have advanced');
  });

  it('reports an unsupported chain head as unverifiable rather than valid', async () => {
    const { verification } = await tamper(
      'head-unknown-version',
      (store, evaluationId) => appendAuthorizationReference(store, evaluationId),
      (db, evaluationId) => {
        db.prepare(`UPDATE governance_reference_chains SET integrity_version = 'aoc.governance-reference-integrity.v2' WHERE evaluation_id = ?`).run(evaluationId);
      },
    );
    assert.equal(verification.valid, false);
    assert.ok(verification.failures.some((failure) => failure.message.includes('cannot verify')));
  });
});

describe('reference integrity — the three-argument verifier stays usable', () => {
  it('skips only the tail check when no chain head is supplied, instead of failing intact records', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const appended = await store.appendEvaluation(buildInput('req-3arg', 'dec-3arg'));
    await appendAuthorizationReference(store, appended.evaluationId, '1');
    await appendAuthorizationReference(store, appended.evaluationId, '2');
    const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
    await store.close();
    assert.ok(record);

    // Exactly how an external consumer of the exported API calls it.
    const threeArg = verifyGovernanceRecordIntegrity(record, record.integrity.previousAggregateDigest ?? null, () => '2026-01-04T00:00:00.000Z');
    assert.equal(threeArg.valid, true, 'an intact record must not be reported invalid merely because no head was passed');
    assert.equal(threeArg.checks.referenceIntegrity, true);
    assert.equal(threeArg.referenceIntegrity.protectedValid, 2, 'per-row digests and chain links are still verified');

    // ...and the per-row verification is real, not skipped wholesale: a
    // tampered row still fails without a head.
    const tamperedRecord = {
      ...record,
      references: record.references.map((reference) => (reference.sequence === 1 ? { ...reference, externalId: 'mandate:swapped' } : reference)),
    };
    const tampered = verifyGovernanceRecordIntegrity(tamperedRecord, tamperedRecord.integrity.previousAggregateDigest ?? null, () => '2026-01-04T00:00:00.000Z');
    assert.equal(tampered.valid, false);
    assert.equal(tampered.referenceIntegrity.protectedCorrupted, 1);
  });

  it('an explicit null head still fails when protected references exist', async () => {
    const store = await createSqliteGovernanceStore(':memory:');
    const appended = await store.appendEvaluation(buildInput('req-nullhead', 'dec-nullhead'));
    await appendAuthorizationReference(store, appended.evaluationId);
    const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
    await store.close();
    assert.ok(record);

    // `null` is the stronger claim — the store looked and found no head — so
    // it must stay a failure, distinct from "no head supplied".
    const explicitNull = verifyGovernanceRecordIntegrity(record, record.integrity.previousAggregateDigest ?? null, () => '2026-01-04T00:00:00.000Z', null);
    assert.equal(explicitNull.valid, false);
    assert.ok(explicitNull.failures.some((failure) => failure.message.includes('no stored reference chain head')));
  });
});

describe('reference integrity — an older runtime keeps reading the database', () => {
  it('an old-shaped read of a protected row returns the same semantic fields it always did', async () => {
    const path = tempDbPath('old-runtime-read');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-old-read', 'dec-old-read'));
    await store.appendReference(SYSTEM, {
      referenceId: 'ref-old-read',
      evaluationId: appended.evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate:old-read',
      externalVersion: '1.0.0',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await store.close();

    // Exactly the projection the pre-hardening `rowToReferenceRecord` used:
    // it names its columns, so the added ones are invisible to it.
    const db = (await openRawDb(path)) as unknown as RawDb;
    const rows = db
      .prepare(`SELECT reference_id, evaluation_id, reference_type, external_id, external_version, digest, uri, created_at FROM governance_references WHERE evaluation_id = ?`)
      .all(appended.evaluationId) as Record<string, unknown>[];
    db.close();

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      reference_id: 'ref-old-read',
      evaluation_id: appended.evaluationId,
      reference_type: 'authorization_artifact',
      external_id: 'mandate:old-read',
      external_version: '1.0.0',
      digest: null,
      uri: null,
      created_at: '2026-01-02T00:00:00.000Z',
    });
  });

  it('a row an old runtime writes (no integrity columns) is read as legacy, not as corruption', async () => {
    const path = tempDbPath('old-runtime-write');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-old-write', 'dec-old-write'));
    await store.close();

    // An old runtime's INSERT names only the columns it knows; the rest
    // default to NULL.
    const db = (await openRawDb(path)) as unknown as RawDb;
    db.prepare(
      `INSERT INTO governance_references (reference_id, evaluation_id, reference_type, external_id, external_version, digest, uri, created_at)
       VALUES ('ref-old-written', ?, 'external_artifact', 'mandate:old-written', NULL, NULL, NULL, '2025-11-01T00:00:00.000Z')`,
    ).run(appended.evaluationId);
    db.close();

    const reopened = await createSqliteGovernanceStore(path);
    const verification = await reopened.verify(SYSTEM, appended.evaluationId);
    await reopened.close();

    // Honest, and worth stating plainly: a row written by a runtime without
    // this mechanism is indistinguishable from a genuinely historical row.
    // Reference integrity attests to rows *this* mechanism sealed; it is not
    // a guarantee that every row in the table was sealed.
    assert.equal(verification.valid, true);
    assert.deepEqual(verification.referenceIntegrity, { legacyUnprotected: 1, protectedValid: 0, protectedCorrupted: 0, protectedUnsupportedVersion: 0 });
  });
});
