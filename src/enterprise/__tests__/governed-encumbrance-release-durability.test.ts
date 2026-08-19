import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import type { GovernedAuthorityStore } from '../authority-governance/authority-store.js';
import { isAuthorityGovernanceError } from '../authority-governance/errors.js';
import { createSqliteGovernedAuthorityStore } from '../authority-governance/sqlite-authority-store.js';
import type { CollateralizationMandateStore } from '../collateralization-governance/mandate-store.js';
import { createCollateralizationGovernanceService } from '../collateralization-governance/service.js';
import { createSqliteCollateralizationMandateStore } from '../collateralization-governance/sqlite-mandate-store.js';
import { isEncumbranceReleaseGovernanceError } from '../encumbrance-release-governance/errors.js';
import {
  createInMemoryEncumbranceReleaseExecutorPort,
  createIndeterminateEncumbranceReleaseExecutorPort,
  type EncumbranceReleaseExecutorPort,
} from '../encumbrance-release-governance/executor-port.js';
import type { EncumbranceReleaseMandateStore } from '../encumbrance-release-governance/mandate-store.js';
import { createEncumbranceReleaseGovernanceService } from '../encumbrance-release-governance/service.js';
import { createSqliteEncumbranceReleaseMandateStore } from '../encumbrance-release-governance/sqlite-mandate-store.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
import {
  ADMIN_CONTEXT,
  ALICE,
  GA_ASSET,
  GA_NOW,
  GA_RELEASE_OFFICER_ACTOR_ID,
  GA_TENANT_A,
  GOVERNED_RIGHT_TYPES,
  TENANT_CONTEXT,
  buildGovernedAuthorityWorld,
  encumbranceReleaseRequest,
  heldScope,
  seedPosition,
} from './governed-authority-support.js';

/**
 * Restart safety, crash safety and concurrency for governed encumbrance
 * release, measured across a real process-shaped boundary and a real database.
 *
 * Three questions, and the layer is worth nothing if any of them is answered
 * wrong:
 *
 * ```
 * restart      does a discharge survive a restart, and does a non-discharge
 *              equally survive as a non-discharge?
 * crash        if the external release succeeded and the process died before
 *              Soberanía terminalized, does the state stay safe and become finishable?
 * concurrency  can a release racing an acquisition, or two releases racing each
 *              other, manufacture capacity that never existed?
 * ```
 *
 * Every test opens durable stores against on-disk SQLite files, closes them
 * completely, and reopens them as *new* instances over the same files. Nothing
 * is carried across in memory: the only thing that survives is what was
 * written. A test that instantiated the same object twice would prove nothing,
 * so none do.
 */

const workDir = mkdtempSync(join(tmpdir(), 'aoc-encumbrance-release-durability-'));
const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;

const openStores: Array<{ close(): Promise<void> }> = [];
after(async () => {
  await Promise.all(openStores.map((store) => store.close().catch(() => {})));
  rmSync(workDir, { recursive: true, force: true });
});

function bp(basisPoints: number) {
  return { kind: 'proportional', basisPoints } as const;
}

interface DurablePaths {
  readonly authorityPath: string;
  readonly governancePath: string;
  readonly collateralPath: string;
  readonly releasePath: string;
}

let counter = 0;
function tempPaths(name: string): DurablePaths {
  counter += 1;
  return {
    authorityPath: join(workDir, `${name}-${counter}-authority.sqlite`),
    governancePath: join(workDir, `${name}-${counter}-governance.sqlite`),
    collateralPath: join(workDir, `${name}-${counter}-collateral.sqlite`),
    releasePath: join(workDir, `${name}-${counter}-release.sqlite`),
  };
}

/**
 * Opens one "process": a freshly-composed world whose four durable stores are
 * new instances backed by the same files.
 *
 * `idSeed` and `kernelIdSeed` keep a later process's generated ids clear of an
 * earlier one's. The Kernel's id generator is per-instance, so without the
 * latter a restart would be refused by the Governance Store for re-issuing an
 * id it already holds — which says nothing about release and would mask what
 * these tests measure.
 */
