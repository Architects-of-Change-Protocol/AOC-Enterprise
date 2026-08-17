import type { CanonicalId } from '@aoc/protocol';
import { GOVERNED_RIGHTS_SCOPE_FULL_BASIS_POINTS, GOVERNED_RIGHT_TYPES, governedRightTypes, governedRightsScopeEquals, governedRightsScopeSum, governedRightsScopeWithin, isGovernedRightType, serializeGovernedRightsScope } from '@aoc-enterprise/governed-authorization';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

/**
 * The shared vocabulary of the `COLLATERALIZE` governed action: what a
 * collateralization authorization is *about* (rights), *how much of it* is
 * authorized (scope), *what it secures* (secured obligation), *for whose
 * benefit* (secured party), *who may carry it out* (executor), and *under
 * what declared limits* (constraints).
 *
 * `COLLATERALIZE` means: authorizing a specified executor to subject a
 * defined scope of specified rights associated with an already-governed
 * asset to an external collateral or security arrangement securing a
 * referenced obligation, under defined governance conditions.
 *
 * It is deliberately distinct from every neighbouring governed action -- see
 * `ENTERPRISE_ACTIONS_DISTINCT_FROM_COLLATERALIZE`. Three distinctions carry
 * real semantic weight and are not stylistic:
 *
 * - `COLLATERALIZE != TRANSFER`. Committing rights as collateral does not
 *   transfer ownership of them. Nothing in this package moves, assigns, or
 *   reassigns a right.
 * - `COLLATERALIZE != TOKENIZE`. Tokenization authorizes the creation of an
 *   external tokenized *representation* of rights; collateralization
 *   authorizes rights to be *committed as security* for an obligation. An
 *   asset may be either, both, or neither, and neither presupposes the other.
 * - `COLLATERALIZE != PROTOCOLIZE`. Protocolization establishes the governed
 *   identity/authority/evidence context; collateralization presupposes it.
 *
 * AOC Enterprise authorizes collateralization. It is not the lender, the
 * collateral agent, the registry, or the platform: nothing in this package
 * originates a loan, computes interest or loan-to-value, prices or values an
 * asset, creates or perfects a security interest, determines priority against
 * any real registry, liquidates or seizes anything, or contacts any external
 * system. `constraints` and the `external*` evidence fields carry
 * provider-neutral, opaque labels (a registry name, a jurisdiction code, an
 * agreement reference) that AOC records and compares as strings and never
 * interprets, resolves, or executes against.
 *
 * This is a pure data contract: no persistence, no service, no API, no
 * policy engine, no provider SDK, no execution. It follows the same
 * composition style as the R004 contract line
 * (`@aoc-enterprise/resource-envelope`, `access-decision`,
 * `access-obligation`, `access-grant`, `grant-revocation`, `usage-event`,
 * `evidence-correlation`, `tokenization-mandate`): closed vocabularies,
 * explicit validation codes, identity/structural equality, deterministic
 * serialization, and references to records owned elsewhere rather than
 * embeddings of them.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/collateralization-mandate`).
 */
export const ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION = '1.0.0' as const;

/**
 * The canonical governed-action identifier. Carried verbatim on
 * `ActionDescriptor.capability` when a `COLLATERALIZE` request is submitted
 * through the generalized governance evaluation path
 * (`POST /api/governance/evaluate` / `AocKernel.evaluate`), and matched
 * against `AuthorityGrant.capability` / `RecognitionCapabilityToken.capability`
 * by the existing authority and recognition runtimes. This package adds no
 * second authorization mechanism of its own.
 *
 * The field is named `capability` throughout the repository's internal
 * contracts; read `capability: 'collateralize'` as "the identifier of the
 * Governed Action `COLLATERALIZE`". The conceptual vocabulary (Governed
 * Action / Enforcement / Mandate) and the internal field name are allowed to
 * differ, and no repository-wide rename is implied.
 */
export const ENTERPRISE_COLLATERALIZE_CAPABILITY = 'collateralize' as const;

