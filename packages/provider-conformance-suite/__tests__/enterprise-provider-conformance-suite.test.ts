import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION, ENTERPRISE_PROVIDER_CAPABILITIES } from '@aoc-enterprise/provider-adapter';
import type { EnterpriseProviderCapabilityDeclaration } from '@aoc-enterprise/provider-adapter';
import type { EnterpriseProviderTranslation } from '@aoc-enterprise/provider-translation';
import { validateEnterpriseProviderTranslation } from '@aoc-enterprise/provider-translation';
import type { EnterpriseProviderConformanceExecutionResult, EnterpriseProviderConformanceHarness } from '../src/enterprise-provider-conformance-suite.js';
import {
  evaluateEnterpriseProviderConformanceBoundary,
  isEnterpriseProviderConformanceExecutionDetail,
  runEnterpriseProviderConformanceSuite,
} from '../src/enterprise-provider-conformance-suite.js';

/**
 * Every harness below is a purely synthetic, in-file fake -- never a real
 * provider, never a real adapter package. This file tests the *suite's own
 * logic*: that it correctly certifies a conformant fake and correctly flags
 * each specific violation a non-conformant fake introduces. The Phase 10
 * reference execution against a real adapter (Pinata) lives in
 * `reference-pinata-conformance.test.ts`, not here.
 */

const FIXED_NOW = '2026-01-01T12:00:00.000Z';
const ALL_CAPABILITIES = Object.values(ENTERPRISE_PROVIDER_CAPABILITIES);

function makeDeclaration(overrides: Partial<EnterpriseProviderCapabilityDeclaration> = {}): EnterpriseProviderCapabilityDeclaration {
  return {
    schemaVersion: ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION,
    id: 'fake-declaration-1',
    providerSystem: 'fake-conformant',
    capabilities: ALL_CAPABILITIES,
    declaredAt: '2026-01-01T00:00:00.000Z',
    correlationId: 'fake-declaration-corr-1',
    ...overrides,
  };
}

function fakeSuccess(translation: EnterpriseProviderTranslation): EnterpriseProviderConformanceExecutionResult {
  return {
    outcome: 'executed',
    translationId: translation.id,
    grantRef: translation.grantRef,
    correlationId: translation.correlationId,
    executionIntent: translation.executionIntent,
    providerSystem: translation.providerSystem,
    detail: { kind: 'fake-detail', note: 'ok' },
    executedAt: FIXED_NOW,
  };
}

function fakeCapabilityUnsupportedFailure(translation: EnterpriseProviderTranslation): EnterpriseProviderConformanceExecutionResult {
  return {
    outcome: 'failed',
    translationId: translation.id,
    grantRef: translation.grantRef,
    correlationId: translation.correlationId,
    executionIntent: translation.executionIntent,
    providerSystem: translation.providerSystem,
    failureReason: 'capability-unsupported',
    message: 'This fake does not support this capability.',
    failedAt: FIXED_NOW,
  };
}

