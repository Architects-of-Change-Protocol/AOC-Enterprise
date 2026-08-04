import type { CanonicalId } from '@aoc/protocol';

/**
 * Enterprise composition over `EnterpriseAccessDecision`
 * (`@aoc-enterprise/access-decision`).
 *
 * `EnterpriseAccessDecision` answers "can access occur?" (`outcome: 'allow' |
 * 'deny' | 'conditional'`). It does not, and must not, answer "under what
 * mandatory conditions?" -- see that package's README, "Decision semantics":
 * `outcome` deliberately reuses Protocol's bare three-state `PolicyDecision`
 * rather than the Enterprise-local `EnterprisePolicyDecision`
 * (`@aoc-enterprise/policy-runtime`) specifically *because* the latter's
 * `obligations` field is execution-shaped state that must never appear on an
 * immutable evaluation record. `EnterpriseAccessObligation` is the contract
 * that answers the second question without smuggling execution back into the
 * first: a mandatory or optional condition that accompanies a decision,
 * referencing it by `decisionRef` rather than embedding it.
 *
 * This is a pure data contract: no persistence, no service, no API, no
 * policy engine, no execution, no MFA, no watermarking, no download
 * restriction, no provider, no adapter, no runtime enforcement, no grant.
 * `EnterpriseAccessObligation` records that a condition must (or may)
 * accompany a decision; it never carries out that condition.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/access-obligation`).
 *
 * See the package README for the full design rationale, including why
 * neither `CanonicalObligation` (`@aoc-enterprise/canonical-runtime-contracts`),
 * `EnterprisePolicyObligation` (`@aoc-enterprise/policy-runtime`), nor
 * `PolicyObligation` (`src/features/domain-policy-pack-runtime`) was reused
 * or extended.
 */
export const ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION = '1.0.0' as const;

/**
 * The canonical, minimum-required vocabulary of declarative obligation
 * categories, taken directly from this sequence's evidence (R004.F Phase 5).
 * Each is a *description* of a mandatory condition, never an instruction to
 * carry it out: `'require-mfa'` records that multi-factor authentication is
 * a condition of the decision, it does not perform MFA; `'watermark-content'`
 * records that content must be watermarked before it is rendered, it does
 * not watermark anything; `'no-download'` and `'read-only'` record access
 * restrictions, they do not enforce them. A future provider adapter or
 * approval/enforcement engine interprets these categories -- this contract
 * does not, and cannot, act on them itself (see "Future integration path" in
 * the README).
 *
 * This is deliberately a closed union, not an open string: the categories
 * are stable, provider-neutral, and shared vocabulary (mirroring the closed
 * `EnterpriseResourceLifecycleState` and `EnterpriseResourceIntegrity.algorithm`
 * unions in `@aoc-enterprise/resource-envelope`), not a provider-specific
 * enum (see "Non-negotiable rules" -- no provider-specific obligation types).
 * A future category is a `schemaVersion` change, not an escape hatch.
 */
export const ENTERPRISE_ACCESS_OBLIGATION_TYPES = {
  REQUIRE_APPROVAL: 'require-approval',
  REQUIRE_MFA: 'require-mfa',
  RECORD_USAGE: 'record-usage',
  WATERMARK_CONTENT: 'watermark-content',
  READ_ONLY: 'read-only',
  TIME_LIMIT: 'time-limit',
  NO_DOWNLOAD: 'no-download',
  REQUIRE_ACCEPTANCE: 'require-acceptance',
} as const;

export type EnterpriseAccessObligationType =
  (typeof ENTERPRISE_ACCESS_OBLIGATION_TYPES)[keyof typeof ENTERPRISE_ACCESS_OBLIGATION_TYPES];

/**
 * Coarse, stable severity bucket, reused verbatim from the vocabulary
 * already established for evaluation-adjacent records in this repository
 * (`PolicyEvaluation.severity` in `src/kernel/contracts/kernel-result.ts`;
 * `PolicyPackRule.severity` in
 * `src/features/domain-policy-pack-runtime/domain/policy-pack-rule.ts`).
 * Optional: not every obligation carries a severity judgment (Phase 3:
 * "severity (if repository evidence supports it)") -- the vocabulary is
 * reused because evidence supports it, but no obligation is required to set
 * it.
 */
export type EnterpriseAccessObligationSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * A parameter value carried by an obligation's `parameters` bag. Restricted
 * to JSON primitives -- never an object, array, function, or class instance
 * -- so `parameters` can never smuggle a runtime object, a provider client,
 * or a nested credential-shaped value through the one genuinely open
 * extension point this contract has (see `validateEnterpriseAccessObligation`'s
 * `FORBIDDEN_PARAMETER_KEY` check for the complementary guard on parameter
 * *names*).
 */
export type EnterpriseAccessObligationParameterValue = string | number | boolean;

/**
 * The canonical Enterprise-owned contract for **a mandatory or optional
 * condition attached to an evaluated `EnterpriseAccessDecision`**. See the
 * package README for the full design rationale, ownership boundary, and
 * relationship to `EnterpriseAccessDecision`, a future `AccessGrant`,
 * `UsageEvent`, and provider adapters.
 *
 * Field groups (R004.F Phase 3):
 * - `id` -- obligation identity. Immutable and unique within any collection
 *   of obligations attached to the same decision (see
 *   `validateEnterpriseAccessObligationSet`'s `DUPLICATE_OBLIGATION_ID`).
 * - `type` -- obligation category, from the canonical, provider-neutral
 *   `EnterpriseAccessObligationType` vocabulary.
 * - `mandatory` -- whether this condition must be satisfied (`true`) or is
 *   merely advisory (`false`). This contract never decides *whether* access
 *   proceeds if a mandatory obligation goes unsatisfied -- that is a future
 *   approval/enforcement engine's job, not this record's.
 * - `decisionRef` -- an opaque pointer to the `EnterpriseAccessDecision`
 *   this obligation accompanies (that decision's own `correlationId`).
 *   A reference, never an embedding: this contract does not know or assume
 *   the shape of `EnterpriseAccessDecision`, matching the reference style
 *   `EnterpriseAccessDecision.policyEvaluationRef`/`evidenceRefs` already
 *   establish for pointing at records owned elsewhere.
 * - `severity?` -- optional coarse severity bucket, reused from existing
 *   repository vocabulary (see `EnterpriseAccessObligationSeverity`).
 * - `parameters?` -- obligation-specific, provider-neutral parameters (e.g.
 *   a `'time-limit'` obligation's duration). Restricted to JSON primitives
 *   and to parameter names that do not resemble a credential, token, or URL
 *   (see `validateEnterpriseAccessObligation`).
 * - `description?` -- optional human-readable documentation metadata,
 *   mirroring the `reason?: string` precedent on `EnterpriseAccessDecision`.
 * - `evidenceRefs?` -- opaque pointers to evidence records that informed
 *   this obligation, mirroring `EnterpriseAccessDecision.evidenceRefs`.
 */
export interface EnterpriseAccessObligation {
  readonly schemaVersion: typeof ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION;
  readonly id: CanonicalId;
  readonly type: EnterpriseAccessObligationType;
  readonly mandatory: boolean;
  readonly decisionRef: CanonicalId;
  readonly severity?: EnterpriseAccessObligationSeverity;
  readonly parameters?: Readonly<Record<string, EnterpriseAccessObligationParameterValue>>;
  readonly description?: string;
  readonly evidenceRefs?: readonly CanonicalId[];
}

// ---------------------------------------------------------------------------
// Identity equality -- derives from obligation identity alone (Phase 3's
// "obligation identity" field), the same pattern
// `enterpriseResourceEnvelopeIdentityEquals`/`enterpriseAccessDecisionIdentityEquals`
// establish: identity equality is always a strict subset of full structural
// equality, never a second, independently invented notion of "the same
// obligation."
// ---------------------------------------------------------------------------

/** Whether two obligations represent the same declared condition, by `id` alone. Two obligations can share identity while disagreeing on every other field (e.g. a corrected `description` recorded after the fact) -- see `enterpriseAccessObligationEquals` for full structural equality. */
export function enterpriseAccessObligationIdentityEquals(a: EnterpriseAccessObligation, b: EnterpriseAccessObligation): boolean {
  return a.id === b.id;
}

