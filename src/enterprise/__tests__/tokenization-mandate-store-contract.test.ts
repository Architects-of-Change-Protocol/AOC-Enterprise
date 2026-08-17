import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { ENTERPRISE_TOKENIZED_RIGHT_TYPES, type EnterpriseTokenizationTerms } from '@aoc-enterprise/tokenization-mandate';

import { createInMemoryTokenizationMandateStore } from '../tokenization-governance/in-memory-mandate-store.js';
import { createSqliteTokenizationMandateStore } from '../tokenization-governance/sqlite-mandate-store.js';
import { isTokenizationGovernanceError } from '../tokenization-governance/errors.js';
import type { TokenizationMandateStore } from '../tokenization-governance/mandate-store.js';
import type { IssueTokenizationMandateInput, TokenizationGovernanceContext } from '../tokenization-governance/contracts.js';

/**
 * One contract, both providers. Every behaviour the in-memory store already
 * guaranteed must hold identically against the durable SQLite backend --
 * this file is what makes "swap the provider" a safe statement rather than a
 * hopeful one. Mirrors `access-grant-store-contract.test.ts` in shape.
 */

const ORG_A: TokenizationGovernanceContext = { system: false, organizationId: 'org-a', actorId: 'operator-a' };
const ORG_B: TokenizationGovernanceContext = { system: false, organizationId: 'org-b', actorId: 'operator-b' };
const SYSTEM: TokenizationGovernanceContext = { system: true };

const ECONOMIC = ENTERPRISE_TOKENIZED_RIGHT_TYPES.ECONOMIC_INTEREST;
const REVENUE = ENTERPRISE_TOKENIZED_RIGHT_TYPES.REVENUE_RIGHT;
const OWNERSHIP = ENTERPRISE_TOKENIZED_RIGHT_TYPES.OWNERSHIP_INTEREST;

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function terms(overrides: Partial<EnterpriseTokenizationTerms> = {}): EnterpriseTokenizationTerms {
  return {
    rights: [ECONOMIC, REVENUE],
    scope: { kind: 'proportional', basisPoints: 2000 },
    executorRef: 'provider-tokenizer-x',
    constraints: {
      maximumIssuedUnits: 1_000_000,
      permittedNetworks: ['network-alpha'],
      permittedTokenStandards: ['standard-registry-v1'],
      permittedJurisdictions: ['jurisdiction-a'],
      transferRestricted: true,
      additionalIssuanceAllowed: true,
    },
    ...overrides,
  };
}

function mandateInput(overrides: Partial<IssueTokenizationMandateInput> = {}): IssueTokenizationMandateInput {
  const requested = overrides.requestedTerms ?? overrides.terms ?? terms();
  return {
    id: nextId('mandate'),
    organizationId: 'org-a',
    assetKind: 'asset',
    assetId: 'building-a',
    assetTenantId: 'org-a',
    terms: terms(),
    requestedTerms: requested,
    requestRef: nextId('tokenization-request'),
    requestedBy: 'actor-asset-steward',
    decisionRef: nextId('decision'),
    evaluationRef: nextId('evaluation'),
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    correlationId: nextId('correlation'),
    obligationRefs: ['obligation-1'],
    approvalRefs: ['approval-1'],
    ...overrides,
  };
}

async function expectRejection(code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.ok(isTokenizationGovernanceError(error), `expected a TokenizationGovernanceError, received ${String(error)}`);
    assert.equal(error.code, code);
    return;
  }
  throw new Error(`expected ${code} to be thrown`);
}

const closers: Array<() => Promise<void>> = [];
after(async () => {
  await Promise.all(closers.map((close) => close().catch(() => {})));
});

const providers: readonly { readonly name: string; readonly build: () => Promise<TokenizationMandateStore> }[] = [
  { name: 'in-memory', build: async () => createInMemoryTokenizationMandateStore({ now: buildClock() }) },
  { name: 'sqlite (:memory:)', build: async () => createSqliteTokenizationMandateStore(':memory:', { now: buildClock() }) },
];