async function openProcess(paths: DurablePaths, options: { readonly idSeed?: number; readonly executor?: EncumbranceReleaseExecutorPort } = {}) {
  const idSeed = options.idSeed ?? 0;
  const authorityStore: GovernedAuthorityStore = await createSqliteGovernedAuthorityStore(paths.authorityPath, { now: () => GA_NOW });
  const governanceStore: GovernanceStore = await createSqliteGovernanceStore(paths.governancePath);
  const collateralStore: CollateralizationMandateStore = await createSqliteCollateralizationMandateStore(paths.collateralPath);
  const releaseStore: EncumbranceReleaseMandateStore = await createSqliteEncumbranceReleaseMandateStore(paths.releasePath, { now: () => GA_NOW });
  openStores.push(authorityStore, governanceStore, collateralStore, releaseStore);

  const executor = options.executor ?? createInMemoryEncumbranceReleaseExecutorPort({ now: () => GA_NOW });
  const world = buildGovernedAuthorityWorld({
    authorityStore,
    governanceStore,
    encumbranceReleaseStore: releaseStore,
    releaseExecutor: executor,
    idSeed,
    kernelIdSeed: idSeed + 1,
  });

  let nextIdCounter = idSeed;
  const nextId = (prefix: string): string => {
    nextIdCounter += 1;
    return `${prefix}-${nextIdCounter}`;
  };
  const shared = {
    kernel: world.kernel,
    governanceStore,
    enterpriseContext: () => ({ enterpriseVersion: '1.0.0-test', lifecycleState: 'ready' as const, modules: [] }),
    now: () => GA_NOW,
    nextId,
  };

  return {
    ...world,
    executor,
    collateralization: createCollateralizationGovernanceService({ ...shared, store: collateralStore, authorityStore }),
    encumbranceRelease: createEncumbranceReleaseGovernanceService({ ...shared, store: releaseStore, authorityStore, executor }),
    async close() {
      await releaseStore.close();
      await collateralStore.close();
      await governanceStore.close();
      await authorityStore.close();
    },
  };
}

type Process = Awaited<ReturnType<typeof openProcess>>;

function collateralRequest(requestId: string, basisPoints: number) {
  return {
    requestId,
    correlationId: `corr-${requestId}`,
    asset: GA_ASSET,
    requestedBy: 'actor-rights-manager',
    trustDomainId: 'trust-domain-meridian-holdings',
    context: { passportId: 'passport-rights-manager', capabilityTokenId: 'cap-manager-governed-actions' },
    mandateExpiresAt: '2026-07-01T00:00:00.000Z',
    authorityHolderRef: ALICE,
    terms: {
      rights: [ECONOMIC],
      scope: bp(basisPoints),
      securedObligationRef: 'obligation-001',
      securedObligationKind: 'credit-facility',
      securedPartyRef: 'party-lender-b',
      executorRef: 'provider-collateral-platform-c',
      constraints: { permittedRegistries: ['registry-alpha'], exclusive: true, releaseEvidenceRequired: false, additionalCollateralizationAllowed: false },
    },
  } as never;
}

function conformingCollateralExecution(mandateId: string, basisPoints: number) {
  return {
    mandateId,
    executorRef: 'provider-collateral-platform-c',
    executedAt: GA_NOW,
    securedObligationRef: 'obligation-001',
    securedPartyRef: 'party-lender-b',
    committedScope: bp(basisPoints),
    rights: [ECONOMIC],
    externalRegistry: 'registry-alpha',
  } as never;
}