function parametersEqual(
  a: Readonly<Record<string, EnterpriseAccessObligationParameterValue>> | undefined,
  b: Readonly<Record<string, EnterpriseAccessObligationParameterValue>> | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function optionalCanonicalIdArrayEquals(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.length === bSorted.length && aSorted.every((value, index) => value === bSorted[index]);
}

/**
 * Full structural equality: identity (via `enterpriseAccessObligationIdentityEquals`)
 * plus every other field -- `type`, `mandatory`, `decisionRef`, `severity`,
 * `parameters`, `description`, `evidenceRefs`. This satisfies Phase 8's
 * required basis ("obligation identity, type, parameters") and extends it to
 * every remaining declarative field, exactly as `enterpriseResourceEnvelopeEquals`
 * and `enterpriseAccessDecisionEquals` extend their own identity functions to
 * full structural equality. Phase 8's "do not derive equality from runtime
 * execution" is satisfied structurally, not by omission: this contract has
 * no execution-shaped field to exclude in the first place.
 */
export function enterpriseAccessObligationEquals(a: EnterpriseAccessObligation, b: EnterpriseAccessObligation): boolean {
  return (
    enterpriseAccessObligationIdentityEquals(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.type === b.type &&
    a.mandatory === b.mandatory &&
    a.decisionRef === b.decisionRef &&
    a.severity === b.severity &&
    parametersEqual(a.parameters, b.parameters) &&
    a.description === b.description &&
    optionalCanonicalIdArrayEquals(a.evidenceRefs, b.evidenceRefs)
  );
}

// ---------------------------------------------------------------------------
// Validation -- internal consistency, required fields, parameter shape
// consistency, and invalid parameter combinations only (Phase 6). No
// provider validation, no network validation, no user/role/permission
// validation, no runtime-state validation.
// ---------------------------------------------------------------------------

export type EnterpriseAccessObligationValidationCode =
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'MISSING_ID'
  | 'INVALID_ID'
  | 'MISSING_TYPE'
  | 'INVALID_TYPE'
  | 'MISSING_MANDATORY'
  | 'INVALID_MANDATORY'
  | 'MISSING_DECISION_REF'
  | 'INVALID_DECISION_REF'
  | 'INVALID_SEVERITY'
  | 'INVALID_PARAMETERS'
  | 'FORBIDDEN_PARAMETER_KEY'
  | 'INVALID_DESCRIPTION'
  | 'INVALID_EVIDENCE_REFS';

export interface EnterpriseAccessObligationValidationIssue {
  readonly code: EnterpriseAccessObligationValidationCode;
  readonly message: string;
}

export type EnterpriseAccessObligationValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseAccessObligationValidationIssue[] };

const OBLIGATION_TYPES: readonly EnterpriseAccessObligationType[] = Object.values(ENTERPRISE_ACCESS_OBLIGATION_TYPES);
const OBLIGATION_SEVERITIES: readonly EnterpriseAccessObligationSeverity[] = ['info', 'warning', 'error', 'critical'];

/**
 * Substrings of a parameter *name* that indicate a credential, token, or
 * URL/link is being smuggled through the one open extension point this
 * contract has (`parameters` is intentionally a provider-neutral
 * `Record<string, primitive>`, per Phase 3 -- unlike every other field on
 * this contract, TypeScript's excess-property checking cannot police its
 * keys). Matched case-insensitively as a substring, not an exact key match,
 * so `apiKey`, `pinataApiKey`, and `x-api-key` are all caught. This is the
 * runtime complement to the compile-time `@ts-expect-error` proofs in
 * `__tests__/enterprise-access-obligation.test.ts` -- those prove the
 * top-level shape cannot carry these concepts; this proves the one
 * structurally-open field cannot either.
 */
const FORBIDDEN_PARAMETER_KEY_SUBSTRINGS = [
  'apikey',
  'api-key',
  'token',
  'jwt',
  'credential',
  'password',
  'secret',
  'bearer',
  'url',
  'accesskey',
  'sessionid',
  'cookie',
];

function isForbiddenParameterKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return FORBIDDEN_PARAMETER_KEY_SUBSTRINGS.some((forbidden) => normalized.includes(forbidden));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isParameterValue(value: unknown): value is EnterpriseAccessObligationParameterValue {
  return (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)));
}

/**
 * Validates internal consistency of a single candidate obligation. Accepts
 * `unknown` so it can guard deserialized/external input, not just
 * already-typed values. Never inspects `decisionRef`/`evidenceRefs` for
 * existence, never checks `type` against what a provider can actually
 * fulfill, and never evaluates whether `mandatory` obligations were
 * satisfied -- only shape, required-field, and parameter consistency. See
 * `validateEnterpriseAccessObligationSet` for duplicate-obligation detection
 * across a collection, which this function -- operating on one obligation at
 * a time -- cannot express.
 */
