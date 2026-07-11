import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateAssuranceFramework } from '../assurance/framework-validation.js';
import { createAssuranceFrameworkRegistry, resolveFrameworkForAssessment } from '../assurance/framework-registry.js';
import { AOC_SAF_FRAMEWORK_V1 } from '../assurance/saf-framework.js';
import { AssuranceError } from '../assurance/errors.js';
import { buildTestFramework } from './assurance-support.js';
import type { AssuranceFramework } from '../assurance/contracts.js';

function issuesFor(framework: AssuranceFramework): readonly string[] {
  return validateAssuranceFramework(framework).issues.map((issue) => issue.check);
}

describe('Assurance framework validation (mission section 47/78)', () => {
  it('accepts the fully valid test framework', () => {
    const result = validateAssuranceFramework(buildTestFramework());
    assert.equal(result.valid, true);
    assert.deepEqual(result.issues, []);
  });

  it('accepts the built-in aoc.saf 1.0.0 framework', () => {
    const result = validateAssuranceFramework(AOC_SAF_FRAMEWORK_V1);
    assert.deepEqual(result.issues, []);
    assert.equal(result.valid, true);
  });

  it('rejects duplicate domain ids', () => {
    const framework = buildTestFramework();
    const withDup = { ...framework, domains: [...framework.domains, framework.domains[0]!] };
    assert.ok(issuesFor(withDup).includes('domain.unique'));
  });

  it('rejects duplicate control ids', () => {
    const framework = buildTestFramework();
    const withDup = { ...framework, controls: [...framework.controls, framework.controls[0]!] };
    assert.ok(issuesFor(withDup).includes('control.unique'));
  });

  it('rejects a control referencing a missing domain', () => {
    const framework = buildTestFramework();
    const broken = { ...framework, controls: framework.controls.map((control) => (control.controlId === 'c.bool' ? { ...control, domainId: 'd.missing' } : control)) };
    assert.ok(issuesFor(broken).includes('control.domain'));
  });

  it('rejects a control referencing a missing evidence requirement', () => {
    const framework = buildTestFramework();
    const broken = { ...framework, controls: framework.controls.map((control) => (control.controlId === 'c.bool' ? { ...control, evidenceRequirementIds: ['req.missing'] } : control)) };
    assert.ok(issuesFor(broken).includes('control.requirement'));
  });

  it('rejects malformed total domain weights', () => {
    const framework = buildTestFramework();
    const broken = { ...framework, domains: framework.domains.map((domain) => ({ ...domain, weight: 0.9 })) };
    assert.ok(issuesFor(broken).includes('domain.weights.total'));
  });

  it('rejects a malformed scoring model (missing status entry, out-of-range value)', () => {
    const framework = buildTestFramework();
    const { pass: _unusedPass, ...withoutPass } = framework.scoringModel.statusScores;
    const missing = { ...framework, scoringModel: { ...framework.scoringModel, statusScores: withoutPass as typeof framework.scoringModel.statusScores } };
    assert.ok(issuesFor(missing).includes('scoring.statusScores'));

    const outOfRange = { ...framework, scoringModel: { ...framework.scoringModel, statusScores: { ...framework.scoringModel.statusScores, pass: 2 } } };
    assert.ok(issuesFor(outOfRange).includes('scoring.statusScores.range'));
  });

  it('rejects a blocking control that is not one of the domain controls', () => {
    const framework = buildTestFramework();
    const broken = { ...framework, domains: framework.domains.map((domain) => (domain.domainId === 'd.core' ? { ...domain, blockingControlIds: ['c.presence'] } : domain)) };
    assert.ok(issuesFor(broken).includes('domain.blocking'));
  });

  it('rejects an invalid eligibility profile (unknown domain, out-of-range score, unknown control)', () => {
    const framework = buildTestFramework();
    const broken: AssuranceFramework = {
      ...framework,
      eligibilityProfiles: [
        { profileId: 'bad', name: 'Bad', minimumOverallScore: 150, minimumDomainScores: { 'd.missing': 50 }, mandatoryControlIds: ['c.missing'], manualReviewRequired: false },
      ],
    };
    const checks = issuesFor(broken);
    assert.ok(checks.includes('eligibility.minimumOverallScore'));
    assert.ok(checks.includes('eligibility.domain'));
    assert.ok(checks.includes('eligibility.control'));
  });

  it('rejects orphan controls (defined but not listed by any domain)', () => {
    const framework = buildTestFramework();
    const broken = { ...framework, domains: framework.domains.map((domain) => (domain.domainId === 'd.review' ? { ...domain, controlIds: ['c.presence', 'c.manual'] } : domain)) };
    assert.ok(issuesFor(broken).includes('control.orphan'));
  });

  it('rejects an invalid composite minimum', () => {
    const framework = buildTestFramework();
    const broken = {
      ...framework,
      controls: framework.controls.map((control) =>
        control.controlId === 'c.bool'
          ? { ...control, criteria: { type: 'composite' as const, operator: 'minimum' as const, minimum: 5, criteria: [{ type: 'boolean' as const, metric: 'm', expected: true }] } }
          : control,
      ),
    };
    assert.ok(issuesFor(broken).includes('control.criteria.minimum'));
  });
});

