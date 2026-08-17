import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ENTERPRISE_LICENSABLE_RIGHT_TYPES,
  ENTERPRISE_LICENSED_USE_TYPES,
  ENTERPRISE_LICENSE_LIFECYCLE_TYPES,
  enterpriseLicenseTermsEquals,
} from '@aoc-enterprise/license-mandate';

import { isLicenseGovernanceError } from '../license-governance/errors.js';
import { createInMemoryLicenseMandateStore } from '../license-governance/in-memory-mandate-store.js';
import { createSqliteLicenseMandateStore } from '../license-governance/sqlite-mandate-store.js';
import type { LicenseMandateStore } from '../license-governance/mandate-store.js';
import type { IssueLicenseMandateInput, LicenseGovernanceContext, RecordLicenseExecutionInput } from '../license-governance/contracts.js';
import {
  LICENSEE_REF,
  LICENSE_EXECUTOR_REF,
  LICENSE_TENANT_A,
  LICENSE_TENANT_B,
  OTHER_LICENSEE_REF,
  PERMITTED_CHANNEL,
  PERMITTED_TERRITORY,
  proportionalLicenseTerms,
  repeatableLicenseTerms,
  webDisplayLicenseTerms,
} from './license-support.js';

/**
 * The shared behavioural contract every `LicenseMandateStore` provider must
 * satisfy, run against both implementations. The in-memory store is not a
 * lesser implementation with looser rules: every assertion below runs
 * identically against it and against the durable SQLite store, so a
 * deployment can change providers without changing what the governance layer
 * guarantees.
 */

const workDir = mkdtempSync(join(tmpdir(), 'aoc-license-store-contract-'));
after(() => rmSync(workDir, { recursive: true, force: true }));

const NOW = '2026-01-01T00:00:00.000Z';
const CONTEXT: LicenseGovernanceContext = { system: false, organizationId: LICENSE_TENANT_A, actorId: 'operator-a' };
const OTHER_TENANT_CONTEXT: LicenseGovernanceContext = { system: false, organizationId: LICENSE_TENANT_B, actorId: 'operator-b' };

let dbCounter = 0;

interface Provider {
  readonly label: string;
  open(): Promise<LicenseMandateStore>;
}

const PROVIDERS: readonly Provider[] = [
  { label: 'memory', open: async () => createInMemoryLicenseMandateStore({ now: () => NOW }) },
  {
    label: 'sqlite',
    open: async () => {
      dbCounter += 1;
      return createSqliteLicenseMandateStore(join(workDir, `contract-${dbCounter}.sqlite`), { now: () => NOW });
    },
  },
];

function issueInput(overrides: Partial<IssueLicenseMandateInput> = {}): IssueLicenseMandateInput {
  const terms = overrides.terms ?? webDisplayLicenseTerms();
  return {
    id: 'license-mandate-1',
    organizationId: LICENSE_TENANT_A,
    assetKind: 'asset',
    assetId: 'digital-work-a',
    assetTenantId: LICENSE_TENANT_A,
    terms,
    requestedTerms: terms,
    requestRef: 'license-request-1',
    requestedBy: 'actor-rights-manager',
    decisionRef: 'decision-1',
    evaluationRef: 'evaluation-1',
    effectiveFrom: NOW,
    expiresAt: '2026-07-01T00:00:00.000Z',
    correlationId: 'correlation-1',
    ...overrides,
  };
}

function executionInput(overrides: Partial<RecordLicenseExecutionInput> = {}): RecordLicenseExecutionInput {
  return {
    id: 'license-execution-1',
    mandateId: 'license-mandate-1',
    organizationId: LICENSE_TENANT_A,
    executedBy: LICENSE_EXECUTOR_REF,
    executedAt: '2026-02-01T00:00:00.000Z',
    licenseeRef: LICENSEE_REF,
    rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.USAGE_RIGHT],
    grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY],
    exclusivity: 'non-exclusive',
    correlationId: 'execution-correlation-1',
    contexts: { territory: [PERMITTED_TERRITORY], channel: [PERMITTED_CHANNEL] },
    licenseEffectiveAt: '2026-02-01T00:00:00.000Z',
    licenseExpiresAt: '2026-12-01T00:00:00.000Z',
    licensedUnits: { units: 5, unitDenomination: 'seat' },
    externalSystem: 'licensing-platform-c',
    externalAgreementReference: 'agreement-1',
    ...overrides,
  };
}

