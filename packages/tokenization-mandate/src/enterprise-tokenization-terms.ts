import type { CanonicalId } from '@aoc/protocol';

/**
 * The shared vocabulary of the `TOKENIZE` governed capability: what a
 * tokenization authorization is *about* (rights), *how much of it* is
 * authorized (scope), *who may carry it out* (executor), and *under what
 * declared limits* (constraints).
 *
 * `TOKENIZE` means: exercising authorized control over specified rights
 * associated with an already-governed asset in order to create an external
 * tokenized representation of those rights. It is deliberately distinct from
 * every neighbouring governed action -- see
 * `ENTERPRISE_CAPABILITIES_DISTINCT_FROM_TOKENIZE`. In particular,
 * protocolization (establishing a governed/canonical asset representation
 * and its authority/evidence context) is NOT tokenization: an asset can be
 * protocolized and never tokenized, and tokenization always presupposes an
 * already-identified governed asset.
 *
 * AOC Enterprise authorizes tokenization. It is not the tokenization
 * provider: nothing in this package mints, issues, transfers, or values any
 * token, and no field here is blockchain-specific in meaning. `constraints`
 * carries provider-neutral, opaque labels (a network name, a token standard
 * name, a jurisdiction code) that AOC records and compares as strings and
 * never interprets, resolves, or executes against.
 *
 * This is a pure data contract: no persistence, no service, no API, no
 * policy engine, no provider SDK, no execution. It follows the same
 * composition style as the R004 contract line (`@aoc-enterprise/resource-envelope`,
 * `access-decision`, `access-obligation`, `access-grant`, `grant-revocation`,
 * `usage-event`, `evidence-correlation`): closed vocabularies, explicit
 * validation codes, identity/structural equality, deterministic
 * serialization, and references to records owned elsewhere rather than
 * embeddings of them.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/tokenization-mandate`).
 */
export const ENTERPRISE_TOKENIZATION_SCHEMA_VERSION = '1.0.0' as const;

/**
 * The canonical capability identifier. Carried verbatim on
 * `ActionDescriptor.capability` when a `TOKENIZE` request is submitted
 * through the generalized governance evaluation path
 * (`POST /api/governance/evaluate` / `AocKernel.evaluate`), and matched
 * against `AuthorityGrant.capability` / `RecognitionCapabilityToken.capability`
 * by the existing authority and recognition runtimes. This package adds no
 * second authorization mechanism of its own.
 */
export const ENTERPRISE_TOKENIZE_CAPABILITY = 'tokenize' as const;

/**
 * The neighbouring governed actions `TOKENIZE` must never be conflated with.
 * Recorded as data (not prose alone) so the distinction is testable, and
 * enforced structurally by `validateEnterpriseTokenizationRequest`, which
 * rejects any request whose `capability` is not exactly
 * `ENTERPRISE_TOKENIZE_CAPABILITY`.
 *
 * This is NOT a capability registry: this repository deliberately treats
 * capability as an open string (see `AuthorityGrant.capability`), and this
 * list neither enumerates nor constrains what other capabilities may exist.
 * It records only which names are known to be *different* from this one.
 */
export const ENTERPRISE_CAPABILITIES_DISTINCT_FROM_TOKENIZE = [
  'protocolize',
  'register',
  'transfer',
  'license',
  'delegate',
  'collateralize',
  'commercialize',
] as const;

/** Whether `capability` is exactly the `TOKENIZE` capability identifier. Never a fuzzy/prefix match -- `'tokenize.partial'` is a different capability. */
export function isEnterpriseTokenizeCapability(capability: unknown): capability is typeof ENTERPRISE_TOKENIZE_CAPABILITY {
  return capability === ENTERPRISE_TOKENIZE_CAPABILITY;
}