describe('Assurance Framework Registry (mission section 46/78)', () => {
  it('registers, lists, and serves a valid framework', () => {
    const registry = createAssuranceFrameworkRegistry();
    registry.register(buildTestFramework());
    assert.equal(registry.list().length, 1);
    assert.equal(registry.get('test.framework', '1.0.0')?.name, 'Test Assurance Framework');
  });

  it('rejects a duplicate framework id/version -- versions are immutable', () => {
    const registry = createAssuranceFrameworkRegistry();
    registry.register(buildTestFramework());
    assert.throws(() => registry.register(buildTestFramework()), (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_FRAMEWORK_INVALID');
  });

  it('supports multiple versions of one framework side by side', () => {
    const registry = createAssuranceFrameworkRegistry();
    registry.register(buildTestFramework());
    registry.register(buildTestFramework({ frameworkVersion: '1.1.0' }));
    assert.equal(registry.list().length, 2);
    assert.ok(registry.get('test.framework', '1.0.0'));
    assert.ok(registry.get('test.framework', '1.1.0'));
  });

  it('rejects an invalid framework at registration', () => {
    const registry = createAssuranceFrameworkRegistry();
    const framework = buildTestFramework();
    const broken = { ...framework, domains: framework.domains.map((domain) => ({ ...domain, weight: 0.1 })) };
    assert.throws(() => registry.register(broken), (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_FRAMEWORK_INVALID');
  });

  it('deprecated frameworks remain readable; retired versions are refused for new assessments unless explicitly allowed', () => {
    const registry = createAssuranceFrameworkRegistry();
    registry.register(buildTestFramework());
    registry.deprecate('test.framework', '1.0.0');
    assert.equal(registry.get('test.framework', '1.0.0')?.status, 'deprecated');
    // Deprecated versions still resolve for assessment (read continuity).
    assert.ok(resolveFrameworkForAssessment(registry, 'test.framework', '1.0.0'));

    const retiredRegistry = createAssuranceFrameworkRegistry();
    retiredRegistry.register(buildTestFramework({ frameworkVersion: '0.9.0', status: 'retired' }));
    assert.throws(
      () => resolveFrameworkForAssessment(retiredRegistry, 'test.framework', '0.9.0'),
      (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_FRAMEWORK_VERSION_UNSUPPORTED',
    );
    // Retired versions remain readable/verifiable and usable when explicitly configured.
    assert.ok(resolveFrameworkForAssessment(retiredRegistry, 'test.framework', '0.9.0', { allowRetired: true }));
  });

  it('draft frameworks are refused for assessment until activated', () => {
    const registry = createAssuranceFrameworkRegistry();
    registry.register(buildTestFramework({ frameworkVersion: '2.0.0', status: 'draft' }));
    assert.throws(
      () => resolveFrameworkForAssessment(registry, 'test.framework', '2.0.0'),
      (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_FRAMEWORK_VERSION_UNSUPPORTED',
    );
    registry.activate('test.framework', '2.0.0');
    assert.ok(resolveFrameworkForAssessment(registry, 'test.framework', '2.0.0'));
  });

  it('freeze() stops registration and activation (active framework mutation rejected)', () => {
    const registry = createAssuranceFrameworkRegistry();
    registry.register(buildTestFramework());
    registry.freeze();
    assert.equal(registry.isFrozen(), true);
    assert.throws(() => registry.register(buildTestFramework({ frameworkVersion: '3.0.0' })), (error: unknown) => error instanceof AssuranceError);
    assert.throws(() => registry.activate('test.framework', '1.0.0'), (error: unknown) => error instanceof AssuranceError);
  });

  it('unknown framework/version lookups fail with ASSURANCE_FRAMEWORK_NOT_FOUND', () => {
    const registry = createAssuranceFrameworkRegistry();
    assert.throws(
      () => resolveFrameworkForAssessment(registry, 'nope', '1.0.0'),
      (error: unknown) => error instanceof AssuranceError && error.code === 'ASSURANCE_FRAMEWORK_NOT_FOUND',
    );
  });
});
