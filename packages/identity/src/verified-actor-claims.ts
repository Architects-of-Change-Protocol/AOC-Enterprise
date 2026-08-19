/**
 * Enterprise-owned identity claims contract.
 *
 * Soberanía Protocol's governance explicitly determined that verified-identity/auth
 * claims (e.g. token subject claims) are an implementation-specific concern
 * and do not belong in `@aoc/protocol`'s public surface — see
 * `docs/protocol/PUBLIC_API.md` in the Protocol repository and
 * `protocol-consumer.lock.json` (`knownGaps` → `aoc-identity-claims-not-exported`)
 * in this repository. `AocIdentityClaims` was never a real Protocol export; it
 * was an Enterprise-invented ambient shim symbol. `VerifiedActorClaims` is the
 * Enterprise-owned replacement.
 *
 * Ownership: Soberanía Enterprise (`@aoc-enterprise/identity`). Evolution of this
 * type is an Enterprise decision, not a Protocol one — do not reintroduce an
 * import of an identity-claims type from `@aoc/protocol`.
 *
 * Scope: every production call site that currently consumes this type only
 * ever reads `.sub` (the verified actor's canonical identifier). The shape is
 * kept minimal and closed rather than an open `Record<string, unknown>` so
 * that adding a field is a deliberate, reviewed decision. If a real,
 * evidenced call site needs another claim (e.g. a tenant or issuer claim),
 * add it here explicitly rather than widening back to an open record.
 */
export interface VerifiedActorClaims {
  readonly sub: string;
}