/**
 * The canonical vocabulary of right categories a tokenized representation
 * may stand for. Each value describes *what the external token would
 * represent*, never what the token technically is: `'ownership-interest'`
 * records that the authorized rights include an ownership interest, it does
 * not assert that anyone owns anything -- that must already be established
 * upstream by the authority primitives AOC evaluates (Authority Graph), and
 * AOC never infers it from the fact that a request was submitted.
 *
 * Deliberately a closed union, consistent with every other governance
 * vocabulary in this contract line (`ENTERPRISE_ACCESS_OBLIGATION_TYPES`,
 * `ENTERPRISE_USAGE_EVENT_TYPES`, `EnterpriseResourceLifecycleState`): the
 * categories are stable, provider-neutral, shared vocabulary, and a future
 * category is a `schemaVersion` change, not an escape hatch. It is
 * extensible in that sense and permanently closed in no other.
 */
export const ENTERPRISE_TOKENIZED_RIGHT_TYPES = {
  ECONOMIC_INTEREST: 'economic-interest',
  REVENUE_RIGHT: 'revenue-right',
  OWNERSHIP_INTEREST: 'ownership-interest',
  USAGE_RIGHT: 'usage-right',
  CONTRACTUAL_CLAIM: 'contractual-claim',
} as const;

export type EnterpriseTokenizedRightType = (typeof ENTERPRISE_TOKENIZED_RIGHT_TYPES)[keyof typeof ENTERPRISE_TOKENIZED_RIGHT_TYPES];

/**
 * How much of the named rights an authorization covers.
 *
 * `'proportional'` expresses a share as an integer count of basis points
 * (1/100th of a percent), so 20% is `2000` and the whole is `10000`. An
 * integer basis-point count is used deliberately instead of a floating-point
 * percentage: `0.1 + 0.2 !== 0.3` in IEEE-754, and an economically
 * significant share must compare and sum exactly. `'unitized'` expresses a
 * fixed count of named entitlement units for rights that are not naturally
 * proportional.
 *
 * A discriminated union rather than a bag of optional fields, so "a scope
 * that is somehow both 20% and 500 units" is unrepresentable.
 */
export type EnterpriseTokenizationScope =
  | { readonly kind: 'proportional'; readonly basisPoints: number }
  | { readonly kind: 'unitized'; readonly units: number; readonly unitDenomination: string };

/** The whole of the named rights, expressed proportionally. Provided so "100%" never has to be spelled as a magic number at call sites. */
export const ENTERPRISE_TOKENIZATION_FULL_BASIS_POINTS = 10_000 as const;

/**
 * Declared, provider-neutral limits an authorization carries. Every field is
 * a description AOC records and can compare; none is an instruction AOC
 * carries out, and none is interpreted against any real network, standard,
 * or legal system.
 *
 * - `maximumIssuedUnits?` -- the ceiling on total external units issued under
 *   this authorization. Absent means no declared ceiling.
 * - `permittedNetworks?` / `permittedTokenStandards?` / `permittedJurisdictions?`
 *   -- opaque allow-lists of labels. Absent means "not restricted by this
 *   authorization", never "any value is endorsed".
 * - `transferRestricted?` -- records that the authorization declares transfer
 *   restrictions that an external system must enforce. AOC cannot and does
 *   not enforce them.
 * - `additionalIssuanceAllowed` -- required, because "may this be exercised
 *   more than once?" has no safe default. `false` means the authorization
 *   permits a single external issuance.
 */
export interface EnterpriseTokenizationConstraints {
  readonly maximumIssuedUnits?: number;
  readonly permittedNetworks?: readonly string[];
  readonly permittedTokenStandards?: readonly string[];
  readonly permittedJurisdictions?: readonly string[];
  readonly transferRestricted?: boolean;
  readonly additionalIssuanceAllowed: boolean;
}

/**
 * The complete statement of *what exactly* is being authorized: which
 * rights, how much of them, by whom, under what declared limits. Shared by
 * `EnterpriseTokenizationRequest` (what was asked) and
 * `EnterpriseTokenizationMandate` (what was granted) so the two can never
 * drift into two subtly different notions of "scope" -- see
 * `enterpriseTokenizationTermsWithin`, the single comparison that decides
 * whether granted terms stayed inside requested terms.
 *
 * `executorRef` names the one party permitted to perform the external
 * tokenization. It is an opaque pointer to a party identity established
 * elsewhere, never a provider credential, endpoint, or client.
 */
export interface EnterpriseTokenizationTerms {
  readonly rights: readonly EnterpriseTokenizedRightType[];
  readonly scope: EnterpriseTokenizationScope;
  readonly executorRef: CanonicalId;
  readonly constraints: EnterpriseTokenizationConstraints;
}

