import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ENTERPRISE_TRANSFERABLE_RIGHT_TYPES, enterpriseTransferTermsEquals } from '@aoc-enterprise/transfer-mandate';

import { isTransferGovernanceError } from '../transfer-governance/errors.js';
import { createInMemoryTransferMandateStore } from '../transfer-governance/in-memory-mandate-store.js';
import { createSqliteTransferMandateStore } from '../transfer-governance/sqlite-mandate-store.js';
import type { TransferMandateStore } from '../transfer-governance/mandate-store.js';
import type { IssueTransferMandateInput, RecordTransferExecutionInput, TransferGovernanceContext } from '../transfer-governance/contracts.js';
import {
  OTHER_TRANSFEREE_REF,
  OTHER_TRANSFEROR_REF,
  OTHER_TRANSFER_EXECUTOR_REF,
  PERMITTED_REGISTRY,
  TRANSFEREE_REF,
  TRANSFEROR_REF,
  TRANSFER_EXECUTOR_REF,
  TRANSFER_TENANT_A,
  TRANSFER_TENANT_B,
  directTransferTerms,
  quarterInterestTransferTerms,
  trancheTransferTerms,
  unitizedTransferTerms,
} from './transfer-support.js';

/**
 * The shared behavioural contract every `TransferMandateStore` provider must
 * satisfy, run against both implementations. The in-memory store is not a
 * lesser implementation with looser rules: every assertion below runs
 * identically against it and against the durable SQLite store, so a deployment
 * can change providers without changing what the governance layer guarantees.
 *
 * Two invariants get particular attention here, because they are the ones
 * `TRANSFER` has and its siblings do not: the cumulative transferred total
 * must agree between providers to the basis point, and the transferor and
 * transferee bindings must be equally unforgiving in both.
 */

const workDir = mkdtempSync(join(tmpdir(), 'aoc-transfer-store-contract-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

const NOW = '2026-01-01T00:00:00.000Z';
const CONTEXT: TransferGovernanceContext = { system: false, organizationId: TRANSFER_TENANT_A, actorId: 'operator-a' };
const OTHER_TENANT_CONTEXT: TransferGovernanceContext = { system: false, organizationId: TRANSFER_TENANT_B, actorId: 'operator-b' };

let dbCounter = 0;

interface Provider {
  readonly label: string;
  open(): Promise<TransferMandateStore>;
}

const PROVIDERS: readonly Provider[] = [
  { label: 'memory', open: async () => createInMemoryTransferMandateStore({ now: () => NOW }) },
  {
    label: 'sqlite',
    open: async () => {
      dbCounter += 1;
      return createSqliteTransferMandateStore(join(workDir, `contract-${dbCounter}.sqlite`), { now: () => NOW });
    },
  },
];

function issueInput(overrides: Partial<IssueTransferMandateInput> = {}): IssueTransferMandateInput {
  const terms = overrides.terms ?? quarterInterestTransferTerms();
  return {
    id: 'transfer-mandate-1',
    organizationId: TRANSFER_TENANT_A,
    assetKind: 'asset',
    assetId: 'digital-asset-a',
    assetTenantId: TRANSFER_TENANT_A,
    terms,
    requestedTerms: overrides.requestedTerms ?? terms,
    requestRef: 'transfer-request-1',
    requestedBy: 'actor-portfolio-manager',
    decisionRef: 'decision-1',
    evaluationRef: 'evaluation-1',
    effectiveFrom: NOW,
    expiresAt: '2026-07-01T00:00:00.000Z',
    correlationId: 'correlation-1',
    ...overrides,
  };
}

/**
 * The conforming execution report, with overrides applied.
 *
 * An override whose value is `undefined` *removes* the field rather than
 * setting it to `undefined`. The repository compiles with
 * `exactOptionalPropertyTypes`, and the distinction matters to the domain as
 * well as the compiler: "reported no registry" and "reported a registry of
 * `undefined`" are the same fact, and every containment check reads presence.
 */
function executionInput(overrides: Record<string, unknown> = {}): RecordTransferExecutionInput {
  const merged: Record<string, unknown> = {
    id: 'transfer-execution-1',
    mandateId: 'transfer-mandate-1',
    organizationId: TRANSFER_TENANT_A,
    executedBy: TRANSFER_EXECUTOR_REF,
    executedAt: '2026-02-01T00:00:00.000Z',
    transferorRef: TRANSFEROR_REF,
    transfereeRef: TRANSFEREE_REF,
    rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST],
    transferredScope: { kind: 'proportional', basisPoints: 2500 },
    correlationId: 'execution-correlation-1',
    registry: PERMITTED_REGISTRY,
    externalAgreementReference: 'agreement-1',
    externalAcceptanceReference: 'acceptance-1',
    ...overrides,
  };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged as unknown as RecordTransferExecutionInput;
}

async function assertStoreError(fn: () => Promise<unknown>, code: string, refusalCode?: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert.ok(isTransferGovernanceError(error), `expected a TransferGovernanceError, received ${String(error)}`);
    assert.equal(error.code, code);
    if (refusalCode !== undefined) {
      assert.equal((error.details as { refusalCode?: string } | undefined)?.refusalCode, refusalCode);
    }
    return;
  }
  assert.fail(`expected ${code} to be thrown`);
}