/**
 * The neighbouring governed actions `COLLATERALIZE` must never be conflated
 * with. Recorded as data (not prose alone) so the distinction is testable,
 * and enforced structurally by `validateEnterpriseCollateralizationRequest`,
 * which rejects any request whose `capability` is not exactly
 * `ENTERPRISE_COLLATERALIZE_CAPABILITY`.
 *
 * This is NOT an action registry: this repository deliberately treats
 * capability as an open string (see `AuthorityGrant.capability`), and this
 * list neither enumerates nor constrains what other actions may exist. It
 * records only which names are known to be *different* from this one --
 * including `release-collateral`, which is deliberately not implemented here
 * (see the package README, "Release and discharge").
 */
export const ENTERPRISE_ACTIONS_DISTINCT_FROM_COLLATERALIZE = [
  'protocolize',
  'register',
  'transfer',
  'license',
  'delegate',
  'tokenize',
  'commercialize',
  'release-collateral',
] as const;

/** Whether `capability` is exactly the `COLLATERALIZE` action identifier. Never a fuzzy/prefix match -- `'collateralize.partial'` is a different action. */
export function isEnterpriseCollateralizeCapability(capability: unknown): capability is typeof ENTERPRISE_COLLATERALIZE_CAPABILITY {
  return capability === ENTERPRISE_COLLATERALIZE_CAPABILITY;
}

/**
 * The canonical vocabulary of right categories that may be committed as
 * collateral. Each value describes *which governed rights' authority is
 * being exercised*, never a legal conclusion: `'ownership-interest'` records
 * that the authorized rights include an ownership interest, it does not
 * assert that anyone owns anything and it does not assert that the interest
 * is capable of being encumbered under any legal system. Ownership and
 * authority must already be established upstream by the primitives AOC
 * evaluates (Authority Graph), and AOC never infers either from the fact
 * that a request was submitted.
 *
 * Deliberately a closed union, consistent with every other governance
 * vocabulary in this contract line: the categories are stable,
 * provider-neutral, shared vocabulary, and a future category is a
 * `schemaVersion` change, not an escape hatch.
 *
 * The value set coincides exactly with `ENTERPRISE_TOKENIZED_RIGHT_TYPES` in
 * `@aoc-enterprise/tokenization-mandate`. That is a deliberate, recorded
 * duplication rather than a shared import: see the package README,
 * "Duplication with TOKENIZE, and why it is not yet extracted".
 */
export const ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES = GOVERNED_RIGHT_TYPES;

export type EnterpriseCollateralizableRightType = GovernedRightType;

/**
 * How much of the named rights an authorization covers.
 *
 * `'proportional'` expresses a share as an integer count of basis points
 * (1/100th of a percent), so 20% is `2000` and the whole is `10000`. An
 * integer basis-point count is used deliberately instead of a floating-point
 * percentage: `0.1 + 0.2 !== 0.3` in IEEE-754, and an economically
 * significant share must compare and sum exactly -- which matters more here
 * than it does for tokenization, because committed collateral scope is
 * *summed* across executions (see
 * `enterpriseCollateralizationScopeSum`). `'unitized'` expresses a fixed
 * count of named entitlement units for rights that are not naturally
 * proportional.
 *
 * A discriminated union rather than a bag of optional fields, so "a scope
 * that is somehow both 20% and 500 units" is unrepresentable.
 */
export type EnterpriseCollateralizationScope = GovernedRightsScope;

/** The whole of the named rights, expressed proportionally. Provided so "100%" never has to be spelled as a magic number at call sites. */
export const ENTERPRISE_COLLATERALIZATION_FULL_BASIS_POINTS = GOVERNED_RIGHTS_SCOPE_FULL_BASIS_POINTS;

/**
 * A declared monetary ceiling, expressed as an integer count of a currency's
 * minor units alongside an opaque currency label.
 *
 * This is deliberately *not* a money type, an accounting subsystem, or a
 * valuation: AOC performs no arithmetic on it beyond comparing two amounts of
 * the *same* currency label, never converts between currencies, never
 * discovers a rate, and never prices an asset. `currency` is an opaque string
 * AOC stores and compares -- amounts whose labels differ are simply not
 * comparable, and a comparison between them fails closed rather than being
 * coerced.
 *
 * Minor units are integers for the same reason basis points are: a
 * financially significant amount must compare exactly.
 */
export interface EnterpriseSecuredAmount {
  readonly minorUnits: number;
  readonly currency: string;
}

