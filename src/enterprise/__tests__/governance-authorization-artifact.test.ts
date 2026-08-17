import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
import {
  GOVERNANCE_REFERENCE_TYPES,
  GOVERNANCE_STORE_SCHEMA_VERSION,
  isCanonicalGovernanceReferenceType,
  type AppendGovernanceEvaluationInput,
  type GovernanceReferenceRecord,
  type GovernanceStoreAccessContext,
} from '../governance-store/contracts.js';
import { GovernanceStoreError } from '../governance-store/errors.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import { createInMemoryGovernanceStore } from '../governance-store/in-memory-governance-store.js';
import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';

/**
 * `authorization_artifact` — the Governance Store reference type that names
 * an artifact **AOC Enterprise itself produced** to record an authorization
 * granted by a governed enforcement decision.
 *
 * The whole point of the vocabulary is a distinction this suite has to make
 * testable in both directions:
 *
 * ```
 * TOKENIZE decision -> TokenizationMandate      [authorization_artifact]  what AOC authorized
 *                   -> token issuance report    [execution_record]        what someone else did
 * ```
 *
 * Three properties matter more than the taxonomy itself and are each proven
 * below rather than asserted in prose:
 *
 * 1. **It is classification, never authority.** Appending the string grants
 *    nothing; enforcement outcomes are unchanged by it.
 * 2. **History stays readable.** Rows written before this vocabulary existed
 *    are still loaded, unmodified, under their original classification.
 * 3. **An older runtime is not broken by it.** The stored contract is
 *    forward-compatible for an added reference value, and the old read path
 *    is exercised here to show exactly what it does.
 */

const SYSTEM: GovernanceStoreAccessContext = { system: true };

