import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES,
  ENTERPRISE_COLLATERAL_RELEASE_TYPES,
  type EnterpriseCollateralizationTerms,
} from '@aoc-enterprise/collateralization-mandate';

import { createInMemoryCollateralizationMandateStore } from '../collateralization-governance/in-memory-mandate-store.js';
import { createSqliteCollateralizationMandateStore } from '../collateralization-governance/sqlite-mandate-store.js';
import { isCollateralizationGovernanceError } from '../collateralization-governance/errors.js';
import type { CollateralizationMandateStore } from '../collateralization-governance/mandate-store.js';
import type {
  CollateralizationGovernanceContext,
  IssueCollateralizationMandateInput,
  RecordCollateralizationExecutionInput,
} from '../collateralization-governance/contracts.js';

/**
 * One contract, both providers. Every behaviour the in-memory store
 * guarantees must hold identically against the durable SQLite backend --
 * this file is what makes "swap the provider" a safe statement rather than a
 * hopeful one. Mirrors `tokenization-mandate-store-contract.test.ts` and
 * `access-grant-store-contract.test.ts` in shape.
 */

const ORG_A: CollateralizationGovernanceContext = { system: false, organizationId: 'org-a', actorId: 'operator-a' };
const ORG_B: CollateralizationGovernanceContext = { system: false, organizationId: 'org-b', actorId: 'operator-b' };
const SYSTEM: CollateralizationGovernanceContext = { system: true };

const ECONOMIC = ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.ECONOMIC_INTEREST;
const REVENUE = ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.REVENUE_RIGHT;
const OWNERSHIP = ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.OWNERSHIP_INTEREST;

const OBLIGATION_A = 'obligation-001';
const OBLIGATION_B = 'obligation-002';
const PARTY_B = 'party-lender-b';
const PARTY_C = 'party-lender-c';
const EXECUTOR_X = 'provider-collateral-x';
const EXECUTOR_Y = 'provider-collateral-y';

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function terms(overrides: Partial<EnterpriseCollateralizationTerms> = {}): EnterpriseCollateralizationTerms {
  return {
    rights: [ECONOMIC, REVENUE],
    scope: { kind: 'proportional', basisPoints: 2000 },
    securedObligationRef: OBLIGATION_A,
    securedObligationKind: 'credit-facility',
    securedPartyRef: PARTY_B,
    executorRef: EXECUTOR_X,
    constraints: {
      maximumSecuredAmount: { minorUnits: 1_000_000, currency: 'unit-alpha' },
      permittedJurisdictions: ['jurisdiction-a'],
      permittedRegistries: ['registry-alpha'],
      requiredPriorityRank: 1,
      exclusive: true,
      releaseEvidenceRequired: true,
      additionalCollateralizationAllowed: true,
    },
    ...overrides,
  };
}

function mandateInput(overrides: Partial<IssueCollateralizationMandateInput> = {}): IssueCollateralizationMandateInput {
  const requested = overrides.requestedTerms ?? overrides.terms ?? terms();
  return {
    id: nextId('collateralization-mandate'),
    organizationId: 'org-a',
    assetKind: 'asset',
    assetId: 'building-a',
    assetTenantId: 'org-a',
    terms: terms(),
    requestedTerms: requested,
    requestRef: nextId('collateralization-request'),
    requestedBy: 'actor-asset-steward',
    decisionRef: nextId('decision'),
    evaluationRef: nextId('evaluation'),
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    correlationId: nextId('correlation'),
    obligationRefs: ['obligation-ref-1'],
    approvalRefs: ['approval-1'],
    ...overrides,
  };
}

function executionInput(mandateId: string, overrides: Partial<RecordCollateralizationExecutionInput> = {}): RecordCollateralizationExecutionInput {
  return {
    id: nextId('collateralization-execution'),
    mandateId,
    organizationId: 'org-a',
    executorRef: EXECUTOR_X,
    executedAt: '2026-02-01T00:00:00.000Z',
    securedObligationRef: OBLIGATION_A,
    securedPartyRef: PARTY_B,
    committedScope: { kind: 'proportional', basisPoints: 1000 },
    rights: [ECONOMIC, REVENUE],
    correlationId: nextId('execution-correlation'),
    securedAmount: { minorUnits: 500_000, currency: 'unit-alpha' },
    externalSystem: 'platform-x',
    externalRegistry: 'registry-alpha',
    externalAgreementReference: 'agreement-1',
    externalFilingReference: 'filing-1',
    jurisdiction: 'jurisdiction-a',
    priorityRank: 1,
    ...overrides,
  };
}

