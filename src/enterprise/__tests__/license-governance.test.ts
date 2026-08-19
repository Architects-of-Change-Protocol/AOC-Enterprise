import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTERPRISE_LICENSABLE_RIGHT_TYPES,
  ENTERPRISE_LICENSED_USE_TYPES,
  ENTERPRISE_LICENSE_CAPABILITY,
  ENTERPRISE_LICENSE_LIFECYCLE_TYPES,
} from '@aoc-enterprise/license-mandate';

import { LicenseGovernanceError, isLicenseGovernanceError } from '../license-governance/errors.js';
import type { LicenseGovernanceContext } from '../license-governance/contracts.js';
import {
  LICENSEE_REF,
  LICENSE_ASSET,
  LICENSE_ASSET_SCOPE,
  LICENSE_DESK_ACTOR_ID,
  LICENSE_DESK_PASSPORT_ID,
  LICENSE_DESK_TOKEN_ID,
  LICENSE_EXECUTOR_REF,
  LICENSE_MANAGER_ACTOR_ID,
  LICENSE_MANDATE_EXPIRES_AT,
  LICENSE_OUTSIDER_ACTOR_ID,
  LICENSE_TENANT_A,
  LICENSE_TENANT_B,
  LICENSE_TENANT_B_ASSET,
  LICENSE_TRUST_DOMAIN_ID,
  OTHER_CHANNEL,
  OTHER_LICENSEE_REF,
  OTHER_LICENSE_EXECUTOR_REF,
  OTHER_TERRITORY,
  PERMITTED_CHANNEL,
  PERMITTED_TERRITORY,
  buildConformingLicenseExecution,
  buildLicenseManagerRequest,
  buildLicenseWorld,
  directGrantLicenseTerms,
  proportionalLicenseTerms,
  repeatableLicenseTerms,
  webDisplayLicenseTerms,
} from './license-support.js';

const TENANT_A_CONTEXT: LicenseGovernanceContext = { system: false, organizationId: LICENSE_TENANT_A, actorId: 'operator-a' };
const TENANT_B_CONTEXT: LicenseGovernanceContext = { system: false, organizationId: LICENSE_TENANT_B, actorId: 'operator-b' };

const USAGE_RIGHTS = [ENTERPRISE_LICENSABLE_RIGHT_TYPES.USAGE_RIGHT] as const;

async function expectLicenseError(code: string, run: () => Promise<unknown>): Promise<LicenseGovernanceError> {
  try {
    await run();
  } catch (error) {
    assert.ok(isLicenseGovernanceError(error), `expected a LicenseGovernanceError, received ${String(error)}`);
    assert.equal(error.code, code);
    return error;
  }
  throw new Error(`expected ${code} to be thrown`);
}