// ---------------------------------------------------------------------------
// Shared primitives. Kept in this module (rather than duplicated per
// contract file) so every contract in this package validates, compares, and
// serializes the same concepts identically.
// ---------------------------------------------------------------------------

export const ENTERPRISE_TOKENIZATION_ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isTokenizationPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTokenizationNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isTokenizationTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ENTERPRISE_TOKENIZATION_ISO_8601_PATTERN.test(value);
}

export function isTokenizationPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isTokenizationCanonicalIdArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => isTokenizationNonEmptyString(entry));
}

/** Sorted, duplicate-insensitive string-set equality. Reused wherever this package compares reference or label collections. */
export function tokenizationStringArrayEquals(a: readonly string[], b: readonly string[]): boolean {
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.length === bSorted.length && aSorted.every((value, index) => value === bSorted[index]);
}

export function tokenizationOptionalStringArrayEquals(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return tokenizationStringArrayEquals(a, b);
}

const RIGHT_TYPES: readonly EnterpriseTokenizedRightType[] = Object.values(ENTERPRISE_TOKENIZED_RIGHT_TYPES);

export function isEnterpriseTokenizedRightType(value: unknown): value is EnterpriseTokenizedRightType {
  return typeof value === 'string' && RIGHT_TYPES.includes(value as EnterpriseTokenizedRightType);
}

// ---------------------------------------------------------------------------
// Scope semantics
// ---------------------------------------------------------------------------

export function enterpriseTokenizationScopeEquals(a: EnterpriseTokenizationScope, b: EnterpriseTokenizationScope): boolean {
  if (a.kind === 'proportional') return b.kind === 'proportional' && a.basisPoints === b.basisPoints;
  return b.kind === 'unitized' && a.units === b.units && a.unitDenomination === b.unitDenomination;
}

/**
 * Whether `inner` is fully contained by `outer`. Scopes of different kinds
 * are never comparable: a proportional share and a unit count describe
 * different quantities, and silently coercing between them is exactly the
 * escalation this function exists to prevent. Unitized scopes must also
 * agree on `unitDenomination` -- 500 of one unit is not 500 of another.
 */
export function enterpriseTokenizationScopeWithin(inner: EnterpriseTokenizationScope, outer: EnterpriseTokenizationScope): boolean {
  if (inner.kind === 'proportional') return outer.kind === 'proportional' && inner.basisPoints <= outer.basisPoints;
  return outer.kind === 'unitized' && inner.unitDenomination === outer.unitDenomination && inner.units <= outer.units;
}

// ---------------------------------------------------------------------------
// Constraint / terms containment
// ---------------------------------------------------------------------------

function labelListWithin(inner: readonly string[] | undefined, outer: readonly string[] | undefined): boolean {
  // An absent outer allow-list declares no restriction, so anything is within it.
  if (outer === undefined) return true;
  // A restricted outer cannot contain an unrestricted inner.
  if (inner === undefined) return false;
  return inner.every((label) => outer.includes(label));
}

/**
 * Whether `inner` constraints are at least as restrictive as `outer`. Used
 * to prove that granted limits never loosened what was requested (or, at
 * execution time, that an exercise stayed inside the mandate).
 */
export function enterpriseTokenizationConstraintsWithin(
  inner: EnterpriseTokenizationConstraints,
  outer: EnterpriseTokenizationConstraints,
): boolean {
  if (outer.maximumIssuedUnits !== undefined) {
    if (inner.maximumIssuedUnits === undefined || inner.maximumIssuedUnits > outer.maximumIssuedUnits) return false;
  }
  if (!labelListWithin(inner.permittedNetworks, outer.permittedNetworks)) return false;
  if (!labelListWithin(inner.permittedTokenStandards, outer.permittedTokenStandards)) return false;
  if (!labelListWithin(inner.permittedJurisdictions, outer.permittedJurisdictions)) return false;
  if (outer.transferRestricted === true && inner.transferRestricted !== true) return false;
  if (!outer.additionalIssuanceAllowed && inner.additionalIssuanceAllowed) return false;
  return true;
}

