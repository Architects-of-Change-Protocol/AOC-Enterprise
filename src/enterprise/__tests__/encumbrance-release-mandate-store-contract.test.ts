import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  EncumbranceReleaseGovernanceContext,
  IssueEncumbranceReleaseMandateInput,
  RecordEncumbranceReleaseExecutionInput,
} from '../encumbrance-release-governance/contracts.js';
import { isEncumbranceReleaseGovernanceError } from '../encumbrance-release-governance/errors.js';
import { createInMemoryEncumbranceReleaseMandateStore } from '../encumbrance-release-governance/in-memory-mandate-store.js';
import type { EncumbranceReleaseMandateStore } from '../encumbrance-release-governance/mandate-store.js';
import { createSqliteEncumbranceReleaseMandateStore } from '../encumbrance-release-governance/sqlite-mandate-store.js';

/**
 * One contract, both providers. Every behaviour the in-memory store guarantees
 * must hold identically against the durable SQLite backend — this file is what
 * makes "swap the provider" a safe statement rather than a hopeful one. Mirrors
 * `collateralization-mandate-store-contract.test.ts` in shape.
 *
 * What is being pinned here is the *authorization* half of governed release:
 * that one request authorizes one discharge, that one constraint carries at
 * most one live authorization, that one authorization is spent by at most one
 * confirmed release, and that failed and unknown attempts accumulate freely
 * without spending anything. The authority half — whether capacity actually
 * returns — belongs to `governed-authority-store-contract.test.ts`, and neither
 * store can do the other's job.
 */

const ORG_A: EncumbranceReleaseGovernanceContext = { system: false, organizationId: 'org-a', actorId: 'operator-a' };
const ORG_B: EncumbranceReleaseGovernanceContext = { system: false, organizationId: 'org-b', actorId: 'operator-b' };
const UNSCOPED: EncumbranceReleaseGovernanceContext = { system: false };

const NOW = '2026-01-01T00:00:00.000Z';
const EXPIRES_AT = '2026-07-01T00:00:00.000Z';
const ENCUMBRANCE_A = 'governed-authority-encumbrance-a';
const ENCUMBRANCE_B = 'governed-authority-encumbrance-b';

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function mandateInput(overrides: Partial<IssueEncumbranceReleaseMandateInput> = {}): IssueEncumbranceReleaseMandateInput {
  return {
    id: nextId('release-mandate'),
    organizationId: 'org-a',
    resourceKind: 'asset',
    resourceId: 'governed-asset-a',
    encumbranceRef: ENCUMBRANCE_A,
    requestRef: nextId('release-request'),
    requestedBy: 'actor-release-officer',
    decisionRef: nextId('decision'),
    evaluationRef: nextId('evaluation'),
    effectiveFrom: NOW,
    expiresAt: EXPIRES_AT,
    correlationId: nextId('correlation'),
    ...overrides,
  };
}

function executionInput(
  mandateId: string,
  overrides: Partial<RecordEncumbranceReleaseExecutionInput> = {},
): RecordEncumbranceReleaseExecutionInput {
  return {
    id: nextId('release-execution'),
    mandateId,
    organizationId: 'org-a',
    encumbranceRef: ENCUMBRANCE_A,
    outcome: 'confirmed_success',
    providerSystem: 'test-release-executor',
    attemptedAt: NOW,
    confirmedAt: NOW,
    providerReleaseReference: 'provider-release-1',
    correlationId: nextId('correlation'),
    ...overrides,
  };
}

/** A non-confirming attempt: no `confirmedAt`, no provider reference, because nothing was confirmed. Built separately rather than by overriding a success with `undefined`, so the record's own shape rule — a confirmed release always says when — is expressed rather than worked around. */
function attemptInput(
  mandateId: string,
  outcome: 'confirmed_failure' | 'indeterminate',
  overrides: Partial<RecordEncumbranceReleaseExecutionInput> = {},
): RecordEncumbranceReleaseExecutionInput {
  return {
    id: nextId('release-execution'),
    mandateId,
    organizationId: 'org-a',
    encumbranceRef: ENCUMBRANCE_A,
    outcome,
    providerSystem: 'test-release-executor',
    attemptedAt: NOW,
    failureCode: outcome === 'indeterminate' ? 'indeterminate' : 'refused',
    correlationId: nextId('correlation'),
    ...overrides,
  };
}