async function expectCode(code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.ok(isLicenseGovernanceError(error), `expected a LicenseGovernanceError, received ${String(error)}`);
    assert.equal(error.code, code);
    return;
  }
  throw new Error(`expected ${code} to be thrown`);
}

for (const provider of PROVIDERS) {
  describe(`LicenseMandateStore contract — ${provider.label}`, () => {
    it('issues a mandate and reads it back structurally identical', async () => {
      const store = await provider.open();
      const issued = await store.issueMandate(CONTEXT, issueInput());
      const read = await store.getMandate(CONTEXT, issued.id);

      assert.deepEqual(read, issued);
      assert.equal(read.status, 'active');
      assert.equal(read.executionCount, 0);

      // Semantic equality, not byte equality: the durable provider stores
      // terms in their canonical serialization, which orders the right and use
      // sets, while the in-memory provider preserves insertion order. Both are
      // the same authorization -- `rights` and `permittedUses` are sets, and
      // every comparison in the frozen contract treats them as such. Asserting
      // raw array order here would be asserting a serialization detail rather
      // than the contract both providers actually owe.
      assert.equal(enterpriseLicenseTermsEquals(read.terms, webDisplayLicenseTerms()), true);
      assert.deepEqual([...read.terms.permittedUses].sort(), ['commercial-use', 'display', 'reproduce']);
      assert.equal(read.terms.licenseeRef, LICENSEE_REF);
      assert.equal(read.terms.exclusivity, 'non-exclusive');
      await store.close();
    });

    it('round-trips an optional rights scope, an absent executor, and the full operating context without drift', async () => {
      const store = await provider.open();

      const proportional = await store.issueMandate(CONTEXT, issueInput({ terms: proportionalLicenseTerms() }));
      assert.deepEqual(proportional.terms.rightsScope, { kind: 'proportional', basisPoints: 2500 });
      assert.deepEqual(proportional.terms.constraints.permittedContexts, { territory: [PERMITTED_TERRITORY], channel: [PERMITTED_CHANNEL] });

      const base = webDisplayLicenseTerms();
      const { executorRef: _unused, ...withoutExecutor } = base;
      const direct = await store.issueMandate(
        CONTEXT,
        issueInput({ id: 'license-mandate-2', requestRef: 'license-request-2', terms: withoutExecutor }),
      );
      assert.equal(direct.terms.executorRef, undefined, 'an absent executor must stay absent, never become null or an empty string');
      assert.equal(direct.terms.rightsScope, undefined, 'an absent rights scope must stay absent, never become 100%');
      await store.close();
    });

    it('refuses a mandate that widens the terms that were requested', async () => {
      const store = await provider.open();
      const requested = webDisplayLicenseTerms();

      // A wider use set.
      await expectCode('LICENSE_PERMISSION_ESCALATION', () =>
        store.issueMandate(
          CONTEXT,
          issueInput({
            terms: webDisplayLicenseTerms({
              permittedUses: [...requested.permittedUses, ENTERPRISE_LICENSED_USE_TYPES.DISTRIBUTE],
            }),
            requestedTerms: requested,
          }),
        ),
      );

      // A higher exclusivity.
      await expectCode('LICENSE_PERMISSION_ESCALATION', () =>
        store.issueMandate(CONTEXT, issueInput({ terms: webDisplayLicenseTerms({ exclusivity: 'exclusive' }), requestedTerms: requested })),
      );

      // A substituted licensee.
      await expectCode('LICENSE_PERMISSION_ESCALATION', () =>
        store.issueMandate(CONTEXT, issueInput({ terms: webDisplayLicenseTerms({ licenseeRef: OTHER_LICENSEE_REF }), requestedTerms: requested })),
      );
      await store.close();
    });

    it('refuses a second mandate for a request that already produced one', async () => {
      const store = await provider.open();
      await store.issueMandate(CONTEXT, issueInput());
      await expectCode('LICENSE_MANDATE_ALREADY_EXISTS', () => store.issueMandate(CONTEXT, issueInput({ id: 'license-mandate-second' })));

      const byRequest = await store.getMandateByRequestRef(CONTEXT, 'license-request-1');
      assert.equal(byRequest?.id, 'license-mandate-1', 'the request still resolves to its one original mandate');
      await store.close();
    });

    it('rejects a non-strict-UTC timestamp rather than storing an ambiguous instant', async () => {
      const store = await provider.open();
      await expectCode('LICENSE_INVALID_TIMESTAMP', () => store.issueMandate(CONTEXT, issueInput({ effectiveFrom: '2026-01-01T00:00:00+02:00' })));
      await store.close();
    });

    it('records an execution, advances the count, and reads the evidence back unchanged', async () => {
      const store = await provider.open();
      await store.issueMandate(CONTEXT, issueInput());
      const { mandate, execution } = await store.recordExecution(CONTEXT, executionInput());

      assert.equal(mandate.executionCount, 1);
      const listed = await store.listExecutions(CONTEXT, mandate.id);
      assert.equal(listed.length, 1);
      assert.deepEqual(listed[0], execution);
      assert.deepEqual(listed[0]?.contexts, { territory: [PERMITTED_TERRITORY], channel: [PERMITTED_CHANNEL] });
      assert.deepEqual(listed[0]?.licensedUnits, { units: 5, unitDenomination: 'seat' });
      await store.close();
    });

    it('re-asserts authorization at the persistence boundary, not only in the service', async () => {
      const store = await provider.open();
      await store.issueMandate(CONTEXT, issueInput());

      // A caller reaching the store directly still cannot substitute the
      // licensee, widen the uses, or raise exclusivity.
      await expectCode('LICENSE_EXECUTION_NOT_AUTHORIZED', () => store.recordExecution(CONTEXT, executionInput({ licenseeRef: OTHER_LICENSEE_REF })));
      await expectCode('LICENSE_EXECUTION_NOT_AUTHORIZED', () =>
        store.recordExecution(CONTEXT, executionInput({ grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISTRIBUTE] })),
      );
      await expectCode('LICENSE_EXECUTION_NOT_AUTHORIZED', () => store.recordExecution(CONTEXT, executionInput({ exclusivity: 'exclusive' })));
      await store.close();
    });

    it('refuses a replayed execution id rather than counting the same grant twice', async () => {
      const store = await provider.open();
      await store.issueMandate(CONTEXT, issueInput({ terms: repeatableLicenseTerms() }));
      await store.recordExecution(CONTEXT, executionInput());
      await expectCode('LICENSE_EXECUTION_ALREADY_RECORDED', () => store.recordExecution(CONTEXT, executionInput()));

      const mandate = await store.getMandate(CONTEXT, 'license-mandate-1');
      assert.equal(mandate.executionCount, 1);
      await store.close();
    });

    it('records lifecycle evidence against a known execution only, and never mutates the mandate', async () => {
      const store = await provider.open();
      await store.issueMandate(CONTEXT, issueInput());
      const { execution } = await store.recordExecution(CONTEXT, executionInput());

      await expectCode('LICENSE_EXECUTION_NOT_FOUND', () =>
        store.recordLifecycleEvent(CONTEXT, {
          id: 'license-lifecycle-x',
          mandateId: 'license-mandate-1',
          executionId: 'never-happened',
          organizationId: LICENSE_TENANT_A,
          reportedBy: LICENSE_EXECUTOR_REF,
          occurredAt: '2026-06-01T00:00:00.000Z',
          lifecycleType: ENTERPRISE_LICENSE_LIFECYCLE_TYPES.EXPIRED,
          correlationId: 'lifecycle-correlation-1',
        }),
      );

      const event = await store.recordLifecycleEvent(CONTEXT, {
        id: 'license-lifecycle-1',
        mandateId: 'license-mandate-1',
        executionId: execution.id,
        organizationId: LICENSE_TENANT_A,
        reportedBy: LICENSE_EXECUTOR_REF,
        occurredAt: '2026-06-01T00:00:00.000Z',
        lifecycleType: ENTERPRISE_LICENSE_LIFECYCLE_TYPES.EXPIRED,
        correlationId: 'lifecycle-correlation-1',
        externalReference: 'expiry-notice-1',
      });

      const listed = await store.listLifecycleEvents(CONTEXT, 'license-mandate-1');
      assert.deepEqual(listed, [event]);

      const mandate = await store.getMandate(CONTEXT, 'license-mandate-1');
      assert.equal(mandate.status, 'active');
      assert.equal(mandate.executionCount, 1, 'a reported end never restores licensing capacity');

      await expectCode('LICENSE_LIFECYCLE_ALREADY_RECORDED', () =>
        store.recordLifecycleEvent(CONTEXT, {
          id: 'license-lifecycle-1',
          mandateId: 'license-mandate-1',
          executionId: execution.id,
          organizationId: LICENSE_TENANT_A,
          reportedBy: LICENSE_EXECUTOR_REF,
          occurredAt: '2026-06-02T00:00:00.000Z',
          lifecycleType: ENTERPRISE_LICENSE_LIFECYCLE_TYPES.TERMINATED,
          correlationId: 'lifecycle-correlation-2',
        }),
      );
      await store.close();
    });

    it('revokes idempotently and preserves the exercise history', async () => {
      const store = await provider.open();
      await store.issueMandate(CONTEXT, issueInput());
      await store.recordExecution(CONTEXT, executionInput());

      const first = await store.revokeMandate(CONTEXT, {
        revocationId: 'license-revocation-1',
        mandateId: 'license-mandate-1',
        organizationId: LICENSE_TENANT_A,
        revokedAt: '2026-03-01T00:00:00.000Z',
        reason: 'withdrawn',
        issuerRef: 'actor-rights-manager',
        correlationId: 'revocation-correlation-1',
      });
      assert.equal(first.kind, 'revoked');
      assert.equal(first.revocation.executionsAtRevocation, 1);

      const second = await store.revokeMandate(CONTEXT, {
        revocationId: 'license-revocation-2',
        mandateId: 'license-mandate-1',
        organizationId: LICENSE_TENANT_A,
        revokedAt: '2026-04-01T00:00:00.000Z',
        reason: 'again',
        issuerRef: 'actor-rights-manager',
        correlationId: 'revocation-correlation-2',
      });
      assert.equal(second.kind, 'already-revoked');
      assert.equal(second.revocation.id, 'license-revocation-1');

      const stored = await store.getRevocation(CONTEXT, 'license-mandate-1');
      assert.equal(stored?.id, 'license-revocation-1');
      await store.close();
    });

    it('scopes every read and mutation to the owning tenant', async () => {
      const store = await provider.open();
      await store.issueMandate(CONTEXT, issueInput());

      await expectCode('LICENSE_ACCESS_SCOPE_VIOLATION', () => store.getMandate(OTHER_TENANT_CONTEXT, 'license-mandate-1'));
      await expectCode('LICENSE_ACCESS_SCOPE_VIOLATION', () => store.listExecutions(OTHER_TENANT_CONTEXT, 'license-mandate-1'));
      await expectCode('LICENSE_ACCESS_SCOPE_VIOLATION', () => store.listLifecycleEvents(OTHER_TENANT_CONTEXT, 'license-mandate-1'));
      await expectCode('LICENSE_ACCESS_SCOPE_VIOLATION', () =>
        store.recordExecution(OTHER_TENANT_CONTEXT, executionInput({ organizationId: LICENSE_TENANT_B })),
      );
      await expectCode('LICENSE_ACCESS_SCOPE_VIOLATION', () =>
        store.revokeMandate(OTHER_TENANT_CONTEXT, {
          revocationId: 'r',
          mandateId: 'license-mandate-1',
          organizationId: LICENSE_TENANT_B,
          revokedAt: NOW,
          reason: 'cross-tenant',
          issuerRef: 'actor-b',
          correlationId: 'c',
        }),
      );
      await expectCode('LICENSE_TENANT_SCOPE_REQUIRED', () => store.getMandate({ system: false }, 'license-mandate-1'));

      // A system caller sees across tenants, by design.
      const asSystem = await store.getMandate({ system: true }, 'license-mandate-1');
      assert.equal(asSystem.id, 'license-mandate-1');
      await store.close();
    });

    it('reports health and refuses use after close', async () => {
      const store = await provider.open();
      const healthy = await store.health();
      assert.equal(healthy.status, 'healthy');
      assert.equal(healthy.schemaVersion, 'aoc.license-mandate-store.schema.v1');

      await store.close();
      const closed = await store.health();
      assert.equal(closed.status, 'unhealthy');
      await expectCode('LICENSE_STORE_UNAVAILABLE', () => store.getMandate(CONTEXT, 'license-mandate-1'));
    });

    it('reports a missing mandate rather than inventing one', async () => {
      const store = await provider.open();
      await expectCode('LICENSE_MANDATE_NOT_FOUND', () => store.getMandate(CONTEXT, 'no-such-mandate'));
      assert.equal(await store.getMandateByRequestRef(CONTEXT, 'no-such-request'), null);
      await store.close();
    });
  });
}
