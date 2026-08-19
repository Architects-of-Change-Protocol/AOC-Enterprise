import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GOVERNED_RIGHTS_SCOPE_FULL_BASIS_POINTS,
  GOVERNED_RIGHT_TYPES,
  governedRightTypes,
  governedRightsScopeEquals,
  governedRightsScopeSum,
  governedRightsScopeWithin,
  isGovernedRightType,
  serializeGovernedRightsScope,
} from '../src/index.js';
import type { GovernedAuthorizationArtifact, GovernedAuthorizationStatus, GovernedRightsScope } from '../src/index.js';

/**
 * The shared vocabulary's own contract. It is deliberately small: this package
 * holds no domain rules, so there is little to test beyond that the primitives
 * mean exactly what four actions independently needed them to mean, and that
 * the total functions over the scope value type refuse rather than coerce.
 */

describe('GovernedRightType', () => {
  it('is the five-category, asset-side vocabulary four actions converged on', () => {
    assert.deepEqual([...governedRightTypes()].sort(), [
      'contractual-claim',
      'economic-interest',
      'ownership-interest',
      'revenue-right',
      'usage-right',
    ]);
    assert.equal(GOVERNED_RIGHT_TYPES.OWNERSHIP_INTEREST, 'ownership-interest');
  });

  it('recognizes only exact members', () => {
    assert.equal(isGovernedRightType('usage-right'), true);
    assert.equal(isGovernedRightType('USAGE-RIGHT'), false);
    assert.equal(isGovernedRightType('usage-right-extended'), false);
    assert.equal(isGovernedRightType(undefined), false);
    assert.equal(isGovernedRightType(42), false);
  });
});

describe('GovernedRightsScope', () => {
  it('expresses the whole as an exact integer, never a floating-point percentage', () => {
    assert.equal(GOVERNED_RIGHTS_SCOPE_FULL_BASIS_POINTS, 10_000);
    assert.equal(Number.isSafeInteger(GOVERNED_RIGHTS_SCOPE_FULL_BASIS_POINTS), true);
  });

  it('compares and sums commensurable scopes exactly', () => {
    assert.equal(governedRightsScopeEquals({ kind: 'proportional', basisPoints: 2500 }, { kind: 'proportional', basisPoints: 2500 }), true);
    assert.equal(governedRightsScopeWithin({ kind: 'proportional', basisPoints: 1000 }, { kind: 'proportional', basisPoints: 2500 }), true);
    assert.equal(governedRightsScopeWithin({ kind: 'proportional', basisPoints: 2501 }, { kind: 'proportional', basisPoints: 2500 }), false);
    assert.deepEqual(governedRightsScopeSum({ kind: 'proportional', basisPoints: 1000 }, { kind: 'proportional', basisPoints: 1500 }), {
      kind: 'proportional',
      basisPoints: 2500,
    });
    assert.deepEqual(
      governedRightsScopeSum({ kind: 'unitized', units: 6, unitDenomination: 'u' }, { kind: 'unitized', units: 4, unitDenomination: 'u' }),
      { kind: 'unitized', units: 10, unitDenomination: 'u' },
    );
  });

  it('refuses incommensurable scopes rather than coercing between them', () => {
    const proportional: GovernedRightsScope = { kind: 'proportional', basisPoints: 10_000 };
    const unitized: GovernedRightsScope = { kind: 'unitized', units: 1, unitDenomination: 'seat' };
    const otherUnit: GovernedRightsScope = { kind: 'unitized', units: 1, unitDenomination: 'install' };

    assert.equal(governedRightsScopeEquals(proportional, unitized), false);
    assert.equal(governedRightsScopeWithin(unitized, proportional), false, 'a unit count is never inside a proportional share');
    assert.equal(governedRightsScopeWithin(unitized, otherUnit), false, 'Soberanía holds no conversion between two opaque denominations');
    assert.equal(governedRightsScopeSum(proportional, unitized), null);
    assert.equal(governedRightsScopeSum(unitized, otherUnit), null);
  });

  it('serializes to a stable field order regardless of input key order', () => {
    const a = serializeGovernedRightsScope({ kind: 'unitized', unitDenomination: 'u', units: 3 } as GovernedRightsScope);
    const b = serializeGovernedRightsScope({ kind: 'unitized', units: 3, unitDenomination: 'u' });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});

describe('GovernedAuthorizationArtifact', () => {
  it('is a two-state lifecycle, and every other state stays derived', () => {
    const active: GovernedAuthorizationStatus = 'active';
    const revoked: GovernedAuthorizationStatus = 'revoked';
    assert.notEqual(active, revoked);
  });

  it('carries the seventeen fields four actions produced, with terms as the only parameter', () => {
    interface DemoTerms {
      readonly rights: readonly string[];
    }
    const artifact: GovernedAuthorizationArtifact<DemoTerms> = {
      schemaVersion: '1.0.0',
      id: 'artifact-1',
      status: 'active',
      asset: { kind: 'asset', id: 'a-1' },
      terms: { rights: ['usage-right'] },
      requestRef: 'request-1',
      requestedBy: 'actor-1',
      decisionRef: 'decision-1',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-07-01T00:00:00.000Z',
      correlationId: 'correlation-1',
    };

    // The eleven required fields are exactly the ones above; the remaining six
    // are optional, and a valid artifact can omit all of them.
    assert.equal(Object.keys(artifact).length, 11);
    assert.equal(artifact.evaluationRef, undefined);
    assert.equal(artifact.issuerRef, undefined);
    assert.equal(artifact.approvalRefs, undefined);
    assert.equal(artifact.obligationRefs, undefined);
    assert.equal(artifact.evidenceRefs, undefined);
    assert.equal(artifact.auditRefs, undefined);
  });
});