/** A harness that behaves conformantly across every category the suite checks. */
function makeFullyConformantHarness(): EnterpriseProviderConformanceHarness {
  return {
    providerSystem: 'fake-conformant',
    capabilityDeclaration: makeDeclaration(),
    async execute(candidate) {
      const validation = validateEnterpriseProviderTranslation(candidate);
      if (!validation.valid) throw new Error(`Malformed translation: ${validation.errors.map((e) => e.code).join(', ')}`);
      const translation = candidate as EnterpriseProviderTranslation;
      // Cross-provider isolation: a conformant adapter must reject a
      // structurally valid translation targeting a different providerSystem
      // (mirroring PinataAdapterInputError's own identical check).
      if (translation.providerSystem !== 'fake-conformant') {
        throw new Error(`Translation targets providerSystem '${translation.providerSystem}', not 'fake-conformant'.`);
      }
      // A capability-supported intent can still legitimately fail at
      // execution time (a real provider being reached but declining the
      // request) -- simulated here for 'InvalidateGrant' so the suite's
      // failure-normalization category is exercised even though this
      // harness declares full capability support.
      if (translation.executionIntent === 'InvalidateGrant') {
        return {
          outcome: 'failed',
          translationId: translation.id,
          grantRef: translation.grantRef,
          correlationId: translation.correlationId,
          executionIntent: translation.executionIntent,
          providerSystem: translation.providerSystem,
          failureReason: 'execution-rejected',
          message: 'Fake provider declined to invalidate the resource (simulated for conformance coverage).',
          failedAt: FIXED_NOW,
        };
      }
      return fakeSuccess(translation);
    },
    async translateExpiredGrant() {
      return {
        outcome: 'failed',
        translationId: 'expired-translation',
        grantRef: 'expired-grant',
        correlationId: 'expired-corr',
        executionIntent: 'ProvideTemporaryAccess',
        providerSystem: 'fake-conformant',
        failureReason: 'grant-expired',
        message: 'Grant expired.',
        failedAt: FIXED_NOW,
      };
    },
    boundaryEvaluation: { valid: true },
  };
}

