import type { CanonicalId, UtcDateTime } from '@aoc/protocol';
import { GOVERNED_RIGHTS_SCOPE_FULL_BASIS_POINTS, GOVERNED_RIGHT_TYPES, governedRightTypes, governedRightsScopeEquals, isGovernedRightType, serializeGovernedRightsScope } from '@aoc-enterprise/governed-authorization';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

/**
 * The shared vocabulary of the `LICENSE` governed action: what a licensing
 * authorization is *about* (rights), *to whom* it is granted (licensee),
 * *which uses* it permits (permitted uses), *how exclusively* (exclusivity),
 * *within what declared limits* (constraints), optionally *how much of the
 * named rights* it draws on (rights scope), and optionally *who may carry it
 * out* (executor).
 *
 * `LICENSE` means: authorizing the grant of a defined permission to a defined
 * licensee to exercise specified governed rights associated with an
 * already-governed asset, for specified uses, within a specified operating
 * context, under defined governance conditions.
 *
 * It is deliberately distinct from every neighbouring governed action -- see
 * `ENTERPRISE_ACTIONS_DISTINCT_FROM_LICENSE`. Four distinctions carry real
 * semantic weight and are not stylistic:
 *
 * - `LICENSE != TRANSFER`. A license permits *use* of rights; it does not
 *   move, assign, or reassign ownership of them. Nothing in this package
 *   transfers a right, and no field here asserts that anything changed hands.
 * - `LICENSE != TOKENIZE`. Tokenization authorizes an external tokenized
 *   *representation* of rights; licensing authorizes *permission to exercise*
 *   them. An asset may be either, both, or neither.
 * - `LICENSE != COLLATERALIZE`. Collateralization commits rights as *security*
 *   for an obligation; licensing commits nothing and secures nothing. A
 *   licensed right is not an encumbered right.
 * - `LICENSE != PROTOCOLIZE`. Protocolization establishes the governed
 *   identity/authority/evidence context; licensing presupposes it.
 *
 * ## What AOC Enterprise does and does not claim
 *
 * AOC Enterprise governs *whether licensing is authorized*: whether this
 * authority graph, policy state, approval state and obligation set permitted
 * this actor to grant this permission to this licensee on these terms.
 *
 * It does **not** claim, and nothing in this package should be read as
 * claiming, that: the license is legally enforceable in any jurisdiction; the
 * agreement satisfies any local formality; consideration was paid; royalties
 * were settled; tax was paid; copyright subsists; a patent is valid; a
 * trademark is registered; the underlying right is legally licensable; or an
 * external contract was signed. Those are facts about the world, and AOC
 * knows them only if some external system independently evidences them --
 * which is what `EnterpriseLicenseExecutionEvidence` exists to record.
 *
 * Nothing here drafts a contract, captures a signature, computes or settles a
 * royalty, charges money, meters usage, enforces DRM, prices a license,
 * values an asset, calculates tax, or contacts any external system. Every
 * `external*` field and every entry in `permittedContexts` is a
 * provider-neutral opaque label that AOC records and compares as a string and
 * never interprets, resolves, or executes against.
 *
 * This is a pure data contract: no persistence, no service, no API, no policy
 * engine, no provider SDK, no execution. It follows the same composition
 * style as the R004 contract line (`@aoc-enterprise/resource-envelope`,
 * `access-decision`, `access-obligation`, `access-grant`, `grant-revocation`,
 * `usage-event`, `evidence-correlation`, `tokenization-mandate`,
 * `collateralization-mandate`): closed vocabularies, explicit validation
 * codes, identity/structural equality, deterministic serialization, and
 * references to records owned elsewhere rather than embeddings of them.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/license-mandate`).
 */
export const ENTERPRISE_LICENSE_SCHEMA_VERSION = '1.0.0' as const;

/**
 * The canonical governed-action identifier. Carried verbatim on
 * `ActionDescriptor.capability` when a `LICENSE` request is submitted through
 * the generalized governance evaluation path (`POST /api/governance/evaluate`
 * / `AocKernel.evaluate`), and matched against `AuthorityGrant.capability` /
 * `RecognitionCapabilityToken.capability` by the existing authority and
 * recognition runtimes. This package adds no second authorization mechanism
 * of its own.
 *
 * The field is named `capability` throughout the repository's internal
 * contracts; read `capability: 'license'` as "the identifier of the Governed
 * Action `LICENSE`". `LICENSE` is an **AOC Enterprise Governed Action**, not
 * an AOC Protocol Sovereignty Capability: the conceptual vocabulary
 * (Governed Action / Enforcement / Mandate / Evidence) and the internal field
 * name are allowed to differ, and no repository-wide rename is implied.
 */
export const ENTERPRISE_LICENSE_CAPABILITY = 'license' as const;

/**
 * The neighbouring governed actions `LICENSE` must never be conflated with.
 * Recorded as data (not prose alone) so the distinction is testable, and
 * enforced structurally by `validateEnterpriseLicenseRequest`, which rejects
 * any request whose `capability` is not exactly
 * `ENTERPRISE_LICENSE_CAPABILITY`.
 *
 * This is NOT an action registry: this repository deliberately treats
 * capability as an open string (see `AuthorityGrant.capability`), and this
 * list neither enumerates nor constrains what other actions may exist. It
 * records only which names are known to be *different* from this one --
 * including `sublicense`, `assign-license` and `terminate-license`, which are
 * deliberately not implemented here (see the package README, "Actions this
 * package deliberately does not introduce").
 */
export const ENTERPRISE_ACTIONS_DISTINCT_FROM_LICENSE = [
  'protocolize',
  'register',
  'transfer',
  'access',
  'delegate',
  'tokenize',
  'collateralize',
  'commercialize',
  'sublicense',
  'assign-license',
  'terminate-license',
] as const;

/** Whether `capability` is exactly the `LICENSE` action identifier. Never a fuzzy/prefix match -- `'license.partial'` is a different action. */
export function isEnterpriseLicenseCapability(capability: unknown): capability is typeof ENTERPRISE_LICENSE_CAPABILITY {
  return capability === ENTERPRISE_LICENSE_CAPABILITY;
}

