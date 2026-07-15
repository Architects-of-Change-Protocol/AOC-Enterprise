import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ScopedAccessRequest } from '@aoc/protocol';
import type { VerifiedActorClaims } from '@aoc-enterprise/identity';
import type { EnterpriseScopedAccessRequest } from '@aoc-enterprise/scoped-access';

// Compile-time governance: `declare const` bindings have no JS emission, and
// the function below that references them is deliberately never invoked, so
// none of this executes at runtime -- only `npm run typecheck`/`npm run
// build` (this file is part of the main tsc project) evaluate it. An unused
// `@ts-expect-error` is itself a compile error, so each of these fails
// loudly the moment the guarantee it documents stops holding -- e.g. if a
// future `@aoc/protocol` version added a `scope` or `action` field to
// `ScopedAccessRequest`, or if `EnterpriseScopedAccessRequest` stopped
// exposing `action`.
declare const protocolAccess: ScopedAccessRequest;
declare const enterpriseAccess: EnterpriseScopedAccessRequest;
declare const claims: VerifiedActorClaims;

function typeOnlyAssertions(): void {
  // The real Protocol contract has no `scope` field -- only `requestedScope`.
  // @ts-expect-error -- ScopedAccessRequest has no `scope`; use `requestedScope`.
  void protocolAccess.scope;

  // The real Protocol contract has no `action` field at all -- it is
  // Enterprise-owned (see EnterpriseScopedAccessRequest below).
  // @ts-expect-error -- ScopedAccessRequest has no `action`; it is Enterprise-owned.
  void protocolAccess.action;

  // `requestedScope` and `resource` (the real, canonical fields) type-check
  // without any suppression.
  void protocolAccess.requestedScope;
  void protocolAccess.resource;

  // EnterpriseScopedAccessRequest composes the real ScopedAccessRequest and
  // additionally exposes Enterprise's own `action` field -- both resolve
  // without suppression, proving the extension is additive, not a
  // reinterpretation of `requestedScope`.
  void enterpriseAccess.requestedScope;
  void enterpriseAccess.action;

  // VerifiedActorClaims is deliberately minimal and closed, not an open
  // Record<string, unknown> -- an unevidenced field does not exist on it.
  // @ts-expect-error -- VerifiedActorClaims only has `sub`.
  void claims.tenantId;
}
void typeOnlyAssertions;

describe('protocol contract adoption -- compile-time governance', () => {
  it('has no executable assertions of its own; see the @ts-expect-error directives in typeOnlyAssertions above', () => {
    // This suite's value is entirely at compile time (npm run typecheck /
    // npm run build), enforced inside `typeOnlyAssertions`, which is
    // intentionally never invoked. This runtime assertion exists only so the
    // test file registers as a passing suite under `node --test`.
    assert.equal(true, true);
  });
});