describe('runEnterpriseProviderConformanceSuite -- conformant harness', () => {
  it('reports passed: true with no failed checks for a fully conformant fake adapter', async () => {
    const report = await runEnterpriseProviderConformanceSuite(makeFullyConformantHarness(), { now: () => FIXED_NOW });
    const failed = report.checks.filter((check) => check.status === 'failed');
    assert.deepEqual(failed, [], `unexpected failures: ${JSON.stringify(failed, null, 2)}`);
    assert.equal(report.passed, true);
    assert.equal(report.providerSystem, 'fake-conformant');
    assert.ok(report.checks.length > 0);
  });

  it('covers every canonical conformance category at least once', async () => {
    const report = await runEnterpriseProviderConformanceSuite(makeFullyConformantHarness());
    const categories = new Set(report.checks.map((check) => check.category));
    for (const expected of [
      'translation-acceptance',
      'capability-validation',
      'failure-normalization',
      'execution-normalization',
      'metadata-normalization',
      'boundary-validation',
      'dependency-validation',
      'serialization-consistency',
      'provider-neutrality',
    ]) {
      assert.ok(categories.has(expected as never), `missing category '${expected}'`);
    }
  });

  it('reports skipped (never failed) only for checks that are legitimately not applicable', async () => {
    const minimal: EnterpriseProviderConformanceHarness = {
      providerSystem: 'fake-minimal',
      capabilityDeclaration: makeDeclaration({ id: 'fake-minimal-declaration-1', providerSystem: 'fake-minimal', capabilities: ['SupportsTemporaryAccess'] }),
      providerMetadataFor: () => undefined,
      // 'SupportsExpiration' is not declared, so 'expired-grant-rejected' is
      // the one check that legitimately remains 'skipped' -- everything
      // else, including boundary validation, must be proven.
      boundaryEvaluation: { valid: true },
      async execute(candidate) {
        const validation = validateEnterpriseProviderTranslation(candidate);
        if (!validation.valid) throw new Error('invalid');
        const translation = candidate as EnterpriseProviderTranslation;
        if (translation.providerSystem !== 'fake-minimal') {
          throw new Error(`Translation targets providerSystem '${translation.providerSystem}', not 'fake-minimal'.`);
        }
        if (translation.executionIntent === 'ProvideTemporaryAccess' || translation.executionIntent === 'ProvideReadOnlyAccess') {
          return fakeSuccess(translation);
        }
        return fakeCapabilityUnsupportedFailure(translation);
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(minimal);
    const skipped = report.checks.filter((check) => check.status === 'skipped').map((check) => check.id).sort();
    assert.deepEqual(skipped, ['expired-grant-rejected']);
    assert.equal(report.passed, true);
  });
});

describe('runEnterpriseProviderConformanceSuite -- non-conformant harnesses (each isolates one violation)', () => {
  it('fails capability-validation when execute() fakes success for an undeclared capability', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      providerSystem: 'fake-faker',
      capabilityDeclaration: makeDeclaration({ id: 'fake-faker-declaration-1', providerSystem: 'fake-faker', capabilities: ['SupportsTemporaryAccess'] }),
      async execute(candidate) {
        // Always claims success -- never honestly reports capability-unsupported.
        const validation = validateEnterpriseProviderTranslation(candidate);
        if (!validation.valid) throw new Error('invalid');
        return fakeSuccess(candidate as EnterpriseProviderTranslation);
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const registerUsageCheck = report.checks.find((check) => check.id === 'unsupported-capability-rejected-RegisterUsage');
    assert.ok(registerUsageCheck);
    assert.equal(registerUsageCheck?.status, 'failed');
  });

  it('fails failure-normalization when a failure result leaks non-canonical fields', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      providerSystem: 'fake-leaky',
      capabilityDeclaration: makeDeclaration({ id: 'fake-leaky-declaration-1', providerSystem: 'fake-leaky', capabilities: ['SupportsTemporaryAccess'] }),
      async execute(candidate) {
        const validation = validateEnterpriseProviderTranslation(candidate);
        if (!validation.valid) throw new Error('invalid');
        const translation = candidate as EnterpriseProviderTranslation;
        if (translation.executionIntent === 'ProvideTemporaryAccess' || translation.executionIntent === 'ProvideReadOnlyAccess') {
          return fakeSuccess(translation);
        }
        return { ...fakeCapabilityUnsupportedFailure(translation), httpStatus: 500 } as unknown as EnterpriseProviderConformanceExecutionResult;
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const leaky = report.checks.filter((check) => check.id.startsWith('failure-field-set-') && check.status === 'failed');
    assert.ok(leaky.length > 0);
  });

  it('fails translation-acceptance when malformed input is silently accepted instead of rejected', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      providerSystem: 'fake-permissive',
      capabilityDeclaration: makeDeclaration({ id: 'fake-permissive-declaration-1', providerSystem: 'fake-permissive' }),
      async execute() {
        // Never validates, never throws -- always fabricates a success.
        return {
          outcome: 'executed',
          translationId: 'whatever',
          grantRef: 'whatever',
          correlationId: 'whatever',
          executionIntent: 'ProvideMetadata',
          providerSystem: 'fake-permissive',
          detail: { kind: 'fake' },
          executedAt: FIXED_NOW,
        };
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const malformedCheck = report.checks.find((check) => check.id === 'malformed-translation-rejected');
    assert.equal(malformedCheck?.status, 'failed');
  });

  it('fails boundary-validation when a supplied boundary evaluation is invalid', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      boundaryEvaluation: { valid: false, issues: [{ code: 'FOREIGN_IMPORTER_FOUND', message: 'a foreign file imports the fake SDK' }] },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const boundaryCheck = report.checks.find((check) => check.id === 'provider-sdk-import-boundary');
    assert.equal(boundaryCheck?.status, 'failed');
  });

  it('fails provider-neutrality when the capability declaration providerSystem does not match the harness providerSystem', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      capabilityDeclaration: makeDeclaration({ providerSystem: 'a-different-provider' }),
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const mismatchCheck = report.checks.find((check) => check.id === 'capability-declaration-provider-system-matches');
    assert.equal(mismatchCheck?.status, 'failed');
  });

  it('fails dependency-validation when a declared SupportsExpiration adapter does not actually reject an expired grant', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async translateExpiredGrant() {
        // Wrongly reports success for an expired grant.
        return {
          outcome: 'executed',
          translationId: 'expired-translation',
          grantRef: 'expired-grant',
          correlationId: 'expired-corr',
          executionIntent: 'ProvideTemporaryAccess',
          providerSystem: 'fake-conformant',
          detail: { kind: 'temporary-access' },
          executedAt: FIXED_NOW,
        };
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const expiredCheck = report.checks.find((check) => check.id === 'expired-grant-rejected');
    assert.equal(expiredCheck?.status, 'failed');
  });

  it('fails dependency-validation when SupportsExpiration is declared but no translateExpiredGrant hook is supplied', async () => {
    const { translateExpiredGrant: _omitted, ...harnessWithoutHook } = makeFullyConformantHarness();
    const report = await runEnterpriseProviderConformanceSuite(harnessWithoutHook);
    assert.equal(report.passed, false);
    const expiredCheck = report.checks.find((check) => check.id === 'expired-grant-rejected');
    assert.equal(expiredCheck?.status, 'failed');
  });

  it('fails dependency-validation when translateExpiredGrant rejects for the right reason but leaks a non-canonical field', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async translateExpiredGrant() {
        return {
          outcome: 'failed',
          translationId: 'expired-translation',
          grantRef: 'expired-grant',
          correlationId: 'expired-corr',
          executionIntent: 'ProvideTemporaryAccess',
          providerSystem: 'fake-conformant',
          failureReason: 'grant-expired',
          message: 'Grant expired.',
          failedAt: FIXED_NOW,
          httpStatus: 410,
        } as unknown as EnterpriseProviderConformanceExecutionResult;
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const expiredCheck = report.checks.find((check) => check.id === 'expired-grant-rejected');
    assert.equal(expiredCheck?.status, 'failed');
  });

  it('fails dependency-validation when translateExpiredGrant rejects for the right reason but targets a foreign providerSystem', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async translateExpiredGrant() {
        return {
          outcome: 'failed',
          translationId: 'expired-translation',
          grantRef: 'expired-grant',
          correlationId: 'expired-corr',
          executionIntent: 'ProvideTemporaryAccess',
          providerSystem: 'a-different-provider',
          failureReason: 'grant-expired',
          message: 'Grant expired.',
          failedAt: FIXED_NOW,
        };
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const expiredCheck = report.checks.find((check) => check.id === 'expired-grant-rejected');
    assert.equal(expiredCheck?.status, 'failed');
  });

  it('fails dependency-validation when translateExpiredGrant rejects for the right reason but carries a non-string id field', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async translateExpiredGrant() {
        return {
          outcome: 'failed',
          translationId: 'expired-translation',
          grantRef: '',
          correlationId: 'expired-corr',
          executionIntent: 'ProvideTemporaryAccess',
          providerSystem: 'fake-conformant',
          failureReason: 'grant-expired',
          message: 'Grant expired.',
          failedAt: FIXED_NOW,
        };
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const expiredCheck = report.checks.find((check) => check.id === 'expired-grant-rejected');
    assert.equal(expiredCheck?.status, 'failed');
  });

  it('fails capability-validation when a declared capability is misreported as capability-unsupported at execution time', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async execute(candidate) {
        const validation = validateEnterpriseProviderTranslation(candidate);
        if (!validation.valid) throw new Error('invalid');
        const translation = candidate as EnterpriseProviderTranslation;
        if (translation.providerSystem !== 'fake-conformant') throw new Error('wrong provider system');
        // Declares full support but wrongly reports capability-unsupported
        // for a capability it did declare.
        return fakeCapabilityUnsupportedFailure(translation);
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const misreported = report.checks.filter((check) => check.id.startsWith('supported-capability-not-misreported-') && check.status === 'failed');
    assert.ok(misreported.length > 0);
  });

  it('fails execution-normalization when a result carries an outcome outside the canonical union', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async execute(candidate) {
        const validation = validateEnterpriseProviderTranslation(candidate);
        if (!validation.valid) throw new Error('invalid');
        const translation = candidate as EnterpriseProviderTranslation;
        if (translation.providerSystem !== 'fake-conformant') throw new Error('wrong provider system');
        return {
          outcome: 'denied',
          translationId: translation.id,
          grantRef: translation.grantRef,
          correlationId: translation.correlationId,
          executionIntent: translation.executionIntent,
          providerSystem: translation.providerSystem,
          failureReason: 'execution-rejected',
          message: 'denied is not a canonical outcome',
          failedAt: FIXED_NOW,
        } as unknown as EnterpriseProviderConformanceExecutionResult;
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const outcomeChecks = report.checks.filter((check) => check.id.startsWith('result-outcome-valid-') && check.status === 'failed');
    assert.ok(outcomeChecks.length > 0);
  });

  it('fails execution-normalization when a success result carries a malformed executedAt timestamp', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async execute(candidate) {
        const validation = validateEnterpriseProviderTranslation(candidate);
        if (!validation.valid) throw new Error('invalid');
        const translation = candidate as EnterpriseProviderTranslation;
        if (translation.providerSystem !== 'fake-conformant') throw new Error('wrong provider system');
        if (translation.executionIntent === 'InvalidateGrant') {
          return {
            outcome: 'failed',
            translationId: translation.id,
            grantRef: translation.grantRef,
            correlationId: translation.correlationId,
            executionIntent: translation.executionIntent,
            providerSystem: translation.providerSystem,
            failureReason: 'execution-rejected',
            message: 'simulated failure',
            failedAt: FIXED_NOW,
          };
        }
        return { ...fakeSuccess(translation), executedAt: 'not-a-timestamp' };
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const timestampChecks = report.checks.filter((check) => check.id.startsWith('success-executed-at-valid-') && check.status === 'failed');
    assert.ok(timestampChecks.length > 0);
  });

  it('fails execution-normalization when a success result carries a digit-shaped but calendar-impossible executedAt (e.g. Feb 31, month 13)', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async execute(candidate) {
        const validation = validateEnterpriseProviderTranslation(candidate);
        if (!validation.valid) throw new Error('invalid');
        const translation = candidate as EnterpriseProviderTranslation;
        if (translation.providerSystem !== 'fake-conformant') throw new Error('wrong provider system');
        if (translation.executionIntent === 'InvalidateGrant') {
          return {
            outcome: 'failed',
            translationId: translation.id,
            grantRef: translation.grantRef,
            correlationId: translation.correlationId,
            executionIntent: translation.executionIntent,
            providerSystem: translation.providerSystem,
            failureReason: 'execution-rejected',
            message: 'simulated failure',
            failedAt: FIXED_NOW,
          };
        }
        // Digit-shaped enough to pass a naive regex, but not a real date:
        // February never has a 31st, and there is no month 13.
        const impossibleTimestamp = translation.executionIntent === 'ProvideMetadata' ? '2026-02-31T00:00:00Z' : '2026-13-01T00:00:00Z';
        return { ...fakeSuccess(translation), executedAt: impossibleTimestamp };
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const timestampChecks = report.checks.filter((check) => check.id.startsWith('success-executed-at-valid-') && check.status === 'failed');
    assert.ok(timestampChecks.length > 0);
  });

  it('fails provider-neutrality when a structurally valid translation for a foreign providerSystem is not rejected', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async execute(candidate) {
        const validation = validateEnterpriseProviderTranslation(candidate);
        if (!validation.valid) throw new Error('invalid');
        // Never checks providerSystem -- executes any structurally valid
        // translation regardless of which provider it targets.
        return fakeSuccess(candidate as EnterpriseProviderTranslation);
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const foreignCheck = report.checks.find((check) => check.id === 'foreign-provider-system-rejected');
    assert.equal(foreignCheck?.status, 'failed');
  });

  it('fails boundary-validation (never skips) when no boundary evaluation is supplied at all', async () => {
    const { boundaryEvaluation: _omitted, ...harnessWithoutBoundary } = makeFullyConformantHarness();
    const report = await runEnterpriseProviderConformanceSuite(harnessWithoutBoundary);
    assert.equal(report.passed, false);
    const boundaryCheck = report.checks.find((check) => check.id === 'provider-sdk-import-boundary');
    assert.equal(boundaryCheck?.status, 'failed');
  });

  it('does not mistake a non-serializable fabricated result for a rejection of malformed input', async () => {
    const circular: Record<string, unknown> = { outcome: 'executed' };
    circular.self = circular;
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async execute() {
        // Never validates, never throws -- always resolves to a fabricated,
        // non-JSON-serializable result regardless of input.
        return circular as unknown as EnterpriseProviderConformanceExecutionResult;
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const malformedCheck = report.checks.find((check) => check.id === 'malformed-translation-rejected');
    assert.equal(malformedCheck?.status, 'failed');
  });

  it('never crashes describing a fabricated result that is both non-JSON-serializable AND non-String()-able (a circular, null-prototype object)', async () => {
    // `Object.create(null)` has no inherited `toString`/`valueOf`/
    // `Symbol.toPrimitive`, so `String(value)` itself throws for it -- on
    // top of `JSON.stringify` already throwing on the circular reference.
    // This is exactly the double-failure case describeValue's fallback must
    // survive without crashing the suite.
    const circularNullProto: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    circularNullProto.outcome = 'executed';
    circularNullProto.self = circularNullProto;
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async execute() {
        return circularNullProto as unknown as EnterpriseProviderConformanceExecutionResult;
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const malformedCheck = report.checks.find((check) => check.id === 'malformed-translation-rejected');
    assert.equal(malformedCheck?.status, 'failed');
  });

  it('reports failed checks, never throws, when the capability declaration has a non-array capabilities field', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      providerSystem: 'fake-malformed-declaration',
      capabilityDeclaration: {
        ...makeDeclaration({ id: 'fake-malformed-declaration-1', providerSystem: 'fake-malformed-declaration' }),
        capabilities: 'SupportsTemporaryAccess' as unknown as EnterpriseProviderCapabilityDeclaration['capabilities'],
      },
      async execute() {
        // Content is irrelevant to this test -- the point is that the suite
        // itself must never throw a TypeError from dereferencing a
        // non-array `capabilities` field (e.g. `.includes`/`.every`), and
        // must instead report failed checks (the declaration itself already
        // fails validation, so report.passed is false regardless).
        throw new Error('unreachable in a well-behaved caller, but harmless here');
      },
    };
    // If the suite itself threw here (rather than reporting failed checks),
    // this `await` would reject and fail the test -- that is the "never
    // throws" proof; no separate assertion helper is needed for it.
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
  });

  it('reports a failed check, never throws, when execute() resolves to null instead of throwing or returning a result', async () => {
    const harness: EnterpriseProviderConformanceHarness = {
      ...makeFullyConformantHarness(),
      async execute() {
        return null as unknown as EnterpriseProviderConformanceExecutionResult;
      },
    };
    const report = await runEnterpriseProviderConformanceSuite(harness);
    assert.equal(report.passed, false);
    const acceptedChecks = report.checks.filter((check) => check.id.includes('-translation-accepted-') && check.status === 'failed');
    assert.ok(acceptedChecks.length > 0);
  });
});

