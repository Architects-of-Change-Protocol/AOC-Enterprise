import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { isAuthorityGovernanceError } from '../authority-governance/errors.js';
import { createSqliteGovernedAuthorityStore } from '../authority-governance/sqlite-authority-store.js';
import type { GovernedAuthorityStore } from '../authority-governance/authority-store.js';
import { createSqliteCollateralizationMandateStore } from '../collateralization-governance/sqlite-mandate-store.js';
import { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import { createCollateralizationGovernanceService } from '../collateralization-governance/service.js';
import type { CollateralizationMandateStore } from '../collateralization-governance/mandate-store.js';
import {
  ADMIN_CONTEXT,
  ALICE,
  GA_ASSET,
  GA_NOW,
  GA_TENANT_A,
  GOVERNED_RIGHT_TYPES,
  TENANT_CONTEXT,
  buildGovernedAuthorityWorld,
  heldScope,
  seedPosition,
  type GovernedAuthorityWorld,
} from './governed-authority-support.js';

/**
 * Restart safety for the persistent constraint layer, measured across a real
 * process-shaped boundary.
 *
 * This is the property that decides whether the layer is worth having at all.
 * A collateral arrangement an external system created does not cease to exist
 * because an AOC process restarted, so the governed state accounting for it
 * must not either — and a deployment that came back up reporting the whole
 * position free would hand the same authority out twice on its first request.
 *
 * Every test here opens durable stores against on-disk SQLite files, closes
 * them completely, and reopens them as *new* instances over the same files.
 * Nothing is carried across in memory: the only thing that survives is what was
 * written. A test that instantiated the same object twice would prove nothing,
 * so none do.
 */

const workDir = mkdtempSync(join(tmpdir(), 'aoc-encumbrance-durability-'));
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
  readonly mandatePath: string;
}

let counter = 0;
function tempPaths(name: string): DurablePaths {
  counter += 1;
  return {
    authorityPath: join(workDir, `${name}-${counter}-authority.sqlite`),
    governancePath: join(workDir, `${name}-${counter}-governance.sqlite`),
    mandatePath: join(workDir, `${name}-${counter}-collateral.sqlite`),
  };
}

/**
 * Opens one "process": a freshly-composed world whose three durable stores are
 * new instances backed by the same files. `idSeed` keeps a later process's
 * generated ids from colliding with an earlier one's.
 */