/**
 * The canonical vocabulary of right categories a license may permit the
 * exercise of. Each value describes *which governed rights' authority is
 * being exercised*, never a legal conclusion: `'usage-right'` records that
 * the authorized rights include a usage right, it does not assert that such a
 * right exists, that anyone holds it, or that it is licensable under any
 * legal system. Authority must already be established upstream by the
 * primitives AOC evaluates (Authority Graph), and AOC never infers it from
 * the fact that a request was submitted.
 *
 * Deliberately a closed union, consistent with every other governance
 * vocabulary in this contract line: the categories are stable,
 * provider-neutral, shared vocabulary, and a future category is a
 * `schemaVersion` change, not an escape hatch.
 *
 * The value set coincides exactly with `ENTERPRISE_TOKENIZED_RIGHT_TYPES` and
 * `ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES`, and this is a *finding* rather
 * than a convenience: the vocabulary names which governed right of the asset
 * an action concerns, which is a property of the asset's rights and not of
 * the action applied to them. Representing a right, encumbering it, and
 * permitting its exercise all select from the same set. The duplication is
 * recorded rather than shared for the compatibility reasons set out in
 * `docs/architecture/ADR-LICENSE-ACTION.md`, "Generalization findings".
 *
 * Note in particular that `'ownership-interest'` is *not* excluded here.
 * Licensing an ownership interest does not transfer it: it records that the
 * permission draws on the ownership interest (as a perpetual exclusive
 * license effectively does), and `LICENSE != TRANSFER` still holds
 * throughout.
 */
export const ENTERPRISE_LICENSABLE_RIGHT_TYPES = GOVERNED_RIGHT_TYPES;

export type EnterpriseLicensableRightType = GovernedRightType;

/**
 * The canonical vocabulary of governed uses a license may permit.
 *
 * This is the concept `TOKENIZE` and `COLLATERALIZE` have no analogue for,
 * and it is the reason "rights + scope" is not the whole of what a license
 * authorizes. A right category says *which right* is engaged; a use says
 * *what may be done* under it. `usage-right` + `display` and `usage-right` +
 * `model-training` name the same right and two very different permissions.
 *
 * Deliberately a closed, provider-neutral, asset-neutral union. These are
 * AOC's own governed-use categories: they are **not** statutory definitions,
 * they do not track any jurisdiction's exclusive-rights enumeration, and AOC
 * asserts no legal meaning for them. A deployment that needs a finer
 * distinction expresses it through `permittedContexts` (opaque, extensible)
 * or through obligations, never by widening this vocabulary informally -- a
 * new category is a `schemaVersion` change.
 *
 * - `display` -- showing or making the work perceivable.
 * - `reproduce` -- making copies.
 * - `distribute` -- supplying copies to others.
 * - `broadcast` -- transmitting or streaming to an audience.
 * - `modify` -- altering the work itself.
 * - `derivative-work` -- creating new works based on it.
 * - `internal-use` -- use confined to the licensee's own operations.
 * - `commercial-use` -- use in the course of commerce.
 * - `model-training` -- use as input to train a statistical or machine
 *   learning model. Named explicitly rather than folded into `reproduce`,
 *   because a license that permits copying and one that permits training are
 *   routinely and deliberately different permissions.
 */
export const ENTERPRISE_LICENSED_USE_TYPES = {
  DISPLAY: 'display',
  REPRODUCE: 'reproduce',
  DISTRIBUTE: 'distribute',
  BROADCAST: 'broadcast',
  MODIFY: 'modify',
  DERIVATIVE_WORK: 'derivative-work',
  INTERNAL_USE: 'internal-use',
  COMMERCIAL_USE: 'commercial-use',
  MODEL_TRAINING: 'model-training',
} as const;

export type EnterpriseLicensedUseType = (typeof ENTERPRISE_LICENSED_USE_TYPES)[keyof typeof ENTERPRISE_LICENSED_USE_TYPES];

/**
 * How exclusively a license is granted, as a three-level rank.
 *
 * - `'non-exclusive'` -- the licensor may grant the same permission to others
 *   and may exercise it itself.
 * - `'sole'` -- the licensor grants the permission to no one else, but
 *   reserves it for itself.
 * - `'exclusive'` -- the licensor grants the permission to no one else and
 *   does not reserve it.
 *
 * A rank rather than a boolean, because "exclusive or not" cannot express the
 * middle case, and collapsing `'sole'` into either neighbour would silently
 * change what was authorized.
 *
 * **This is a declaration AOC records and compares, never a rule AOC
 * enforces against the world.** It never follows from this contract that an
 * asset may carry only one license, that an exclusive license blocks any
 * other license, or that a conflicting license is invalid. Whether a
 * prior exclusive grant should block a new request is a policy question,
 * answered by the policy layer against prior mandates and evidence -- not a
 * universal law this contract invents. See the package README, "Multiple
 * licenses are not prohibited".
 */
export const ENTERPRISE_LICENSE_EXCLUSIVITY_LEVELS = {
  NON_EXCLUSIVE: 'non-exclusive',
  SOLE: 'sole',
  EXCLUSIVE: 'exclusive',
} as const;

export type EnterpriseLicenseExclusivity =
  (typeof ENTERPRISE_LICENSE_EXCLUSIVITY_LEVELS)[keyof typeof ENTERPRISE_LICENSE_EXCLUSIVITY_LEVELS];

/**
 * Ordering used for exclusivity containment: a granted license may be *at
 * most* as exclusive as the authorization permits. `'sole'` sits strictly
 * between the two, so a `'sole'` authorization refuses an `'exclusive'`
 * execution and admits a `'non-exclusive'` one.
 */
const EXCLUSIVITY_RANK: Readonly<Record<EnterpriseLicenseExclusivity, number>> = {
  'non-exclusive': 0,
  sole: 1,
  exclusive: 2,
};

/**
 * How a license disposes of a downstream right the licensee might otherwise
 * assume it has. A closed three-value union rather than a boolean, because
 * "may be done, but only with a further approval" is a real and common
 * arrangement that neither `true` nor `false` can express.
 *
 * AOC records the disposition; it does not run the further approval. A
 * deployment that wants `'approval-required'` to mean something operational
 * expresses that through the Approval Runtime and obligations, and -- if
 * sublicensing or assignment must ever be *authorized* by AOC rather than
 * merely declared -- through a separate governed action with its own request,
 * decision and mandate. `SUBLICENSE` and `ASSIGN_LICENSE` are deliberately
 * not introduced by this package.
 */
export const ENTERPRISE_LICENSE_DISPOSITIONS = {
  PROHIBITED: 'prohibited',
  APPROVAL_REQUIRED: 'approval-required',
  PERMITTED: 'permitted',
} as const;

export type EnterpriseLicenseDisposition = (typeof ENTERPRISE_LICENSE_DISPOSITIONS)[keyof typeof ENTERPRISE_LICENSE_DISPOSITIONS];