describe('evaluateEnterpriseProviderConformanceBoundary', () => {
  it('is valid when the provider SDK is imported only by the declared allowed files', () => {
    const result = evaluateEnterpriseProviderConformanceBoundary({
      providerModuleName: 'fake-sdk',
      allowedImporterFiles: ['packages/fake-adapter/src/fake-provider-client.ts'],
      actualImporterFilesWithinAdapter: ['packages/fake-adapter/src/fake-provider-client.ts'],
      foreignImporterFiles: [],
    });
    assert.deepEqual(result, { valid: true });
  });

  it('reports FOREIGN_IMPORTER_FOUND when a file outside the adapter imports the SDK', () => {
    const result = evaluateEnterpriseProviderConformanceBoundary({
      providerModuleName: 'fake-sdk',
      allowedImporterFiles: ['packages/fake-adapter/src/fake-provider-client.ts'],
      actualImporterFilesWithinAdapter: ['packages/fake-adapter/src/fake-provider-client.ts'],
      foreignImporterFiles: ['packages/access-grant/src/enterprise-access-grant.ts'],
    });
    assert.equal(result.valid, false);
    if (!result.valid) assert.ok(result.issues.some((issue) => issue.code === 'FOREIGN_IMPORTER_FOUND'));
  });

  it('reports UNEXPECTED_ADAPTER_IMPORTER when an undeclared file within the adapter imports the SDK', () => {
    const result = evaluateEnterpriseProviderConformanceBoundary({
      providerModuleName: 'fake-sdk',
      allowedImporterFiles: ['packages/fake-adapter/src/fake-provider-client.ts'],
      actualImporterFilesWithinAdapter: ['packages/fake-adapter/src/fake-provider-client.ts', 'packages/fake-adapter/src/fake-provider-adapter.ts'],
      foreignImporterFiles: [],
    });
    assert.equal(result.valid, false);
    if (!result.valid) assert.ok(result.issues.some((issue) => issue.code === 'UNEXPECTED_ADAPTER_IMPORTER'));
  });

  it('reports MISSING_EXPECTED_ADAPTER_IMPORTER when a declared allowed file does not actually import the SDK', () => {
    const result = evaluateEnterpriseProviderConformanceBoundary({
      providerModuleName: 'fake-sdk',
      allowedImporterFiles: ['packages/fake-adapter/src/fake-provider-client.ts'],
      actualImporterFilesWithinAdapter: [],
      foreignImporterFiles: [],
    });
    assert.equal(result.valid, false);
    if (!result.valid) assert.ok(result.issues.some((issue) => issue.code === 'MISSING_EXPECTED_ADAPTER_IMPORTER'));
  });
});