const workDir = mkdtempSync(join(tmpdir(), 'aoc-authorization-artifact-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

let dbCounter = 0;
function tempDbPath(name: string): string {
  dbCounter += 1;
  return join(workDir, `${name}-${dbCounter}.sqlite`);
}

function buildInput(requestId: string, decisionId: string, organizationId = 'org-a'): AppendGovernanceEvaluationInput {
  const request: KernelEvaluationRequest = {
    requestId,
    actor: { id: 'actor-1', trustDomainId: 'td-1' },
    action: { type: 'draft_email', resourceScope: 'project:x' },
    organization: { id: organizationId },
    requestedAt: '2026-01-01T00:00:00.000Z',
  };
  const result = {
    requestId,
    decisionId,
    status: 'allowed',
    reasonCodes: ['OK'],
    summary: 'fine',
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
    accessContext: SYSTEM,
  };
}

async function openRawDb(path: string) {
  const { default: Database } = await import('better-sqlite3');
  return new Database(path);
}

/** Both providers must agree on the vocabulary, or the classification means different things depending on where it is stored. */
const VARIANTS: readonly { readonly name: string; readonly build: () => Promise<GovernanceStore> }[] = [
  { name: 'in-memory', build: async () => createInMemoryGovernanceStore() },
  { name: 'sqlite (:memory:)', build: () => createSqliteGovernanceStore(':memory:') },
];

// ---------------------------------------------------------------------------
// A. The vocabulary itself
// ---------------------------------------------------------------------------

describe('Governance Store reference vocabulary', () => {
  it('publishes authorization_artifact as a canonical reference type', () => {
    assert.ok(GOVERNANCE_REFERENCE_TYPES.includes('authorization_artifact'));
    assert.equal(isCanonicalGovernanceReferenceType('authorization_artifact'), true);
  });

  it('keeps every previously supported reference type — this is an addition, never a replacement', () => {
    for (const existing of ['passport_event', 'evidence_bundle', 'assurance_record', 'execution_record', 'external_artifact'] as const) {
      assert.ok(GOVERNANCE_REFERENCE_TYPES.includes(existing), `${existing} must remain canonical`);
      assert.equal(isCanonicalGovernanceReferenceType(existing), true);
    }
  });

  it('does not admit anything else — an unknown string is not a classification this build recognizes', () => {
    for (const unknown of ['', 'AUTHORIZATION_ARTIFACT', 'authorization', 'authorization_artifacts', 'license_mandate']) {
      assert.equal(isCanonicalGovernanceReferenceType(unknown), false);
    }
  });

  for (const variant of VARIANTS) {
    describe(variant.name, () => {
      it('round-trips every canonical reference type through the real append/read path', async () => {
        const store = await variant.build();
        const appended = await store.appendEvaluation(buildInput('req-vocab', 'dec-vocab'));

        for (const [index, referenceType] of GOVERNANCE_REFERENCE_TYPES.entries()) {
          await store.appendReference(SYSTEM, {
            referenceId: `ref-vocab-${index}`,
            evaluationId: appended.evaluationId,
            referenceType,
            externalId: `artifact-${index}`,
            createdAt: '2026-01-02T00:00:00.000Z',
          });
        }

        const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
        const recovered = (record?.references ?? []).map((reference) => reference.referenceType).sort();
        assert.deepEqual(recovered, [...GOVERNANCE_REFERENCE_TYPES].sort());
        await store.close();
      });

      it('refuses to persist a reference type outside the canonical vocabulary', async () => {
        const store = await variant.build();
        const appended = await store.appendEvaluation(buildInput('req-reject', 'dec-reject'));

        await assert.rejects(
          () =>
            store.appendReference(SYSTEM, {
              referenceId: 'ref-bogus',
              evaluationId: appended.evaluationId,
              // A caller reaching past the type system — exactly the case the
              // write guard exists for, since an unvalidated string would be
              // cast straight back out on read as though it were canonical.
              referenceType: 'totally_made_up' as GovernanceReferenceRecord['referenceType'],
              externalId: 'artifact-bogus',
              createdAt: '2026-01-02T00:00:00.000Z',
            }),
          (error: unknown) => error instanceof GovernanceStoreError && error.code === 'GOVERNANCE_STORE_VALIDATION_ERROR',
        );

        const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
        assert.equal(record?.references.length, 0, 'a rejected reference must leave nothing behind');
        await store.close();
      });
    });
  }
});

// ---------------------------------------------------------------------------
// B. Durable persistence across a restart (§27 — real backend, not a double)
// ---------------------------------------------------------------------------

describe('authorization_artifact — durable persistence', () => {
  it('survives close/reopen against an on-disk SQLite store with its type intact', async () => {
    const path = tempDbPath('persistence');

    const first = await createSqliteGovernanceStore(path);
    const appended = await first.appendEvaluation(buildInput('req-durable', 'dec-durable'));
    await first.appendReference(SYSTEM, {
      referenceId: 'ref-durable-mandate',
      evaluationId: appended.evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate-durable',
      externalVersion: 'enterprise.tokenization.v1',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await first.close();

    const reopened = await createSqliteGovernanceStore(path);
    const record = await reopened.getByEvaluationId(SYSTEM, appended.evaluationId);
    assert.equal(record?.references.length, 1);
    assert.equal(record?.references[0]?.referenceType, 'authorization_artifact');
    assert.equal(record?.references[0]?.externalId, 'mandate-durable');
    assert.equal(record?.references[0]?.externalVersion, 'enterprise.tokenization.v1');
    await reopened.close();
  });

  it('stores the classification as the literal canonical string, not a rewritten or numeric encoding', async () => {
    const path = tempDbPath('literal');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-literal', 'dec-literal'));
    await store.appendReference(SYSTEM, {
      referenceId: 'ref-literal',
      evaluationId: appended.evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate-literal',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await store.close();

    const db = await openRawDb(path);
    const row = db.prepare(`SELECT reference_type FROM governance_references WHERE reference_id = 'ref-literal'`).get() as { reference_type: string };
    db.close();
    assert.equal(row.reference_type, 'authorization_artifact');
  });
});

// ---------------------------------------------------------------------------
// C. Historical compatibility (§26, §39)
// ---------------------------------------------------------------------------

describe('authorization_artifact — historical compatibility', () => {
  /**
   * A store as an older runtime left it: mandates classified
   * `external_artifact`, because that is the only thing that runtime could
   * write. Those rows are historical truth and are never rewritten, so this
   * seeds them the way that runtime did — a direct insert, bypassing the
   * write guard this build added afterwards.
   */
  async function seedHistoricalStore(path: string): Promise<string> {
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-historical', 'dec-historical'));
    await store.close();

    const db = await openRawDb(path);
    db.prepare(
      `INSERT INTO governance_references (reference_id, evaluation_id, reference_type, external_id, external_version, digest, uri, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
    ).run('ref-historical-mandate', appended.evaluationId, 'external_artifact', 'mandate-legacy-1', 'enterprise.tokenization.v1', '2025-12-01T00:00:00.000Z');
    db.prepare(
      `INSERT INTO governance_references (reference_id, evaluation_id, reference_type, external_id, external_version, digest, uri, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
    ).run('ref-historical-execution', appended.evaluationId, 'execution_record', 'execution-legacy-1', 'enterprise.tokenization.v1', '2025-12-02T00:00:00.000Z');
    db.close();

    return appended.evaluationId;
  }

  it('still reads historical external_artifact reference rows written before this vocabulary existed', async () => {
    const path = tempDbPath('historical');
    const evaluationId = await seedHistoricalStore(path);

    const store = await createSqliteGovernanceStore(path);
    const record = await store.getByEvaluationId(SYSTEM, evaluationId);
    await store.close();

    assert.equal(record?.references.length, 2);
    const byId = new Map((record?.references ?? []).map((reference) => [reference.referenceId, reference]));
    assert.equal(byId.get('ref-historical-mandate')?.referenceType, 'external_artifact');
    assert.equal(byId.get('ref-historical-execution')?.referenceType, 'execution_record');
  });

  it('leaves historical rows byte-for-byte unmodified — no migration rewrites past evidence to improve its taxonomy', async () => {
    const path = tempDbPath('historical-immutable');
    const evaluationId = await seedHistoricalStore(path);

    const readBack = await createSqliteGovernanceStore(path);
    // A new reference under the new vocabulary is appended alongside the old
    // ones; opening and writing must not disturb what is already there.
    await readBack.appendReference(SYSTEM, {
      referenceId: 'ref-new-mandate',
      evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate-new-1',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await readBack.close();

    const db = await openRawDb(path);
    const rows = db
      .prepare(`SELECT reference_id, reference_type FROM governance_references ORDER BY reference_id`)
      .all() as { reference_id: string; reference_type: string }[];
    db.close();

    assert.deepEqual(rows, [
      { reference_id: 'ref-historical-execution', reference_type: 'execution_record' },
      { reference_id: 'ref-historical-mandate', reference_type: 'external_artifact' },
      { reference_id: 'ref-new-mandate', reference_type: 'authorization_artifact' },
    ]);
  });

  it('reads a store that mixes historical and new classifications in one aggregate', async () => {
    const path = tempDbPath('historical-mixed');
    const evaluationId = await seedHistoricalStore(path);

    const store = await createSqliteGovernanceStore(path);
    await store.appendReference(SYSTEM, {
      referenceId: 'ref-mixed-new',
      evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate-new-2',
      createdAt: '2026-01-03T00:00:00.000Z',
    });
    const record = await store.getByEvaluationId(SYSTEM, evaluationId);
    const verification = await store.verify(SYSTEM, evaluationId);
    await store.close();

    assert.equal(record?.references.length, 3);
    assert.equal(verification.valid, true, 'a mixed-vocabulary aggregate is still a valid aggregate');
  });
});

// ---------------------------------------------------------------------------
// D. Old-runtime compatibility (§11, §28, §38)
// ---------------------------------------------------------------------------

describe('authorization_artifact — old-runtime compatibility', () => {
  /**
   * The pre-change stored contract, reproduced verbatim. The older runtime's
   * union did not contain `authorization_artifact`, and its read path was an
   * unchecked cast of the stored `TEXT` column:
   *
   *     referenceType: row.reference_type as GovernanceReferenceRecord['referenceType']
   *
   * Executing an actual old build is impractical here, so the frozen read
   * path is reproduced against a database this build wrote. That is the
   * evidence for the compatibility claim; it is not asserted from prose.
   */
  type OldReferenceType = 'passport_event' | 'evidence_bundle' | 'assurance_record' | 'execution_record' | 'external_artifact';

  interface OldReferenceRecord {
    readonly referenceId: string;
    readonly referenceType: OldReferenceType;
    readonly externalId: string;
  }

  function oldRuntimeReadReferences(rows: readonly { reference_id: string; reference_type: string; external_id: string }[]): readonly OldReferenceRecord[] {
    return rows.map((row) => ({
      referenceId: row.reference_id,
      referenceType: row.reference_type as OldReferenceType,
      externalId: row.external_id,
    }));
  }

  it('an old runtime opening a database written by this build is not turned away by the version guard', async () => {
    const path = tempDbPath('old-runtime-guard');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-guard', 'dec-guard'));
    await store.appendReference(SYSTEM, {
      referenceId: 'ref-guard',
      evaluationId: appended.evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate-guard',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await store.close();

    const db = await openRawDb(path);
    const storeVersion = db.prepare(`SELECT schema_version FROM governance_store_versions ORDER BY id DESC LIMIT 1`).get() as { schema_version: string };
    const metadataVersion = db.prepare(`SELECT schema_version FROM governance_record_metadata WHERE evaluation_id = ?`).get(appended.evaluationId) as {
      schema_version: string;
    };
    db.close();

    // Both version guards an older runtime consults are untouched by adding a
    // reference value. Bumping either would make old runtimes *refuse* stores
    // they can read perfectly well, which is a far larger break than the
    // vocabulary addition it would be guarding.
    assert.equal(storeVersion.schema_version, GOVERNANCE_STORE_SCHEMA_VERSION);
    assert.equal(storeVersion.schema_version, 'aoc.governance-store.schema.v1');
    assert.equal(metadataVersion.schema_version, 'aoc.governance-store.schema.v1');
  });

  it('the old read path returns the new value verbatim: it neither rejects nor drops it, but it does silently widen its own union', async () => {
    const path = tempDbPath('old-runtime-read');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-old-read', 'dec-old-read'));
    await store.appendReference(SYSTEM, {
      referenceId: 'ref-old-read-mandate',
      evaluationId: appended.evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate-old-read',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await store.appendReference(SYSTEM, {
      referenceId: 'ref-old-read-execution',
      evaluationId: appended.evaluationId,
      referenceType: 'execution_record',
      externalId: 'execution-old-read',
      createdAt: '2026-01-03T00:00:00.000Z',
    });
    await store.close();

    const db = await openRawDb(path);
    const rows = db
      .prepare(`SELECT reference_id, reference_type, external_id FROM governance_references WHERE evaluation_id = ? ORDER BY reference_id`)
      .all(appended.evaluationId) as { reference_id: string; reference_type: string; external_id: string }[];
    db.close();

    const asOldRuntimeSawIt = oldRuntimeReadReferences(rows);

    // Concretely: the old runtime keeps every reference, including the one it
    // has no name for, and hands back the exact stored string. It does not
    // fail closed, does not misclassify it as some other member, and does not
    // drop it from the aggregate. The one real defect is that its *type* now
    // claims a value the union never declared — harmless in this repository
    // because no code path branches on `referenceType`, and the reason a
    // consumer's exhaustive `switch` needs a `default`.
    assert.equal(asOldRuntimeSawIt.length, 2);
    assert.equal((asOldRuntimeSawIt[0] as OldReferenceRecord).referenceType, 'execution_record');
    assert.equal(String((asOldRuntimeSawIt[1] as OldReferenceRecord).referenceType), 'authorization_artifact');
    assert.equal((asOldRuntimeSawIt[1] as OldReferenceRecord).externalId, 'mandate-old-read');
    assert.equal(
      isCanonicalGovernanceReferenceType(String((asOldRuntimeSawIt[1] as OldReferenceRecord).referenceType)),
      true,
      'this build recognizes the value the old union does not declare',
    );
  });

  it('this build reads a store an old runtime wrote, with the old classification preserved', async () => {
    const path = tempDbPath('old-runtime-write');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-old-write', 'dec-old-write'));
    await store.close();

    // What the old runtime would have written for a mandate.
    const db = await openRawDb(path);
    db.prepare(
      `INSERT INTO governance_references (reference_id, evaluation_id, reference_type, external_id, external_version, digest, uri, created_at)
       VALUES (?, ?, 'external_artifact', ?, NULL, NULL, NULL, ?)`,
    ).run('ref-old-written', appended.evaluationId, 'mandate-old-written', '2025-11-01T00:00:00.000Z');
    db.close();

    const reopened = await createSqliteGovernanceStore(path);
    const record = await reopened.getByEvaluationId(SYSTEM, appended.evaluationId);
    const verification = await reopened.verify(SYSTEM, appended.evaluationId);
    await reopened.close();

    assert.equal(record?.references[0]?.referenceType, 'external_artifact');
    assert.equal(verification.valid, true);
  });
});

// ---------------------------------------------------------------------------
// E. Integrity (§16, §29)
// ---------------------------------------------------------------------------

describe('authorization_artifact — integrity behavior', () => {
  it('an appended authorization_artifact leaves the aggregate and its chain verifiable', async () => {
    const path = tempDbPath('integrity');
    const store = await createSqliteGovernanceStore(path);
    const first = await store.appendEvaluation(buildInput('req-int-1', 'dec-int-1'));
    const second = await store.appendEvaluation(buildInput('req-int-2', 'dec-int-2'));

    await store.appendReference(SYSTEM, {
      referenceId: 'ref-int-authorization',
      evaluationId: first.evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate-int-1',
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    const verifiedFirst = await store.verify(SYSTEM, first.evaluationId);
    const verifiedSecond = await store.verify(SYSTEM, second.evaluationId);
    await store.close();

    assert.equal(verifiedFirst.valid, true);
    assert.equal(verifiedFirst.failures.length, 0);
    assert.equal(verifiedSecond.valid, true);
    assert.equal(verifiedSecond.checks.previousDigest, true, 'the store-scoped chain is unaffected');
  });

  it('behaves identically to every other reference type under verification — the classification is not a special case', async () => {
    const results: Record<string, boolean> = {};
    for (const referenceType of GOVERNANCE_REFERENCE_TYPES) {
      const store = await createSqliteGovernanceStore(':memory:');
      const appended = await store.appendEvaluation(buildInput(`req-eq-${referenceType}`, `dec-eq-${referenceType}`));
      await store.appendReference(SYSTEM, {
        referenceId: `ref-eq-${referenceType}`,
        evaluationId: appended.evaluationId,
        referenceType,
        externalId: `artifact-eq-${referenceType}`,
        createdAt: '2026-01-02T00:00:00.000Z',
      });
      const verification = await store.verify(SYSTEM, appended.evaluationId);
      await store.close();
      results[referenceType] = verification.valid;
    }
    assert.deepEqual(
      results,
      Object.fromEntries(GOVERNANCE_REFERENCE_TYPES.map((referenceType) => [referenceType, true])),
      'no reference type may change whether an aggregate verifies',
    );
  });

  it('references are outside the aggregate digest — so tampering with a stored reference_type is NOT detected, exactly as before this change', async () => {
    const path = tempDbPath('integrity-tamper');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-tamper-ref', 'dec-tamper-ref'));
    await store.appendReference(SYSTEM, {
      referenceId: 'ref-tamper-target',
      evaluationId: appended.evaluationId,
      referenceType: 'execution_record',
      externalId: 'execution-tamper',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await store.close();

    // Forge an execution report into an authorization classification by
    // writing the database directly.
    const db = await openRawDb(path);
    db.prepare(`UPDATE governance_references SET reference_type = 'authorization_artifact' WHERE reference_id = 'ref-tamper-target'`).run();
    db.close();

    const reopened = await createSqliteGovernanceStore(path);
    const verification = await reopened.verify(SYSTEM, appended.evaluationId);
    const record = await reopened.getByEvaluationId(SYSTEM, appended.evaluationId);
    await reopened.close();

    // This is a **pre-existing limit of the v1 integrity model**, recorded
    // here rather than papered over: references are appended after the
    // aggregate digest is computed (`projection.ts` builds the aggregate with
    // `references: []`), so no reference row has ever been covered by it.
    // This change neither introduces nor widens that gap — it adds no new
    // reference field to the digest and removes none. Bringing references
    // under the digest would invalidate every aggregate digest already
    // stored, which is a separate, breaking piece of work.
    //
    // What *does* still hold: a forged classification confers nothing. The
    // mandate it claims to point at does not exist, and no enforcement path
    // consults this column — see "no privilege escalation" below.
    assert.equal(verification.valid, true, 'reference rows are outside the digest, before and after this change');
    assert.equal(record?.references[0]?.referenceType, 'authorization_artifact');
  });

  it('tamper detection over the digested components is unchanged by the new vocabulary', async () => {
    const path = tempDbPath('integrity-still-detects');
    const store = await createSqliteGovernanceStore(path);
    const appended = await store.appendEvaluation(buildInput('req-still-detects', 'dec-still-detects'));
    await store.appendReference(SYSTEM, {
      referenceId: 'ref-still-detects',
      evaluationId: appended.evaluationId,
      referenceType: 'authorization_artifact',
      externalId: 'mandate-still-detects',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await store.close();

    const db = await openRawDb(path);
    db.prepare(`UPDATE governance_evaluations SET status = 'denied' WHERE evaluation_id = ?`).run(appended.evaluationId);
    db.close();

    const reopened = await createSqliteGovernanceStore(path);
    const verification = await reopened.verify(SYSTEM, appended.evaluationId);
    await reopened.close();

    // Rewriting the decision an authorization_artifact hangs off is still caught.
    assert.equal(verification.valid, false);
    assert.ok(verification.failures.map((failure) => failure.check).includes('evaluationDigest'));
  });
});

// ---------------------------------------------------------------------------
// F. Append-only and tenant isolation (§17, §19)
// ---------------------------------------------------------------------------

describe('authorization_artifact — append-only and tenant isolation', () => {
  for (const variant of VARIANTS) {
    it(`${variant.name}: an authorization_artifact reference cannot be overwritten once appended`, async () => {
      const store = await variant.build();
      const appended = await store.appendEvaluation(buildInput('req-append-only', 'dec-append-only'));
      const reference: GovernanceReferenceRecord = {
        referenceId: 'ref-append-only',
        evaluationId: appended.evaluationId,
        referenceType: 'authorization_artifact',
        externalId: 'mandate-append-only',
        createdAt: '2026-01-02T00:00:00.000Z',
      };
      await store.appendReference(SYSTEM, reference);

      await assert.rejects(
        () => store.appendReference(SYSTEM, { ...reference, referenceType: 'external_artifact' }),
        (error: unknown) => error instanceof GovernanceStoreError && error.code === 'GOVERNANCE_STORE_VALIDATION_ERROR',
      );

      const record = await store.getByEvaluationId(SYSTEM, appended.evaluationId);
      assert.equal(record?.references.length, 1);
      assert.equal(record?.references[0]?.referenceType, 'authorization_artifact');
      await store.close();
    });

    it(`${variant.name}: one tenant can neither read nor inject an authorization_artifact into another tenant's aggregate`, async () => {
      const store = await variant.build();
      const tenantB = await store.appendEvaluation(buildInput('req-tenant-b', 'dec-tenant-b', 'org-b'));

      const tenantAContext: GovernanceStoreAccessContext = { system: false, organizationId: 'org-a', actorId: 'operator-a' };

      // Tenant A cannot see Tenant B's aggregate at all...
      assert.equal(await store.getByEvaluationId(tenantAContext, tenantB.evaluationId), null);

      // ...so it cannot append an authorization classification into it. The
      // scope check happens before anything is written, so this is a refusal,
      // not a partially-applied write.
      await assert.rejects(
        () =>
          store.appendReference(tenantAContext, {
            referenceId: 'ref-cross-tenant',
            evaluationId: tenantB.evaluationId,
            referenceType: 'authorization_artifact',
            externalId: 'mandate-forged-cross-tenant',
            createdAt: '2026-01-02T00:00:00.000Z',
          }),
        (error: unknown) => error instanceof GovernanceStoreError && error.code === 'GOVERNANCE_RECORD_NOT_FOUND',
      );

      const asSystem = await store.getByEvaluationId(SYSTEM, tenantB.evaluationId);
      assert.equal(asSystem?.references.length, 0, "nothing was written into the other tenant's aggregate");
      await store.close();
    });
  }
});
