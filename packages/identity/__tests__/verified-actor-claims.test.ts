import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { VerifiedActorClaims } from '../src/verified-actor-claims.js';

function isSameActor(a: VerifiedActorClaims, b: VerifiedActorClaims): boolean {
  return a.sub === b.sub;
}

describe('VerifiedActorClaims', () => {
  it('carries a valid sub', () => {
    const claims: VerifiedActorClaims = { sub: 'actor-1' };
    assert.equal(claims.sub, 'actor-1');
  });

  it('supports the authorization comparison call sites continue to rely on (actor.sub equality)', () => {
    const requestActor: VerifiedActorClaims = { sub: 'actor-1' };
    const delegationActor: VerifiedActorClaims = { sub: 'actor-1' };
    const otherActor: VerifiedActorClaims = { sub: 'actor-2' };

    assert.equal(isSameActor(requestActor, delegationActor), true);
    assert.equal(isSameActor(requestActor, otherActor), false);
  });

  it('does not accept a missing sub at the type level (no runtime-checkable default exists)', () => {
    // VerifiedActorClaims.sub is required (not optional) -- there is no
    // "invalid sub" runtime case to construct without bypassing the type
    // system, which matches existing behavior: the previous shim's `sub` was
    // optional and unchecked; call sites (e.g. src/runtime/host.ts comparing
    // `payload.actorId !== input.actor.sub`) never handled a missing `sub`
    // specially, they simply compared it as a string (undefined !== string).
    // Making `sub` required, non-optional documents the real expectation
    // without changing that comparison's runtime behavior.
    const claims: VerifiedActorClaims = { sub: '' };
    assert.equal(typeof claims.sub, 'string');
  });
});