/**
 * How much of the named governed rights a license draws on, when -- and only
 * when -- the permission is meaningfully expressed as a portion of them.
 *
 * `'proportional'` expresses a share as an integer count of basis points
 * (1/100th of a percent), so 25% is `2500` and the whole is `10000`.
 * `'unitized'` expresses a fixed count of named entitlement units for rights
 * that are not naturally proportional. Integers, never floating-point
 * percentages: `0.1 + 0.2 !== 0.3` in IEEE-754, and an economically
 * significant share must compare exactly.
 *
 * ## This is not the license's permission scope
 *
 * This is the single most important structural point of this contract, and
 * the reason `EnterpriseLicenseTerms.rightsScope` is **optional**.
 *
 * A license has two independent kinds of scope, and they are not the same
 * concept:
 *
 * ```
 * rights scope        25% of a divisible revenue right   (this type)
 * permission scope    display only, web channel only,    (permittedUses,
 *                     Territory A only, 12 months,        permittedContexts,
 *                     non-exclusive, 10 seats             exclusivity,
 *                                                         maximumLicenseTermEndsAt,
 *                                                         maximumLicensedUnits)
 * ```
 *
 * `TOKENIZE` and `COLLATERALIZE` both require a scope, because representing
 * or encumbering a right is inherently a question of *how much of it*. A
 * permission is not: "Company B may display this work on its website for 12
 * months" is a completely specified license with no fraction anywhere in it.
 * Requiring a percentage would force every such license to assert `10000`
 * basis points, which is a claim about the rights that the licensor never
 * made.
 *
 * Absence therefore means **"this authorization is not expressed as a portion
 * of the named rights"** -- emphatically *not* "100%". The two are
 * incommensurable, and every comparison in this package treats them as such
 * and fails closed rather than coercing one into the other. See
 * `enterpriseLicenseRightsScopeWithin`.
 */
export type EnterpriseLicenseRightsScope = GovernedRightsScope;

/** The whole of the named rights, expressed proportionally. Provided so "100%" never has to be spelled as a magic number at call sites. */
export const ENTERPRISE_LICENSE_FULL_BASIS_POINTS = GOVERNED_RIGHTS_SCOPE_FULL_BASIS_POINTS;

/**
 * A declared ceiling on the size of one granted license, expressed as an
 * integer count of named units alongside an opaque denomination label --
 * seats, deployments, installations, copies, devices.
 *
 * This is deliberately **not** a rights scope, and the distinction is a real
 * finding rather than a naming preference. A rights scope says what portion
 * of a finite governed right is engaged; a unit ceiling says how large one
 * grant may be. Ten seats to Company B and ten seats to Company C exhaust
 * nothing about the asset, whereas 60% plus 60% of a revenue right is
 * impossible. Collapsing the two would let a seat count be compared against a
 * proportional share, which is exactly the escalation this package refuses.
 *
 * It is also not a metering system. AOC counts nothing, observes no usage,
 * and enforces no limit at run time. This is a ceiling AOC records and
 * compares against what an external system *reports*, per granted license.
 * Denominations are opaque: `500` of one denomination is never comparable to
 * `500` of another.
 */
export interface EnterpriseLicensedUnits {
  readonly units: number;
  readonly unitDenomination: string;
}

/**
 * Declared, provider-neutral limits a license authorization carries. Every
 * field is a description AOC records and can compare; none is an instruction
 * AOC carries out, and none is interpreted against any real platform,
 * licensee, or legal system.
 *
 * - `prohibitedUses?` -- governed uses this authorization explicitly excludes.
 *   Not redundant with `permittedUses`: `permittedUses` is already an
 *   allow-list, but a broad permitted use can be granted with a narrower
 *   carve-out ("commercial use, but never model training"), which an
 *   allow-list alone cannot express. A use may never appear in both lists --
 *   an authorization that simultaneously permits and forbids the same use is
 *   an unrepresentable state, rejected at validation.
 * - `permittedContexts?` -- the operating context the license is confined to,
 *   as a map from an opaque *dimension* label to an opaque allow-list of
 *   values. `{ territory: ['a'], channel: ['web'] }` and
 *   `{ environment: ['production'] }` are both well-formed, and AOC
 *   interprets neither. Territory is deliberately **not** the root concept:
 *   for software the operating context may be an environment, for content a
 *   channel or platform, for data a market -- and hard-coding geography would
 *   make every non-geographic license misrepresent itself. A dimension that
 *   is absent is not restricted by this authorization; that is never an
 *   endorsement of any value.
 * - `maximumLicenseTermEndsAt?` -- the latest instant the *external* license
 *   this authorization permits may run to. Deliberately distinct from the
 *   mandate's own `expiresAt`, which bounds AOC's authority to grant rather
 *   than the granted license's life. Absent means this authorization declares
 *   no ceiling on the external term.
 * - `maximumLicensedUnits?` -- the per-license ceiling described above.
 * - `sublicensing` / `assignment` -- required dispositions. Neither has a safe
 *   default: silence about whether a licensee may sublicense or assign is
 *   precisely the ambiguity a governed authorization exists to remove.
 *   `assignment` additionally carries the only condition under which a
 *   license may be executed for a party other than the named licensee -- see
 *   `EnterpriseLicenseMandate`.
 * - `additionalLicensesAllowed` -- required, because "may this be exercised
 *   more than once?" has no safe default. `false` means the authorization
 *   permits a single external license grant.
 * - `externalAgreementReferenceRequired?` -- records that this authorization
 *   requires an external agreement reference to be reported when the license
 *   is executed, and is *checked* at execution rather than merely declared.
 *   This is the hook for arrangements that depend on an external contract,
 *   payment, royalty or consideration: the requirement is expressed as
 *   "evidence must be produced", and the evidence itself is carried by the
 *   existing `evidenceRefs` and obligation machinery. AOC computes no
 *   royalty, charges nothing, settles nothing, and infers no consideration.
 */
export interface EnterpriseLicenseConstraints {
  readonly prohibitedUses?: readonly EnterpriseLicensedUseType[];
  readonly permittedContexts?: Readonly<Record<string, readonly string[]>>;
  readonly maximumLicenseTermEndsAt?: UtcDateTime;
  readonly maximumLicensedUnits?: EnterpriseLicensedUnits;
  readonly sublicensing: EnterpriseLicenseDisposition;
  readonly assignment: EnterpriseLicenseDisposition;
  readonly additionalLicensesAllowed: boolean;
  readonly externalAgreementReferenceRequired?: boolean;
}