async function openProcess(paths: DurablePaths, idSeed = 0) {
  const authorityStore: GovernedAuthorityStore = await createSqliteGovernedAuthorityStore(paths.authorityPath, { now: () => GA_NOW });
  const governanceStore: GovernanceStore = await createSqliteGovernanceStore(paths.governancePath);
  const mandateStore: CollateralizationMandateStore = await createSqliteCollateralizationMandateStore(paths.mandatePath);
  openStores.push(authorityStore, governanceStore, mandateStore);

  // The world supplies the real Kernel, Recognition Runtime, Authority Graph
  // and Approval Runtime; only the three stores are substituted, so what a
  // restart carries across is exactly the durable state and nothing else.
  // `kernelIdSeed` moves the second process's decision ids clear of the first's.
  // The Kernel's id generator is per-instance, so without it a restart would be
  // refused by the Governance Store for re-issuing an id it already holds —
  // which says nothing about authority and would mask what this test measures.
  const world = buildGovernedAuthorityWorld({ authorityStore, governanceStore, idSeed, kernelIdSeed: idSeed + 1 });
  let nextIdCounter = idSeed;
  const collateralization = createCollateralizationGovernanceService({
    store: mandateStore,
    kernel: world.kernel,
    governanceStore,
    enterpriseContext: () => ({ enterpriseVersion: '1.0.0-test', lifecycleState: 'ready', modules: [] }),
    now: () => GA_NOW,
    nextId: (prefix: string) => {
      nextIdCounter += 1;
      return `${prefix}-${nextIdCounter}`;
    },
    authorityStore,
  });

  return {
    ...world,
    collateralization,
    async close() {
      await mandateStore.close();
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

function conformingExecution(mandateId: string, basisPoints: number) {
  return {
    mandateId,
    executorRef: 'provider-collateral-platform-c',
    executedAt: GA_NOW,
    securedObligationRef: 'obligation-001',
    securedPartyRef: 'party-lender-b',
    committedScope: bp(basisPoints),
    rights: [ECONOMIC],
    externalRegistry: 'registry-alpha',
  };
}

async function capacityOf(process: Process | GovernedAuthorityWorld) {
  return process.authorityStore.resolveAvailability(ADMIN_CONTEXT, {
    tenantId: GA_TENANT_A,
    holderRef: ALICE,
    resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
    governedRight: ECONOMIC,
    at: GA_NOW,
  });
}

async function refusalCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    assert.ok(isAuthorityGovernanceError(error), `expected an AuthorityGovernanceError, received ${String(error)}`);
    return error.code;
  }
  assert.fail('expected the commitment to be refused');
}

describe('Encumbrance durability — a constraint outlives the process that recorded it', () => {
  it('survives a restart and still refuses the overlapping mandate in the next process', async () => {
    const paths = tempPaths('restart');

    // --- Process one: authorize and execute. -------------------------------
    const first = await openProcess(paths);
    await seedPosition(first, ALICE, ECONOMIC, bp(5_000));
    const outcome = await first.collateralization.requestCollateralization(TENANT_CONTEXT, GA_TENANT_A, collateralRequest('restart-a', 4_000));
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate !== undefined);
    await first.collateralization.recordExecution(TENANT_CONTEXT, conformingExecution(outcome.mandate.id, 4_000));

    const before = await capacityOf(first);
    assert.ok(before.outcome === 'available');
    assert.deepEqual(before.encumbered, bp(4_000));
    assert.deepEqual(before.available, bp(1_000));
    await first.close();

    // --- Process two: nothing in memory, everything from disk. -------------
    const second = await openProcess(paths, 1_000);
    const after = await capacityOf(second);
    assert.ok(after.outcome === 'available');
    assert.deepEqual(after.held, bp(5_000), 'the position is what it always was');
    assert.deepEqual(after.encumbered, bp(4_000), 'and the constraint came back with it');
    assert.deepEqual(after.available, bp(1_000));
    assert.deepEqual(await heldScope(second, ALICE, ECONOMIC), bp(5_000));

    // The point of persisting it: the new process enforces it against a mandate
    // it has never seen before.
    assert.equal(
      await refusalCode(() => second.collateralization.requestCollateralization(TENANT_CONTEXT, GA_TENANT_A, collateralRequest('restart-b', 4_000))),
      'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    );
    // And what does fit, still fits.
    const fits = await second.collateralization.requestCollateralization(TENANT_CONTEXT, GA_TENANT_A, collateralRequest('restart-c', 1_000));
    assert.equal(fits.status, 'allowed');
    await second.close();
  });

  it('keeps a released constraint terminal across a restart, and the capacity returned', async () => {
    const paths = tempPaths('restart-released');

    const first = await openProcess(paths);
    await seedPosition(first, ALICE, ECONOMIC, bp(5_000));
    const outcome = await first.collateralization.requestCollateralization(TENANT_CONTEXT, GA_TENANT_A, collateralRequest('released-a', 4_000));
    assert.ok(outcome.mandate !== undefined);
    await first.collateralization.recordExecution(TENANT_CONTEXT, conformingExecution(outcome.mandate.id, 4_000));

    const [constraint] = await first.authorityStore.listEncumbrancesByMandateRef(ADMIN_CONTEXT, GA_TENANT_A, outcome.mandate.id);
    assert.ok(constraint !== undefined);
    // The privileged act, from an operator context a request path never holds.
    await first.authorityStore.releaseEncumbrance(ADMIN_CONTEXT, { tenantId: GA_TENANT_A, encumbranceId: constraint.id, basis: 'administrative' });
    await first.close();

    const second = await openProcess(paths, 2_000);
    assert.equal((await second.authorityStore.getEncumbrance(ADMIN_CONTEXT, GA_TENANT_A, constraint.id))?.status, 'released');
    const capacity = await capacityOf(second);
    assert.ok(capacity.outcome === 'available');
    assert.deepEqual(capacity.held, bp(5_000), 'the position was never changed by any of it');
    assert.deepEqual(capacity.available, bp(5_000));

    const reauthorized = await second.collateralization.requestCollateralization(TENANT_CONTEXT, GA_TENANT_A, collateralRequest('released-b', 4_000));
    assert.equal(reauthorized.status, 'allowed');
    await second.close();
  });

  it('carries a pre-execution commitment across a restart, and completes the handoff in the next process', async () => {
    // The crash window that matters: the mandate exists and holds capacity, and
    // the execution has not been recorded. The safe state is the conservative
    // one — the capacity stays unavailable rather than becoming falsely free —
    // and the next process must be able to finish the job.
    const paths = tempPaths('restart-midflight');

    const first = await openProcess(paths);
    await seedPosition(first, ALICE, ECONOMIC, bp(5_000));
    const outcome = await first.collateralization.requestCollateralization(TENANT_CONTEXT, GA_TENANT_A, collateralRequest('midflight-a', 4_000));
    assert.ok(outcome.mandate !== undefined);
    const mandateId = outcome.mandate.id;
    await first.close();

    const second = await openProcess(paths, 3_000);
    const midflight = await capacityOf(second);
    assert.ok(midflight.outcome === 'available');
    assert.deepEqual(midflight.committed, bp(4_000), 'the commitment is still standing, conservatively');
    assert.equal(midflight.encumbered, undefined, 'and nothing is constrained, because nothing has executed');
    assert.deepEqual(midflight.available, bp(1_000));

    // The external executor reports, in the new process. The handoff completes
    // against the commitment the previous process left behind.
    await second.collateralization.recordExecution(TENANT_CONTEXT, conformingExecution(mandateId, 4_000));
    const settled = await capacityOf(second);
    assert.ok(settled.outcome === 'available');
    assert.equal(settled.committed, undefined);
    assert.deepEqual(settled.encumbered, bp(4_000));
    assert.deepEqual(settled.available, bp(1_000), 'and at no point did the 4 000 look free, or get counted twice');

    const commitments = await second.authorityStore.listReservationsByMandateRef(ADMIN_CONTEXT, GA_TENANT_A, mandateId);
    assert.equal(commitments[0]?.status, 'encumbered');
    await second.close();
  });

  it('is visible to a second store opened over the same file, with nothing shared in memory', async () => {
    // Two connections, no shared object graph. What the second one sees is what
    // the first one committed to disk, which is the only thing a separate
    // process would have to go on.
    const paths = tempPaths('two-connections');
    const writer = await createSqliteGovernedAuthorityStore(paths.authorityPath, { now: () => GA_NOW });
    const reader = await createSqliteGovernedAuthorityStore(paths.authorityPath, { now: () => GA_NOW });
    openStores.push(writer, reader);

    await writer.bootstrapPosition(ADMIN_CONTEXT, {
      tenantId: GA_TENANT_A,
      holderRef: ALICE,
      resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
      governedRight: ECONOMIC,
      scope: bp(5_000),
      basis: { kind: 'administrative-bootstrap', assertedBy: 'actor-administrator' },
      effectiveFrom: GA_NOW,
    });
    await writer.recordEncumbrance(ADMIN_CONTEXT, {
      tenantId: GA_TENANT_A,
      holderRef: ALICE,
      resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
      governedRight: ECONOMIC,
      scope: bp(4_000),
      sourceAction: 'collateralize',
      sourceMandateRef: 'mandate-cross-connection',
      sourceExecutionRef: 'exec-cross-connection',
      effectiveFrom: GA_NOW,
    });

    const seen = await reader.resolveAvailability(ADMIN_CONTEXT, {
      tenantId: GA_TENANT_A,
      holderRef: ALICE,
      resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
      governedRight: ECONOMIC,
      at: GA_NOW,
    });
    assert.ok(seen.outcome === 'available');
    assert.deepEqual(seen.encumbered, bp(4_000));
    assert.deepEqual(seen.available, bp(1_000));

    // And the second connection enforces it: the durable UNIQUE constraints and
    // the transaction boundary hold across connections, not merely within one.
    assert.equal(
      await refusalCode(() =>
        reader.acquireReservation(ADMIN_CONTEXT, {
          tenantId: GA_TENANT_A,
          holderRef: ALICE,
          resource: { kind: GA_ASSET.kind, id: GA_ASSET.id },
          governedRight: ECONOMIC,
          scope: bp(4_000),
          action: 'collateralize',
          sourceRequestRef: 'request-cross-connection',
          sourceMandateRef: 'mandate-cross-connection-2',
          effectiveFrom: GA_NOW,
          expiresAt: '2026-07-01T00:00:00.000Z',
        }),
      ),
      'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
    );
    await reader.close();
    await writer.close();
  });
});