/**
 * Declared, provider-neutral limits a collateralization authorization
 * carries. Every field is a description AOC records and can compare; none is
 * an instruction AOC carries out, and none is interpreted against any real
 * registry, lender, or legal system.
 *
 * - `maximumSecuredAmount?` -- the declared ceiling on the obligation amount
 *   this collateral may secure. Compared per execution against the amount an
 *   external system reports; never summed, because the ceiling describes the
 *   secured obligation, not a running total. Absent means no declared ceiling.
 * - `permittedJurisdictions?` / `permittedRegistries?` -- opaque allow-lists
 *   of labels. Absent means "not restricted by this authorization", never
 *   "any value is endorsed". AOC does not resolve a registry, contact one, or
 *   assume one exists.
 * - `requiredPriorityRank?` -- the least senior ranking this authorization
 *   permits the external arrangement to take, as a positive integer where `1`
 *   is most senior. This records a *requirement placed on an external
 *   system* and is compared against what that system reports. It is not a
 *   claim that AOC determined, perfected, or can enforce priority anywhere.
 * - `exclusive?` -- records that the authorization declares the external
 *   arrangement must be an exclusive security interest. A declaration only:
 *   AOC cannot observe, and does not assume, what other interests exist over
 *   the asset. It never follows from this contract that an asset may carry
 *   only one collateral interest (see the package README, "Multiple interests
 *   are not prohibited").
 * - `releaseEvidenceRequired?` -- records that the authorization requires
 *   external release/discharge evidence to be reported back when the
 *   arrangement ends. A declaration AOC records and can audit against; it
 *   does not cause AOC to release anything.
 * - `additionalCollateralizationAllowed` -- required, because "may this be
 *   exercised more than once?" has no safe default. `false` means the
 *   authorization permits a single external collateralization.
 */
export interface EnterpriseCollateralizationConstraints {
  readonly maximumSecuredAmount?: EnterpriseSecuredAmount;
  readonly permittedJurisdictions?: readonly string[];
  readonly permittedRegistries?: readonly string[];
  readonly requiredPriorityRank?: number;
  readonly exclusive?: boolean;
  readonly releaseEvidenceRequired?: boolean;
  readonly additionalCollateralizationAllowed: boolean;
}

/**
 * The complete statement of *what exactly* is being authorized: which
 * rights, how much of them, securing which obligation, for whose benefit, by
 * whom, under what declared limits. Shared by
 * `EnterpriseCollateralizationRequest` (what was asked) and
 * `EnterpriseCollateralizationMandate` (what was granted) so the two can
 * never drift into two subtly different notions of "scope" -- see
 * `enterpriseCollateralizationTermsWithin`, the single comparison that
 * decides whether granted terms stayed inside requested terms.
 *
 * Four distinct parties/references appear across this contract and its
 * request, and conflating any two of them is precisely the substitution this
 * package exists to prevent:
 *
 * ```
 * requestedBy         who asks           (on the request/mandate)
 * securedPartyRef     who benefits       (the lender / collateral taker)
 * executorRef         who may perform    (the external platform/agent)
 * securedObligationRef what is secured   (not a party at all)
 * ```
 *
 * `securedObligationRef` is an opaque canonical pointer to an obligation
 * established elsewhere -- an external loan, a credit facility, a contractual
 * obligation, or another governed obligation. AOC does not originate that
 * obligation, does not evaluate whether it is legally valid or enforceable,
 * and does not resolve the reference. It preserves it because it is the
 * answer to "what is this collateral authorization securing?", and because an
 * execution that names a *different* obligation must be refused.
 *
 * `securedObligationKind?` is an optional opaque label describing that
 * obligation in the requester's own vocabulary. AOC never interprets it and
 * never derives anything from it; it exists so the reference is legible to a
 * reviewer without dereferencing it.
 *
 * `securedPartyRef` and `executorRef` are opaque pointers to party identities
 * established elsewhere, never provider credentials, endpoints, or clients.
 */
export interface EnterpriseCollateralizationTerms {
  readonly rights: readonly EnterpriseCollateralizableRightType[];
  readonly scope: EnterpriseCollateralizationScope;
  readonly securedObligationRef: CanonicalId;
  readonly securedObligationKind?: string;
  readonly securedPartyRef: CanonicalId;
  readonly executorRef: CanonicalId;
  readonly constraints: EnterpriseCollateralizationConstraints;
}