/**
 * The complete statement of *what exactly* is being authorized: which rights,
 * to whom, for which uses, how exclusively, under what declared limits,
 * optionally over what portion of the rights, and optionally by whom. Shared
 * by `EnterpriseLicenseRequest` (what was asked) and
 * `EnterpriseLicenseMandate` (what was granted) so the two can never drift
 * into two subtly different notions of "the license" -- see
 * `enterpriseLicenseTermsWithin`, the single comparison that decides whether
 * granted terms stayed inside requested terms.
 *
 * Four distinct parties/roles appear across this contract and its request,
 * and conflating any two of them is precisely the substitution this package
 * exists to prevent:
 *
 * ```
 * requestedBy    who asks            (on the request/mandate)
 * asset          what is licensed    (an already-governed ResourceRef)
 * licenseeRef    who receives        (the party granted the permission)
 * executorRef?   who may perform     (an external licensing platform/administrator)
 * ```
 *
 * The asset's own authority holder is a fifth role, established upstream in
 * the Authority Graph and never named here: this contract records what was
 * asked for, and authority is decided by the Kernel.
 *
 * `licenseeRef` is required. `executorRef` is **optional**, and that is a
 * deliberate domain finding rather than a convenience. `TOKENIZE` and
 * `COLLATERALIZE` both necessarily have an external performer -- someone must
 * mint the token, someone must create the security interest. Licensing does
 * not: a licensor that grants a license directly has no separate executor,
 * while a licensor working through a licensing platform or rights
 * administrator does. Requiring one would force every direct license to
 * invent a party, and an invented party binding protects nothing. When
 * present, execution is bound to exactly that party; when absent, this
 * authorization simply does not bind who performs the external act, and the
 * evidence records the performer as an observation. See
 * `docs/architecture/ADR-LICENSE-ACTION.md`, "Executor decision".
 *
 * Both `licenseeRef` and `executorRef` are opaque pointers to party
 * identities established elsewhere, never provider credentials, endpoints, or
 * clients.
 */
export interface EnterpriseLicenseTerms {
  readonly rights: readonly EnterpriseLicensableRightType[];
  readonly licenseeRef: CanonicalId;
  readonly permittedUses: readonly EnterpriseLicensedUseType[];
  readonly exclusivity: EnterpriseLicenseExclusivity;
  readonly constraints: EnterpriseLicenseConstraints;
  /** Present only when the permission is meaningfully a portion of the named rights. Absent means "not fractionally expressed", never "100%". */
  readonly rightsScope?: EnterpriseLicenseRightsScope;
  /** Present only when an external party is bound to perform the licensing act. Absent means this authorization binds no executor. */
  readonly executorRef?: CanonicalId;
}

// ---------------------------------------------------------------------------
// Shared primitives. Kept in this module (rather than duplicated per
// contract file) so every contract in this package validates, compares, and
// serializes the same concepts identically.
// ---------------------------------------------------------------------------

export const ENTERPRISE_LICENSE_ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isLicensePlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isLicenseNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isLicenseTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ENTERPRISE_LICENSE_ISO_8601_PATTERN.test(value);
}

export function isLicensePositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isLicenseCanonicalIdArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => isLicenseNonEmptyString(entry));
}

/** Sorted, duplicate-insensitive string-set equality. Reused wherever this package compares reference or label collections. */
export function licenseStringArrayEquals(a: readonly string[], b: readonly string[]): boolean {
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.length === bSorted.length && aSorted.every((value, index) => value === bSorted[index]);
}

export function licenseOptionalStringArrayEquals(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return licenseStringArrayEquals(a, b);
}

const RIGHT_TYPES: readonly EnterpriseLicensableRightType[] = governedRightTypes();
const USE_TYPES: readonly EnterpriseLicensedUseType[] = Object.values(ENTERPRISE_LICENSED_USE_TYPES);
const EXCLUSIVITY_LEVELS: readonly EnterpriseLicenseExclusivity[] = Object.values(ENTERPRISE_LICENSE_EXCLUSIVITY_LEVELS);
const DISPOSITIONS: readonly EnterpriseLicenseDisposition[] = Object.values(ENTERPRISE_LICENSE_DISPOSITIONS);

export function isEnterpriseLicensableRightType(value: unknown): value is EnterpriseLicensableRightType {
  return isGovernedRightType(value);
}

export function isEnterpriseLicensedUseType(value: unknown): value is EnterpriseLicensedUseType {
  return typeof value === 'string' && USE_TYPES.includes(value as EnterpriseLicensedUseType);
}

export function isEnterpriseLicenseExclusivity(value: unknown): value is EnterpriseLicenseExclusivity {
  return typeof value === 'string' && EXCLUSIVITY_LEVELS.includes(value as EnterpriseLicenseExclusivity);
}

export function isEnterpriseLicenseDisposition(value: unknown): value is EnterpriseLicenseDisposition {
  return typeof value === 'string' && DISPOSITIONS.includes(value as EnterpriseLicenseDisposition);
}

// ---------------------------------------------------------------------------
// Rights-scope semantics
// ---------------------------------------------------------------------------

export function isEnterpriseLicensedUnits(value: unknown): value is EnterpriseLicensedUnits {
  return isLicensePlainObject(value) && isLicensePositiveInteger(value.units) && isLicenseNonEmptyString(value.unitDenomination);
}

export function enterpriseLicensedUnitsEquals(a: EnterpriseLicensedUnits | undefined, b: EnterpriseLicensedUnits | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.units === b.units && a.unitDenomination === b.unitDenomination;
}

/**
 * Whether `inner` does not exceed `outer`. Unit counts in different
 * denominations are never comparable -- AOC holds no conversion between a
 * "seat" and an "installation", and silently coercing between labels is
 * exactly the escalation this refusal prevents -- so a denomination mismatch
 * is `false`, never a conversion.
 */
export function enterpriseLicensedUnitsWithin(inner: EnterpriseLicensedUnits, outer: EnterpriseLicensedUnits): boolean {
  return inner.unitDenomination === outer.unitDenomination && inner.units <= outer.units;
}

export function enterpriseLicenseRightsScopeEquals(
  a: EnterpriseLicenseRightsScope | undefined,
  b: EnterpriseLicenseRightsScope | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  return governedRightsScopeEquals(a, b);
}

/**
 * Whether `inner` rights scope is fully contained by `outer`, where either
 * may be absent.
 *
 * Four cases, and only one of them is arithmetic:
 *
 * - both absent -- contained. Neither expresses a portion of the rights.
 * - `outer` present, `inner` absent -- **not** contained. An authorization
 *   that carved out 25% cannot be shown to contain a claim that names no
 *   portion at all; treating the absence as "the same 25%" would invent a
 *   fact, and treating it as "100%" would invert the containment.
 * - `outer` absent, `inner` present -- **not** contained. An authorization
 *   that never expressed a portion did not authorize one to be asserted, and
 *   AOC cannot verify a fraction it never granted.
 * - both present -- contained iff the kinds match and the quantity fits.
 *   Proportional shares and unit counts describe different quantities and are
 *   never coerced into one another; unitized scopes must also agree on
 *   `unitDenomination`.
 *
 * Every "not contained" case above is a *refusal to compare incommensurable
 * things*, not a judgement that the inner value is too large. That is the
 * same fail-closed posture `enterpriseCollateralizationScopeWithin` takes
 * across scope kinds, applied one level up to presence itself.
 */
