import type { ResourceRef, ScopedAccessRequest } from '@aoc/protocol';

/**
 * Enterprise composition over AOC Protocol's `ScopedAccessRequest`.
 *
 * `ScopedAccessRequest` is canonical in `@aoc/protocol`
 * (`principalId`, `resource`, `requestedScope`, `requestedAt` — no `scope` or
 * `action` field has ever existed on it, confirmed by Protocol's own
 * compile-time `@ts-expect-error` tests). `action` is a distinct, Enterprise-owned
 * concept: today it is only ever read at one call site
 * (`src/runtime/host.ts`'s delegated-access evaluation, comparing a delegation's
 * `constraints.action` against the request's `action`) and it has no equivalent
 * anywhere in Protocol's adapter or contract surface for this request shape.
 *
 * This composes the public Protocol type rather than duplicating its fields, so
 * it inherits any future additive change to `ScopedAccessRequest` automatically.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/scoped-access`). Do not reinterpret
 * `action` as an alias of `requestedScope` — they are unrelated fields.
 */
export interface EnterpriseScopedAccessRequest extends ScopedAccessRequest {
  readonly action?: string;
}

/**
 * Enterprise's legacy delegation-constraint representation (see
 * `src/runtime/host.ts`, `DelegatedCapabilityPayload.constraints`) stores
 * `resource` as a single colon-joined `kind:id` string (e.g. `'record:contract'`,
 * `'dataset:example'` — see `tests/enterprise-runtime-host.contract.test.mjs` and
 * `examples/enterprise-runtime-host/usage-example.ts`), not as Protocol's
 * structured `ResourceRef`. This reconstructs that exact legacy string form from
 * a real `ResourceRef` so the two representations can be compared explicitly,
 * without casting `ResourceRef` to `string` or inventing new resource semantics.
 *
 * If `resource.tenantId` is present, it is prepended (`tenantId:kind:id`); no
 * production call site currently populates `tenantId`, so today this always
 * produces the plain `kind:id` form.
 */
export function legacyResourceIdentifier(resource: ResourceRef): string {
  return resource.tenantId === undefined
    ? `${resource.kind}:${resource.id}`
    : `${resource.tenantId}:${resource.kind}:${resource.id}`;
}