describe('isEnterpriseProviderConformanceExecutionDetail', () => {
  it('accepts a plain object with a kind discriminant and primitive/flat-record values', () => {
    assert.equal(isEnterpriseProviderConformanceExecutionDetail({ kind: 'temporary-access', accessUrl: 'https://example.test', expiresAt: FIXED_NOW }), true);
    assert.equal(isEnterpriseProviderConformanceExecutionDetail({ kind: 'metadata', metadata: { cid: 'Qm123', sizeBytes: 42 } }), true);
  });

  it('rejects a missing or empty kind discriminant', () => {
    assert.equal(isEnterpriseProviderConformanceExecutionDetail({ accessUrl: 'https://example.test' }), false);
    assert.equal(isEnterpriseProviderConformanceExecutionDetail({ kind: '' }), false);
  });

  it('rejects arrays, null, and non-objects', () => {
    assert.equal(isEnterpriseProviderConformanceExecutionDetail(['kind']), false);
    assert.equal(isEnterpriseProviderConformanceExecutionDetail(null), false);
    assert.equal(isEnterpriseProviderConformanceExecutionDetail('kind'), false);
  });

  it('rejects nested functions or deeply-nested objects (a proxy for a leaked raw SDK object)', () => {
    assert.equal(isEnterpriseProviderConformanceExecutionDetail({ kind: 'leak', client: () => undefined }), false);
    assert.equal(isEnterpriseProviderConformanceExecutionDetail({ kind: 'leak', nested: { deep: { value: 1 } } }), false);
  });

  it('rejects a class instance even when every enumerable property on it is a primitive', () => {
    class FakeSdkClient {
      readonly apiKey = 'not-actually-a-secret-but-shaped-like-one';
      readonly region = 'us-east-1';
    }
    assert.equal(isEnterpriseProviderConformanceExecutionDetail({ kind: 'leak', client: new FakeSdkClient() }), false);
    assert.equal(isEnterpriseProviderConformanceExecutionDetail(new FakeSdkClient()), false);
  });

  it('accepts an object created with Object.create(null) (no prototype, but still a plain record)', () => {
    const detail = Object.create(null) as Record<string, unknown>;
    detail.kind = 'null-proto';
    detail.value = 'ok';
    assert.equal(isEnterpriseProviderConformanceExecutionDetail(detail), true);
  });
});