for (const provider of PROVIDERS) {
  describe(`TransferMandateStore contract — ${provider.label}`, () => {
    it('issues a mandate and reads it back with terms structurally identical', async () => {
      const store = await provider.open();
      try {
        const issued = await store.issueMandate(CONTEXT, issueInput());
        const read = await store.getMandate(CONTEXT, issued.id);
        assert.ok(enterpriseTransferTermsEquals(read.terms, quarterInterestTransferTerms()));
        assert.equal(read.status, 'active');
        assert.equal(read.executionCount, 0);
        assert.equal(read.transferredScope, undefined, 'nothing has moved yet — absent, never a zero portion');
      } finally {
        await store.close();
      }
    });

    it('refuses a second mandate for a request that already produced one', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput());
        await assertStoreError(() => store.issueMandate(CONTEXT, issueInput({ id: 'transfer-mandate-2' })), 'TRANSFER_MANDATE_ALREADY_EXISTS');
      } finally {
        await store.close();
      }
    });

    it('refuses a mandate that widens the requested portion or substitutes a party', async () => {
      const store = await provider.open();
      try {
        const requested = quarterInterestTransferTerms();
        await assertStoreError(
          () =>
            store.issueMandate(
              CONTEXT,
              issueInput({ terms: { ...requested, scope: { kind: 'proportional', basisPoints: 5000 } }, requestedTerms: requested }),
            ),
          'TRANSFER_SCOPE_ESCALATION',
        );
        await assertStoreError(
          () => store.issueMandate(CONTEXT, issueInput({ terms: { ...requested, transferorRef: OTHER_TRANSFEROR_REF }, requestedTerms: requested })),
          'TRANSFER_SCOPE_ESCALATION',
        );
        await assertStoreError(
          () => store.issueMandate(CONTEXT, issueInput({ terms: { ...requested, transfereeRef: OTHER_TRANSFEREE_REF }, requestedTerms: requested })),
          'TRANSFER_SCOPE_ESCALATION',
        );
        await assertStoreError(
          () => store.issueMandate(CONTEXT, issueInput({ terms: { ...requested, executorRef: OTHER_TRANSFER_EXECUTOR_REF }, requestedTerms: requested })),
          'TRANSFER_SCOPE_ESCALATION',
        );
      } finally {
        await store.close();
      }
    });

    it('accepts a mandate that genuinely narrows the requested portion', async () => {
      const store = await provider.open();
      try {
        const requested = trancheTransferTerms();
        const issued = await store.issueMandate(
          CONTEXT,
          issueInput({ terms: { ...requested, scope: { kind: 'proportional', basisPoints: 1000 } }, requestedTerms: requested }),
        );
        assert.deepEqual(issued.terms.scope, { kind: 'proportional', basisPoints: 1000 });
      } finally {
        await store.close();
      }
    });

    it('records a conforming movement and advances both totals', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput());
        const { mandate, execution } = await store.recordExecution(CONTEXT, executionInput());
        assert.equal(mandate.executionCount, 1);
        assert.deepEqual(mandate.transferredScope, { kind: 'proportional', basisPoints: 2500 });
        assert.equal(execution.transfereeRef, TRANSFEREE_REF);

        const listed = await store.listExecutions(CONTEXT, mandate.id);
        assert.equal(listed.length, 1);
        assert.equal(listed[0]?.id, execution.id);
      } finally {
        await store.close();
      }
    });

    it('binds transferor, transferee and executor identically in both providers', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput());
        await assertStoreError(
          () => store.recordExecution(CONTEXT, executionInput({ transferorRef: OTHER_TRANSFEROR_REF })),
          'TRANSFER_EXECUTION_NOT_AUTHORIZED',
          'TRANSFEROR_NOT_AUTHORIZED',
        );
        await assertStoreError(
          () => store.recordExecution(CONTEXT, executionInput({ transfereeRef: OTHER_TRANSFEREE_REF })),
          'TRANSFER_EXECUTION_NOT_AUTHORIZED',
          'TRANSFEREE_NOT_AUTHORIZED',
        );
        await assertStoreError(
          () => store.recordExecution(CONTEXT, executionInput({ executedBy: OTHER_TRANSFER_EXECUTOR_REF })),
          'TRANSFER_EXECUTION_NOT_AUTHORIZED',
          'EXECUTOR_NOT_AUTHORIZED',
        );
      } finally {
        await store.close();
      }
    });

    it('observes rather than checks the performer when no executor was bound', async () => {
      const store = await provider.open();
      try {
        const terms = directTransferTerms();
        await store.issueMandate(CONTEXT, issueInput({ terms }));
        const { execution } = await store.recordExecution(
          CONTEXT,
          executionInput({ executedBy: 'whoever-effected-it', registry: undefined, externalAgreementReference: undefined, externalAcceptanceReference: undefined }),
        );
        assert.equal(execution.executedBy, 'whoever-effected-it');
      } finally {
        await store.close();
      }
    });

    it('refuses a movement larger than the authorized portion', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput());
        await assertStoreError(
          () => store.recordExecution(CONTEXT, executionInput({ transferredScope: { kind: 'proportional', basisPoints: 10_000 } })),
          'TRANSFER_EXECUTION_NOT_AUTHORIZED',
          'SCOPE_EXCEEDS_MANDATE',
        );
      } finally {
        await store.close();
      }
    });

    it('enforces cumulative conservation across tranches identically in both providers', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput({ terms: trancheTransferTerms() }));
        await store.recordExecution(CONTEXT, executionInput({ id: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1000 } }));
        const second = await store.recordExecution(CONTEXT, executionInput({ id: 'exec-2', transferredScope: { kind: 'proportional', basisPoints: 1500 } }));
        assert.deepEqual(second.mandate.transferredScope, { kind: 'proportional', basisPoints: 2500 });

        await assertStoreError(
          () => store.recordExecution(CONTEXT, executionInput({ id: 'exec-3', transferredScope: { kind: 'proportional', basisPoints: 100 } })),
          'TRANSFER_EXECUTION_NOT_AUTHORIZED',
          'CUMULATIVE_SCOPE_EXCEEDS_MANDATE',
        );
      } finally {
        await store.close();
      }
    });

    it('accumulates unitized movements and refuses an incommensurable one', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput({ terms: unitizedTransferTerms() }));
        const first = await store.recordExecution(
          CONTEXT,
          executionInput({ id: 'exec-1', transferredScope: { kind: 'unitized', units: 4, unitDenomination: 'participation-unit' } }),
        );
        assert.deepEqual(first.mandate.transferredScope, { kind: 'unitized', units: 4, unitDenomination: 'participation-unit' });

        await assertStoreError(
          () =>
            store.recordExecution(CONTEXT, executionInput({ id: 'exec-2', transferredScope: { kind: 'unitized', units: 1, unitDenomination: 'other-unit' } })),
          'TRANSFER_EXECUTION_NOT_AUTHORIZED',
          'SCOPE_EXCEEDS_MANDATE',
        );
      } finally {
        await store.close();
      }
    });

    it('refuses a partial movement, and a repeat one, when partiality is prohibited', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput());
        await assertStoreError(
          () => store.recordExecution(CONTEXT, executionInput({ transferredScope: { kind: 'proportional', basisPoints: 1000 } })),
          'TRANSFER_EXECUTION_NOT_AUTHORIZED',
          'PARTIAL_TRANSFER_PROHIBITED',
        );
        await store.recordExecution(CONTEXT, executionInput({ id: 'exec-1' }));
        await assertStoreError(
          () => store.recordExecution(CONTEXT, executionInput({ id: 'exec-2' })),
          'TRANSFER_EXECUTION_NOT_AUTHORIZED',
          'PARTIAL_TRANSFER_PROHIBITED',
        );
      } finally {
        await store.close();
      }
    });

    it('refuses a replayed execution id without double-counting the movement', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput({ terms: trancheTransferTerms() }));
        await store.recordExecution(CONTEXT, executionInput({ id: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1000 } }));
        await assertStoreError(
          () => store.recordExecution(CONTEXT, executionInput({ id: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1000 } })),
          'TRANSFER_EXECUTION_ALREADY_RECORDED',
        );
        const mandate = await store.getMandate(CONTEXT, 'transfer-mandate-1');
        assert.equal(mandate.executionCount, 1);
        assert.deepEqual(mandate.transferredScope, { kind: 'proportional', basisPoints: 1000 });
      } finally {
        await store.close();
      }
    });

    it('revokes once, idempotently, preserving both totals at the moment authority was withdrawn', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput({ terms: trancheTransferTerms() }));
        await store.recordExecution(CONTEXT, executionInput({ id: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1000 } }));

        const first = await store.revokeMandate(CONTEXT, {
          revocationId: 'revocation-1',
          mandateId: 'transfer-mandate-1',
          organizationId: TRANSFER_TENANT_A,
          revokedAt: NOW,
          reason: 'withdrawn',
          issuerRef: 'actor-portfolio-manager',
          correlationId: 'revocation-correlation-1',
        });
        assert.equal(first.kind, 'revoked');
        assert.equal(first.revocation.executionsAtRevocation, 1);
        assert.deepEqual(first.revocation.transferredScopeAtRevocation, { kind: 'proportional', basisPoints: 1000 });

        const second = await store.revokeMandate(CONTEXT, {
          revocationId: 'revocation-2',
          mandateId: 'transfer-mandate-1',
          organizationId: TRANSFER_TENANT_A,
          revokedAt: NOW,
          reason: 'again',
          issuerRef: 'actor-portfolio-manager',
          correlationId: 'revocation-correlation-2',
        });
        assert.equal(second.kind, 'already-revoked');
        assert.equal(second.revocation.id, 'revocation-1');

        await assertStoreError(
          () => store.recordExecution(CONTEXT, executionInput({ id: 'exec-2', transferredScope: { kind: 'proportional', basisPoints: 100 } })),
          'TRANSFER_EXECUTION_NOT_AUTHORIZED',
          'MANDATE_REVOKED',
        );
      } finally {
        await store.close();
      }
    });

    it('records lifecycle evidence without touching the mandate, and refuses one against an unknown movement', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput());
        await store.recordExecution(CONTEXT, executionInput({ id: 'exec-1' }));

        await assertStoreError(
          () =>
            store.recordLifecycleEvent(CONTEXT, {
              id: 'lifecycle-x',
              mandateId: 'transfer-mandate-1',
              executionId: 'exec-unknown',
              organizationId: TRANSFER_TENANT_A,
              reportedBy: PERMITTED_REGISTRY,
              occurredAt: '2026-03-01T00:00:00.000Z',
              lifecycleType: 'registered',
              correlationId: 'lifecycle-correlation-x',
            }),
          'TRANSFER_EXECUTION_NOT_FOUND',
        );

        await store.recordLifecycleEvent(CONTEXT, {
          id: 'lifecycle-1',
          mandateId: 'transfer-mandate-1',
          executionId: 'exec-1',
          organizationId: TRANSFER_TENANT_A,
          reportedBy: PERMITTED_REGISTRY,
          occurredAt: '2026-03-01T00:00:00.000Z',
          lifecycleType: 'reversed',
          correlationId: 'lifecycle-correlation-1',
        });

        const mandate = await store.getMandate(CONTEXT, 'transfer-mandate-1');
        assert.equal(mandate.status, 'active');
        assert.equal(mandate.executionCount, 1);
        assert.deepEqual(mandate.transferredScope, { kind: 'proportional', basisPoints: 2500 }, 'a reported reversal restores nothing');

        await assertStoreError(
          () =>
            store.recordLifecycleEvent(CONTEXT, {
              id: 'lifecycle-1',
              mandateId: 'transfer-mandate-1',
              executionId: 'exec-1',
              organizationId: TRANSFER_TENANT_A,
              reportedBy: PERMITTED_REGISTRY,
              occurredAt: '2026-03-01T00:00:00.000Z',
              lifecycleType: 'reversed',
              correlationId: 'lifecycle-correlation-1',
            }),
          'TRANSFER_LIFECYCLE_ALREADY_RECORDED',
        );
      } finally {
        await store.close();
      }
    });

    it('scopes every read and mutation to the owning tenant', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput());
        await assertStoreError(() => store.getMandate(OTHER_TENANT_CONTEXT, 'transfer-mandate-1'), 'TRANSFER_ACCESS_SCOPE_VIOLATION');
        await assertStoreError(() => store.listExecutions(OTHER_TENANT_CONTEXT, 'transfer-mandate-1'), 'TRANSFER_ACCESS_SCOPE_VIOLATION');
        await assertStoreError(() => store.listLifecycleEvents(OTHER_TENANT_CONTEXT, 'transfer-mandate-1'), 'TRANSFER_ACCESS_SCOPE_VIOLATION');
        await assertStoreError(() => store.getRevocation(OTHER_TENANT_CONTEXT, 'transfer-mandate-1'), 'TRANSFER_ACCESS_SCOPE_VIOLATION');
        await assertStoreError(
          () => store.recordExecution(OTHER_TENANT_CONTEXT, executionInput({ organizationId: TRANSFER_TENANT_B })),
          'TRANSFER_ACCESS_SCOPE_VIOLATION',
        );
        // A system caller sees it.
        const seen = await store.getMandate({ system: true }, 'transfer-mandate-1');
        assert.equal(seen.id, 'transfer-mandate-1');
      } finally {
        await store.close();
      }
    });

    it('requires a tenant scope from a non-system caller', async () => {
      const store = await provider.open();
      try {
        await store.issueMandate(CONTEXT, issueInput());
        await assertStoreError(() => store.getMandate({ system: false }, 'transfer-mandate-1'), 'TRANSFER_TENANT_SCOPE_REQUIRED');
      } finally {
        await store.close();
      }
    });

    it('refuses a timestamp that is not unambiguously UTC on its face', async () => {
      const store = await provider.open();
      try {
        await assertStoreError(() => store.issueMandate(CONTEXT, issueInput({ effectiveFrom: '2026-01-01T00:00:00.000+02:00' })), 'TRANSFER_INVALID_TIMESTAMP');
      } finally {
        await store.close();
      }
    });

    it('reports health and refuses use after close', async () => {
      const store = await provider.open();
      const health = await store.health();
      assert.equal(health.status, 'healthy');
      assert.equal(health.schemaVersion, 'aoc.transfer-mandate-store.schema.v1');
      await store.close();
      await assertStoreError(() => store.getMandate(CONTEXT, 'transfer-mandate-1'), 'TRANSFER_STORE_UNAVAILABLE');
    });

    it('finds a mandate by the request that produced it, and returns null for one that produced none', async () => {
      const store = await provider.open();
      try {
        const issued = await store.issueMandate(CONTEXT, issueInput());
        const found = await store.getMandateByRequestRef(CONTEXT, 'transfer-request-1');
        assert.equal(found?.id, issued.id);
        assert.equal(await store.getMandateByRequestRef(CONTEXT, 'transfer-request-never'), null);
      } finally {
        await store.close();
      }
    });
  });
}