export function validateEnterpriseAccessObligation(candidate: unknown): EnterpriseAccessObligationValidationResult {
  const errors: EnterpriseAccessObligationValidationIssue[] = [];

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: [{ code: 'MISSING_ID', message: 'Obligation must be an object.' }] };
  }

  if (candidate.schemaVersion !== ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION) {
    errors.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `schemaVersion must be '${ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION}'.`,
    });
  }

  if (!isNonEmptyString(candidate.id)) {
    errors.push({ code: candidate.id === undefined ? 'MISSING_ID' : 'INVALID_ID', message: 'id is required and must be a non-empty string.' });
  }

  if (candidate.type === undefined) {
    errors.push({ code: 'MISSING_TYPE', message: 'type is required.' });
  } else if (typeof candidate.type !== 'string' || !OBLIGATION_TYPES.includes(candidate.type as EnterpriseAccessObligationType)) {
    errors.push({ code: 'INVALID_TYPE', message: `type must be one of: ${OBLIGATION_TYPES.join(', ')}.` });
  }

  if (candidate.mandatory === undefined) {
    errors.push({ code: 'MISSING_MANDATORY', message: 'mandatory is required.' });
  } else if (typeof candidate.mandatory !== 'boolean') {
    errors.push({ code: 'INVALID_MANDATORY', message: 'mandatory must be a boolean.' });
  }

  if (!isNonEmptyString(candidate.decisionRef)) {
    errors.push({
      code: candidate.decisionRef === undefined ? 'MISSING_DECISION_REF' : 'INVALID_DECISION_REF',
      message: 'decisionRef is required and must be a non-empty string.',
    });
  }

  if (candidate.severity !== undefined) {
    if (typeof candidate.severity !== 'string' || !OBLIGATION_SEVERITIES.includes(candidate.severity as EnterpriseAccessObligationSeverity)) {
      errors.push({ code: 'INVALID_SEVERITY', message: `severity must be one of: ${OBLIGATION_SEVERITIES.join(', ')}, when present.` });
    }
  }

  if (candidate.parameters !== undefined) {
    if (!isPlainObject(candidate.parameters)) {
      errors.push({ code: 'INVALID_PARAMETERS', message: 'parameters must be a plain object when present.' });
    } else {
      for (const [key, value] of Object.entries(candidate.parameters)) {
        if (!isParameterValue(value)) {
          errors.push({
            code: 'INVALID_PARAMETERS',
            message: `parameters.${key} must be a string, a finite number, or a boolean.`,
          });
        }
        if (isForbiddenParameterKey(key)) {
          errors.push({
            code: 'FORBIDDEN_PARAMETER_KEY',
            message: `parameters key '${key}' resembles a credential, token, or URL and is not permitted; obligations are declarative and provider-neutral.`,
          });
        }
      }
    }
  }

  if (candidate.description !== undefined && !isNonEmptyString(candidate.description)) {
    errors.push({ code: 'INVALID_DESCRIPTION', message: 'description must be a non-empty string when present.' });
  }

  if (candidate.evidenceRefs !== undefined) {
    if (!Array.isArray(candidate.evidenceRefs) || !candidate.evidenceRefs.every((ref) => isNonEmptyString(ref))) {
      errors.push({ code: 'INVALID_EVIDENCE_REFS', message: 'evidenceRefs must be an array of non-empty strings when present.' });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Duplicate detection -- operates on a collection, not a single obligation
// (Phase 6: "duplicate obligations"). An obligation collection (e.g. every
// obligation attached to one EnterpriseAccessDecision) must not declare the
// same obligation identity twice.
// ---------------------------------------------------------------------------

export type EnterpriseAccessObligationSetValidationCode = 'DUPLICATE_OBLIGATION_ID';

export interface EnterpriseAccessObligationSetValidationIssue {
  readonly code: EnterpriseAccessObligationSetValidationCode;
  readonly message: string;
}

export type EnterpriseAccessObligationSetValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly EnterpriseAccessObligationSetValidationIssue[] };

/**
 * Validates that no two obligations in `obligations` share the same `id`.
 * Deliberately a separate function from `validateEnterpriseAccessObligation`:
 * "duplicate" is a property of a collection, not of any single obligation,
 * so it cannot be expressed by that function's per-candidate signature.
 * Does not check individual obligation shape -- call
 * `validateEnterpriseAccessObligation` for that.
 */
export function validateEnterpriseAccessObligationSet(
  obligations: readonly EnterpriseAccessObligation[],
): EnterpriseAccessObligationSetValidationResult {
  const seen = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const obligation of obligations) {
    if (seen.has(obligation.id)) {
      duplicateIds.add(obligation.id);
    }
    seen.add(obligation.id);
  }

  if (duplicateIds.size === 0) {
    return { valid: true };
  }

  const errors: EnterpriseAccessObligationSetValidationIssue[] = [...duplicateIds]
    .sort()
    .map((id) => ({ code: 'DUPLICATE_OBLIGATION_ID' as const, message: `Obligation id '${id}' appears more than once in the set.` }));

  return { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Serialization -- stable, deterministic, provider-neutral, round-trip safe,
// version-friendly (Phase 7).
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseAccessObligation {
  readonly schemaVersion: string;
  readonly id: string;
  readonly type: string;
  readonly mandatory: boolean;
  readonly decisionRef: string;
  readonly severity?: string;
  readonly parameters?: Readonly<Record<string, EnterpriseAccessObligationParameterValue>>;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
}

function sortedParameters(
  parameters: Readonly<Record<string, EnterpriseAccessObligationParameterValue>> | undefined,
): Readonly<Record<string, EnterpriseAccessObligationParameterValue>> | undefined {
  if (parameters === undefined) return undefined;
  const sorted: Record<string, EnterpriseAccessObligationParameterValue> = {};
  for (const key of Object.keys(parameters).sort()) {
    sorted[key] = parameters[key] as EnterpriseAccessObligationParameterValue;
  }
  return sorted;
}

/** Projects an `EnterpriseAccessObligation` to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already a valid `EnterpriseAccessObligation` by construction. */
export function serializeEnterpriseAccessObligation(obligation: EnterpriseAccessObligation): SerializedEnterpriseAccessObligation {
  const parameters = sortedParameters(obligation.parameters);
  const evidenceRefs = obligation.evidenceRefs === undefined ? undefined : [...obligation.evidenceRefs].sort();

  return {
    schemaVersion: obligation.schemaVersion,
    id: obligation.id,
    type: obligation.type,
    mandatory: obligation.mandatory,
    decisionRef: obligation.decisionRef,
    ...(obligation.severity === undefined ? {} : { severity: obligation.severity }),
    ...(parameters === undefined ? {} : { parameters }),
    ...(obligation.description === undefined ? {} : { description: obligation.description }),
    ...(evidenceRefs === undefined ? {} : { evidenceRefs }),
  };
}

/**
 * Thrown by `deserializeEnterpriseAccessObligation` when the input fails
 * `validateEnterpriseAccessObligation`. Carries the full issue list rather
 * than just the first, matching `EnterpriseAccessObligationValidationResult`.
 */
export class EnterpriseAccessObligationValidationError extends Error {
  readonly issues: readonly EnterpriseAccessObligationValidationIssue[];

  constructor(issues: readonly EnterpriseAccessObligationValidationIssue[]) {
    super(`Invalid EnterpriseAccessObligation: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'EnterpriseAccessObligationValidationError';
    this.issues = issues;
  }
}

/**
 * Parses and validates a candidate value (e.g. `JSON.parse` output) into an
 * `EnterpriseAccessObligation`. Every field is mapped explicitly from the
 * validated candidate -- no structural cast (`as EnterpriseAccessObligation`)
 * over unchecked input, matching the convention already established in
 * `@aoc-enterprise/resource-envelope` and `@aoc-enterprise/access-decision`.
 *
 * Throws `EnterpriseAccessObligationValidationError` when validation fails.
 */
export function deserializeEnterpriseAccessObligation(candidate: unknown): EnterpriseAccessObligation {
  const result = validateEnterpriseAccessObligation(candidate);
  if (!result.valid) {
    throw new EnterpriseAccessObligationValidationError(result.errors);
  }

  // Validated above: `candidate` has the required shape of a
  // SerializedEnterpriseAccessObligation. Read through a narrow local view
  // instead of casting the whole object to EnterpriseAccessObligation.
  const value = candidate as SerializedEnterpriseAccessObligation;

  return {
    schemaVersion: ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION,
    id: value.id,
    type: value.type as EnterpriseAccessObligationType,
    mandatory: value.mandatory,
    decisionRef: value.decisionRef,
    ...(value.severity === undefined ? {} : { severity: value.severity as EnterpriseAccessObligationSeverity }),
    ...(value.parameters === undefined ? {} : { parameters: { ...value.parameters } }),
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.evidenceRefs === undefined ? {} : { evidenceRefs: [...value.evidenceRefs] }),
  };
}