/** Asserts a refusal came from the canonical contract with the expected refusal code, not from an incidental downstream failure. */
async function expectExecutionRefusal(refusalCode: string, run: () => Promise<unknown>): Promise<void> {
  const error = await expectLicenseError('LICENSE_EXECUTION_NOT_AUTHORIZED', run);
  assert.equal(error.details?.refusalCode, refusalCode, `expected refusal ${refusalCode}, received ${String(error.details?.refusalCode)}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// A. Real governed action — the happy path, and the proof it went through the
// canonical governance lifecycle rather than around it.
// ---------------------------------------------------------------------------

describe('LICENSE — authorized request', () => {
  it('produces an allowed decision and a mandate carrying exactly the requested terms', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());

    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate, 'an allowed LICENSE decision must produce a mandate');
    const mandate = outcome.mandate;

    assert.equal(mandate.status, 'active');
    assert.equal(mandate.organizationId, LICENSE_TENANT_A);
    assert.equal(mandate.assetKind, LICENSE_ASSET.kind);
    assert.equal(mandate.assetId, LICENSE_ASSET.id);
    assert.equal(mandate.requestedBy, LICENSE_MANAGER_ACTOR_ID);
    assert.deepEqual(mandate.terms, webDisplayLicenseTerms());
    assert.equal(mandate.decisionRef, outcome.decisionId);
    assert.equal(mandate.evaluationRef, outcome.evaluationId);
    assert.equal(mandate.expiresAt, LICENSE_MANDATE_EXPIRES_AT);
    assert.equal(mandate.executionCount, 0, 'nothing has been licensed until an external grant is reported');
  });

  it('keeps the requester, the licensee and the executor as three distinct identities', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    const mandate = outcome.mandate;
    assert.ok(mandate);

    assert.equal(mandate.requestedBy, LICENSE_MANAGER_ACTOR_ID);
    assert.equal(mandate.terms.licenseeRef, LICENSEE_REF);
    assert.equal(mandate.terms.executorRef, LICENSE_EXECUTOR_REF);

    const distinct = new Set([mandate.requestedBy, mandate.terms.licenseeRef, mandate.terms.executorRef, mandate.assetId]);
    assert.equal(distinct.size, 4, 'the requester, licensee, executor and asset must never collapse into one another');
  });

  it('routes the request through the Kernel as the LICENSE action and commits it to the Governance Store', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());

    const record = await world.governanceStore.getByEvaluationId({ system: true, organizationId: LICENSE_TENANT_A }, outcome.evaluationId);
    assert.ok(record, 'the LICENSE evaluation must be durably recorded by the canonical Governance Store');
    assert.equal(record.request.actionType, ENTERPRISE_LICENSE_CAPABILITY);
    assert.equal(record.request.resourceScope, LICENSE_ASSET_SCOPE);
    assert.equal(record.request.organizationId, LICENSE_TENANT_A);
    assert.equal(record.evaluation.status, 'allowed');
    assert.equal(record.evaluation.decisionId, outcome.decisionId);

    const verification = await world.governanceStore.verify({ system: true, organizationId: LICENSE_TENANT_A }, outcome.evaluationId);
    assert.equal(verification.valid, true, `governance record integrity failed: ${JSON.stringify(verification.failures)}`);
  });

  it('licenses without an executor when the authorization binds none', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(
      TENANT_A_CONTEXT,
      LICENSE_TENANT_A,
      buildLicenseManagerRequest({ terms: directGrantLicenseTerms() }),
    );

    assert.equal(outcome.status, 'allowed');
    assert.equal(outcome.mandate?.terms.executorRef, undefined, 'LICENSE must not invent an executor the licensor never named');

    // The licensor grants directly; `executedBy` is recorded as an
    // observation and is not checked against anything.
    const recorded = await world.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingLicenseExecution(outcome.mandate?.id ?? '', {
        executedBy: LICENSE_MANAGER_ACTOR_ID,
        externalAgreementReference: undefined,
      }),
    );
    assert.equal(recorded.execution.executedBy, LICENSE_MANAGER_ACTOR_ID);
  });
});

// ---------------------------------------------------------------------------
// B/C/D. Authority, approvals, and the requester who has neither.
// ---------------------------------------------------------------------------

describe('LICENSE — authority and approvals', () => {
  it('denies a requester with no recognized standing, and issues no mandate', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(
      TENANT_A_CONTEXT,
      LICENSE_TENANT_A,
      buildLicenseManagerRequest({ requestedBy: LICENSE_OUTSIDER_ACTOR_ID, context: {} }),
    );

    assert.notEqual(outcome.status, 'allowed', 'an unrecognized requester must never be allowed to license');
    assert.equal(outcome.mandate, undefined, 'a denied LICENSE decision must produce no mandate');

    // The denial is still durably recorded: a refusal is governance evidence.
    const record = await world.governanceStore.getByEvaluationId({ system: true }, outcome.evaluationId);
    assert.ok(record, 'a denied LICENSE evaluation is still committed to the Governance Store');
    assert.notEqual(record.evaluation.status, 'allowed');
  });

  it('produces no mandate while an approval is still outstanding', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(
      TENANT_A_CONTEXT,
      LICENSE_TENANT_A,
      buildLicenseManagerRequest({
        requestedBy: LICENSE_DESK_ACTOR_ID,
        principalActorId: LICENSE_MANAGER_ACTOR_ID,
        actorType: 'agent',
        context: { passportId: LICENSE_DESK_PASSPORT_ID, capabilityTokenId: LICENSE_DESK_TOKEN_ID },
      }),
    );

    assert.notEqual(outcome.status, 'allowed', 'a delegated request subject to approval is not authorization');
    assert.equal(outcome.mandate, undefined, "'approval_required' is not authorization and must never produce a mandate");
  });

  it('denies a requester whose authority does not cover the asset', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(
      TENANT_A_CONTEXT,
      LICENSE_TENANT_A,
      buildLicenseManagerRequest({
        asset: { kind: 'asset', id: 'unrelated-work', tenantId: LICENSE_TENANT_A },
      }),
    );

    assert.notEqual(outcome.status, 'allowed', 'authority is scoped to the asset, not to the action name');
    assert.equal(outcome.mandate, undefined);
  });
});

// ---------------------------------------------------------------------------
// E. Licensee binding — the substitution this action exists to prevent.
// ---------------------------------------------------------------------------

describe('LICENSE — licensee binding', () => {
  it('refuses an execution granting the license to a different licensee', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    const mandateId = outcome.mandate?.id ?? '';

    await expectExecutionRefusal('LICENSEE_NOT_AUTHORIZED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { licenseeRef: OTHER_LICENSEE_REF })),
    );
  });

  it('admits a different licensee only when the authorization declares the license freely assignable', async () => {
    const world = buildLicenseWorld();
    const terms = webDisplayLicenseTerms({
      constraints: { ...webDisplayLicenseTerms().constraints, assignment: 'permitted' },
    });
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest({ terms }));
    const mandateId = outcome.mandate?.id ?? '';

    const recorded = await world.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingLicenseExecution(mandateId, { licenseeRef: OTHER_LICENSEE_REF }),
    );
    assert.equal(recorded.execution.licenseeRef, OTHER_LICENSEE_REF);
  });

  it("keeps the binding when assignment merely requires a further approval", async () => {
    const world = buildLicenseWorld();
    const terms = webDisplayLicenseTerms({
      constraints: { ...webDisplayLicenseTerms().constraints, assignment: 'approval-required' },
    });
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest({ terms }));

    await expectExecutionRefusal('LICENSEE_NOT_AUTHORIZED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(outcome.mandate?.id ?? '', { licenseeRef: OTHER_LICENSEE_REF }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// F/G/H/I/J. Permission containment — uses, context, duration, exclusivity,
// executor. Every check is semantic, never string coincidence.
// ---------------------------------------------------------------------------

describe('LICENSE — permission containment', () => {
  async function mandateFor(terms = webDisplayLicenseTerms()) {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest({ terms }));
    assert.ok(outcome.mandate);
    return { world, mandateId: outcome.mandate.id };
  }

  it('refuses a use the authorization never permitted', async () => {
    const { world, mandateId } = await mandateFor();
    await expectExecutionRefusal('USES_NOT_AUTHORIZED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(mandateId, {
          grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY, ENTERPRISE_LICENSED_USE_TYPES.DISTRIBUTE],
        }),
      ),
    );
  });

  it('refuses a use the authorization explicitly excluded, and reports it as an exclusion', async () => {
    // `model-training` is in `prohibitedUses`, and is *not* in `permittedUses`.
    // It must be reported as prohibited rather than merely unlisted.
    const { prohibitedUses: _excluded, ...constraintsWithoutExclusions } = webDisplayLicenseTerms().constraints;
    const terms = webDisplayLicenseTerms({
      permittedUses: [
        ENTERPRISE_LICENSED_USE_TYPES.DISPLAY,
        ENTERPRISE_LICENSED_USE_TYPES.REPRODUCE,
        ENTERPRISE_LICENSED_USE_TYPES.COMMERCIAL_USE,
        ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING,
      ],
      constraints: constraintsWithoutExclusions,
    });
    const permissive = await mandateFor(terms);
    // With training permitted and nothing excluded, it goes through...
    const ok = await permissive.world.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingLicenseExecution(permissive.mandateId, {
        grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING],
      }),
    );
    assert.deepEqual(ok.execution.grantedUses, [ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING]);

    // ...and with the default terms, which exclude it, it does not.
    const { world, mandateId } = await mandateFor();
    await expectExecutionRefusal('USES_NOT_AUTHORIZED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(mandateId, { grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING] }),
      ),
    );
  });

  it('refuses an operating context wider than the authorization, per dimension', async () => {
    const { world, mandateId } = await mandateFor();

    // Territory A + Territory B against an allow-list of Territory A.
    await expectExecutionRefusal('CONTEXT_NOT_PERMITTED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(mandateId, {
          contexts: { territory: [PERMITTED_TERRITORY, OTHER_TERRITORY], channel: [PERMITTED_CHANNEL] },
        }),
      ),
    );

    // A different dimension, same rule.
    await expectExecutionRefusal('CONTEXT_NOT_PERMITTED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(mandateId, {
          contexts: { territory: [PERMITTED_TERRITORY], channel: [OTHER_CHANNEL] },
        }),
      ),
    );

    // And a restricted dimension the execution simply omits: an absent context
    // cannot be shown to be inside a restricted allow-list.
    await expectExecutionRefusal('CONTEXT_NOT_PERMITTED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(mandateId, { contexts: { territory: [PERMITTED_TERRITORY] } }),
      ),
    );
  });

  it('refuses an external license running past the authorized term ceiling', async () => {
    const { world, mandateId } = await mandateFor();

    await expectExecutionRefusal('LICENSE_TERM_EXCEEDS_MANDATE', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(mandateId, { licenseExpiresAt: '2029-01-01T00:00:00.000Z' }),
      ),
    );

    // A license reporting no end at all is potentially perpetual and is
    // refused rather than assumed bounded.
    await expectExecutionRefusal('LICENSE_TERM_EXCEEDS_MANDATE', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { licenseExpiresAt: undefined })),
    );
  });

  it('refuses an exclusivity above what was authorized, and admits one below', async () => {
    const { world, mandateId } = await mandateFor();
    await expectExecutionRefusal('EXCLUSIVITY_EXCEEDS_MANDATE', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { exclusivity: 'exclusive' })),
    );
    await expectExecutionRefusal('EXCLUSIVITY_EXCEEDS_MANDATE', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { exclusivity: 'sole' })),
    );

    // An `exclusive` authorization admits a narrower `sole` grant: `sole` sits
    // strictly between the two, which a boolean could not express.
    const solePermitted = await mandateFor(webDisplayLicenseTerms({ exclusivity: 'exclusive' }));
    const recorded = await solePermitted.world.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingLicenseExecution(solePermitted.mandateId, { exclusivity: 'sole' }),
    );
    assert.equal(recorded.execution.exclusivity, 'sole');
  });

  it('refuses a substituted executor when the authorization bound one', async () => {
    const { world, mandateId } = await mandateFor();
    await expectExecutionRefusal('EXECUTOR_NOT_AUTHORIZED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { executedBy: OTHER_LICENSE_EXECUTOR_REF })),
    );
  });

  it('refuses a rights category the authorization never named', async () => {
    const { world, mandateId } = await mandateFor();
    await expectExecutionRefusal('RIGHTS_NOT_AUTHORIZED', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(mandateId, {
          rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.USAGE_RIGHT, ENTERPRISE_LICENSABLE_RIGHT_TYPES.ECONOMIC_INTEREST],
        }),
      ),
    );
  });

  it('refuses a unit count over the per-license ceiling', async () => {
    const { world, mandateId } = await mandateFor();
    await expectExecutionRefusal('LICENSED_UNITS_EXCEED_MANDATE', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(mandateId, { licensedUnits: { units: 50, unitDenomination: 'seat' } }),
      ),
    );

    // A different denomination is not a smaller count -- it is not comparable
    // at all, and is refused rather than coerced.
    await expectExecutionRefusal('LICENSED_UNITS_EXCEED_MANDATE', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(mandateId, { licensedUnits: { units: 1, unitDenomination: 'deployment' } }),
      ),
    );
  });

  it('refuses a grant that omits a required external agreement reference', async () => {
    const { world, mandateId } = await mandateFor();
    await expectExecutionRefusal('EXTERNAL_AGREEMENT_REFERENCE_REQUIRED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { externalAgreementReference: undefined })),
    );
  });

  it('refuses a second license when the authorization permits only one, and admits one when it permits more', async () => {
    const { world, mandateId } = await mandateFor();
    await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { executionId: 'license-exec-1' }));
    await expectExecutionRefusal('ADDITIONAL_LICENSES_PROHIBITED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { executionId: 'license-exec-2' })),
    );

    const repeatable = await mandateFor(repeatableLicenseTerms());
    await repeatable.world.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingLicenseExecution(repeatable.mandateId, { executionId: 'license-exec-a' }),
    );
    const second = await repeatable.world.service.recordExecution(
      TENANT_A_CONTEXT,
      buildConformingLicenseExecution(repeatable.mandateId, { executionId: 'license-exec-b' }),
    );
    assert.equal(second.mandate.executionCount, 2);
  });
});

// ---------------------------------------------------------------------------
// K. Rights scope — applicable only when the license is fractionally
// expressed, which is precisely the finding this action contributes.
// ---------------------------------------------------------------------------

describe('LICENSE — rights scope is separate from permission scope', () => {
  it('applies basis-point containment when the authorization expresses a portion of the rights', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(
      TENANT_A_CONTEXT,
      LICENSE_TENANT_A,
      buildLicenseManagerRequest({ terms: proportionalLicenseTerms() }),
    );
    const mandateId = outcome.mandate?.id ?? '';
    assert.deepEqual(outcome.mandate?.terms.rightsScope, { kind: 'proportional', basisPoints: 2500 });

    const conforming = buildConformingLicenseExecution(mandateId, {
      rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.REVENUE_RIGHT],
      rightsScope: { kind: 'proportional', basisPoints: 1000 },
    });
    const recorded = await world.service.recordExecution(TENANT_A_CONTEXT, conforming);
    assert.deepEqual(recorded.execution.rightsScope, { kind: 'proportional', basisPoints: 1000 });

    // 10000 basis points against an authorized 2500.
    await expectExecutionRefusal('RIGHTS_SCOPE_EXCEEDS_MANDATE', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, {
        ...conforming,
        executionId: 'license-exec-escalate',
        rightsScope: { kind: 'proportional', basisPoints: 10_000 },
      }),
    );
  });

  it('refuses a rights-scope claim under an authorization that never expressed one', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    assert.equal(outcome.mandate?.terms.rightsScope, undefined, 'absence means "not fractionally expressed", never 100%');

    await expectExecutionRefusal('RIGHTS_SCOPE_EXCEEDS_MANDATE', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(outcome.mandate?.id ?? '', { rightsScope: { kind: 'proportional', basisPoints: 1 } }),
      ),
    );
  });

  it('refuses an execution that omits a rights scope the authorization did express', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(
      TENANT_A_CONTEXT,
      LICENSE_TENANT_A,
      buildLicenseManagerRequest({ terms: proportionalLicenseTerms() }),
    );

    await expectExecutionRefusal('RIGHTS_SCOPE_EXCEEDS_MANDATE', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(outcome.mandate?.id ?? '', {
          rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.REVENUE_RIGHT],
          rightsScope: undefined,
        }),
      ),
    );
  });

  it('never coerces a proportional share into a unit count', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(
      TENANT_A_CONTEXT,
      LICENSE_TENANT_A,
      buildLicenseManagerRequest({ terms: proportionalLicenseTerms() }),
    );

    await expectExecutionRefusal('RIGHTS_SCOPE_EXCEEDS_MANDATE', () =>
      world.service.recordExecution(
        TENANT_A_CONTEXT,
        buildConformingLicenseExecution(outcome.mandate?.id ?? '', {
          rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.REVENUE_RIGHT],
          rightsScope: { kind: 'unitized', units: 1, unitDenomination: 'share' },
        }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// M. Revocation, and the distinction from termination.
// ---------------------------------------------------------------------------

describe('LICENSE — revocation is not termination', () => {
  it('withdraws authority for further licensing without touching the licenses already granted', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(
      TENANT_A_CONTEXT,
      LICENSE_TENANT_A,
      buildLicenseManagerRequest({ terms: repeatableLicenseTerms() }),
    );
    const mandateId = outcome.mandate?.id ?? '';

    const granted = await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { executionId: 'exec-before' }));

    const revoked = await world.service.revokeMandate(TENANT_A_CONTEXT, {
      mandateId,
      reason: 'Rights withdrawn from the licensing programme.',
      requestedBy: LICENSE_MANAGER_ACTOR_ID,
    });
    assert.equal(revoked.kind, 'revoked');
    assert.equal(revoked.mandate.status, 'revoked');
    assert.equal(revoked.revocation.executionsAtRevocation, 1, 'the revocation preserves how far the authorization had been exercised');

    // The already-granted license is untouched evidence...
    const executions = await world.service.listExecutions(TENANT_A_CONTEXT, mandateId);
    assert.equal(executions.length, 1);
    assert.equal(executions[0]?.id, granted.execution.id);

    // ...and no further license may be granted under this authorization.
    await expectExecutionRefusal('MANDATE_REVOKED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { executionId: 'exec-after' })),
    );
  });

  it('is idempotent, returning the original revocation rather than a competing one', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    const mandateId = outcome.mandate?.id ?? '';

    const first = await world.service.revokeMandate(TENANT_A_CONTEXT, { mandateId, reason: 'first', requestedBy: LICENSE_MANAGER_ACTOR_ID });
    const second = await world.service.revokeMandate(TENANT_A_CONTEXT, { mandateId, reason: 'second', requestedBy: LICENSE_MANAGER_ACTOR_ID });

    assert.equal(second.kind, 'already-revoked');
    assert.equal(second.revocation.id, first.revocation.id);
    assert.equal(second.revocation.reason, 'first');
  });
});

// ---------------------------------------------------------------------------
// N/T. External execution and external lifecycle evidence.
// ---------------------------------------------------------------------------

describe('LICENSE — external evidence', () => {
  it('records a reported end without changing the mandate or creating fresh licensing capacity', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    const mandateId = outcome.mandate?.id ?? '';
    const granted = await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId));

    const ended = await world.service.recordLifecycleEvent(TENANT_A_CONTEXT, {
      mandateId,
      executionId: granted.execution.id,
      reportedBy: LICENSE_EXECUTOR_REF,
      occurredAt: '2026-06-01T00:00:00.000Z',
      lifecycleType: ENTERPRISE_LICENSE_LIFECYCLE_TYPES.TERMINATED,
      externalSystem: 'licensing-platform-c',
      externalReference: 'termination-2026-0001',
    });

    assert.equal(ended.lifecycleType, 'terminated');
    assert.equal(ended.executionId, granted.execution.id);

    const mandate = await world.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(mandate.status, 'active', 'a reported end is an observation, never a governance state transition');
    assert.equal(mandate.executionCount, 1, 'a reported end must not restore licensing capacity Soberanía cannot verify was freed');

    // And the exhaustion constraint still holds: the mandate permitted one
    // license, that license was granted, and the report of its end does not
    // authorize another.
    await expectExecutionRefusal('ADDITIONAL_LICENSES_PROHIBITED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { executionId: 'exec-after-end' })),
    );
  });

  it('refuses a lifecycle report against a license it has no evidence of', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());

    await expectLicenseError('LICENSE_EXECUTION_NOT_FOUND', () =>
      world.service.recordLifecycleEvent(TENANT_A_CONTEXT, {
        mandateId: outcome.mandate?.id ?? '',
        executionId: 'exec-never-happened',
        reportedBy: LICENSE_EXECUTOR_REF,
        occurredAt: '2026-06-01T00:00:00.000Z',
        lifecycleType: ENTERPRISE_LICENSE_LIFECYCLE_TYPES.EXPIRED,
      }),
    );
  });

  it('accepts a lifecycle report after the authorization has been revoked', async () => {
    // Reports about a license ending arrive after authority has lapsed far
    // more often than before; refusing them would discard exactly the evidence
    // an auditor needs.
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    const mandateId = outcome.mandate?.id ?? '';
    const granted = await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId));
    await world.service.revokeMandate(TENANT_A_CONTEXT, { mandateId, reason: 'withdrawn', requestedBy: LICENSE_MANAGER_ACTOR_ID });

    const ended = await world.service.recordLifecycleEvent(TENANT_A_CONTEXT, {
      mandateId,
      executionId: granted.execution.id,
      reportedBy: LICENSEE_REF,
      occurredAt: '2026-08-01T00:00:00.000Z',
      lifecycleType: ENTERPRISE_LICENSE_LIFECYCLE_TYPES.SURRENDERED,
    });
    assert.equal(ended.lifecycleType, 'surrendered');
  });
});

// ---------------------------------------------------------------------------
// R. Replay / idempotency.
// ---------------------------------------------------------------------------

describe('LICENSE — replay', () => {
  it('resolves a replayed request to the original mandate rather than a second authorization', async () => {
    const world = buildLicenseWorld();
    const request = buildLicenseManagerRequest({ requestId: 'license-request-replay', correlationId: 'license-correlation-replay' });

    const first = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, request);
    const second = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, request);

    assert.ok(first.mandate);
    assert.equal(second.evaluationId, first.evaluationId, 'the replay resolves to the original aggregate');
    assert.equal(second.mandate?.id, first.mandate.id, 'and to the original mandate');
  });

  it('refuses a replayed execution rather than recording the same grant twice', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(
      TENANT_A_CONTEXT,
      LICENSE_TENANT_A,
      buildLicenseManagerRequest({ terms: repeatableLicenseTerms() }),
    );
    const mandateId = outcome.mandate?.id ?? '';
    await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { executionId: 'exec-replay' }));

    await expectLicenseError('LICENSE_EXECUTION_ALREADY_RECORDED', () =>
      world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId, { executionId: 'exec-replay' })),
    );

    const mandate = await world.service.getMandate(TENANT_A_CONTEXT, mandateId);
    assert.equal(mandate.executionCount, 1, 'a replayed execution must never be counted twice');
  });

  it('reports a reused request id carrying a different payload as a conflict, not a replay', async () => {
    const world = buildLicenseWorld();
    const request = buildLicenseManagerRequest({ requestId: 'license-request-conflict', correlationId: 'license-correlation-conflict' });
    await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, request);

    await expectLicenseError('LICENSE_REQUEST_CONFLICT', () =>
      world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, {
        ...request,
        terms: webDisplayLicenseTerms({ exclusivity: 'exclusive' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// S. Tenant isolation.
// ---------------------------------------------------------------------------

describe('LICENSE — tenant isolation', () => {
  it('refuses to license another tenant s asset before the Kernel is ever consulted', async () => {
    const world = buildLicenseWorld();
    await expectLicenseError('LICENSE_ASSET_TENANT_MISMATCH', () =>
      world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest({ asset: LICENSE_TENANT_B_ASSET })),
    );
  });

  it('refuses a caller acting for an organization it does not scope to', async () => {
    const world = buildLicenseWorld();
    await expectLicenseError('LICENSE_ACCESS_SCOPE_VIOLATION', () =>
      world.service.requestLicense(TENANT_B_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest()),
    );
  });

  it("hides, and refuses to mutate, another tenant's mandate", async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    const mandateId = outcome.mandate?.id ?? '';

    await expectLicenseError('LICENSE_ACCESS_SCOPE_VIOLATION', () => world.service.getMandate(TENANT_B_CONTEXT, mandateId));
    await expectLicenseError('LICENSE_ACCESS_SCOPE_VIOLATION', () =>
      world.service.revokeMandate(TENANT_B_CONTEXT, { mandateId, reason: 'cross-tenant', requestedBy: 'actor-b' }),
    );
    await expectLicenseError('LICENSE_ACCESS_SCOPE_VIOLATION', () =>
      world.service.recordExecution(TENANT_B_CONTEXT, buildConformingLicenseExecution(mandateId)),
    );
    await expectLicenseError('LICENSE_ACCESS_SCOPE_VIOLATION', () => world.service.listExecutions(TENANT_B_CONTEXT, mandateId));
    await expectLicenseError('LICENSE_ACCESS_SCOPE_VIOLATION', () => world.service.getEvidenceLineage(TENANT_B_CONTEXT, mandateId));
  });

  it('requires a tenant scope from a non-system caller', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    await expectLicenseError('LICENSE_TENANT_SCOPE_REQUIRED', () =>
      world.service.getMandate({ system: false }, outcome.mandate?.id ?? ''),
    );
  });
});

// ---------------------------------------------------------------------------
// Governance lineage reconstruction.
// ---------------------------------------------------------------------------

describe('LICENSE — governance lineage', () => {
  it('answers every licensing review question from stored references alone', async () => {
    const world = buildLicenseWorld();
    const outcome = await world.service.requestLicense(TENANT_A_CONTEXT, LICENSE_TENANT_A, buildLicenseManagerRequest());
    const mandateId = outcome.mandate?.id ?? '';
    const granted = await world.service.recordExecution(TENANT_A_CONTEXT, buildConformingLicenseExecution(mandateId));
    const ended = await world.service.recordLifecycleEvent(TENANT_A_CONTEXT, {
      mandateId,
      executionId: granted.execution.id,
      reportedBy: LICENSE_EXECUTOR_REF,
      occurredAt: '2026-06-01T00:00:00.000Z',
      lifecycleType: ENTERPRISE_LICENSE_LIFECYCLE_TYPES.EXPIRED,
    });
    const revoked = await world.service.revokeMandate(TENANT_A_CONTEXT, {
      mandateId,
      reason: 'programme closed',
      requestedBy: LICENSE_MANAGER_ACTOR_ID,
    });

    const lineage = await world.service.getEvidenceLineage(TENANT_A_CONTEXT, mandateId);

    // Why was licensing permitted, and who decided?
    assert.equal(lineage.decisionRef, outcome.decisionId);
    assert.equal(lineage.evaluationRef, outcome.evaluationId);
    // Who had authority, and over what?
    assert.equal(lineage.requestedBy, LICENSE_MANAGER_ACTOR_ID);
    assert.deepEqual(lineage.asset, { kind: LICENSE_ASSET.kind, id: LICENSE_ASSET.id, tenantId: LICENSE_TENANT_A });
    // Which rights, and what portion of them?
    assert.deepEqual(lineage.terms.rights, USAGE_RIGHTS);
    assert.equal(lineage.rightsScope, undefined, 'this license is not fractionally expressed, and the lineage says so rather than implying 100%');
    // Who was the licensee, what could they do, and what could they not?
    assert.equal(lineage.licenseeRef, LICENSEE_REF);
    assert.deepEqual([...lineage.permittedUses].sort(), ['commercial-use', 'display', 'reproduce']);
    assert.deepEqual(lineage.prohibitedUses, ['model-training']);
    // How exclusively, where, for how long, and executed by whom?
    assert.equal(lineage.exclusivity, 'non-exclusive');
    assert.deepEqual(lineage.permittedContexts, { territory: [PERMITTED_TERRITORY], channel: [PERMITTED_CHANNEL] });
    assert.equal(lineage.maximumLicenseTermEndsAt, '2027-01-01T00:00:00.000Z');
    assert.equal(lineage.executorRef, LICENSE_EXECUTOR_REF);
    // Was it executed, did it end, and has future authority been withdrawn?
    assert.deepEqual(lineage.executionRefs, [granted.execution.id]);
    assert.deepEqual(lineage.lifecycleRefs, [ended.id]);
    assert.equal(lineage.executionCount, 1);
    assert.equal(lineage.revocationRef, revoked.revocation.id);
  });
});