async function expectRejection(code: string, operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert.ok(isEncumbranceReleaseGovernanceError(error), `expected an EncumbranceReleaseGovernanceError, received ${String(error)}`);
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected the operation to be rejected with ${code}`);
}

const providers: readonly { readonly name: string; readonly build: () => Promise<EncumbranceReleaseMandateStore> }[] = [
  { name: 'in-memory', build: async () => createInMemoryEncumbranceReleaseMandateStore({ now: buildClock() }) },
  { name: 'sqlite (:memory:)', build: async () => createSqliteEncumbranceReleaseMandateStore(':memory:', { now: buildClock() }) },
];

for (const provider of providers) {
  describe(`Encumbrance Release Mandate Store — ${provider.name}`, () => {
    it('issues an authorization and reads it back by id and by request', async () => {
      const store = await provider.build();
      const input = mandateInput();
      const mandate = await store.issueMandate(ORG_A, input);

      assert.equal(mandate.status, 'active');
      assert.equal(mandate.encumbranceRef, ENCUMBRANCE_A);
      assert.equal(mandate.executionRef, undefined, 'a fresh authorization has spent nothing');
      assert.deepEqual(await store.getMandate(ORG_A, mandate.id), mandate);
      assert.deepEqual(await store.getMandateByRequestRef(ORG_A, input.requestRef), mandate);
      assert.equal(await store.getMandateByRequestRef(ORG_A, 'request-that-never-happened'), null);
      assert.deepEqual(await store.getActiveMandateForEncumbrance(ORG_A, 'org-a', ENCUMBRANCE_A), mandate);
      await store.close();
    });

    it('authorizes one discharge per request, however often the request is replayed', async () => {
      const store = await provider.build();
      const input = mandateInput();
      await store.issueMandate(ORG_A, input);
      await expectRejection('ENCUMBRANCE_RELEASE_MANDATE_ALREADY_EXISTS', () =>
        store.issueMandate(ORG_A, { ...input, id: nextId('release-mandate') }),
      );
      await store.close();
    });

    it('refuses a second live authorization over one constraint, and frees the slot when the first ends', async () => {
      // Two governance chains each committed to discharging one constraint is
      // not a race for whichever executes first: it means two chains each
      // believe they own the discharge, and a caller has to see that.
      const store = await provider.build();
      const first = await store.issueMandate(ORG_A, mandateInput());
      await expectRejection('ENCUMBRANCE_RELEASE_MANDATE_ALREADY_ACTIVE', () => store.issueMandate(ORG_A, mandateInput()));

      // A different constraint is a different question, and is unaffected.
      const other = await store.issueMandate(ORG_A, mandateInput({ encumbranceRef: ENCUMBRANCE_B }));
      assert.equal(other.status, 'active');

      await store.revokeMandate(ORG_A, {
        revocationId: nextId('revocation'),
        mandateId: first.id,
        organizationId: 'org-a',
        revokedAt: NOW,
        reason: 'superseded',
        issuerRef: 'actor-release-officer',
        correlationId: nextId('correlation'),
      });
      const replacement = await store.issueMandate(ORG_A, mandateInput());
      assert.equal(replacement.status, 'active', 'the refusal was about concurrency, not about the constraint');
      assert.equal((await store.getActiveMandateForEncumbrance(ORG_A, 'org-a', ENCUMBRANCE_A))?.id, replacement.id);
      await store.close();
    });

    it('refuses an authorization with no live window', async () => {
      const store = await provider.build();
      await expectRejection('ENCUMBRANCE_RELEASE_VALIDATION_ERROR', () =>
        store.issueMandate(ORG_A, mandateInput({ expiresAt: NOW })),
      );
      await expectRejection('ENCUMBRANCE_RELEASE_INVALID_TIMESTAMP', () =>
        store.issueMandate(ORG_A, mandateInput({ expiresAt: '2026-07-01T00:00:00+02:00' })),
      );
      await store.close();
    });

    it('spends the authorization on a confirmed release, and only then', async () => {
      const store = await provider.build();
      const mandate = await store.issueMandate(ORG_A, mandateInput());

      const failed = await store.recordExecution(ORG_A, attemptInput(mandate.id, 'confirmed_failure'));
      assert.equal(failed.mandate.status, 'active', 'a definitive failure spends nothing, so it can be retried');
      assert.equal(failed.mandate.executionRef, undefined);

      const unknown = await store.recordExecution(ORG_A, attemptInput(mandate.id, 'indeterminate', { failureReason: 'timeout' }));
      assert.equal(unknown.mandate.status, 'active', 'nor does an unknown outcome');

      const confirmed = await store.recordExecution(ORG_A, executionInput(mandate.id));
      assert.equal(confirmed.mandate.status, 'executed');
      assert.equal(confirmed.mandate.executionRef, confirmed.execution.id);

      const attempts = await store.listExecutions(ORG_A, mandate.id);
      assert.equal(attempts.length, 3, 'every attempt is kept — the failures are facts too');
      assert.deepEqual(
        attempts.map((attempt) => attempt.outcome),
        ['confirmed_failure', 'indeterminate', 'confirmed_success'],
        'in the order they happened',
      );
      assert.equal((await store.getConfirmedExecution(ORG_A, mandate.id))?.id, confirmed.execution.id);
      await store.close();
    });

    it('records at most one confirmed release per authorization', async () => {
      // One release mandate authorizes exactly one discharge. A second success
      // against it would be a discharge nothing authorized.
      const store = await provider.build();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      await store.recordExecution(ORG_A, executionInput(mandate.id));
      await expectRejection('ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE', () => store.recordExecution(ORG_A, executionInput(mandate.id)));
      assert.equal((await store.listExecutions(ORG_A, mandate.id)).length, 1);
      await store.close();
    });

    it('records one attempt at most once', async () => {
      const store = await provider.build();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      const input = attemptInput(mandate.id, 'indeterminate');
      await store.recordExecution(ORG_A, input);
      await expectRejection('ENCUMBRANCE_RELEASE_EXECUTION_ALREADY_RECORDED', () => store.recordExecution(ORG_A, input));
      await store.close();
    });

    it('refuses evidence about a constraint the authorization does not name', async () => {
      const store = await provider.build();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      await expectRejection('ENCUMBRANCE_RELEASE_TARGET_MISMATCH', () =>
        store.recordExecution(ORG_A, executionInput(mandate.id, { encumbranceRef: ENCUMBRANCE_B })),
      );
      await store.close();
    });

    it('refuses a confirmed release against a withdrawn authorization', async () => {
      const store = await provider.build();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      await store.revokeMandate(ORG_A, {
        revocationId: nextId('revocation'),
        mandateId: mandate.id,
        organizationId: 'org-a',
        revokedAt: NOW,
        reason: 'withdrawn',
        issuerRef: 'actor-release-officer',
        correlationId: nextId('correlation'),
      });
      await expectRejection('ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE', () => store.recordExecution(ORG_A, executionInput(mandate.id)));
      await store.close();
    });

    it('withdraws a live authorization once, and never a terminal one', async () => {
      const store = await provider.build();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      const revocation = {
        revocationId: nextId('revocation'),
        mandateId: mandate.id,
        organizationId: 'org-a',
        revokedAt: NOW,
        reason: 'withdrawn',
        issuerRef: 'actor-release-officer',
        correlationId: nextId('correlation'),
      };
      const revoked = await store.revokeMandate(ORG_A, revocation);
      assert.equal(revoked.mandate.status, 'revoked');
      assert.equal((await store.getRevocation(ORG_A, mandate.id))?.id, revocation.revocationId);

      await expectRejection('ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE', () =>
        store.revokeMandate(ORG_A, { ...revocation, revocationId: nextId('revocation') }),
      );

      // And a spent authorization cannot be withdrawn either: withdrawing one
      // would suggest the discharge it produced could be undone.
      const spent = await store.issueMandate(ORG_A, mandateInput({ encumbranceRef: ENCUMBRANCE_B }));
      await store.recordExecution(ORG_A, executionInput(spent.id, { encumbranceRef: ENCUMBRANCE_B }));
      await expectRejection('ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE', () =>
        store.revokeMandate(ORG_A, { ...revocation, revocationId: nextId('revocation'), mandateId: spent.id }),
      );
      await store.close();
    });

    it('keeps tenants apart on every operation', async () => {
      const store = await provider.build();
      const mandate = await store.issueMandate(ORG_A, mandateInput());

      await expectRejection('ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION', () => store.getMandate(ORG_B, mandate.id));
      await expectRejection('ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION', () => store.listExecutions(ORG_B, mandate.id));
      await expectRejection('ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION', () => store.getConfirmedExecution(ORG_B, mandate.id));
      await expectRejection('ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION', () => store.getRevocation(ORG_B, mandate.id));
      await expectRejection('ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION', () =>
        store.recordExecution(ORG_B, executionInput(mandate.id, { organizationId: 'org-b' })),
      );
      await expectRejection('ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION', () =>
        store.issueMandate(ORG_B, mandateInput({ organizationId: 'org-a', encumbranceRef: ENCUMBRANCE_B })),
      );
      await expectRejection('ENCUMBRANCE_RELEASE_TENANT_SCOPE_REQUIRED', () => store.getMandate(UNSCOPED, mandate.id));

      // The same constraint identifier in another tenant is a different
      // question, and one tenant's live authorization does not block another's.
      const otherTenant = await store.issueMandate(ORG_B, mandateInput({ organizationId: 'org-b' }));
      assert.equal(otherTenant.status, 'active');
      await store.close();
    });

    it('reports its own health', async () => {
      const store = await provider.build();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      await store.recordExecution(ORG_A, attemptInput(mandate.id, 'indeterminate'));

      const health = await store.health();
      assert.equal(health.providerKind, provider.name === 'in-memory' ? 'memory' : 'sqlite');
      assert.equal(health.available, true);
      assert.equal(health.mandateCount, 1);
      assert.equal(health.executionCount, 1);
      assert.equal(health.activeMandateCount, 1);

      await store.close();
      await expectRejection('ENCUMBRANCE_RELEASE_STORE_UNAVAILABLE', () => store.getMandate(ORG_A, mandate.id));
    });
  });
}