async function expectRejection(code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.ok(isCollateralizationGovernanceError(error), `expected a CollateralizationGovernanceError, received ${String(error)}`);
    assert.equal(error.code, code);
    return;
  }
  throw new Error(`expected ${code} to be thrown`);
}

const closers: Array<() => Promise<void>> = [];
after(async () => {
  await Promise.all(closers.map((close) => close().catch(() => {})));
});

const providers: readonly { readonly name: string; readonly build: () => Promise<CollateralizationMandateStore> }[] = [
  { name: 'in-memory', build: async () => createInMemoryCollateralizationMandateStore({ now: buildClock() }) },
  { name: 'sqlite (:memory:)', build: async () => createSqliteCollateralizationMandateStore(':memory:', { now: buildClock() }) },
];

for (const provider of providers) {
  describe(`CollateralizationMandateStore contract -- ${provider.name}`, () => {
    async function open(): Promise<CollateralizationMandateStore> {
      const store = await provider.build();
      closers.push(() => store.close());
      return store;
    }

    it('issues a mandate and reads it back with its terms intact', async () => {
      const store = await open();
      const input = mandateInput();
      const issued = await store.issueMandate(ORG_A, input);

      assert.equal(issued.status, 'active');
      assert.equal(issued.committedScope, undefined);
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
      assert.equal(health.schemaVersion, 'aoc.collateralization-mandate-store.schema.v1');
    });

    it('refuses a mandate whose scope is wider than the scope that was requested', async () => {
      const store = await open();
      await expectRejection('COLLATERALIZATION_SCOPE_ESCALATION', () =>
        store.issueMandate(ORG_A, mandateInput({ terms: terms({ scope: { kind: 'proportional', basisPoints: 10_000 } }), requestedTerms: terms() })),
      );
    });

    it('refuses a mandate that substitutes the secured obligation, the secured party, or the executor', async () => {
      const store = await open();
      for (const substitution of [
        terms({ securedObligationRef: OBLIGATION_B }),
        terms({ securedPartyRef: PARTY_C }),
        terms({ executorRef: EXECUTOR_Y }),
      ]) {
        await expectRejection('COLLATERALIZATION_SCOPE_ESCALATION', () =>
          store.issueMandate(ORG_A, mandateInput({ terms: substitution, requestedTerms: terms() })),
        );
      }
    });

    it('refuses a second mandate for the same collateralization request', async () => {
      const store = await open();
      const requestRef = nextId('collateralization-request');
      await store.issueMandate(ORG_A, mandateInput({ requestRef }));
      await expectRejection('COLLATERALIZATION_MANDATE_ALREADY_EXISTS', () => store.issueMandate(ORG_A, mandateInput({ requestRef })));
    });

    it('refuses a mandate id that is already claimed', async () => {
      const store = await open();
      const id = nextId('collateralization-mandate');
      await store.issueMandate(ORG_A, mandateInput({ id }));
      await expectRejection('COLLATERALIZATION_MANDATE_ALREADY_EXISTS', () => store.issueMandate(ORG_A, mandateInput({ id })));
    });

    it('refuses a timestamp that is not unambiguously UTC', async () => {
      const store = await open();
      await expectRejection('COLLATERALIZATION_INVALID_TIMESTAMP', () =>
        store.issueMandate(ORG_A, mandateInput({ effectiveFrom: '2026-01-01T00:00:00+02:00' })),
      );
    });

    it('finds the one mandate a request produced, and nothing for a request that produced none', async () => {
      const store = await open();
      const requestRef = nextId('collateralization-request');
      const issued = await store.issueMandate(ORG_A, mandateInput({ requestRef }));
      assert.equal((await store.getMandateByRequestRef(ORG_A, requestRef))?.id, issued.id);
      assert.equal(await store.getMandateByRequestRef(ORG_A, 'never-submitted'), null);
    });

    it('records an external arrangement and advances the cumulative committed scope', async () => {
      const store = await open();
      const mandate = await store.issueMandate(ORG_A, mandateInput());

      const first = await store.recordExecution(ORG_A, executionInput(mandate.id));
      assert.deepEqual(first.mandate.committedScope, { kind: 'proportional', basisPoints: 1000 });
      assert.equal(first.mandate.executionCount, 1);

      const second = await store.recordExecution(ORG_A, executionInput(mandate.id, { committedScope: { kind: 'proportional', basisPoints: 500 } }));
      assert.deepEqual(second.mandate.committedScope, { kind: 'proportional', basisPoints: 1500 });
      assert.equal(second.mandate.executionCount, 2);

      const executions = await store.listExecutions(ORG_A, mandate.id);
      assert.equal(executions.length, 2);
      assert.deepEqual(executions.map((execution) => execution.committedScope.kind), ['proportional', 'proportional']);
      assert.deepEqual(executions[0]?.securedAmount, { minorUnits: 500_000, currency: 'unit-alpha' });
      assert.equal(executions[0]?.externalAgreementReference, 'agreement-1');
      assert.equal(executions[0]?.priorityRank, 1);
    });

    it('refuses an execution that would exceed the authorized scope cumulatively', async () => {
      const store = await open();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      await store.recordExecution(ORG_A, executionInput(mandate.id, { committedScope: { kind: 'proportional', basisPoints: 1500 } }));
      await expectRejection('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
        store.recordExecution(ORG_A, executionInput(mandate.id, { committedScope: { kind: 'proportional', basisPoints: 1500 } })),
      );

      const reloaded = await store.getMandate(ORG_A, mandate.id);
      assert.deepEqual(reloaded.committedScope, { kind: 'proportional', basisPoints: 1500 }, 'a refused execution must not advance the committed scope');
      assert.equal(reloaded.executionCount, 1);
    });

    it('refuses an execution that substitutes the obligation, the party, the executor, or an unauthorized right', async () => {
      const store = await open();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      for (const substitution of [
        { securedObligationRef: OBLIGATION_B },
        { securedPartyRef: PARTY_C },
        { executorRef: EXECUTOR_Y },
        { rights: [OWNERSHIP] },
      ] as const) {
        await expectRejection('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
          store.recordExecution(ORG_A, executionInput(mandate.id, substitution)),
        );
      }
      assert.equal((await store.listExecutions(ORG_A, mandate.id)).length, 0);
    });

    it('refuses to record the same execution twice', async () => {
      const store = await open();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      const input = executionInput(mandate.id);
      await store.recordExecution(ORG_A, input);
      await expectRejection('COLLATERALIZATION_EXECUTION_ALREADY_RECORDED', () => store.recordExecution(ORG_A, input));

      const reloaded = await store.getMandate(ORG_A, mandate.id);
      assert.deepEqual(reloaded.committedScope, { kind: 'proportional', basisPoints: 1000 }, 'a replayed execution must not commit its scope twice');
      assert.equal(reloaded.executionCount, 1);
    });

    it('records a reported release without touching the mandate’s status or committed scope', async () => {
      const store = await open();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      const executed = await store.recordExecution(ORG_A, executionInput(mandate.id));

      const release = await store.recordRelease(ORG_A, {
        id: nextId('collateralization-release'),
        mandateId: mandate.id,
        executionId: executed.execution.id,
        organizationId: 'org-a',
        reportedBy: EXECUTOR_X,
        releasedAt: '2026-03-01T00:00:00.000Z',
        releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.DISCHARGED,
        correlationId: nextId('release-correlation'),
        externalReleaseReference: 'discharge-1',
      });

      assert.equal(release.executionId, executed.execution.id);
      assert.deepEqual(await store.listReleases(ORG_A, mandate.id), [release]);

      const reloaded = await store.getMandate(ORG_A, mandate.id);
      assert.equal(reloaded.status, 'active');
      assert.deepEqual(reloaded.committedScope, { kind: 'proportional', basisPoints: 1000 });
      assert.equal(reloaded.executionCount, 1);
    });

    it('refuses a release against an arrangement this mandate has no evidence of, and a replayed release', async () => {
      const store = await open();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      const executed = await store.recordExecution(ORG_A, executionInput(mandate.id));

      await expectRejection('COLLATERALIZATION_EXECUTION_NOT_FOUND', () =>
        store.recordRelease(ORG_A, {
          id: nextId('collateralization-release'),
          mandateId: mandate.id,
          executionId: 'execution-that-never-happened',
          organizationId: 'org-a',
          reportedBy: EXECUTOR_X,
          releasedAt: '2026-03-01T00:00:00.000Z',
          releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.RELEASED,
          correlationId: nextId('release-correlation'),
        }),
      );

      const releaseInput = {
        id: nextId('collateralization-release'),
        mandateId: mandate.id,
        executionId: executed.execution.id,
        organizationId: 'org-a',
        reportedBy: EXECUTOR_X,
        releasedAt: '2026-03-01T00:00:00.000Z',
        releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.RELEASED,
        correlationId: nextId('release-correlation'),
      };
      await store.recordRelease(ORG_A, releaseInput);
      await expectRejection('COLLATERALIZATION_RELEASE_ALREADY_RECORDED', () => store.recordRelease(ORG_A, releaseInput));
      assert.equal((await store.listReleases(ORG_A, mandate.id)).length, 1);
    });

    it('revokes once, idempotently, preserving how far the authorization had been exercised', async () => {
      const store = await open();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      await store.recordExecution(ORG_A, executionInput(mandate.id));

      const revokeInput = {
        revocationId: nextId('collateralization-revocation'),
        mandateId: mandate.id,
        organizationId: 'org-a',
        revokedAt: '2026-03-01T00:00:00.000Z',
        reason: 'facility cancelled',
        issuerRef: 'actor-asset-steward',
        correlationId: nextId('revocation-correlation'),
      };

      const first = await store.revokeMandate(ORG_A, revokeInput);
      assert.equal(first.kind, 'revoked');
      assert.equal(first.mandate.status, 'revoked');
      assert.equal(first.revocation.executionsAtRevocation, 1);
      assert.deepEqual(first.revocation.committedScopeAtRevocation, { kind: 'proportional', basisPoints: 1000 });

      const second = await store.revokeMandate(ORG_A, { ...revokeInput, revocationId: nextId('collateralization-revocation') });
      assert.equal(second.kind, 'already-revoked');
      assert.equal(second.revocation.id, first.revocation.id);

      assert.deepEqual(await store.getRevocation(ORG_A, mandate.id), first.revocation);
      // The evidence of what was already done survives the withdrawal of authority.
      assert.equal((await store.listExecutions(ORG_A, mandate.id)).length, 1);
    });

    it('refuses further collateralization once revoked', async () => {
      const store = await open();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      await store.revokeMandate(ORG_A, {
        revocationId: nextId('collateralization-revocation'),
        mandateId: mandate.id,
        organizationId: 'org-a',
        revokedAt: '2026-03-01T00:00:00.000Z',
        reason: 'r',
        issuerRef: 'actor-asset-steward',
        correlationId: nextId('revocation-correlation'),
      });
      await expectRejection('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () => store.recordExecution(ORG_A, executionInput(mandate.id)));
    });

    it('still accepts release evidence after revocation', async () => {
      const store = await open();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      const executed = await store.recordExecution(ORG_A, executionInput(mandate.id));
      await store.revokeMandate(ORG_A, {
        revocationId: nextId('collateralization-revocation'),
        mandateId: mandate.id,
        organizationId: 'org-a',
        revokedAt: '2026-03-01T00:00:00.000Z',
        reason: 'r',
        issuerRef: 'actor-asset-steward',
        correlationId: nextId('revocation-correlation'),
      });

      const release = await store.recordRelease(ORG_A, {
        id: nextId('collateralization-release'),
        mandateId: mandate.id,
        executionId: executed.execution.id,
        organizationId: 'org-a',
        reportedBy: EXECUTOR_X,
        releasedAt: '2026-04-01T00:00:00.000Z',
        releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.SATISFIED,
        correlationId: nextId('release-correlation'),
      });
      assert.equal(release.releaseType, 'satisfied');
    });

    it('refuses an unknown mandate', async () => {
      const store = await open();
      await expectRejection('COLLATERALIZATION_MANDATE_NOT_FOUND', () => store.getMandate(ORG_A, 'no-such-mandate'));
    });

    it('keeps tenants apart on every read and every mutation', async () => {
      const store = await open();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      const executed = await store.recordExecution(ORG_A, executionInput(mandate.id));

      await expectRejection('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => store.getMandate(ORG_B, mandate.id));
      await expectRejection('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => store.listExecutions(ORG_B, mandate.id));
      await expectRejection('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => store.listReleases(ORG_B, mandate.id));
      await expectRejection('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => store.getRevocation(ORG_B, mandate.id));
      await expectRejection('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () => store.getMandateByRequestRef(ORG_B, mandate.requestRef));
      await expectRejection('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () =>
        store.recordExecution(ORG_B, executionInput(mandate.id, { organizationId: 'org-b' })),
      );
      await expectRejection('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () =>
        store.recordRelease(ORG_B, {
          id: nextId('collateralization-release'),
          mandateId: mandate.id,
          executionId: executed.execution.id,
          organizationId: 'org-b',
          reportedBy: EXECUTOR_X,
          releasedAt: '2026-03-01T00:00:00.000Z',
          releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.RELEASED,
          correlationId: nextId('release-correlation'),
        }),
      );
      await expectRejection('COLLATERALIZATION_ACCESS_SCOPE_VIOLATION', () =>
        store.revokeMandate(ORG_B, {
          revocationId: nextId('collateralization-revocation'),
          mandateId: mandate.id,
          organizationId: 'org-b',
          revokedAt: '2026-03-01T00:00:00.000Z',
          reason: 'r',
          issuerRef: 'actor-b',
          correlationId: nextId('revocation-correlation'),
        }),
      );
    });

    it('requires a non-system caller to name a tenant scope, and lets a system caller see every tenant', async () => {
      const store = await open();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      await expectRejection('COLLATERALIZATION_TENANT_SCOPE_REQUIRED', () => store.getMandate({ system: false }, mandate.id));
      assert.equal((await store.getMandate(SYSTEM, mandate.id)).id, mandate.id);
    });

    it('refuses every operation once closed', async () => {
      const store = await provider.build();
      const mandate = await store.issueMandate(ORG_A, mandateInput());
      await store.close();
      await expectRejection('COLLATERALIZATION_STORE_UNAVAILABLE', () => store.getMandate(ORG_A, mandate.id));
      const health = await store.health();
      assert.equal(health.status, 'unhealthy');
    });

    it('supports unitized scopes with the same cumulative discipline', async () => {
      const store = await open();
      const unitized = terms({ scope: { kind: 'unitized', units: 500, unitDenomination: 'entitlement-unit' } });
      const mandate = await store.issueMandate(ORG_A, mandateInput({ terms: unitized, requestedTerms: unitized }));

      const first = await store.recordExecution(
        ORG_A,
        executionInput(mandate.id, { committedScope: { kind: 'unitized', units: 300, unitDenomination: 'entitlement-unit' } }),
      );
      assert.deepEqual(first.mandate.committedScope, { kind: 'unitized', units: 300, unitDenomination: 'entitlement-unit' });

      await expectRejection('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
        store.recordExecution(ORG_A, executionInput(mandate.id, { committedScope: { kind: 'unitized', units: 300, unitDenomination: 'entitlement-unit' } })),
      );

      // A unit count is never comparable to a proportional share.
      await expectRejection('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
        store.recordExecution(ORG_A, executionInput(mandate.id, { committedScope: { kind: 'proportional', basisPoints: 1 } })),
      );

      // Nor are units of a different denomination.
      await expectRejection('COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED', () =>
        store.recordExecution(ORG_A, executionInput(mandate.id, { committedScope: { kind: 'unitized', units: 1, unitDenomination: 'other-unit' } })),
      );
    });
  });
}