export function enterpriseTokenizationConstraintsEquals(a: EnterpriseTokenizationConstraints, b: EnterpriseTokenizationConstraints): boolean {
  return (
    a.maximumIssuedUnits === b.maximumIssuedUnits &&
    tokenizationOptionalStringArrayEquals(a.permittedNetworks, b.permittedNetworks) &&
    tokenizationOptionalStringArrayEquals(a.permittedTokenStandards, b.permittedTokenStandards) &&
    tokenizationOptionalStringArrayEquals(a.permittedJurisdictions, b.permittedJurisdictions) &&
    a.transferRestricted === b.transferRestricted &&
    a.additionalIssuanceAllowed === b.additionalIssuanceAllowed
  );
}

export function enterpriseTokenizationTermsEquals(a: EnterpriseTokenizationTerms, b: EnterpriseTokenizationTerms): boolean {
  return (
    tokenizationStringArrayEquals(a.rights, b.rights) &&
    enterpriseTokenizationScopeEquals(a.scope, b.scope) &&
    a.executorRef === b.executorRef &&
    enterpriseTokenizationConstraintsEquals(a.constraints, b.constraints)
  );
}

/**
 * The single containment test this package exposes for "did the granted
 * authorization stay inside what was requested?" -- rights are a subset,
 * scope is contained, the executor is unchanged, and constraints did not
 * loosen. Every path that turns a request into a mandate is expected to
 * assert this; `20%` can never quietly become `100%` while it holds.
 */