for (const provider of providers) {
  describe(`TokenizationMandateStore contract -- ${provider.name}`, () => {
    async function open(): Promise<TokenizationMandateStore> {
      const store = await provider.build();
      closers.push(() => store.close());
      return store;
    }

    it('issues a mandate and reads it back with its terms intact', async () => {
      const store = await open();
      const input = mandateInput();
      const issued = await store.issueMandate(ORG_A, input);

      assert.equal(issued.status, 'active');
      assert.equal(issued.issuedUnits, 0);
      assert.equal(issued.executionCount, 0);
      assert.deepEqual(issued.terms, input.terms);

      const loaded = await store.getMandate(ORG_A, issued.id);
      assert.deepEqual(loaded, issued);
    });

    it('reports its schema version and readiness', async () => {
      const store = await open();
      const health = await store.health();
      assert.equal(health.status, 'healthy');
      assert.equal(health.readable, true);
      assert.equal(health.writable, true);
      assert.equal(health.schemaVersion, 'aoc.tokenization-mandate-store.schema.v1');
    });

    it('refuses a mandate whose terms are wider than the terms that were requested', async () => {
      const store = await open();
      await expectRejection('TOKENIZATION_SCOPE_ESCALATION', () =>
        store.issueMandate(ORG_A, mandateInput({ terms: terms({ scope: { kind: 'proportional', basisPoints: 10_000 } }), requestedTerms: terms() })),
      );
    });

    it('refuses a second mandate for the same tokenization request', async () => {
      const store = await open();
      const requestRef = nextId('tokenization-request');
      await store.issueMandate(ORG_A, mandateInput({ requestRef }));
      await expectRejection('TOKENIZATION_MANDATE_ALREADY_EXISTS', () => store.issueMandate(ORG_A, mandateInput({ requestRef })));
    });

    it('refuses a duplicate mandate id', async () => {
      const store = await open();
      const id = nextId('mandate');
      await store.issueMandate(ORG_A, mandateInput({ id }));
      await expectRejection('TOKENIZATION_MANDATE_ALREADY_EXISTS', () => store.issueMandate(ORG_A, mandateInput({ id })));
    });

    it('finds a mandate by the request that authorized it, and reports null for an unknown request', async () => {
      const store = await open();
      const input = mandateInput();
      const issued = await store.issueMandate(ORG_A, input);

      const found = await store.getMandateByRequestRef(ORG_A, input.requestRef);
      assert.equal(found?.id, issued.id);
      assert.equal(await store.getMandateByRequestRef(ORG_A, 'tokenization-request-never-submitted'), null);
    });

    it('records execution evidence in append order and advances the mandate counters', async () => {
      const store = await open();
      const issued = await store.issueMandate(ORG_A, mandateInput());

      const first = await store.recordExecution(ORG_A, {
        id: nextId('execution'),
        mandateId: issued.id,
        organizationId: 'org-a',
        executorRef: 'provider-tokenizer-x',
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 1000 },
        rights: [ECONOMIC],
        correlationId: nextId('correlation'),
        issuedUnits: 400,
        externalSystem: 'provider-x',
        externalNetwork: 'network-alpha',
        externalTokenStandard: 'standard-registry-v1',
        externalContractReference: 'external-contract-1',
        externalTransactionReference: 'external-tx-1',
        evidenceRefs: ['evidence-1'],
      });
      assert.equal(first.mandate.executionCount, 1);
      assert.equal(first.mandate.issuedUnits, 400);

      const second = await store.recordExecution(ORG_A, {
        id: nextId('execution'),
        mandateId: issued.id,
        organizationId: 'org-a',
        executorRef: 'provider-tokenizer-x',
        executedAt: '2026-03-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 500 },
        rights: [ECONOMIC, REVENUE],
        correlationId: nextId('correlation'),
        issuedUnits: 100,
      });
      assert.equal(second.mandate.executionCount, 2);
      assert.equal(second.mandate.issuedUnits, 500);

      const listed = await store.listExecutions(ORG_A, issued.id);
      assert.equal(listed.length, 2);
      assert.deepEqual(
        listed.map((execution) => execution.id),
        [first.execution.id, second.execution.id],
      );
      assert.deepEqual(listed[0], first.execution);
      assert.equal(listed[0]?.externalTransactionReference, 'external-tx-1');
      assert.deepEqual(listed[0]?.evidenceRefs, ['evidence-1']);
    });

    it('refuses a replayed execution id rather than double-counting issued units', async () => {
      const store = await open();
      const issued = await store.issueMandate(ORG_A, mandateInput());
      const execution = {
        id: nextId('execution'),
        mandateId: issued.id,
        organizationId: 'org-a',
        executorRef: 'provider-tokenizer-x',
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 1000 } as const,
        rights: [ECONOMIC],
        correlationId: nextId('correlation'),
        issuedUnits: 400,
      };

      await store.recordExecution(ORG_A, execution);
      await expectRejection('TOKENIZATION_EXECUTION_ALREADY_RECORDED', () => store.recordExecution(ORG_A, execution));

      const mandate = await store.getMandate(ORG_A, issued.id);
      assert.equal(mandate.issuedUnits, 400);
      assert.equal(mandate.executionCount, 1);
    });

    it('refuses an exercise outside the mandate on every dimension', async () => {
      const store = await open();
      const issued = await store.issueMandate(ORG_A, mandateInput());
      const base = {
        mandateId: issued.id,
        organizationId: 'org-a',
        executorRef: 'provider-tokenizer-x',
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 1000 } as const,
        rights: [ECONOMIC],
      };

      // Wrong executor, unauthorized right, scope beyond the mandate, past expiry.
      for (const override of [
        { executorRef: 'provider-tokenizer-y' },
        { rights: [OWNERSHIP] },
        { issuedScope: { kind: 'proportional', basisPoints: 10_000 } as const },
        { executedAt: '2027-01-01T00:00:00.000Z' },
      ]) {
        await expectRejection('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
          store.recordExecution(ORG_A, { ...base, ...override, id: nextId('execution'), correlationId: nextId('correlation') }),
        );
      }

      const mandate = await store.getMandate(ORG_A, issued.id);
      assert.equal(mandate.executionCount, 0, 'a refused exercise must leave no trace on the mandate');
      assert.equal((await store.listExecutions(ORG_A, issued.id)).length, 0);
    });

    it('revokes idempotently, preserving evidence recorded before revocation', async () => {
      const store = await open();
      const issued = await store.issueMandate(ORG_A, mandateInput());
      await store.recordExecution(ORG_A, {
        id: nextId('execution'),
        mandateId: issued.id,
        organizationId: 'org-a',
        executorRef: 'provider-tokenizer-x',
        executedAt: '2026-02-01T00:00:00.000Z',
        issuedScope: { kind: 'proportional', basisPoints: 1000 },
        rights: [ECONOMIC],
        correlationId: nextId('correlation'),
        issuedUnits: 250,
        externalTransactionReference: 'external-tx-before-revocation',
      });

      const revokeInput = {
        revocationId: nextId('revocation'),
        mandateId: issued.id,
        organizationId: 'org-a',
        revokedAt: '2026-03-01T00:00:00.000Z',
        reason: 'authority-withdrawn',
        issuerRef: 'actor-asset-steward',
        correlationId: nextId('correlation'),
        description: 'Board resolution 2026-09.',
        evidenceRefs: ['evidence-revocation-1'],
      };
      const first = await store.revokeMandate(ORG_A, revokeInput);
      assert.equal(first.kind, 'revoked');
      assert.equal(first.mandate.status, 'revoked');
      assert.equal(first.revocation.executionsAtRevocation, 1);

      const second = await store.revokeMandate(ORG_A, { ...revokeInput, revocationId: nextId('revocation') });
      assert.equal(second.kind, 'already-revoked');
      assert.equal(second.revocation.id, first.revocation.id);

      const stored = await store.getRevocation(ORG_A, issued.id);
      assert.deepEqual(stored, first.revocation);

      const executions = await store.listExecutions(ORG_A, issued.id);
      assert.equal(executions.length, 1);
      assert.equal(executions[0]?.externalTransactionReference, 'external-tx-before-revocation');

      await expectRejection('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
        store.recordExecution(ORG_A, {
          id: nextId('execution'),
          mandateId: issued.id,
          organizationId: 'org-a',
          executorRef: 'provider-tokenizer-x',
          executedAt: '2026-04-01T00:00:00.000Z',
          issuedScope: { kind: 'proportional', basisPoints: 100 },
          rights: [ECONOMIC],
          correlationId: nextId('correlation'),
        }),
      );
    });

    it('reports null when a mandate has never been revoked', async () => {
      const store = await open();
      const issued = await store.issueMandate(ORG_A, mandateInput());
      assert.equal(await store.getRevocation(ORG_A, issued.id), null);
    });

    it('reports a missing mandate as not found, never as an empty authorization', async () => {
      const store = await open();
      await expectRejection('TOKENIZATION_MANDATE_NOT_FOUND', () => store.getMandate(ORG_A, 'mandate-never-issued'));
    });

    it("never discloses or mutates another tenant's mandate", async () => {
      const store = await open();
      const input = mandateInput();
      const issued = await store.issueMandate(ORG_A, input);

      await expectRejection('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () => store.getMandate(ORG_B, issued.id));
      await expectRejection('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () => store.getMandateByRequestRef(ORG_B, input.requestRef));
      await expectRejection('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () => store.listExecutions(ORG_B, issued.id));
      await expectRejection('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () => store.getRevocation(ORG_B, issued.id));
      await expectRejection('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () =>
        store.revokeMandate(ORG_B, {
          revocationId: nextId('revocation'),
          mandateId: issued.id,
          organizationId: 'org-b',
          revokedAt: '2026-03-01T00:00:00.000Z',
          reason: 'authority-withdrawn',
          issuerRef: 'actor-b',
          correlationId: nextId('correlation'),
        }),
      );
      await expectRejection('TOKENIZATION_ACCESS_SCOPE_VIOLATION', () =>
        store.recordExecution(ORG_B, {
          id: nextId('execution'),
          mandateId: issued.id,
          organizationId: 'org-b',
          executorRef: 'provider-tokenizer-x',
          executedAt: '2026-02-01T00:00:00.000Z',
          issuedScope: { kind: 'proportional', basisPoints: 100 },
          rights: [ECONOMIC],
          correlationId: nextId('correlation'),
        }),
      );

      // And the mandate is untouched by every one of those attempts.
      const mandate = await store.getMandate(ORG_A, issued.id);
      assert.equal(mandate.status, 'active');
      assert.equal(mandate.executionCount, 0);
    });

    it('requires an organization scope from a non-system caller', async () => {
      const store = await open();
      const issued = await store.issueMandate(ORG_A, mandateInput());
      await expectRejection('TOKENIZATION_TENANT_SCOPE_REQUIRED', () => store.getMandate({ system: false }, issued.id));
    });

    it('lets a system caller read across organizations, preserving existing cross-tenant semantics', async () => {
      const store = await open();
      const issued = await store.issueMandate(ORG_A, mandateInput());
      const loaded = await store.getMandate(SYSTEM, issued.id);
      assert.equal(loaded.id, issued.id);
    });

    it('refuses a non-UTC timestamp rather than recording an ambiguous instant', async () => {
      const store = await open();
      await expectRejection('TOKENIZATION_INVALID_TIMESTAMP', () => store.issueMandate(ORG_A, mandateInput({ expiresAt: '2026-07-01T00:00:00+02:00' })));
    });

    it('round-trips a unitized scope without collapsing it into a proportional one', async () => {
      const store = await open();
      const unitized = terms({ scope: { kind: 'unitized', units: 500, unitDenomination: 'entitlement-unit' } });
      const issued = await store.issueMandate(ORG_A, mandateInput({ terms: unitized, requestedTerms: unitized }));

      const loaded = await store.getMandate(ORG_A, issued.id);
      assert.deepEqual(loaded.terms.scope, { kind: 'unitized', units: 500, unitDenomination: 'entitlement-unit' });

      await expectRejection('TOKENIZATION_EXECUTION_NOT_AUTHORIZED', () =>
        store.recordExecution(ORG_A, {
          id: nextId('execution'),
          mandateId: issued.id,
          organizationId: 'org-a',
          executorRef: 'provider-tokenizer-x',
          executedAt: '2026-02-01T00:00:00.000Z',
          issuedScope: { kind: 'unitized', units: 501, unitDenomination: 'entitlement-unit' },
          rights: [ECONOMIC],
          correlationId: nextId('correlation'),
        }),
      );
    });

    it('closes cleanly and refuses further work', async () => {
      const store = await provider.build();
      const issued = await store.issueMandate(ORG_A, mandateInput());
      await store.close();
      await expectRejection('TOKENIZATION_STORE_UNAVAILABLE', () => store.getMandate(ORG_A, issued.id));
    });
  });
}