/** Drives a collateralization to an active persistent constraint in a running process, and returns it. */
async function encumber(process: Process, requestId: string, basisPoints: number) {
  const outcome = await process.collateralization.requestCollateralization(TENANT_CONTEXT, GA_TENANT_A, collateralRequest(requestId, basisPoints));
  assert.equal(outcome.status, 'allowed');
  assert.ok(outcome.mandate !== undefined);
  const executed = await process.collateralization.recordExecution(TENANT_CONTEXT, conformingCollateralExecution(outcome.mandate.id, basisPoints));
  const constraints = await process.authorityStore.listActiveEncumbrances(ADMIN_CONTEXT, availability());
  const created = constraints.find((constraint) => constraint.sourceExecutionRef === executed.execution.id);
  assert.ok(created !== undefined);
  return created;
}

function availability(holderRef = ALICE) {
  return {
    tenantId: GA_TENANT_A,
    holderRef,
    resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
    governedRight: ECONOMIC,
    at: GA_NOW,
  };
}

async function capacityOf(process: Process, holderRef = ALICE) {
  return process.authorityStore.resolveAvailability(ADMIN_CONTEXT, availability(holderRef));
}

async function refusalCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (isEncumbranceReleaseGovernanceError(error)) return error.code;
    if (isAuthorityGovernanceError(error)) return error.code;
    assert.fail(`expected a governance error, received ${String(error)}`);
  }
  assert.fail('expected the operation to be refused');
}