export function enterpriseTokenizationTermsWithin(inner: EnterpriseTokenizationTerms, outer: EnterpriseTokenizationTerms): boolean {
  return (
    inner.rights.every((right) => outer.rights.includes(right)) &&
    enterpriseTokenizationScopeWithin(inner.scope, outer.scope) &&
    inner.executorRef === outer.executorRef &&
    enterpriseTokenizationConstraintsWithin(inner.constraints, outer.constraints)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseTokenizationTermsValidationCode =
  | 'MISSING_TERMS'
  | 'INVALID_TERMS'
  | 'MISSING_RIGHTS'
  | 'INVALID_RIGHTS'
  | 'EMPTY_RIGHTS'
  | 'DUPLICATE_RIGHTS'
  | 'MISSING_SCOPE'
  | 'INVALID_SCOPE_KIND'
  | 'INVALID_SCOPE_BASIS_POINTS'
  | 'INVALID_SCOPE_UNITS'
  | 'INVALID_SCOPE_UNIT_DENOMINATION'
  | 'MISSING_EXECUTOR_REF'
  | 'INVALID_EXECUTOR_REF'
  | 'MISSING_CONSTRAINTS'
  | 'INVALID_CONSTRAINTS'
  | 'INVALID_MAXIMUM_ISSUED_UNITS'
  | 'INVALID_PERMITTED_NETWORKS'
  | 'INVALID_PERMITTED_TOKEN_STANDARDS'
  | 'INVALID_PERMITTED_JURISDICTIONS'
  | 'INVALID_TRANSFER_RESTRICTED'
  | 'MISSING_ADDITIONAL_ISSUANCE_ALLOWED'
  | 'INVALID_ADDITIONAL_ISSUANCE_ALLOWED';

export interface EnterpriseTokenizationTermsValidationIssue {
  readonly code: EnterpriseTokenizationTermsValidationCode;
  readonly message: string;
}

/** Validates a candidate scope in isolation. Exposed because execution evidence carries a scope without carrying full terms. */
export function collectEnterpriseTokenizationScopeIssues(candidate: unknown, path: string): EnterpriseTokenizationTermsValidationIssue[] {
  const issues: EnterpriseTokenizationTermsValidationIssue[] = [];
  if (!isTokenizationPlainObject(candidate)) {
    issues.push({ code: 'MISSING_SCOPE', message: `${path} is required and must be an object.` });
    return issues;
  }
  if (candidate.kind === 'proportional') {
    if (!isTokenizationPositiveInteger(candidate.basisPoints) || candidate.basisPoints > ENTERPRISE_TOKENIZATION_FULL_BASIS_POINTS) {
      issues.push({
        code: 'INVALID_SCOPE_BASIS_POINTS',
        message: `${path}.basisPoints must be an integer between 1 and ${ENTERPRISE_TOKENIZATION_FULL_BASIS_POINTS} (basis points, never a floating-point percentage).`,
      });
    }
  } else if (candidate.kind === 'unitized') {
    if (!isTokenizationPositiveInteger(candidate.units)) {
      issues.push({ code: 'INVALID_SCOPE_UNITS', message: `${path}.units must be a positive integer.` });
    }
    if (!isTokenizationNonEmptyString(candidate.unitDenomination)) {
      issues.push({ code: 'INVALID_SCOPE_UNIT_DENOMINATION', message: `${path}.unitDenomination must be a non-empty string.` });
    }
  } else {
    issues.push({ code: 'INVALID_SCOPE_KIND', message: `${path}.kind must be 'proportional' or 'unitized'.` });
  }
  return issues;
}

function collectConstraintIssues(candidate: unknown, path: string): EnterpriseTokenizationTermsValidationIssue[] {
  const issues: EnterpriseTokenizationTermsValidationIssue[] = [];
  if (!isTokenizationPlainObject(candidate)) {
    issues.push({ code: 'MISSING_CONSTRAINTS', message: `${path} is required and must be an object.` });
    return issues;
  }
  if (candidate.maximumIssuedUnits !== undefined && !isTokenizationPositiveInteger(candidate.maximumIssuedUnits)) {
    issues.push({ code: 'INVALID_MAXIMUM_ISSUED_UNITS', message: `${path}.maximumIssuedUnits must be a positive integer when present.` });
  }
  const labelLists: readonly (readonly [string, EnterpriseTokenizationTermsValidationCode])[] = [
    ['permittedNetworks', 'INVALID_PERMITTED_NETWORKS'],
    ['permittedTokenStandards', 'INVALID_PERMITTED_TOKEN_STANDARDS'],
    ['permittedJurisdictions', 'INVALID_PERMITTED_JURISDICTIONS'],
  ];
  for (const [field, code] of labelLists) {
    const value = candidate[field];
    if (value === undefined) continue;
    if (!isTokenizationCanonicalIdArray(value) || value.length === 0) {
      issues.push({ code, message: `${path}.${field} must be a non-empty array of non-empty strings when present; omit it to declare no restriction.` });
    }
  }
  if (candidate.transferRestricted !== undefined && typeof candidate.transferRestricted !== 'boolean') {
    issues.push({ code: 'INVALID_TRANSFER_RESTRICTED', message: `${path}.transferRestricted must be a boolean when present.` });
  }
  if (candidate.additionalIssuanceAllowed === undefined) {
    issues.push({ code: 'MISSING_ADDITIONAL_ISSUANCE_ALLOWED', message: `${path}.additionalIssuanceAllowed is required; it has no safe default.` });
  } else if (typeof candidate.additionalIssuanceAllowed !== 'boolean') {
    issues.push({ code: 'INVALID_ADDITIONAL_ISSUANCE_ALLOWED', message: `${path}.additionalIssuanceAllowed must be a boolean.` });
  }
  return issues;
}

/** Validates a candidate `EnterpriseTokenizationTerms`. Accepts `unknown` so it can guard deserialized/external input. */
export function collectEnterpriseTokenizationTermsIssues(candidate: unknown, path = 'terms'): EnterpriseTokenizationTermsValidationIssue[] {
  if (!isTokenizationPlainObject(candidate)) {
    return [{ code: 'MISSING_TERMS', message: `${path} is required and must be an object.` }];
  }

  const issues: EnterpriseTokenizationTermsValidationIssue[] = [];

  if (candidate.rights === undefined) {
    issues.push({ code: 'MISSING_RIGHTS', message: `${path}.rights is required.` });
  } else if (!Array.isArray(candidate.rights) || !candidate.rights.every((right) => isEnterpriseTokenizedRightType(right))) {
    issues.push({ code: 'INVALID_RIGHTS', message: `${path}.rights must be an array of: ${RIGHT_TYPES.join(', ')}.` });
  } else if (candidate.rights.length === 0) {
    issues.push({ code: 'EMPTY_RIGHTS', message: `${path}.rights must name at least one right; 'tokenize the asset' is not an expressible authorization.` });
  } else if (new Set(candidate.rights).size !== candidate.rights.length) {
    issues.push({ code: 'DUPLICATE_RIGHTS', message: `${path}.rights must not repeat a right category.` });
  }

  issues.push(...collectEnterpriseTokenizationScopeIssues(candidate.scope, `${path}.scope`));

  if (!isTokenizationNonEmptyString(candidate.executorRef)) {
    issues.push({
      code: candidate.executorRef === undefined ? 'MISSING_EXECUTOR_REF' : 'INVALID_EXECUTOR_REF',
      message: `${path}.executorRef is required and must be a non-empty string.`,
    });
  }

  issues.push(...collectConstraintIssues(candidate.constraints, `${path}.constraints`));

  return issues;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseTokenizationTerms {
  readonly rights: readonly string[];
  readonly scope: EnterpriseTokenizationScope;
  readonly executorRef: string;
  readonly constraints: {
    readonly maximumIssuedUnits?: number;
    readonly permittedNetworks?: readonly string[];
    readonly permittedTokenStandards?: readonly string[];
    readonly permittedJurisdictions?: readonly string[];
    readonly transferRestricted?: boolean;
    readonly additionalIssuanceAllowed: boolean;
  };
}

function serializeScope(scope: EnterpriseTokenizationScope): EnterpriseTokenizationScope {
  return scope.kind === 'proportional'
    ? { kind: 'proportional', basisPoints: scope.basisPoints }
    : { kind: 'unitized', units: scope.units, unitDenomination: scope.unitDenomination };
}

/** Projects terms to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseTokenizationTerms(terms: EnterpriseTokenizationTerms): SerializedEnterpriseTokenizationTerms {
  const { constraints } = terms;
  return {
    rights: [...terms.rights].sort(),
    scope: serializeScope(terms.scope),
    executorRef: terms.executorRef,
    constraints: {
      ...(constraints.maximumIssuedUnits === undefined ? {} : { maximumIssuedUnits: constraints.maximumIssuedUnits }),
      ...(constraints.permittedNetworks === undefined ? {} : { permittedNetworks: [...constraints.permittedNetworks].sort() }),
      ...(constraints.permittedTokenStandards === undefined ? {} : { permittedTokenStandards: [...constraints.permittedTokenStandards].sort() }),
      ...(constraints.permittedJurisdictions === undefined ? {} : { permittedJurisdictions: [...constraints.permittedJurisdictions].sort() }),
      ...(constraints.transferRestricted === undefined ? {} : { transferRestricted: constraints.transferRestricted }),
      additionalIssuanceAllowed: constraints.additionalIssuanceAllowed,
    },
  };
}

/**
 * Maps an already-validated candidate onto `EnterpriseTokenizationTerms`.
 * Every field is read explicitly -- no structural cast over unchecked input,
 * matching the convention in `@aoc-enterprise/access-decision` and
 * `@aoc-enterprise/access-grant`.
 */
export function readEnterpriseTokenizationTerms(value: SerializedEnterpriseTokenizationTerms): EnterpriseTokenizationTerms {
  const scope = value.scope;
  return {
    rights: value.rights.map((right) => right as EnterpriseTokenizedRightType),
    scope: serializeScope(scope),
    executorRef: value.executorRef,
    constraints: {
      ...(value.constraints.maximumIssuedUnits === undefined ? {} : { maximumIssuedUnits: value.constraints.maximumIssuedUnits }),
      ...(value.constraints.permittedNetworks === undefined ? {} : { permittedNetworks: [...value.constraints.permittedNetworks] }),
      ...(value.constraints.permittedTokenStandards === undefined ? {} : { permittedTokenStandards: [...value.constraints.permittedTokenStandards] }),
      ...(value.constraints.permittedJurisdictions === undefined ? {} : { permittedJurisdictions: [...value.constraints.permittedJurisdictions] }),
      ...(value.constraints.transferRestricted === undefined ? {} : { transferRestricted: value.constraints.transferRestricted }),
      additionalIssuanceAllowed: value.constraints.additionalIssuanceAllowed,
    },
  };
}