// ---------------------------------------------------------------------------
// Shared primitives. Kept in this module (rather than duplicated per
// contract file) so every contract in this package validates, compares, and
// serializes the same concepts identically.
// ---------------------------------------------------------------------------

export const ENTERPRISE_COLLATERALIZATION_ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isCollateralizationPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCollateralizationNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isCollateralizationTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ENTERPRISE_COLLATERALIZATION_ISO_8601_PATTERN.test(value);
}

export function isCollateralizationPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isCollateralizationCanonicalIdArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => isCollateralizationNonEmptyString(entry));
}

/** Sorted, duplicate-insensitive string-set equality. Reused wherever this package compares reference or label collections. */
export function collateralizationStringArrayEquals(a: readonly string[], b: readonly string[]): boolean {
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.length === bSorted.length && aSorted.every((value, index) => value === bSorted[index]);
}

export function collateralizationOptionalStringArrayEquals(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return collateralizationStringArrayEquals(a, b);
}

const RIGHT_TYPES: readonly EnterpriseCollateralizableRightType[] = governedRightTypes();

export function isEnterpriseCollateralizableRightType(value: unknown): value is EnterpriseCollateralizableRightType {
  return isGovernedRightType(value);
}

// ---------------------------------------------------------------------------
// Secured amount semantics
// ---------------------------------------------------------------------------

export function isEnterpriseSecuredAmount(value: unknown): value is EnterpriseSecuredAmount {
  return (
    isCollateralizationPlainObject(value) &&
    typeof value.minorUnits === 'number' &&
    Number.isSafeInteger(value.minorUnits) &&
    value.minorUnits >= 0 &&
    isCollateralizationNonEmptyString(value.currency)
  );
}

export function enterpriseSecuredAmountEquals(a: EnterpriseSecuredAmount | undefined, b: EnterpriseSecuredAmount | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.minorUnits === b.minorUnits && a.currency === b.currency;
}

/**
 * Whether `inner` does not exceed `outer`. Amounts in different currencies
 * are never comparable -- AOC holds no rate, and silently coercing between
 * currency labels is exactly the escalation this refusal prevents -- so a
 * currency mismatch is `false`, never a conversion.
 */
export function enterpriseSecuredAmountWithin(inner: EnterpriseSecuredAmount, outer: EnterpriseSecuredAmount): boolean {
  return inner.currency === outer.currency && inner.minorUnits <= outer.minorUnits;
}

// ---------------------------------------------------------------------------
// Scope semantics
// ---------------------------------------------------------------------------

export function enterpriseCollateralizationScopeEquals(a: EnterpriseCollateralizationScope, b: EnterpriseCollateralizationScope): boolean {
  return governedRightsScopeEquals(a, b);
}

/**
 * Whether `inner` is fully contained by `outer`. Scopes of different kinds
 * are never comparable: a proportional share and a unit count describe
 * different quantities, and silently coercing between them is exactly the
 * escalation this function exists to prevent. Unitized scopes must also
 * agree on `unitDenomination` -- 500 of one unit is not 500 of another.
 */
export function enterpriseCollateralizationScopeWithin(
  inner: EnterpriseCollateralizationScope,
  outer: EnterpriseCollateralizationScope,
): boolean {
  return governedRightsScopeWithin(inner, outer);
}

/**
 * Adds two commensurable scopes, or returns `null` when they are not
 * commensurable (different kinds, or unitized scopes with different
 * denominations).
 *
 * This has no analogue in the tokenization contracts and is the arithmetic
 * that makes cumulative collateral scope enforceable: an authorization for
 * 20% must refuse a *second* commitment of 15% even though 15% is, on its
 * own, inside 20%. Integer arithmetic only -- a `null` return is propagated
 * as a refusal by the caller, never as an assumed zero.
 */