describe('governed encumbrance release durability', () => {
  it('a discharge survives a restart, and the capacity stays restored', async () => {
    const paths = tempPaths('released');
    const first = await openProcess(paths);
    await seedPosition(first, ALICE, ECONOMIC, bp(5_000));
    const encumbrance = await encumber(first, 'req-durable-collateralize', 4_000);

    const outcome = await first.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-durable-release', encumbrance.id),
    );
    assert.equal(outcome.status, 'allowed');
    const executed = await first.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });
    assert.equal(executed.encumbrance.status, 'released');
    await first.close();

    const second = await openProcess(paths, { idSeed: 500 });
    const stored = await second.authorityStore.getEncumbrance(ADMIN_CONTEXT, GA_TENANT_A, encumbrance.id);
    assert.equal(stored?.status, 'released', 'the discharge survived');
    assert.equal(stored?.releaseBasis, 'governed-execution');
    assert.equal(stored?.releaseMandateRef, outcome.mandate!.id);
    assert.equal(stored?.releaseExecutionRef, executed.execution.id, 'with the lineage that justified it');

    const capacity = await capacityOf(second);
    assert.ok(capacity.outcome === 'available');
    assert.deepEqual(capacity.held, bp(5_000), 'and the position is exactly what it always was');
    assert.deepEqual(capacity.available, bp(5_000));

    // The release mandate is spent, in the reopened store, so a restart cannot
    // be used to spend it again.
    const mandate = await second.encumbranceRelease.getMandate(TENANT_CONTEXT, outcome.mandate!.id);
    assert.equal(mandate.status, 'executed');
    assert.equal(
      await refusalCode(() => second.encumbranceRelease.requestEncumbranceRelease(
        TENANT_CONTEXT,
        GA_TENANT_A,
        encumbranceReleaseRequest('req-durable-release-again', encumbrance.id),
      )),
      'ENCUMBRANCE_RELEASE_TARGET_NOT_ACTIVE',
    );
    await second.close();
  });

  it('an issued-but-unexecuted authorization survives a restart, and has released nothing', async () => {
    const paths = tempPaths('mandate-only');
    const first = await openProcess(paths);
    await seedPosition(first, ALICE, ECONOMIC, bp(5_000));
    const encumbrance = await encumber(first, 'req-mandate-only-collateralize', 4_000);

    const outcome = await first.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-mandate-only-release', encumbrance.id),
    );
    assert.equal(outcome.status, 'allowed');
    await first.close();

    const second = await openProcess(paths, { idSeed: 500 });
    assert.equal((await second.authorityStore.getEncumbrance(ADMIN_CONTEXT, GA_TENANT_A, encumbrance.id))?.status, 'active');
    const capacity = await capacityOf(second);
    assert.ok(capacity.outcome === 'available');
    assert.deepEqual(capacity.available, bp(1_000), 'authorization is not effect, across a restart as well as within one');

    // And it is still usable: a durable mandate is a durable authorization.
    const mandate = await second.encumbranceRelease.getMandate(TENANT_CONTEXT, outcome.mandate!.id);
    assert.equal(mandate.status, 'active');
    const executed = await second.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: mandate.id });
    assert.equal(executed.encumbrance.status, 'released');
    const after = await capacityOf(second);
    assert.ok(after.outcome === 'available');
    assert.deepEqual(after.available, bp(5_000));
    await second.close();
  });

  it('an unknown outcome survives a restart as unknown, and frees nothing', async () => {
    const paths = tempPaths('unknown');
    const first = await openProcess(paths, { executor: createIndeterminateEncumbranceReleaseExecutorPort() });
    await seedPosition(first, ALICE, ECONOMIC, bp(5_000));
    const encumbrance = await encumber(first, 'req-unknown-collateralize', 4_000);

    const outcome = await first.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-unknown-release', encumbrance.id),
    );
    const attempted = await first.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate!.id });
    assert.equal(attempted.execution.outcome, 'indeterminate');
    await first.close();

    const second = await openProcess(paths, { idSeed: 500, executor: createIndeterminateEncumbranceReleaseExecutorPort() });
    assert.equal((await second.authorityStore.getEncumbrance(ADMIN_CONTEXT, GA_TENANT_A, encumbrance.id))?.status, 'active');
    const capacity = await capacityOf(second);
    assert.ok(capacity.outcome === 'available');
    assert.deepEqual(capacity.available, bp(1_000), 'unknown stays unknown; nothing is resolved optimistically by restarting');

    // The attempt is still there, and the authorization is still live, so a
    // reconciliation can retry it.
    assert.equal((await second.encumbranceRelease.listExecutions(TENANT_CONTEXT, outcome.mandate!.id)).length, 1);
    assert.equal((await second.encumbranceRelease.getMandate(TENANT_CONTEXT, outcome.mandate!.id)).status, 'active');
    // And recovery finds nothing to finish, because nothing was confirmed.
    assert.equal(await second.encumbranceRelease.recoverEncumbranceRelease(TENANT_CONTEXT, outcome.mandate!.id), null);
    await second.close();
  });

  it('finishes a terminalization a crash interrupted, exactly once', async () => {
    // Crash matrix state E, reproduced rather than argued about: the external
    // release succeeded, the evidence is durable, and the process died before
    // the authority store was told. The ordering that makes this the *reachable*
    // failure is deliberate — evidence first, terminalization second — because
    // the other ordering's reachable failure is capacity freed for a discharge
    // whose evidence never landed.
    const paths = tempPaths('crash');
    const first = await openProcess(paths);
    await seedPosition(first, ALICE, ECONOMIC, bp(5_000));
    const encumbrance = await encumber(first, 'req-crash-collateralize', 4_000);

    const outcome = await first.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-crash-release', encumbrance.id),
    );
    assert.ok(outcome.mandate !== undefined);

    // Simulate the crash by recording the confirmed evidence through the store
    // directly and stopping there — precisely the state
    // `executeEncumbranceRelease` is in between its two durable steps.
    const confirmed = await first.encumbranceReleaseStore.recordExecution(TENANT_CONTEXT, {
      id: 'release-execution-interrupted',
      mandateId: outcome.mandate.id,
      organizationId: GA_TENANT_A,
      encumbranceRef: encumbrance.id,
      outcome: 'confirmed_success',
      providerSystem: 'in-memory-release-executor',
      attemptedAt: GA_NOW,
      confirmedAt: GA_NOW,
      providerReleaseReference: 'provider-release-interrupted',
      correlationId: 'corr-crash',
    });
    assert.equal(confirmed.mandate.status, 'executed');
    await first.close();

    const second = await openProcess(paths, { idSeed: 500 });

    // The safe intermediate state: capacity blocked rather than falsely freed.
    assert.equal((await second.authorityStore.getEncumbrance(ADMIN_CONTEXT, GA_TENANT_A, encumbrance.id))?.status, 'active');
    const blocked = await capacityOf(second);
    assert.ok(blocked.outcome === 'available');
    assert.deepEqual(blocked.available, bp(1_000), 'the crash blocked too much, never too little');

    const recovered = await second.encumbranceRelease.recoverEncumbranceRelease(TENANT_CONTEXT, outcome.mandate.id);
    assert.ok(recovered !== null);
    assert.equal(recovered.terminalized, true);
    assert.equal(recovered.encumbrance.status, 'released');
    assert.equal(recovered.encumbrance.releaseExecutionRef, 'release-execution-interrupted');

    // Running recovery again is a no-op, and so is executing the mandate again.
    const again = await second.encumbranceRelease.recoverEncumbranceRelease(TENANT_CONTEXT, outcome.mandate.id);
    assert.equal(again?.terminalized, false);
    const replayed = await second.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate.id });
    assert.equal(replayed.terminalized, false);
    assert.equal(
      (await second.encumbranceRelease.listExecutions(TENANT_CONTEXT, outcome.mandate.id)).length,
      1,
      'and no second external release is performed by recovering one that already happened',
    );

    const capacity = await capacityOf(second);
    assert.ok(capacity.outcome === 'available');
    assert.deepEqual(capacity.available, bp(5_000), 'capacity restored exactly once');
    assert.deepEqual(await heldScope(second, ALICE, ECONOMIC), bp(5_000));
    await second.close();
  });
});