export function enterpriseLicenseRightsScopeWithin(
  inner: EnterpriseLicenseRightsScope | undefined,
  outer: EnterpriseLicenseRightsScope | undefined,
): boolean {
  if (outer === undefined) return inner === undefined;
  if (inner === undefined) return false;
  if (inner.kind === 'proportional') return outer.kind === 'proportional' && inner.basisPoints <= outer.basisPoints;
  return outer.kind === 'unitized' && inner.unitDenomination === outer.unitDenomination && inner.units <= outer.units;
}

// ---------------------------------------------------------------------------
// Use / exclusivity / context semantics
// ---------------------------------------------------------------------------

/** Whether every use in `inner` is permitted by `outer`. An empty `inner` is vacuously contained; callers reject empty use sets separately, where "a license permitting nothing" can be reported as such. */
export function enterpriseLicensedUsesWithin(
  inner: readonly EnterpriseLicensedUseType[],
  outer: readonly EnterpriseLicensedUseType[],
): boolean {
  return inner.every((use) => outer.includes(use));
}

/** Whether a granted exclusivity is at most as exclusive as an authorized one. */
export function enterpriseLicenseExclusivityWithin(inner: EnterpriseLicenseExclusivity, outer: EnterpriseLicenseExclusivity): boolean {
  return EXCLUSIVITY_RANK[inner] <= EXCLUSIVITY_RANK[outer];
}

/**
 * Whether `inner` operating contexts stay inside `outer`.
 *
 * Read dimension by dimension. A dimension `outer` does not restrict places
 * no limit on `inner`, in either direction: an authorization silent about
 * channels permits any channel, and `inner` naming channels it never
 * restricted is not an escalation. A dimension `outer` *does* restrict must
 * be present in `inner` and every value must be allowed -- an absent
 * dimension cannot be shown to be inside a restricted allow-list, so it is
 * refused rather than assumed empty, exactly as
 * `permittedRegistries`/`permittedJurisdictions` are handled for
 * collateralization.
 *
 * This is what makes "Territory A" refuse "Territory A + Territory B": the
 * values are compared as a set, not as a first-match.
 */
export function enterpriseLicenseContextsWithin(
  inner: Readonly<Record<string, readonly string[]>> | undefined,
  outer: Readonly<Record<string, readonly string[]>> | undefined,
): boolean {
  if (outer === undefined) return true;
  for (const dimension of Object.keys(outer)) {
    const permitted = outer[dimension];
    if (permitted === undefined) continue;
    const claimed = inner?.[dimension];
    if (claimed === undefined || claimed.length === 0) return false;
    if (!claimed.every((value) => permitted.includes(value))) return false;
  }
  return true;
}

export function enterpriseLicenseContextsEquals(
  a: Readonly<Record<string, readonly string[]>> | undefined,
  b: Readonly<Record<string, readonly string[]>> | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length || !aKeys.every((key, index) => key === bKeys[index])) return false;
  return aKeys.every((key) => licenseStringArrayEquals(a[key] ?? [], b[key] ?? []));
}

// ---------------------------------------------------------------------------
// Constraint / terms containment
// ---------------------------------------------------------------------------

const DISPOSITION_RANK: Readonly<Record<EnterpriseLicenseDisposition, number>> = {
  prohibited: 0,
  'approval-required': 1,
  permitted: 2,
};

/** Whether `inner` disposition is at most as permissive as `outer`. */
function dispositionWithin(inner: EnterpriseLicenseDisposition, outer: EnterpriseLicenseDisposition): boolean {
  return DISPOSITION_RANK[inner] <= DISPOSITION_RANK[outer];
}

/**
 * Whether `inner` constraints are at least as restrictive as `outer`. Used to
 * prove that granted limits never loosened what was requested.
 *
 * `prohibitedUses` runs the opposite way to every allow-list here: a granted
 * authorization may forbid *more* than was asked, never less, so `outer`'s
 * exclusions must all survive in `inner`.
 */
export function enterpriseLicenseConstraintsWithin(inner: EnterpriseLicenseConstraints, outer: EnterpriseLicenseConstraints): boolean {
  if (outer.prohibitedUses !== undefined) {
    const innerProhibited = inner.prohibitedUses ?? [];
    if (!outer.prohibitedUses.every((use) => innerProhibited.includes(use))) return false;
  }
  if (!enterpriseLicenseContextsWithin(inner.permittedContexts, outer.permittedContexts)) return false;
  if (outer.maximumLicenseTermEndsAt !== undefined) {
    if (inner.maximumLicenseTermEndsAt === undefined) return false;
    if (Date.parse(inner.maximumLicenseTermEndsAt) > Date.parse(outer.maximumLicenseTermEndsAt)) return false;
  }
  if (outer.maximumLicensedUnits !== undefined) {
    if (inner.maximumLicensedUnits === undefined) return false;
    if (!enterpriseLicensedUnitsWithin(inner.maximumLicensedUnits, outer.maximumLicensedUnits)) return false;
  }
  if (!dispositionWithin(inner.sublicensing, outer.sublicensing)) return false;
  if (!dispositionWithin(inner.assignment, outer.assignment)) return false;
  if (!outer.additionalLicensesAllowed && inner.additionalLicensesAllowed) return false;
  if (outer.externalAgreementReferenceRequired === true && inner.externalAgreementReferenceRequired !== true) return false;
  return true;
}

export function enterpriseLicenseConstraintsEquals(a: EnterpriseLicenseConstraints, b: EnterpriseLicenseConstraints): boolean {
  return (
    licenseOptionalStringArrayEquals(a.prohibitedUses, b.prohibitedUses) &&
    enterpriseLicenseContextsEquals(a.permittedContexts, b.permittedContexts) &&
    a.maximumLicenseTermEndsAt === b.maximumLicenseTermEndsAt &&
    enterpriseLicensedUnitsEquals(a.maximumLicensedUnits, b.maximumLicensedUnits) &&
    a.sublicensing === b.sublicensing &&
    a.assignment === b.assignment &&
    a.additionalLicensesAllowed === b.additionalLicensesAllowed &&
    a.externalAgreementReferenceRequired === b.externalAgreementReferenceRequired
  );
}

export function enterpriseLicenseTermsEquals(a: EnterpriseLicenseTerms, b: EnterpriseLicenseTerms): boolean {
  return (
    licenseStringArrayEquals(a.rights, b.rights) &&
    a.licenseeRef === b.licenseeRef &&
    licenseStringArrayEquals(a.permittedUses, b.permittedUses) &&
    a.exclusivity === b.exclusivity &&
    enterpriseLicenseRightsScopeEquals(a.rightsScope, b.rightsScope) &&
    a.executorRef === b.executorRef &&
    enterpriseLicenseConstraintsEquals(a.constraints, b.constraints)
  );
}