export function enterpriseCollateralizationScopeSum(
  a: EnterpriseCollateralizationScope,
  b: EnterpriseCollateralizationScope,
): EnterpriseCollateralizationScope | null {
  return governedRightsScopeSum(a, b);
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
 * to prove that granted limits never loosened what was requested.
 *
 * `requiredPriorityRank` is the one field whose "narrower" direction is
 * numerically downward: rank `1` is the most senior position, so demanding a
 * rank of at most `1` is a stricter requirement than demanding at most `3`.
 */
export function enterpriseCollateralizationConstraintsWithin(
  inner: EnterpriseCollateralizationConstraints,
  outer: EnterpriseCollateralizationConstraints,
): boolean {
  if (outer.maximumSecuredAmount !== undefined) {
    if (inner.maximumSecuredAmount === undefined) return false;
    if (!enterpriseSecuredAmountWithin(inner.maximumSecuredAmount, outer.maximumSecuredAmount)) return false;
  }
  if (!labelListWithin(inner.permittedJurisdictions, outer.permittedJurisdictions)) return false;
  if (!labelListWithin(inner.permittedRegistries, outer.permittedRegistries)) return false;
  if (outer.requiredPriorityRank !== undefined) {
    if (inner.requiredPriorityRank === undefined || inner.requiredPriorityRank > outer.requiredPriorityRank) return false;
  }
  if (outer.exclusive === true && inner.exclusive !== true) return false;
  if (outer.releaseEvidenceRequired === true && inner.releaseEvidenceRequired !== true) return false;
  if (!outer.additionalCollateralizationAllowed && inner.additionalCollateralizationAllowed) return false;
  return true;
}

export function enterpriseCollateralizationConstraintsEquals(
  a: EnterpriseCollateralizationConstraints,
  b: EnterpriseCollateralizationConstraints,
): boolean {
  return (
    enterpriseSecuredAmountEquals(a.maximumSecuredAmount, b.maximumSecuredAmount) &&
    collateralizationOptionalStringArrayEquals(a.permittedJurisdictions, b.permittedJurisdictions) &&
    collateralizationOptionalStringArrayEquals(a.permittedRegistries, b.permittedRegistries) &&
    a.requiredPriorityRank === b.requiredPriorityRank &&
    a.exclusive === b.exclusive &&
    a.releaseEvidenceRequired === b.releaseEvidenceRequired &&
    a.additionalCollateralizationAllowed === b.additionalCollateralizationAllowed
  );
}

export function enterpriseCollateralizationTermsEquals(a: EnterpriseCollateralizationTerms, b: EnterpriseCollateralizationTerms): boolean {
  return (
    collateralizationStringArrayEquals(a.rights, b.rights) &&
    enterpriseCollateralizationScopeEquals(a.scope, b.scope) &&
    a.securedObligationRef === b.securedObligationRef &&
    a.securedObligationKind === b.securedObligationKind &&
    a.securedPartyRef === b.securedPartyRef &&
    a.executorRef === b.executorRef &&
    enterpriseCollateralizationConstraintsEquals(a.constraints, b.constraints)
  );
}

/**
 * The single containment test this package exposes for "did the granted
 * authorization stay inside what was requested?" -- rights are a subset,
 * scope is contained, the secured obligation, the secured party and the
 * executor are all unchanged, and constraints did not loosen. Every path that
 * turns a request into a mandate is expected to assert this; `20%` can never
 * quietly become `100%`, and Lender B can never quietly become Lender C,
 * while it holds.
 */
export function enterpriseCollateralizationTermsWithin(
  inner: EnterpriseCollateralizationTerms,
  outer: EnterpriseCollateralizationTerms,
): boolean {
  return (
    inner.rights.every((right) => outer.rights.includes(right)) &&
    enterpriseCollateralizationScopeWithin(inner.scope, outer.scope) &&
    inner.securedObligationRef === outer.securedObligationRef &&
    inner.securedObligationKind === outer.securedObligationKind &&
    inner.securedPartyRef === outer.securedPartyRef &&
    inner.executorRef === outer.executorRef &&
    enterpriseCollateralizationConstraintsWithin(inner.constraints, outer.constraints)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseCollateralizationTermsValidationCode =
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
  | 'MISSING_SECURED_OBLIGATION_REF'
  | 'INVALID_SECURED_OBLIGATION_REF'
  | 'INVALID_SECURED_OBLIGATION_KIND'
  | 'MISSING_SECURED_PARTY_REF'
  | 'INVALID_SECURED_PARTY_REF'
  | 'MISSING_EXECUTOR_REF'
  | 'INVALID_EXECUTOR_REF'
  | 'MISSING_CONSTRAINTS'
  | 'INVALID_CONSTRAINTS'
  | 'INVALID_MAXIMUM_SECURED_AMOUNT'
  | 'INVALID_PERMITTED_JURISDICTIONS'
  | 'INVALID_PERMITTED_REGISTRIES'
  | 'INVALID_REQUIRED_PRIORITY_RANK'
  | 'INVALID_EXCLUSIVE'
  | 'INVALID_RELEASE_EVIDENCE_REQUIRED'
  | 'MISSING_ADDITIONAL_COLLATERALIZATION_ALLOWED'
  | 'INVALID_ADDITIONAL_COLLATERALIZATION_ALLOWED';

export interface EnterpriseCollateralizationTermsValidationIssue {
  readonly code: EnterpriseCollateralizationTermsValidationCode;
  readonly message: string;
}

/** Validates a candidate scope in isolation. Exposed because execution evidence carries a scope without carrying full terms. */
export function collectEnterpriseCollateralizationScopeIssues(
  candidate: unknown,
  path: string,
): EnterpriseCollateralizationTermsValidationIssue[] {
  const issues: EnterpriseCollateralizationTermsValidationIssue[] = [];
  if (!isCollateralizationPlainObject(candidate)) {
    issues.push({ code: 'MISSING_SCOPE', message: `${path} is required and must be an object.` });
    return issues;
  }
  if (candidate.kind === 'proportional') {
    if (!isCollateralizationPositiveInteger(candidate.basisPoints) || candidate.basisPoints > ENTERPRISE_COLLATERALIZATION_FULL_BASIS_POINTS) {
      issues.push({
        code: 'INVALID_SCOPE_BASIS_POINTS',
        message: `${path}.basisPoints must be an integer between 1 and ${ENTERPRISE_COLLATERALIZATION_FULL_BASIS_POINTS} (basis points, never a floating-point percentage).`,
      });
    }
  } else if (candidate.kind === 'unitized') {
    if (!isCollateralizationPositiveInteger(candidate.units)) {
      issues.push({ code: 'INVALID_SCOPE_UNITS', message: `${path}.units must be a positive integer.` });
    }
    if (!isCollateralizationNonEmptyString(candidate.unitDenomination)) {
      issues.push({ code: 'INVALID_SCOPE_UNIT_DENOMINATION', message: `${path}.unitDenomination must be a non-empty string.` });
    }
  } else {
    issues.push({ code: 'INVALID_SCOPE_KIND', message: `${path}.kind must be 'proportional' or 'unitized'.` });
  }
  return issues;
}

function collectConstraintIssues(candidate: unknown, path: string): EnterpriseCollateralizationTermsValidationIssue[] {
  const issues: EnterpriseCollateralizationTermsValidationIssue[] = [];
  if (!isCollateralizationPlainObject(candidate)) {
    issues.push({ code: 'MISSING_CONSTRAINTS', message: `${path} is required and must be an object.` });
    return issues;
  }
  if (candidate.maximumSecuredAmount !== undefined && !isEnterpriseSecuredAmount(candidate.maximumSecuredAmount)) {
    issues.push({
      code: 'INVALID_MAXIMUM_SECURED_AMOUNT',
      message: `${path}.maximumSecuredAmount must be { minorUnits: a non-negative integer, currency: a non-empty opaque label } when present; AOC records and compares it and never converts between currencies.`,
    });
  }
  const labelLists: readonly (readonly [string, EnterpriseCollateralizationTermsValidationCode])[] = [
    ['permittedJurisdictions', 'INVALID_PERMITTED_JURISDICTIONS'],
    ['permittedRegistries', 'INVALID_PERMITTED_REGISTRIES'],
  ];
  for (const [field, code] of labelLists) {
    const value = candidate[field];
    if (value === undefined) continue;
    if (!isCollateralizationCanonicalIdArray(value) || value.length === 0) {
      issues.push({ code, message: `${path}.${field} must be a non-empty array of non-empty strings when present; omit it to declare no restriction.` });
    }
  }
  if (candidate.requiredPriorityRank !== undefined && !isCollateralizationPositiveInteger(candidate.requiredPriorityRank)) {
    issues.push({
      code: 'INVALID_REQUIRED_PRIORITY_RANK',
      message: `${path}.requiredPriorityRank must be a positive integer when present (1 is the most senior ranking); it records a requirement placed on an external system, not a priority AOC determined.`,
    });
  }
  if (candidate.exclusive !== undefined && typeof candidate.exclusive !== 'boolean') {
    issues.push({ code: 'INVALID_EXCLUSIVE', message: `${path}.exclusive must be a boolean when present.` });
  }
  if (candidate.releaseEvidenceRequired !== undefined && typeof candidate.releaseEvidenceRequired !== 'boolean') {
    issues.push({ code: 'INVALID_RELEASE_EVIDENCE_REQUIRED', message: `${path}.releaseEvidenceRequired must be a boolean when present.` });
  }
  if (candidate.additionalCollateralizationAllowed === undefined) {
    issues.push({
      code: 'MISSING_ADDITIONAL_COLLATERALIZATION_ALLOWED',
      message: `${path}.additionalCollateralizationAllowed is required; it has no safe default.`,
    });
  } else if (typeof candidate.additionalCollateralizationAllowed !== 'boolean') {
    issues.push({ code: 'INVALID_ADDITIONAL_COLLATERALIZATION_ALLOWED', message: `${path}.additionalCollateralizationAllowed must be a boolean.` });
  }
  return issues;
}

/** Validates a candidate `EnterpriseCollateralizationTerms`. Accepts `unknown` so it can guard deserialized/external input. */
export function collectEnterpriseCollateralizationTermsIssues(
  candidate: unknown,
  path = 'terms',
): EnterpriseCollateralizationTermsValidationIssue[] {
  if (!isCollateralizationPlainObject(candidate)) {
    return [{ code: 'MISSING_TERMS', message: `${path} is required and must be an object.` }];
  }

  const issues: EnterpriseCollateralizationTermsValidationIssue[] = [];

  if (candidate.rights === undefined) {
    issues.push({ code: 'MISSING_RIGHTS', message: `${path}.rights is required.` });
  } else if (!Array.isArray(candidate.rights) || !candidate.rights.every((right) => isEnterpriseCollateralizableRightType(right))) {
    issues.push({ code: 'INVALID_RIGHTS', message: `${path}.rights must be an array of: ${RIGHT_TYPES.join(', ')}.` });
  } else if (candidate.rights.length === 0) {
    issues.push({
      code: 'EMPTY_RIGHTS',
      message: `${path}.rights must name at least one right; 'collateralize the asset' is not an expressible authorization.`,
    });
  } else if (new Set(candidate.rights).size !== candidate.rights.length) {
    issues.push({ code: 'DUPLICATE_RIGHTS', message: `${path}.rights must not repeat a right category.` });
  }

  issues.push(...collectEnterpriseCollateralizationScopeIssues(candidate.scope, `${path}.scope`));

  if (!isCollateralizationNonEmptyString(candidate.securedObligationRef)) {
    issues.push({
      code: candidate.securedObligationRef === undefined ? 'MISSING_SECURED_OBLIGATION_REF' : 'INVALID_SECURED_OBLIGATION_REF',
      message: `${path}.securedObligationRef is required and must be a non-empty string; a collateralization authorization must record what it secures.`,
    });
  }

  if (candidate.securedObligationKind !== undefined && !isCollateralizationNonEmptyString(candidate.securedObligationKind)) {
    issues.push({ code: 'INVALID_SECURED_OBLIGATION_KIND', message: `${path}.securedObligationKind must be a non-empty opaque label when present.` });
  }

  if (!isCollateralizationNonEmptyString(candidate.securedPartyRef)) {
    issues.push({
      code: candidate.securedPartyRef === undefined ? 'MISSING_SECURED_PARTY_REF' : 'INVALID_SECURED_PARTY_REF',
      message: `${path}.securedPartyRef is required and must be a non-empty string; it is distinct from the requester, the asset authority, and the executor.`,
    });
  }

  if (!isCollateralizationNonEmptyString(candidate.executorRef)) {
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

export interface SerializedEnterpriseCollateralizationTerms {
  readonly rights: readonly string[];
  readonly scope: EnterpriseCollateralizationScope;
  readonly securedObligationRef: string;
  readonly securedObligationKind?: string;
  readonly securedPartyRef: string;
  readonly executorRef: string;
  readonly constraints: {
    readonly maximumSecuredAmount?: EnterpriseSecuredAmount;
    readonly permittedJurisdictions?: readonly string[];
    readonly permittedRegistries?: readonly string[];
    readonly requiredPriorityRank?: number;
    readonly exclusive?: boolean;
    readonly releaseEvidenceRequired?: boolean;
    readonly additionalCollateralizationAllowed: boolean;
  };
}

/** Projects a scope to a plain, field-ordered object. Shared by every contract in this package that carries a scope. */
export function serializeEnterpriseCollateralizationScope(scope: EnterpriseCollateralizationScope): EnterpriseCollateralizationScope {
  return serializeGovernedRightsScope(scope);
}

function serializeSecuredAmount(amount: EnterpriseSecuredAmount): EnterpriseSecuredAmount {
  return { minorUnits: amount.minorUnits, currency: amount.currency };
}

/** Projects terms to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseCollateralizationTerms(terms: EnterpriseCollateralizationTerms): SerializedEnterpriseCollateralizationTerms {
  const { constraints } = terms;
  return {
    rights: [...terms.rights].sort(),
    scope: serializeEnterpriseCollateralizationScope(terms.scope),
    securedObligationRef: terms.securedObligationRef,
    ...(terms.securedObligationKind === undefined ? {} : { securedObligationKind: terms.securedObligationKind }),
    securedPartyRef: terms.securedPartyRef,
    executorRef: terms.executorRef,
    constraints: {
      ...(constraints.maximumSecuredAmount === undefined ? {} : { maximumSecuredAmount: serializeSecuredAmount(constraints.maximumSecuredAmount) }),
      ...(constraints.permittedJurisdictions === undefined ? {} : { permittedJurisdictions: [...constraints.permittedJurisdictions].sort() }),
      ...(constraints.permittedRegistries === undefined ? {} : { permittedRegistries: [...constraints.permittedRegistries].sort() }),
      ...(constraints.requiredPriorityRank === undefined ? {} : { requiredPriorityRank: constraints.requiredPriorityRank }),
      ...(constraints.exclusive === undefined ? {} : { exclusive: constraints.exclusive }),
      ...(constraints.releaseEvidenceRequired === undefined ? {} : { releaseEvidenceRequired: constraints.releaseEvidenceRequired }),
      additionalCollateralizationAllowed: constraints.additionalCollateralizationAllowed,
    },
  };
}

/**
 * Maps an already-validated candidate onto `EnterpriseCollateralizationTerms`.
 * Every field is read explicitly -- no structural cast over unchecked input,
 * matching the convention in `@aoc-enterprise/access-decision`,
 * `@aoc-enterprise/access-grant` and `@aoc-enterprise/tokenization-mandate`.
 */
export function readEnterpriseCollateralizationTerms(value: SerializedEnterpriseCollateralizationTerms): EnterpriseCollateralizationTerms {
  return {
    rights: value.rights.map((right) => right as EnterpriseCollateralizableRightType),
    scope: serializeEnterpriseCollateralizationScope(value.scope),
    securedObligationRef: value.securedObligationRef,
    ...(value.securedObligationKind === undefined ? {} : { securedObligationKind: value.securedObligationKind }),
    securedPartyRef: value.securedPartyRef,
    executorRef: value.executorRef,
    constraints: {
      ...(value.constraints.maximumSecuredAmount === undefined
        ? {}
        : { maximumSecuredAmount: serializeSecuredAmount(value.constraints.maximumSecuredAmount) }),
      ...(value.constraints.permittedJurisdictions === undefined ? {} : { permittedJurisdictions: [...value.constraints.permittedJurisdictions] }),
      ...(value.constraints.permittedRegistries === undefined ? {} : { permittedRegistries: [...value.constraints.permittedRegistries] }),
      ...(value.constraints.requiredPriorityRank === undefined ? {} : { requiredPriorityRank: value.constraints.requiredPriorityRank }),
      ...(value.constraints.exclusive === undefined ? {} : { exclusive: value.constraints.exclusive }),
      ...(value.constraints.releaseEvidenceRequired === undefined ? {} : { releaseEvidenceRequired: value.constraints.releaseEvidenceRequired }),
      additionalCollateralizationAllowed: value.constraints.additionalCollateralizationAllowed,
    },
  };
}