describe('governed encumbrance release concurrency', () => {
  it('a release racing a competing acquisition can never manufacture capacity', async () => {
    // Two orderings are correct and a third is not. Either the acquisition
    // arrives while the constraint stands and loses, or the release commits
    // first and it wins — but the total of what stands committed and
    // constrained must never exceed what Alice holds.
    const paths = tempPaths('race-acquire');
    const process = await openProcess(paths);
    await seedPosition(process, ALICE, ECONOMIC, bp(5_000));
    const encumbrance = await encumber(process, 'req-race-collateralize', 4_000);

    const outcome = await process.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-race-release', encumbrance.id),
    );
    assert.ok(outcome.mandate !== undefined);

    const [release, acquire] = await Promise.allSettled([
      process.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate.id }),
      process.authorityStore.acquireReservation(ADMIN_CONTEXT, {
        tenantId: GA_TENANT_A,
        holderRef: ALICE,
        resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
        governedRight: ECONOMIC,
        scope: bp(4_000),
        action: 'collateralize',
        sourceRequestRef: 'req-race-competitor',
        sourceMandateRef: 'mandate-race-competitor',
        effectiveFrom: GA_NOW,
        expiresAt: '2026-07-01T00:00:00.000Z',
      }),
    ]);

    assert.equal(release.status, 'fulfilled', 'the release is never the loser: it commits or it fails on its own merits');
    assert.equal(release.value.encumbrance.status, 'released');

    const capacity = await capacityOf(process);
    assert.ok(capacity.outcome === 'available', `capacity must stay coherent, saw ${capacity.outcome}`);
    assert.deepEqual(capacity.held, bp(5_000));

    if (acquire.status === 'fulfilled' && acquire.value.outcome === 'reserved') {
      // The acquisition won a slot: it must have been paid for out of the
      // 5 000 Alice holds, never out of thin air.
      assert.deepEqual(capacity.committed, bp(4_000));
      assert.deepEqual(capacity.available, bp(1_000));
    } else {
      assert.equal(capacity.committed, undefined);
      assert.deepEqual(capacity.available, bp(5_000));
    }
    await process.close();
  });

  it('two concurrent executions of one authorization terminalize exactly once', async () => {
    const paths = tempPaths('race-double');
    const process = await openProcess(paths);
    await seedPosition(process, ALICE, ECONOMIC, bp(5_000));
    const encumbrance = await encumber(process, 'req-double-collateralize', 4_000);

    const outcome = await process.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-double-release', encumbrance.id),
    );
    assert.ok(outcome.mandate !== undefined);

    const results = await Promise.allSettled([
      process.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate.id }),
      process.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: outcome.mandate.id }),
    ]);
    const terminalizations = results.filter((result) => result.status === 'fulfilled' && result.value.terminalized).length;
    assert.equal(terminalizations, 1, 'exactly one call performs the terminalization');

    // Whatever the other call did — succeeded idempotently or was refused — the
    // durable state is one confirmed release and one restoration.
    const confirmed = (await process.encumbranceRelease.listExecutions(TENANT_CONTEXT, outcome.mandate.id)).filter(
      (execution) => execution.outcome === 'confirmed_success',
    );
    assert.equal(confirmed.length, 1, 'and the authorization was spent once');

    const capacity = await capacityOf(process);
    assert.ok(capacity.outcome === 'available');
    assert.deepEqual(capacity.held, bp(5_000), 'the position never moved');
    assert.deepEqual(capacity.available, bp(5_000), 'and capacity came back once, never twice');
    await process.close();
  });

  it('concurrent releases of independent siblings both succeed, and free exactly their own', async () => {
    const paths = tempPaths('race-siblings');
    const process = await openProcess(paths);
    await seedPosition(process, ALICE, ECONOMIC, bp(10_000));
    const a = await encumber(process, 'req-siblings-a', 3_000);
    const b = await encumber(process, 'req-siblings-b', 2_000);

    const releaseA = await process.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-siblings-release-a', a.id),
    );
    const releaseB = await process.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-siblings-release-b', b.id),
    );

    const results = await Promise.all([
      process.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: releaseA.mandate!.id }),
      process.encumbranceRelease.executeEncumbranceRelease(TENANT_CONTEXT, { mandateId: releaseB.mandate!.id }),
    ]);
    assert.deepEqual(
      results.map((result) => result.encumbrance.status),
      ['released', 'released'],
    );

    const capacity = await capacityOf(process);
    assert.ok(capacity.outcome === 'available');
    assert.deepEqual(capacity.held, bp(10_000));
    assert.equal(capacity.encumbered, undefined);
    assert.deepEqual(capacity.available, bp(10_000), 'held minus nothing still constraining — never more');
    assert.deepEqual(await heldScope(process, ALICE, ECONOMIC), bp(10_000), 'and never a credit');
    await process.close();
  });

  it('the release officer is the only actor that can start any of this', async () => {
    // A durability-level restatement of the phase's central negative result,
    // against the real SQLite stores: the authority question does not soften
    // because the state is durable.
    const paths = tempPaths('durable-authority');
    const process = await openProcess(paths);
    await seedPosition(process, ALICE, ECONOMIC, bp(5_000));
    const encumbrance = await encumber(process, 'req-durable-authority', 4_000);

    const asHolder = await process.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-durable-authority-holder', encumbrance.id, {
        requestedBy: ALICE,
        context: { passportId: 'passport-alice', capabilityTokenId: 'cap-alice-governed-actions' },
      }),
    );
    assert.equal(asHolder.status, 'denied');

    const asOfficer = await process.encumbranceRelease.requestEncumbranceRelease(
      TENANT_CONTEXT,
      GA_TENANT_A,
      encumbranceReleaseRequest('req-durable-authority-officer', encumbrance.id, { requestedBy: GA_RELEASE_OFFICER_ACTOR_ID }),
    );
    assert.equal(asOfficer.status, 'allowed');
    await process.close();
  });
});