/**
 * The single containment test this package exposes for "did the granted
 * authorization stay inside what was requested?" -- rights are a subset,
 * permitted uses are a subset, exclusivity did not rise, the rights scope is
 * contained, the licensee and any bound executor are unchanged, and
 * constraints did not loosen. Every path that turns a request into a mandate
 * is expected to assert this; `display` can never quietly become
 * `distribute`, `non-exclusive` can never become `exclusive`, and Company B
 * can never quietly become Company C, while it holds.
 */
export function enterpriseLicenseTermsWithin(inner: EnterpriseLicenseTerms, outer: EnterpriseLicenseTerms): boolean {
  return (
    inner.rights.every((right) => outer.rights.includes(right)) &&
    inner.licenseeRef === outer.licenseeRef &&
    enterpriseLicensedUsesWithin(inner.permittedUses, outer.permittedUses) &&
    enterpriseLicenseExclusivityWithin(inner.exclusivity, outer.exclusivity) &&
    enterpriseLicenseRightsScopeWithin(inner.rightsScope, outer.rightsScope) &&
    inner.executorRef === outer.executorRef &&
    enterpriseLicenseConstraintsWithin(inner.constraints, outer.constraints)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseLicenseTermsValidationCode =
  | 'MISSING_TERMS'
  | 'INVALID_TERMS'
  | 'MISSING_RIGHTS'
  | 'INVALID_RIGHTS'
  | 'EMPTY_RIGHTS'
  | 'DUPLICATE_RIGHTS'
  | 'MISSING_LICENSEE_REF'
  | 'INVALID_LICENSEE_REF'
  | 'MISSING_PERMITTED_USES'
  | 'INVALID_PERMITTED_USES'
  | 'EMPTY_PERMITTED_USES'
  | 'DUPLICATE_PERMITTED_USES'
  | 'MISSING_EXCLUSIVITY'
  | 'INVALID_EXCLUSIVITY'
  | 'INVALID_RIGHTS_SCOPE'
  | 'INVALID_RIGHTS_SCOPE_KIND'
  | 'INVALID_RIGHTS_SCOPE_BASIS_POINTS'
  | 'INVALID_RIGHTS_SCOPE_UNITS'
  | 'INVALID_RIGHTS_SCOPE_UNIT_DENOMINATION'
  | 'INVALID_EXECUTOR_REF'
  | 'MISSING_CONSTRAINTS'
  | 'INVALID_CONSTRAINTS'
  | 'INVALID_PROHIBITED_USES'
  | 'CONTRADICTORY_USES'
  | 'INVALID_PERMITTED_CONTEXTS'
  | 'INVALID_MAXIMUM_LICENSE_TERM_ENDS_AT'
  | 'INVALID_MAXIMUM_LICENSED_UNITS'
  | 'MISSING_SUBLICENSING'
  | 'INVALID_SUBLICENSING'
  | 'MISSING_ASSIGNMENT'
  | 'INVALID_ASSIGNMENT'
  | 'MISSING_ADDITIONAL_LICENSES_ALLOWED'
  | 'INVALID_ADDITIONAL_LICENSES_ALLOWED'
  | 'INVALID_EXTERNAL_AGREEMENT_REFERENCE_REQUIRED';

export interface EnterpriseLicenseTermsValidationIssue {
  readonly code: EnterpriseLicenseTermsValidationCode;
  readonly message: string;
}

/** Validates a candidate rights scope in isolation. Exposed because execution evidence may carry one without carrying full terms. */
export function collectEnterpriseLicenseRightsScopeIssues(candidate: unknown, path: string): EnterpriseLicenseTermsValidationIssue[] {
  const issues: EnterpriseLicenseTermsValidationIssue[] = [];
  if (!isLicensePlainObject(candidate)) {
    issues.push({ code: 'INVALID_RIGHTS_SCOPE', message: `${path} must be an object when present; omit it entirely when the permission is not expressed as a portion of the rights.` });
    return issues;
  }
  if (candidate.kind === 'proportional') {
    if (!isLicensePositiveInteger(candidate.basisPoints) || candidate.basisPoints > ENTERPRISE_LICENSE_FULL_BASIS_POINTS) {
      issues.push({
        code: 'INVALID_RIGHTS_SCOPE_BASIS_POINTS',
        message: `${path}.basisPoints must be an integer between 1 and ${ENTERPRISE_LICENSE_FULL_BASIS_POINTS} (basis points, never a floating-point percentage).`,
      });
    }
  } else if (candidate.kind === 'unitized') {
    if (!isLicensePositiveInteger(candidate.units)) {
      issues.push({ code: 'INVALID_RIGHTS_SCOPE_UNITS', message: `${path}.units must be a positive integer.` });
    }
    if (!isLicenseNonEmptyString(candidate.unitDenomination)) {
      issues.push({ code: 'INVALID_RIGHTS_SCOPE_UNIT_DENOMINATION', message: `${path}.unitDenomination must be a non-empty string.` });
    }
  } else {
    issues.push({ code: 'INVALID_RIGHTS_SCOPE_KIND', message: `${path}.kind must be 'proportional' or 'unitized'.` });
  }
  return issues;
}

/**
 * Validates a candidate operating-context map in isolation.
 *
 * Generic in the issue code so the one implementation serves both callers:
 * terms report `INVALID_PERMITTED_CONTEXTS`, execution evidence reports
 * `INVALID_CONTEXTS`, and neither has to restate the shape rules.
 */
export function collectEnterpriseLicenseContextIssues<TCode extends string>(
  candidate: unknown,
  path: string,
  code: TCode,
): { readonly code: TCode; readonly message: string }[] {
  if (!isLicensePlainObject(candidate)) {
    return [{ code, message: `${path} must be an object mapping opaque dimension labels to non-empty arrays of opaque values when present.` }];
  }
  const dimensions = Object.keys(candidate);
  if (dimensions.length === 0) {
    return [{ code, message: `${path} must name at least one dimension when present; omit it to declare no context restriction.` }];
  }
  for (const dimension of dimensions) {
    if (dimension.length === 0) {
      return [{ code, message: `${path} dimension labels must be non-empty strings.` }];
    }
    const values = candidate[dimension];
    if (!isLicenseCanonicalIdArray(values) || values.length === 0) {
      return [{ code, message: `${path}['${dimension}'] must be a non-empty array of non-empty strings.` }];
    }
  }
  return [];
}

function collectConstraintIssues(candidate: unknown, path: string, permittedUses: readonly unknown[] | undefined): EnterpriseLicenseTermsValidationIssue[] {
  const issues: EnterpriseLicenseTermsValidationIssue[] = [];
  if (!isLicensePlainObject(candidate)) {
    issues.push({ code: 'MISSING_CONSTRAINTS', message: `${path} is required and must be an object.` });
    return issues;
  }

  if (candidate.prohibitedUses !== undefined) {
    if (
      !Array.isArray(candidate.prohibitedUses) ||
      candidate.prohibitedUses.length === 0 ||
      !candidate.prohibitedUses.every((use) => isEnterpriseLicensedUseType(use))
    ) {
      issues.push({
        code: 'INVALID_PROHIBITED_USES',
        message: `${path}.prohibitedUses must be a non-empty array of: ${USE_TYPES.join(', ')} when present; omit it to declare no explicit exclusion.`,
      });
    } else if (new Set(candidate.prohibitedUses).size !== candidate.prohibitedUses.length) {
      issues.push({ code: 'INVALID_PROHIBITED_USES', message: `${path}.prohibitedUses must not repeat a use.` });
    } else if (permittedUses !== undefined && Array.isArray(permittedUses)) {
      const overlap = candidate.prohibitedUses.filter((use) => permittedUses.includes(use));
      if (overlap.length > 0) {
        issues.push({
          code: 'CONTRADICTORY_USES',
          message: `${path}.prohibitedUses must not repeat a permitted use (${overlap.join(', ')}); an authorization that both permits and forbids the same use is not a state this contract can represent.`,
        });
      }
    }
  }

  if (candidate.permittedContexts !== undefined) {
    issues.push(...collectEnterpriseLicenseContextIssues(candidate.permittedContexts, `${path}.permittedContexts`, 'INVALID_PERMITTED_CONTEXTS'));
  }

  if (candidate.maximumLicenseTermEndsAt !== undefined && !isLicenseTimestamp(candidate.maximumLicenseTermEndsAt)) {
    issues.push({
      code: 'INVALID_MAXIMUM_LICENSE_TERM_ENDS_AT',
      message: `${path}.maximumLicenseTermEndsAt must be an ISO 8601 timestamp string when present; it bounds the external license's own term, not the mandate's authority window.`,
    });
  }

  if (candidate.maximumLicensedUnits !== undefined && !isEnterpriseLicensedUnits(candidate.maximumLicensedUnits)) {
    issues.push({
      code: 'INVALID_MAXIMUM_LICENSED_UNITS',
      message: `${path}.maximumLicensedUnits must be { units: a positive integer, unitDenomination: a non-empty opaque label } when present; it is a per-license ceiling, never a portion of the governed rights.`,
    });
  }

  const dispositions: readonly (readonly [
    'sublicensing' | 'assignment',
    EnterpriseLicenseTermsValidationCode,
    EnterpriseLicenseTermsValidationCode,
  ])[] = [
    ['sublicensing', 'MISSING_SUBLICENSING', 'INVALID_SUBLICENSING'],
    ['assignment', 'MISSING_ASSIGNMENT', 'INVALID_ASSIGNMENT'],
  ];
  for (const [field, missingCode, invalidCode] of dispositions) {
    const value = candidate[field];
    if (value === undefined) {
      issues.push({ code: missingCode, message: `${path}.${field} is required; it has no safe default.` });
    } else if (!isEnterpriseLicenseDisposition(value)) {
      issues.push({ code: invalidCode, message: `${path}.${field} must be one of: ${DISPOSITIONS.join(', ')}.` });
    }
  }

  if (candidate.additionalLicensesAllowed === undefined) {
    issues.push({ code: 'MISSING_ADDITIONAL_LICENSES_ALLOWED', message: `${path}.additionalLicensesAllowed is required; it has no safe default.` });
  } else if (typeof candidate.additionalLicensesAllowed !== 'boolean') {
    issues.push({ code: 'INVALID_ADDITIONAL_LICENSES_ALLOWED', message: `${path}.additionalLicensesAllowed must be a boolean.` });
  }

  if (candidate.externalAgreementReferenceRequired !== undefined && typeof candidate.externalAgreementReferenceRequired !== 'boolean') {
    issues.push({
      code: 'INVALID_EXTERNAL_AGREEMENT_REFERENCE_REQUIRED',
      message: `${path}.externalAgreementReferenceRequired must be a boolean when present.`,
    });
  }

  return issues;
}

/** Validates a candidate `EnterpriseLicenseTerms`. Accepts `unknown` so it can guard deserialized/external input. */
export function collectEnterpriseLicenseTermsIssues(candidate: unknown, path = 'terms'): EnterpriseLicenseTermsValidationIssue[] {
  if (!isLicensePlainObject(candidate)) {
    return [{ code: 'MISSING_TERMS', message: `${path} is required and must be an object.` }];
  }

  const issues: EnterpriseLicenseTermsValidationIssue[] = [];

  if (candidate.rights === undefined) {
    issues.push({ code: 'MISSING_RIGHTS', message: `${path}.rights is required.` });
  } else if (!Array.isArray(candidate.rights) || !candidate.rights.every((right) => isEnterpriseLicensableRightType(right))) {
    issues.push({ code: 'INVALID_RIGHTS', message: `${path}.rights must be an array of: ${RIGHT_TYPES.join(', ')}.` });
  } else if (candidate.rights.length === 0) {
    issues.push({
      code: 'EMPTY_RIGHTS',
      message: `${path}.rights must name at least one right; 'license the asset' is not an expressible authorization.`,
    });
  } else if (new Set(candidate.rights).size !== candidate.rights.length) {
    issues.push({ code: 'DUPLICATE_RIGHTS', message: `${path}.rights must not repeat a right category.` });
  }

  if (!isLicenseNonEmptyString(candidate.licenseeRef)) {
    issues.push({
      code: candidate.licenseeRef === undefined ? 'MISSING_LICENSEE_REF' : 'INVALID_LICENSEE_REF',
      message: `${path}.licenseeRef is required and must be a non-empty string; it is distinct from the requester, the asset authority, the approver and any executor.`,
    });
  }

  let permittedUses: readonly unknown[] | undefined;
  if (candidate.permittedUses === undefined) {
    issues.push({ code: 'MISSING_PERMITTED_USES', message: `${path}.permittedUses is required.` });
  } else if (!Array.isArray(candidate.permittedUses) || !candidate.permittedUses.every((use) => isEnterpriseLicensedUseType(use))) {
    issues.push({ code: 'INVALID_PERMITTED_USES', message: `${path}.permittedUses must be an array of: ${USE_TYPES.join(', ')}.` });
  } else if (candidate.permittedUses.length === 0) {
    issues.push({
      code: 'EMPTY_PERMITTED_USES',
      message: `${path}.permittedUses must name at least one use; a license permitting nothing is not an expressible authorization.`,
    });
  } else if (new Set(candidate.permittedUses).size !== candidate.permittedUses.length) {
    issues.push({ code: 'DUPLICATE_PERMITTED_USES', message: `${path}.permittedUses must not repeat a use.` });
  } else {
    permittedUses = candidate.permittedUses;
  }

  if (candidate.exclusivity === undefined) {
    issues.push({ code: 'MISSING_EXCLUSIVITY', message: `${path}.exclusivity is required; it has no safe default.` });
  } else if (!isEnterpriseLicenseExclusivity(candidate.exclusivity)) {
    issues.push({ code: 'INVALID_EXCLUSIVITY', message: `${path}.exclusivity must be one of: ${EXCLUSIVITY_LEVELS.join(', ')}.` });
  }

  if (candidate.rightsScope !== undefined) {
    issues.push(...collectEnterpriseLicenseRightsScopeIssues(candidate.rightsScope, `${path}.rightsScope`));
  }

  if (candidate.executorRef !== undefined && !isLicenseNonEmptyString(candidate.executorRef)) {
    issues.push({
      code: 'INVALID_EXECUTOR_REF',
      message: `${path}.executorRef must be a non-empty string when present; omit it entirely when this authorization binds no external executor.`,
    });
  }

  issues.push(...collectConstraintIssues(candidate.constraints, `${path}.constraints`, permittedUses));

  return issues;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseLicenseTerms {
  readonly rights: readonly string[];
  readonly licenseeRef: string;
  readonly permittedUses: readonly string[];
  readonly exclusivity: string;
  readonly rightsScope?: EnterpriseLicenseRightsScope;
  readonly executorRef?: string;
  readonly constraints: {
    readonly prohibitedUses?: readonly string[];
    readonly permittedContexts?: Readonly<Record<string, readonly string[]>>;
    readonly maximumLicenseTermEndsAt?: string;
    readonly maximumLicensedUnits?: EnterpriseLicensedUnits;
    readonly sublicensing: string;
    readonly assignment: string;
    readonly additionalLicensesAllowed: boolean;
    readonly externalAgreementReferenceRequired?: boolean;
  };
}

/** Projects a rights scope to a plain, field-ordered object. Shared by every contract in this package that carries one. */
export function serializeEnterpriseLicenseRightsScope(scope: EnterpriseLicenseRightsScope): EnterpriseLicenseRightsScope {
  return serializeGovernedRightsScope(scope);
}

/** Projects an operating-context map to a deterministically-ordered plain object: dimensions sorted, values sorted. */
export function serializeEnterpriseLicenseContexts(
  contexts: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, readonly string[]>> {
  const sorted: Record<string, readonly string[]> = {};
  for (const dimension of Object.keys(contexts).sort()) {
    sorted[dimension] = [...(contexts[dimension] ?? [])].sort();
  }
  return sorted;
}

function serializeLicensedUnits(units: EnterpriseLicensedUnits): EnterpriseLicensedUnits {
  return { units: units.units, unitDenomination: units.unitDenomination };
}

/** Projects terms to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseLicenseTerms(terms: EnterpriseLicenseTerms): SerializedEnterpriseLicenseTerms {
  const { constraints } = terms;
  return {
    rights: [...terms.rights].sort(),
    licenseeRef: terms.licenseeRef,
    permittedUses: [...terms.permittedUses].sort(),
    exclusivity: terms.exclusivity,
    ...(terms.rightsScope === undefined ? {} : { rightsScope: serializeEnterpriseLicenseRightsScope(terms.rightsScope) }),
    ...(terms.executorRef === undefined ? {} : { executorRef: terms.executorRef }),
    constraints: {
      ...(constraints.prohibitedUses === undefined ? {} : { prohibitedUses: [...constraints.prohibitedUses].sort() }),
      ...(constraints.permittedContexts === undefined ? {} : { permittedContexts: serializeEnterpriseLicenseContexts(constraints.permittedContexts) }),
      ...(constraints.maximumLicenseTermEndsAt === undefined ? {} : { maximumLicenseTermEndsAt: constraints.maximumLicenseTermEndsAt }),
      ...(constraints.maximumLicensedUnits === undefined ? {} : { maximumLicensedUnits: serializeLicensedUnits(constraints.maximumLicensedUnits) }),
      sublicensing: constraints.sublicensing,
      assignment: constraints.assignment,
      additionalLicensesAllowed: constraints.additionalLicensesAllowed,
      ...(constraints.externalAgreementReferenceRequired === undefined
        ? {}
        : { externalAgreementReferenceRequired: constraints.externalAgreementReferenceRequired }),
    },
  };
}

/** Reads an operating-context map back, copying every array so the result shares no structure with the input. */
export function readEnterpriseLicenseContexts(
  value: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, readonly string[]>> {
  const copy: Record<string, readonly string[]> = {};
  for (const dimension of Object.keys(value)) copy[dimension] = [...(value[dimension] ?? [])];
  return copy;
}

/**
 * Maps an already-validated candidate onto `EnterpriseLicenseTerms`. Every
 * field is read explicitly -- no structural cast over unchecked input,
 * matching the convention in `@aoc-enterprise/access-decision`,
 * `@aoc-enterprise/access-grant`, `@aoc-enterprise/tokenization-mandate` and
 * `@aoc-enterprise/collateralization-mandate`.
 */
export function readEnterpriseLicenseTerms(value: SerializedEnterpriseLicenseTerms): EnterpriseLicenseTerms {
  return {
    rights: value.rights.map((right) => right as EnterpriseLicensableRightType),
    licenseeRef: value.licenseeRef,
    permittedUses: value.permittedUses.map((use) => use as EnterpriseLicensedUseType),
    exclusivity: value.exclusivity as EnterpriseLicenseExclusivity,
    ...(value.rightsScope === undefined ? {} : { rightsScope: serializeEnterpriseLicenseRightsScope(value.rightsScope) }),
    ...(value.executorRef === undefined ? {} : { executorRef: value.executorRef }),
    constraints: {
      ...(value.constraints.prohibitedUses === undefined
        ? {}
        : { prohibitedUses: value.constraints.prohibitedUses.map((use) => use as EnterpriseLicensedUseType) }),
      ...(value.constraints.permittedContexts === undefined
        ? {}
        : { permittedContexts: readEnterpriseLicenseContexts(value.constraints.permittedContexts) }),
      ...(value.constraints.maximumLicenseTermEndsAt === undefined
        ? {}
        : { maximumLicenseTermEndsAt: value.constraints.maximumLicenseTermEndsAt }),
      ...(value.constraints.maximumLicensedUnits === undefined
        ? {}
        : { maximumLicensedUnits: serializeLicensedUnits(value.constraints.maximumLicensedUnits) }),
      sublicensing: value.constraints.sublicensing as EnterpriseLicenseDisposition,
      assignment: value.constraints.assignment as EnterpriseLicenseDisposition,
      additionalLicensesAllowed: value.constraints.additionalLicensesAllowed,
      ...(value.constraints.externalAgreementReferenceRequired === undefined
        ? {}
        : { externalAgreementReferenceRequired: value.constraints.externalAgreementReferenceRequired }),
    },
  };
}
