import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOVERNED_RIGHT_TYPES } from '@aoc-enterprise/governed-authorization';

import {
  governedAuthorityPositionKey,
  governedAuthorityPositionState,
  isGovernedAuthorityCovered,
  isGovernedAuthorityIssuanceBasis,
  isZeroGovernedRightsScope,
  type GovernedAuthorityPosition,
} from '../src/index.js';

function position(overrides: Partial<GovernedAuthorityPosition> = {}): GovernedAuthorityPosition {
  return {
    id: 'position-1',
    tenantId: 'org-a',
    actorRef: 'party-alice',
    resourceKind: 'asset',
    resourceId: 'asset-a',
    governedRight: GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST,
    scope: { kind: 'proportional', basisPoints: 10_000 },
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastTransitionRef: 'transition-1',
    digest: 'sha256:0',
    ...overrides,
  };
}

describe('governedAuthorityPositionKey', () => {
  it('identifies a position by tenant, actor, resource and right', () => {
    assert.equal(
      governedAuthorityPositionKey({
        tenantId: 'org-a',
        actorRef: 'party-alice',
        resourceKind: 'asset',
        resourceId: 'asset-a',
        governedRight: GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST,
      }),
      '5:org-a|11:party-alice|5:asset|7:asset-a|17:economic-interest',
    );
  });

  it('cannot be forged by separators inside the parts, because every part is length-prefixed', () => {
    const a = governedAuthorityPositionKey({
      tenantId: 'org-a|11:party',
      actorRef: 'alice',
      resourceKind: 'asset',
      resourceId: 'asset-a',
      governedRight: GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST,
    });
    const b = governedAuthorityPositionKey({
      tenantId: 'org-a',
      actorRef: 'party-alice',
      resourceKind: 'asset',
      resourceId: 'asset-a',
      governedRight: GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST,
    });
    assert.notEqual(a, b);
  });

  it('separates two rights of the same resource held by the same actor', () => {
    const base = { tenantId: 'org-a', actorRef: 'party-alice', resourceKind: 'asset', resourceId: 'asset-a' } as const;
    assert.notEqual(
      governedAuthorityPositionKey({ ...base, governedRight: GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST }),
      governedAuthorityPositionKey({ ...base, governedRight: GOVERNED_RIGHT_TYPES.USAGE_RIGHT }),
    );
  });
});

describe('governedAuthorityPositionState', () => {
  it('is active while the window is open and something is left', () => {
    assert.equal(governedAuthorityPositionState(position(), '2026-06-01T00:00:00.000Z'), 'active');
  });

  it('is pending before it starts', () => {
    assert.equal(governedAuthorityPositionState(position({ effectiveFrom: '2026-06-01T00:00:00.000Z' }), '2026-01-01T00:00:00.000Z'), 'pending');
  });

  it('is expired at and after its expiry, never one tick late', () => {
    const expiring = position({ expiresAt: '2026-06-01T00:00:00.000Z' });
    assert.equal(governedAuthorityPositionState(expiring, '2026-05-31T23:59:59.999Z'), 'active');
    assert.equal(governedAuthorityPositionState(expiring, '2026-06-01T00:00:00.000Z'), 'expired');
  });

  it('is exhausted at zero, without a stored status having to say so', () => {
    assert.equal(governedAuthorityPositionState(position({ scope: { kind: 'proportional', basisPoints: 0 } }), '2026-06-01T00:00:00.000Z'), 'exhausted');
    assert.equal(
      governedAuthorityPositionState(position({ scope: { kind: 'unitized', units: 0, unitDenomination: 'share' } }), '2026-06-01T00:00:00.000Z'),
      'exhausted',
    );
  });

  it('reports expiry rather than exhaustion when both apply, because expiry is the load-bearing reason', () => {
    const spent = position({ scope: { kind: 'proportional', basisPoints: 0 }, expiresAt: '2026-03-01T00:00:00.000Z' });
    assert.equal(governedAuthorityPositionState(spent, '2026-06-01T00:00:00.000Z'), 'expired');
  });
});

describe('isZeroGovernedRightsScope', () => {
  it('recognizes nothing-left in both scope kinds and only there', () => {
    assert.equal(isZeroGovernedRightsScope({ kind: 'proportional', basisPoints: 0 }), true);
    assert.equal(isZeroGovernedRightsScope({ kind: 'proportional', basisPoints: 1 }), false);
    assert.equal(isZeroGovernedRightsScope({ kind: 'unitized', units: 0, unitDenomination: 'share' }), true);
    assert.equal(isZeroGovernedRightsScope({ kind: 'unitized', units: 1, unitDenomination: 'share' }), false);
  });
});

describe('isGovernedAuthorityIssuanceBasis', () => {
  it('separates the two issuing bases from the one conserving basis', () => {
    assert.equal(isGovernedAuthorityIssuanceBasis({ kind: 'administrative-bootstrap', assertedBy: 'actor-admin' }), true);
    assert.equal(
      isGovernedAuthorityIssuanceBasis({ kind: 'recognized-external-evidence', assertedBy: 'actor-admin', evidenceRefs: ['evidence-1'] }),
      true,
    );
    assert.equal(
      isGovernedAuthorityIssuanceBasis({ kind: 'governed-execution', capability: 'transfer', executionRef: 'exec-1', mandateRef: 'mandate-1' }),
      false,
    );
  });
});

describe('isGovernedAuthorityCovered', () => {
  it('is true for exactly one outcome', () => {
    assert.equal(isGovernedAuthorityCovered({ outcome: 'covered', positionId: 'p', available: { kind: 'proportional', basisPoints: 1 } }), true);
    assert.equal(isGovernedAuthorityCovered({ outcome: 'resource_not_enrolled' }), false);
    assert.equal(isGovernedAuthorityCovered({ outcome: 'no_right_authority', governedRight: GOVERNED_RIGHT_TYPES.USAGE_RIGHT }), false);
    assert.equal(isGovernedAuthorityCovered({ outcome: 'expired', positionId: 'p' }), false);
    assert.equal(
      isGovernedAuthorityCovered({
        outcome: 'insufficient_scope',
        positionId: 'p',
        available: { kind: 'proportional', basisPoints: 1 },
        requested: { kind: 'proportional', basisPoints: 2 },
      }),
      false,
    );
    assert.equal(
      isGovernedAuthorityCovered({
        outcome: 'incompatible_scope',
        positionId: 'p',
        available: { kind: 'proportional', basisPoints: 1 },
        requested: { kind: 'unitized', units: 1, unitDenomination: 'share' },
      }),
      false,
    );
  });
});
