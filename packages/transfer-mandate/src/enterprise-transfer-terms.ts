import type { CanonicalId } from '@aoc/protocol';
import {
  GOVERNED_RIGHTS_SCOPE_FULL_BASIS_POINTS,
  GOVERNED_RIGHT_TYPES,
  governedRightTypes,
  governedRightsScopeEquals,
  governedRightsScopeSum,
  governedRightsScopeWithin,
  isGovernedRightType,
  serializeGovernedRightsScope,
} from '@aoc-enterprise/governed-authorization';
// Type-only specifiers are kept on one line deliberately: `scripts/check-duplicate-semantic-contracts.mjs`
// treats a line-leading `type Name,` inside an import block as a *declaration* of that name.
import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

/**
 * The shared vocabulary of the `TRANSFER` governed action: what a transfer
 * authorization is *about* (rights), *how much of them* moves (scope), *from
 * whom* (transferor), *to whom* (transferee), *under what declared limits*
 * (constraints), and optionally *who may carry it out* (executor).
 *
 * `TRANSFER` means: authorizing the movement of specified governed rights
 * associated with an already-governed asset -- or a defined portion of those
 * rights -- from a specified current holder to a specified recipient, under
 * defined governance conditions.
 *
 * It is deliberately distinct from every neighbouring governed action -- see
 * `ENTERPRISE_ACTIONS_DISTINCT_FROM_TRANSFER`. Five distinctions carry real
 * semantic weight and are not stylistic:
 *
 * - `TRANSFER != LICENSE`. A license permits a licensee to *use* rights the
 *   licensor keeps; a transfer moves the right itself away from the holder.
 *   After a license the licensor still holds what it licensed. After a
 *   transfer it does not.
 * - `TRANSFER != COLLATERALIZE`. Committing rights as security encumbers them
 *   while leaving them where they are; a transfer relocates them. An
 *   encumbered right is still the holder's.
 * - `TRANSFER != TOKENIZE`. Tokenization authorizes an external
 *   *representation* of rights; nothing about which party holds them changes.
 * - `TRANSFER != PROTOCOLIZE`. Protocolization establishes the governed
 *   identity/authority/evidence context; transfer presupposes it.
 * - `TRANSFER != ACCESS`. Access is permission to reach a resource now;
 *   transfer reassigns a right for the future.
 *
 * ## The one property no sibling action has: the quantity is conserved
 *
 * `TOKENIZE`, `COLLATERALIZE` and `LICENSE` all *bound* a quantity. `TRANSFER`
 * *moves* one. Twenty-five percent transferred twice is fifty percent gone,
 * and the second movement is refused not because a ceiling was crossed but
 * because the right being moved is finite and part of it has already left.
 * This is why `scope` is required here (a transfer with no quantity does not
 * describe a movement), why transferred scope accumulates, and why a transfer
 * mandate that permits no partial movement must be executed for exactly the
 * authorized scope rather than merely "no more than" it.
 *
 * ## What AOC Enterprise does and does not claim
 *
 * AOC Enterprise governs *whether a transfer is authorized*: whether this
 * authority graph, policy state, approval state and obligation set permitted
 * this actor to move this right, in this portion, from this holder to this
 * recipient.
 *
 * It does **not** claim, and nothing in this package should be read as
 * claiming, that: the transfer occurred; title passed; the recipient now owns
 * or controls anything; any registry was updated; any consideration was paid;
 * any agreement was signed; any formality was satisfied in any jurisdiction;
 * the right was legally transferable; or the transferor genuinely held what it
 * purported to move. Those are facts about the world, and AOC knows them only
 * if some external system independently evidences them -- which is what
 * `EnterpriseTransferExecutionEvidence` exists to record.
 *
 * Most importantly, and unlike anything the previous three actions had to say:
 * **recording that a transfer executed does not move authority inside AOC.**
 * See `docs/architecture/ADR-TRANSFER-ACTION.md`, "Post-transfer authority".
 *
 * Nothing here moves an asset, updates a registry, computes or settles a
 * price, escrows funds, calculates tax, values anything, drafts or signs an
 * agreement, or contacts any external system. Every `external*` field and
 * every entry in `permittedRegistries` is a provider-neutral opaque label that
 * AOC records and compares as a string and never interprets, resolves, or
 * executes against.
 *
 * This is a pure data contract: no persistence, no service, no API, no policy
 * engine, no provider SDK, no execution. It follows the same composition style
 * as the R004 contract line (`@aoc-enterprise/resource-envelope`,
 * `access-decision`, `access-obligation`, `access-grant`, `grant-revocation`,
 * `usage-event`, `evidence-correlation`, `tokenization-mandate`,
 * `collateralization-mandate`, `license-mandate`): closed vocabularies,
 * explicit validation codes, identity/structural equality, deterministic
 * serialization, and references to records owned elsewhere rather than
 * embeddings of them.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/transfer-mandate`).
 */
export const ENTERPRISE_TRANSFER_SCHEMA_VERSION = '1.0.0' as const;

/**
 * The canonical governed-action identifier. Carried verbatim on
 * `ActionDescriptor.capability` when a `TRANSFER` request is submitted through
 * the generalized governance evaluation path (`POST /api/governance/evaluate`
 * / `AocKernel.evaluate`), and matched against `AuthorityGrant.capability` /
 * `RecognitionCapabilityToken.capability` by the existing authority and
 * recognition runtimes. This package adds no second authorization mechanism of
 * its own.
 *
 * The field is named `capability` throughout the repository's internal
 * contracts; read `capability: 'transfer'` as "the identifier of the Governed
 * Action `TRANSFER`". `TRANSFER` is an **AOC Enterprise Governed Action**, not
 * an AOC Protocol Sovereignty Capability: the conceptual vocabulary (Governed
 * Action / Enforcement / Mandate / Evidence) and the internal field name are
 * allowed to differ, and no repository-wide rename is implied.
 */
export const ENTERPRISE_TRANSFER_CAPABILITY = 'transfer' as const;

/**
 * The neighbouring governed actions `TRANSFER` must never be conflated with.
 * Recorded as data (not prose alone) so the distinction is testable, and
 * enforced structurally by `validateEnterpriseTransferRequest`, which rejects
 * any request whose `capability` is not exactly
 * `ENTERPRISE_TRANSFER_CAPABILITY`.
 *
 * This is NOT an action registry: this repository deliberately treats
 * capability as an open string (see `AuthorityGrant.capability`), and this
 * list neither enumerates nor constrains what other actions may exist. It
 * records only which names are known to be *different* from this one --
 * including `reverse-transfer`, `rescind-transfer` and `return`, which are
 * deliberately not implemented here (see the package README, "Reversal is not
 * a governed action in this package").
 */
export const ENTERPRISE_ACTIONS_DISTINCT_FROM_TRANSFER = [
  'protocolize',
  'register',
  'access',
  'delegate',
  'tokenize',
  'collateralize',
  'license',
  'commercialize',
  'reverse-transfer',
  'rescind-transfer',
  'return',
] as const;

/** Whether `capability` is exactly the `TRANSFER` action identifier. Never a fuzzy/prefix match -- `'transfer.partial'` is a different action. */
export function isEnterpriseTransferCapability(capability: unknown): capability is typeof ENTERPRISE_TRANSFER_CAPABILITY {
  return capability === ENTERPRISE_TRANSFER_CAPABILITY;
}

/**
 * The canonical vocabulary of right categories that may be transferred. Each
 * value describes *which governed right of the asset is being moved*, never a
 * legal conclusion: `'ownership-interest'` records that the rights being
 * transferred include an ownership interest, it does not assert that anyone
 * owns anything, that the interest exists, or that it is capable of being
 * transferred under any legal system.
 *
 * Deliberately a closed union, consistent with every other governance
 * vocabulary in this contract line: the categories are stable,
 * provider-neutral, shared vocabulary, and a future category is a
 * `schemaVersion` change, not an escape hatch.
 *
 * The value set coincides exactly with `ENTERPRISE_TOKENIZED_RIGHT_TYPES`,
 * `ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES` and
 * `ENTERPRISE_LICENSABLE_RIGHT_TYPES`, and after four independent actions this
 * is a settled *finding* rather than a convenience: the vocabulary names which
 * governed right of the asset an action concerns, which is a property of the
 * asset's rights and not of the action applied to them. Representing a right,
 * encumbering it, permitting its exercise and moving it all select from the
 * same set.
 *
 * **`TRANSFER` is the action that proves the vocabulary is asset-side rather
 * than action-side.** For `LICENSE`, `'ownership-interest'` names the right a
 * permission *draws on* while the permission granted is something narrower;
 * for `TRANSFER` the very same value names the thing that *moves*. One
 * vocabulary, two completely different relations to it -- which is only
 * possible because the vocabulary describes the asset's rights and the action
 * describes what is being done to them. See
 * `docs/architecture/ADR-ENTERPRISE-ENFORCEMENT-VOCABULARY.md`.
 *
 * No value is marked transferable or non-transferable here, and that refusal
 * is deliberate. Whether a usage right may be assigned, whether an ownership
 * interest may be split, and whether a contractual claim is capable of
 * novation are matters of the arrangement and the jurisdiction, not of this
 * vocabulary. AOC evaluates configured authority, policy, approvals and
 * obligations; it encodes no universal legal rule about transferability.
 */
export const ENTERPRISE_TRANSFERABLE_RIGHT_TYPES = GOVERNED_RIGHT_TYPES;

export type EnterpriseTransferableRightType = GovernedRightType;

/**
 * How much of the named governed rights a transfer moves.
 *
 * `'proportional'` expresses a share as an integer count of basis points
 * (1/100th of a percent), so 25% is `2500` and the whole is `10000`.
 * `'unitized'` expresses a fixed count of named entitlement units for rights
 * that are not naturally proportional. Integers, never floating-point
 * percentages: `0.1 + 0.2 !== 0.3` in IEEE-754, and a quantity that is both
 * *summed across executions* and economically significant must compare and add
 * exactly.
 *
 * ## Required, and this is the opposite of `LICENSE`
 *
 * `EnterpriseLicenseTerms.rightsScope` is optional, because "Company B may
 * display this work for 12 months" is a completely specified permission with
 * no fraction anywhere in it. A transfer is not like that. Moving a right is
 * inherently a question of *how much of it moves*, and there is no third
 * option between "all of it" and "some stated portion of it": a transfer that
 * declines to say is not under-specified in an acceptable way, it is
 * ambiguous about the only thing that distinguishes a full transfer from a
 * partial one.
 *
 * So `10000` basis points here genuinely means "the whole of the named
 * rights", and stating it is a claim the transferor is making rather than a
 * coercion this contract imposed -- which is exactly why `LICENSE` could not
 * be made to state it. `TRANSFER` therefore sits with `TOKENIZE` and
 * `COLLATERALIZE` on requiredness (3 of 4) and confirms that requiredness is a
 * property of the *action*, while the scope value type is generic across all
 * four.
 */
export type EnterpriseTransferScope = GovernedRightsScope;

/** The whole of the named rights, expressed proportionally. Provided so "100%" never has to be spelled as a magic number at call sites. */
export const ENTERPRISE_TRANSFER_FULL_BASIS_POINTS = GOVERNED_RIGHTS_SCOPE_FULL_BASIS_POINTS;

/**
 * How a transfer authorization disposes of a downstream act the recipient
 * might otherwise assume it may perform. A closed three-value union rather
 * than a boolean, because "may be done, but only with a further approval" is a
 * real arrangement that neither `true` nor `false` can express.
 *
 * Used by `constraints.onwardTransferAllowed`, and recorded with an important
 * honesty caveat: **AOC does not enforce this against the recipient.** Once a
 * right has left the transferor, AOC has no authority relationship with the
 * recipient through which to refuse anything -- indeed it has no authority
 * relationship with the recipient at all (see
 * `docs/architecture/ADR-TRANSFER-ACTION.md`). This field records what the
 * transferring party declared, so that a later governed request can be
 * evaluated against it by policy, and so an auditor can see what was intended.
 * It is a declaration AOC preserves, never a rule AOC applies to a party it
 * does not govern.
 */
export const ENTERPRISE_TRANSFER_DISPOSITIONS = {
  PROHIBITED: 'prohibited',
  APPROVAL_REQUIRED: 'approval-required',
  PERMITTED: 'permitted',
} as const;

export type EnterpriseTransferDisposition = (typeof ENTERPRISE_TRANSFER_DISPOSITIONS)[keyof typeof ENTERPRISE_TRANSFER_DISPOSITIONS];

/**
 * Declared, provider-neutral limits a transfer authorization carries. Every
 * field is a description AOC records and can compare; none is an instruction
 * AOC carries out, and none is interpreted against any real registry,
 * recipient, or legal system.
 *
 * - `partialTransferAllowed` -- required, because it has no safe default and
 *   because for this action it answers *two* questions at once. For `LICENSE`
 *   and `COLLATERALIZE`, "may this be exercised again?" and "may this be
 *   exercised for less than the whole?" are separate questions with separate
 *   flags. For a transfer they collapse into one, because the quantity is
 *   conserved: permitting tranches *is* permitting repeat execution, and
 *   forbidding tranches *is* requiring the single execution to move exactly
 *   what was authorized. `false` therefore means "one execution, for precisely
 *   the authorized scope"; `true` means "any number of executions whose
 *   transferred scope sums to no more than the authorized scope". This is a
 *   genuine domain finding, not a simplification -- see the package README.
 * - `onwardTransferAllowed` -- required disposition, described above. Silence
 *   about whether a recipient may move the right onward is precisely the
 *   ambiguity a governed authorization exists to remove, even though AOC
 *   cannot enforce the answer.
 * - `recipientAcceptanceRequired?` -- records that this authorization requires
 *   the recipient's acceptance to be evidenced when the transfer is executed,
 *   and is *checked* at execution against a reported acceptance reference
 *   rather than merely declared. Deliberately expressed this way rather than
 *   as an acceptance workflow: whether a given transfer needs acceptance is
 *   entirely arrangement-specific (a registered book-entry movement typically
 *   does not; a novated contractual claim typically does), so AOC neither
 *   requires it universally nor runs it. A deployment that wants acceptance to
 *   be *governed* rather than *evidenced* expresses it through the Approval
 *   Runtime, which already models exactly that. See
 *   `docs/architecture/ADR-TRANSFER-ACTION.md`, "Recipient acceptance".
 * - `considerationEvidenceRequired?` -- records that this authorization
 *   requires evidence of consideration to be reported when the transfer is
 *   executed. This is the whole of AOC's involvement with money in a transfer:
 *   the requirement is expressed as "evidence must be produced", the evidence
 *   itself is an opaque reference, and AOC computes no price, holds no escrow,
 *   settles nothing, converts nothing, and infers no amount. There is
 *   deliberately no amount field anywhere in this package.
 * - `externalAgreementReferenceRequired?` -- records that an external
 *   agreement reference must be reported with the transfer.
 * - `permittedRegistries?` -- an opaque allow-list of registry labels the
 *   external transfer may be effected through. Absent means "not restricted by
 *   this authorization", never "any registry is endorsed". AOC does not
 *   resolve a registry, contact one, or assume one exists.
 */
export interface EnterpriseTransferConstraints {
  readonly partialTransferAllowed: boolean;
  readonly onwardTransferAllowed: EnterpriseTransferDisposition;
  readonly recipientAcceptanceRequired?: boolean;
  readonly considerationEvidenceRequired?: boolean;
  readonly externalAgreementReferenceRequired?: boolean;
  readonly permittedRegistries?: readonly string[];
}

/**
 * The complete statement of *what exactly* is being authorized: which rights,
 * how much of them, from whom, to whom, under what declared limits, and
 * optionally by whom. Shared by `EnterpriseTransferRequest` (what was asked)
 * and `EnterpriseTransferMandate` (what was granted) so the two can never
 * drift into two subtly different notions of "the transfer" -- see
 * `enterpriseTransferTermsWithin`, the single comparison that decides whether
 * granted terms stayed inside requested terms.
 *
 * Five distinct parties/roles appear across this contract and its request, and
 * conflating any two of them is precisely the substitution this package exists
 * to prevent:
 *
 * ```
 * requestedBy      who asks                 (on the request/mandate)
 * asset            what the rights belong to (an already-governed ResourceRef)
 * transferorRef    who currently holds them  (the right leaves this party)
 * transfereeRef    who receives them         (the right arrives at this party)
 * executorRef?     who may perform           (a registry/custodian/agent)
 * ```
 *
 * ## `transferorRef` is not the requester, and this is new
 *
 * No sibling action names the party the authorization takes something *away*
 * from, because none of them takes anything away. `TOKENIZE` and
 * `COLLATERALIZE` name only an executor; `LICENSE` adds a licensee who
 * receives. `TRANSFER` is the first action with a source as well as a
 * destination, and the source is emphatically not the requester: a delegated
 * administrator, a corporate secretary, or a managing agent routinely submits
 * a transfer of a right held by the entity it acts for. The request records
 * whose right is moving; the Kernel decides whether the requester had the
 * authority to move it. Equating the two would silently convert "who asked"
 * into "whose property this was", which is the single most dangerous
 * conflation this action could make.
 *
 * `transfereeRef` is required and, unlike `EnterpriseLicenseTerms.licenseeRef`,
 * is **absolutely binding**: there is no disposition that relaxes it. A
 * license has an assignment disposition because a licensee may later pass on a
 * permission it holds, which is a fact about the licensee's downstream
 * conduct. A transfer has no equivalent, because a "substituted recipient" is
 * not a relaxation of anything -- it is a different transfer, to a different
 * party, requiring its own authority, policy and approvals. Introducing a flag
 * that let a mandate name Company B and be executed for Company C would create
 * exactly the escalation this contract exists to refuse.
 *
 * `executorRef` is **optional**, confirming rather than repeating the
 * `LICENSE` finding, and for a different reason. Licensing showed that some
 * actions have no necessary external performer. Transfer shows something
 * sharper: the *same* action has one in some arrangements and not in others. A
 * holder moving a right directly to a recipient performs the act itself; a
 * movement effected through a registry, a custodian or a transfer agent has a
 * distinct performer whose identity should be bound. Requiring one would force
 * every direct transfer to invent a party, and an invented binding protects
 * nothing. When present, execution is bound to exactly that party; when
 * absent, this authorization does not bind who performs the external act, and
 * the evidence records the performer as an observation.
 *
 * `transferorRef`, `transfereeRef` and `executorRef` are opaque pointers to
 * party identities established elsewhere, never provider credentials,
 * endpoints, or clients.
 */
export interface EnterpriseTransferTerms {
  readonly rights: readonly EnterpriseTransferableRightType[];
  /** The party whose rights are being moved. Deliberately never defaulted from the requester. */
  readonly transferorRef: CanonicalId;
  /** The party the rights move to. Binding without exception -- there is no substitution disposition. */
  readonly transfereeRef: CanonicalId;
  /** How much of the named rights moves. Required: a transfer with no quantity does not describe a movement. */
  readonly scope: EnterpriseTransferScope;
  readonly constraints: EnterpriseTransferConstraints;
  /** Present only when an external party is bound to effect the transfer. Absent means this authorization binds no executor. */
  readonly executorRef?: CanonicalId;
}

// ---------------------------------------------------------------------------
// Shared primitives. Kept in this module (rather than duplicated per contract
// file) so every contract in this package validates, compares, and serializes
// the same concepts identically.
// ---------------------------------------------------------------------------

export const ENTERPRISE_TRANSFER_ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isTransferPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTransferNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isTransferTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ENTERPRISE_TRANSFER_ISO_8601_PATTERN.test(value);
}

export function isTransferPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isTransferCanonicalIdArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => isTransferNonEmptyString(entry));
}

/** Sorted, duplicate-insensitive string-set equality. Reused wherever this package compares reference or label collections. */
export function transferStringArrayEquals(a: readonly string[], b: readonly string[]): boolean {
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.length === bSorted.length && aSorted.every((value, index) => value === bSorted[index]);
}

export function transferOptionalStringArrayEquals(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return transferStringArrayEquals(a, b);
}

const RIGHT_TYPES: readonly EnterpriseTransferableRightType[] = governedRightTypes();
const DISPOSITIONS: readonly EnterpriseTransferDisposition[] = Object.values(ENTERPRISE_TRANSFER_DISPOSITIONS);

export function isEnterpriseTransferableRightType(value: unknown): value is EnterpriseTransferableRightType {
  return isGovernedRightType(value);
}

export function isEnterpriseTransferDisposition(value: unknown): value is EnterpriseTransferDisposition {
  return typeof value === 'string' && DISPOSITIONS.includes(value as EnterpriseTransferDisposition);
}

// ---------------------------------------------------------------------------
// Scope semantics
// ---------------------------------------------------------------------------

export function enterpriseTransferScopeEquals(a: EnterpriseTransferScope, b: EnterpriseTransferScope): boolean {
  return governedRightsScopeEquals(a, b);
}

/**
 * Whether `inner` is fully contained by `outer`. Scopes of different kinds are
 * never comparable: a proportional share and a unit count describe different
 * quantities, and silently coercing between them is exactly the escalation
 * this function exists to prevent. Unitized scopes must also agree on
 * `unitDenomination` -- 500 of one unit is not 500 of another.
 */
export function enterpriseTransferScopeWithin(inner: EnterpriseTransferScope, outer: EnterpriseTransferScope): boolean {
  return governedRightsScopeWithin(inner, outer);
}

/**
 * Adds two commensurable scopes, or returns `null` when they are not
 * commensurable (different kinds, or unitized scopes with different
 * denominations).
 *
 * Structurally the same arithmetic `enterpriseCollateralizationScopeSum`
 * performs, and semantically a stronger requirement. Collateral scope is
 * summed because encumbering a finite right twice exhausts it; transferred
 * scope is summed because the right *left*, and what has left cannot leave
 * again. Integer arithmetic only -- a `null` return is propagated as a refusal
 * by the caller, never as an assumed zero.
 */
export function enterpriseTransferScopeSum(a: EnterpriseTransferScope, b: EnterpriseTransferScope): EnterpriseTransferScope | null {
  return governedRightsScopeSum(a, b);
}

// ---------------------------------------------------------------------------
// Constraint / terms containment
// ---------------------------------------------------------------------------

const DISPOSITION_RANK: Readonly<Record<EnterpriseTransferDisposition, number>> = {
  prohibited: 0,
  'approval-required': 1,
  permitted: 2,
};

/** Whether `inner` disposition is at most as permissive as `outer`. */
function dispositionWithin(inner: EnterpriseTransferDisposition, outer: EnterpriseTransferDisposition): boolean {
  return DISPOSITION_RANK[inner] <= DISPOSITION_RANK[outer];
}

/** An absent outer allow-list declares no restriction, so anything is within it; a restricted outer cannot contain an unrestricted inner. */
function labelListWithin(inner: readonly string[] | undefined, outer: readonly string[] | undefined): boolean {
  if (outer === undefined) return true;
  if (inner === undefined) return false;
  return inner.every((label) => outer.includes(label));
}

/**
 * Whether `inner` constraints are at least as restrictive as `outer`. Used to
 * prove that granted limits never loosened what was requested. Every
 * evidence-requirement flag runs one way only: a granted authorization may
 * demand more evidence than was asked for, never less.
 */
export function enterpriseTransferConstraintsWithin(inner: EnterpriseTransferConstraints, outer: EnterpriseTransferConstraints): boolean {
  if (!outer.partialTransferAllowed && inner.partialTransferAllowed) return false;
  if (!dispositionWithin(inner.onwardTransferAllowed, outer.onwardTransferAllowed)) return false;
  if (outer.recipientAcceptanceRequired === true && inner.recipientAcceptanceRequired !== true) return false;
  if (outer.considerationEvidenceRequired === true && inner.considerationEvidenceRequired !== true) return false;
  if (outer.externalAgreementReferenceRequired === true && inner.externalAgreementReferenceRequired !== true) return false;
  if (!labelListWithin(inner.permittedRegistries, outer.permittedRegistries)) return false;
  return true;
}

export function enterpriseTransferConstraintsEquals(a: EnterpriseTransferConstraints, b: EnterpriseTransferConstraints): boolean {
  return (
    a.partialTransferAllowed === b.partialTransferAllowed &&
    a.onwardTransferAllowed === b.onwardTransferAllowed &&
    a.recipientAcceptanceRequired === b.recipientAcceptanceRequired &&
    a.considerationEvidenceRequired === b.considerationEvidenceRequired &&
    a.externalAgreementReferenceRequired === b.externalAgreementReferenceRequired &&
    transferOptionalStringArrayEquals(a.permittedRegistries, b.permittedRegistries)
  );
}

export function enterpriseTransferTermsEquals(a: EnterpriseTransferTerms, b: EnterpriseTransferTerms): boolean {
  return (
    transferStringArrayEquals(a.rights, b.rights) &&
    a.transferorRef === b.transferorRef &&
    a.transfereeRef === b.transfereeRef &&
    enterpriseTransferScopeEquals(a.scope, b.scope) &&
    a.executorRef === b.executorRef &&
    enterpriseTransferConstraintsEquals(a.constraints, b.constraints)
  );
}

/**
 * The single containment test this package exposes for "did the granted
 * authorization stay inside what was requested?" -- rights are a subset, the
 * scope is contained, the transferor and transferee are unchanged, any bound
 * executor is unchanged, and constraints did not loosen.
 *
 * Note that *both* party identities are equality-checked rather than
 * contained. A narrower transfer is a smaller portion of the same right moving
 * between the same two parties; a different source or a different destination
 * is a different transfer entirely, and no amount of narrowing makes one into
 * the other.
 */
export function enterpriseTransferTermsWithin(inner: EnterpriseTransferTerms, outer: EnterpriseTransferTerms): boolean {
  return (
    inner.rights.every((right) => outer.rights.includes(right)) &&
    inner.transferorRef === outer.transferorRef &&
    inner.transfereeRef === outer.transfereeRef &&
    enterpriseTransferScopeWithin(inner.scope, outer.scope) &&
    inner.executorRef === outer.executorRef &&
    enterpriseTransferConstraintsWithin(inner.constraints, outer.constraints)
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EnterpriseTransferTermsValidationCode =
  | 'MISSING_TERMS'
  | 'INVALID_TERMS'
  | 'MISSING_RIGHTS'
  | 'INVALID_RIGHTS'
  | 'EMPTY_RIGHTS'
  | 'DUPLICATE_RIGHTS'
  | 'MISSING_TRANSFEROR_REF'
  | 'INVALID_TRANSFEROR_REF'
  | 'MISSING_TRANSFEREE_REF'
  | 'INVALID_TRANSFEREE_REF'
  | 'TRANSFEROR_IS_TRANSFEREE'
  | 'MISSING_SCOPE'
  | 'INVALID_SCOPE'
  | 'INVALID_SCOPE_KIND'
  | 'INVALID_SCOPE_BASIS_POINTS'
  | 'INVALID_SCOPE_UNITS'
  | 'INVALID_SCOPE_UNIT_DENOMINATION'
  | 'INVALID_EXECUTOR_REF'
  | 'EXECUTOR_IS_TRANSFEREE'
  | 'MISSING_CONSTRAINTS'
  | 'INVALID_CONSTRAINTS'
  | 'MISSING_PARTIAL_TRANSFER_ALLOWED'
  | 'INVALID_PARTIAL_TRANSFER_ALLOWED'
  | 'MISSING_ONWARD_TRANSFER_ALLOWED'
  | 'INVALID_ONWARD_TRANSFER_ALLOWED'
  | 'INVALID_RECIPIENT_ACCEPTANCE_REQUIRED'
  | 'INVALID_CONSIDERATION_EVIDENCE_REQUIRED'
  | 'INVALID_EXTERNAL_AGREEMENT_REFERENCE_REQUIRED'
  | 'INVALID_PERMITTED_REGISTRIES';

export interface EnterpriseTransferTermsValidationIssue {
  readonly code: EnterpriseTransferTermsValidationCode;
  readonly message: string;
}

/** Validates a candidate transfer scope in isolation. Exposed because execution evidence carries one without carrying full terms. */
export function collectEnterpriseTransferScopeIssues(candidate: unknown, path: string): EnterpriseTransferTermsValidationIssue[] {
  const issues: EnterpriseTransferTermsValidationIssue[] = [];
  if (!isTransferPlainObject(candidate)) {
    issues.push({ code: 'INVALID_SCOPE', message: `${path} must be an object naming how much of the rights moves.` });
    return issues;
  }
  if (candidate.kind === 'proportional') {
    if (!isTransferPositiveInteger(candidate.basisPoints) || candidate.basisPoints > ENTERPRISE_TRANSFER_FULL_BASIS_POINTS) {
      issues.push({
        code: 'INVALID_SCOPE_BASIS_POINTS',
        message: `${path}.basisPoints must be an integer between 1 and ${ENTERPRISE_TRANSFER_FULL_BASIS_POINTS} (basis points, never a floating-point percentage).`,
      });
    }
  } else if (candidate.kind === 'unitized') {
    if (!isTransferPositiveInteger(candidate.units)) {
      issues.push({ code: 'INVALID_SCOPE_UNITS', message: `${path}.units must be a positive integer.` });
    }
    if (!isTransferNonEmptyString(candidate.unitDenomination)) {
      issues.push({ code: 'INVALID_SCOPE_UNIT_DENOMINATION', message: `${path}.unitDenomination must be a non-empty string.` });
    }
  } else {
    issues.push({ code: 'INVALID_SCOPE_KIND', message: `${path}.kind must be 'proportional' or 'unitized'.` });
  }
  return issues;
}

function collectConstraintIssues(candidate: unknown, path: string): EnterpriseTransferTermsValidationIssue[] {
  const issues: EnterpriseTransferTermsValidationIssue[] = [];
  if (!isTransferPlainObject(candidate)) {
    issues.push({ code: 'MISSING_CONSTRAINTS', message: `${path} is required and must be an object.` });
    return issues;
  }

  if (candidate.partialTransferAllowed === undefined) {
    issues.push({
      code: 'MISSING_PARTIAL_TRANSFER_ALLOWED',
      message: `${path}.partialTransferAllowed is required; it has no safe default, and for a transfer it decides both whether tranches are permitted and whether the authorization may be exercised more than once.`,
    });
  } else if (typeof candidate.partialTransferAllowed !== 'boolean') {
    issues.push({ code: 'INVALID_PARTIAL_TRANSFER_ALLOWED', message: `${path}.partialTransferAllowed must be a boolean.` });
  }

  if (candidate.onwardTransferAllowed === undefined) {
    issues.push({ code: 'MISSING_ONWARD_TRANSFER_ALLOWED', message: `${path}.onwardTransferAllowed is required; it has no safe default.` });
  } else if (!isEnterpriseTransferDisposition(candidate.onwardTransferAllowed)) {
    issues.push({ code: 'INVALID_ONWARD_TRANSFER_ALLOWED', message: `${path}.onwardTransferAllowed must be one of: ${DISPOSITIONS.join(', ')}.` });
  }

  const flags: readonly (readonly [string, EnterpriseTransferTermsValidationCode])[] = [
    ['recipientAcceptanceRequired', 'INVALID_RECIPIENT_ACCEPTANCE_REQUIRED'],
    ['considerationEvidenceRequired', 'INVALID_CONSIDERATION_EVIDENCE_REQUIRED'],
    ['externalAgreementReferenceRequired', 'INVALID_EXTERNAL_AGREEMENT_REFERENCE_REQUIRED'],
  ];
  for (const [field, code] of flags) {
    const value = candidate[field];
    if (value !== undefined && typeof value !== 'boolean') {
      issues.push({ code, message: `${path}.${field} must be a boolean when present.` });
    }
  }

  if (candidate.permittedRegistries !== undefined) {
    if (!isTransferCanonicalIdArray(candidate.permittedRegistries) || candidate.permittedRegistries.length === 0) {
      issues.push({
        code: 'INVALID_PERMITTED_REGISTRIES',
        message: `${path}.permittedRegistries must be a non-empty array of non-empty opaque labels when present; omit it to declare no registry restriction.`,
      });
    } else if (new Set(candidate.permittedRegistries).size !== candidate.permittedRegistries.length) {
      issues.push({ code: 'INVALID_PERMITTED_REGISTRIES', message: `${path}.permittedRegistries must not repeat a label.` });
    }
  }

  return issues;
}

/** Validates a candidate `EnterpriseTransferTerms`. Accepts `unknown` so it can guard deserialized/external input. */
export function collectEnterpriseTransferTermsIssues(candidate: unknown, path = 'terms'): EnterpriseTransferTermsValidationIssue[] {
  if (!isTransferPlainObject(candidate)) {
    return [{ code: 'MISSING_TERMS', message: `${path} is required and must be an object.` }];
  }

  const issues: EnterpriseTransferTermsValidationIssue[] = [];

  if (candidate.rights === undefined) {
    issues.push({ code: 'MISSING_RIGHTS', message: `${path}.rights is required.` });
  } else if (!Array.isArray(candidate.rights) || !candidate.rights.every((right) => isEnterpriseTransferableRightType(right))) {
    issues.push({ code: 'INVALID_RIGHTS', message: `${path}.rights must be an array of: ${RIGHT_TYPES.join(', ')}.` });
  } else if (candidate.rights.length === 0) {
    issues.push({
      code: 'EMPTY_RIGHTS',
      message: `${path}.rights must name at least one right; 'transfer the asset' is not an expressible authorization -- a transfer moves named rights, never an asset in the abstract.`,
    });
  } else if (new Set(candidate.rights).size !== candidate.rights.length) {
    issues.push({ code: 'DUPLICATE_RIGHTS', message: `${path}.rights must not repeat a right category.` });
  }

  if (!isTransferNonEmptyString(candidate.transferorRef)) {
    issues.push({
      code: candidate.transferorRef === undefined ? 'MISSING_TRANSFEROR_REF' : 'INVALID_TRANSFEROR_REF',
      message: `${path}.transferorRef is required and must be a non-empty string; it names the party whose right is moving and is deliberately never defaulted from the requester.`,
    });
  }

  if (!isTransferNonEmptyString(candidate.transfereeRef)) {
    issues.push({
      code: candidate.transfereeRef === undefined ? 'MISSING_TRANSFEREE_REF' : 'INVALID_TRANSFEREE_REF',
      message: `${path}.transfereeRef is required and must be a non-empty string; it is distinct from the requester, the transferor, the approver and any executor.`,
    });
  }

  // A right that moves from a party to itself moves nothing. Rejected as an
  // unrepresentable state rather than recorded as a no-op authorization, so a
  // mis-wired caller is told what it did instead of being handed a mandate
  // whose execution could never mean anything.
  if (
    isTransferNonEmptyString(candidate.transferorRef) &&
    isTransferNonEmptyString(candidate.transfereeRef) &&
    candidate.transferorRef === candidate.transfereeRef
  ) {
    issues.push({
      code: 'TRANSFEROR_IS_TRANSFEREE',
      message: `${path}.transferorRef and ${path}.transfereeRef must name different parties; a right transferred to its current holder has not moved.`,
    });
  }

  if (candidate.scope === undefined) {
    issues.push({
      code: 'MISSING_SCOPE',
      message: `${path}.scope is required; unlike a license, a transfer is inherently a question of how much of the named rights moves, and silence cannot distinguish a full transfer from a partial one.`,
    });
  } else {
    issues.push(...collectEnterpriseTransferScopeIssues(candidate.scope, `${path}.scope`));
  }

  if (candidate.executorRef !== undefined) {
    if (!isTransferNonEmptyString(candidate.executorRef)) {
      issues.push({
        code: 'INVALID_EXECUTOR_REF',
        message: `${path}.executorRef must be a non-empty string when present; omit it entirely when this authorization binds no external executor.`,
      });
    } else if (candidate.executorRef === candidate.transfereeRef) {
      // Binding the recipient as the party permitted to effect its own
      // acquisition would make the executor binding vacuous: the check that
      // exists to prove an independent party performed the movement would be
      // satisfied by the party that gains from it.
      issues.push({
        code: 'EXECUTOR_IS_TRANSFEREE',
        message: `${path}.executorRef must not be the transferee; binding the recipient as the executor of its own acquisition makes the executor binding meaningless.`,
      });
    }
  }

  issues.push(...collectConstraintIssues(candidate.constraints, `${path}.constraints`));

  return issues;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedEnterpriseTransferTerms {
  readonly rights: readonly string[];
  readonly transferorRef: string;
  readonly transfereeRef: string;
  readonly scope: EnterpriseTransferScope;
  readonly executorRef?: string;
  readonly constraints: {
    readonly partialTransferAllowed: boolean;
    readonly onwardTransferAllowed: string;
    readonly recipientAcceptanceRequired?: boolean;
    readonly considerationEvidenceRequired?: boolean;
    readonly externalAgreementReferenceRequired?: boolean;
    readonly permittedRegistries?: readonly string[];
  };
}

/** Projects a scope to a plain, field-ordered object. Shared by every contract in this package that carries one. */
export function serializeEnterpriseTransferScope(scope: EnterpriseTransferScope): EnterpriseTransferScope {
  return serializeGovernedRightsScope(scope);
}

/** Projects terms to a plain, JSON-safe, deterministically-ordered object. Never throws -- the input is already valid by construction. */
export function serializeEnterpriseTransferTerms(terms: EnterpriseTransferTerms): SerializedEnterpriseTransferTerms {
  const { constraints } = terms;
  return {
    rights: [...terms.rights].sort(),
    transferorRef: terms.transferorRef,
    transfereeRef: terms.transfereeRef,
    scope: serializeEnterpriseTransferScope(terms.scope),
    ...(terms.executorRef === undefined ? {} : { executorRef: terms.executorRef }),
    constraints: {
      partialTransferAllowed: constraints.partialTransferAllowed,
      onwardTransferAllowed: constraints.onwardTransferAllowed,
      ...(constraints.recipientAcceptanceRequired === undefined ? {} : { recipientAcceptanceRequired: constraints.recipientAcceptanceRequired }),
      ...(constraints.considerationEvidenceRequired === undefined ? {} : { considerationEvidenceRequired: constraints.considerationEvidenceRequired }),
      ...(constraints.externalAgreementReferenceRequired === undefined
        ? {}
        : { externalAgreementReferenceRequired: constraints.externalAgreementReferenceRequired }),
      ...(constraints.permittedRegistries === undefined ? {} : { permittedRegistries: [...constraints.permittedRegistries].sort() }),
    },
  };
}

/**
 * Maps an already-validated candidate onto `EnterpriseTransferTerms`. Every
 * field is read explicitly -- no structural cast over unchecked input,
 * matching the convention in `@aoc-enterprise/access-decision`,
 * `@aoc-enterprise/access-grant`, `@aoc-enterprise/tokenization-mandate`,
 * `@aoc-enterprise/collateralization-mandate` and
 * `@aoc-enterprise/license-mandate`.
 */
export function readEnterpriseTransferTerms(value: SerializedEnterpriseTransferTerms): EnterpriseTransferTerms {
  return {
    rights: value.rights.map((right) => right as EnterpriseTransferableRightType),
    transferorRef: value.transferorRef,
    transfereeRef: value.transfereeRef,
    scope: serializeEnterpriseTransferScope(value.scope),
    ...(value.executorRef === undefined ? {} : { executorRef: value.executorRef }),
    constraints: {
      partialTransferAllowed: value.constraints.partialTransferAllowed,
      onwardTransferAllowed: value.constraints.onwardTransferAllowed as EnterpriseTransferDisposition,
      ...(value.constraints.recipientAcceptanceRequired === undefined
        ? {}
        : { recipientAcceptanceRequired: value.constraints.recipientAcceptanceRequired }),
      ...(value.constraints.considerationEvidenceRequired === undefined
        ? {}
        : { considerationEvidenceRequired: value.constraints.considerationEvidenceRequired }),
      ...(value.constraints.externalAgreementReferenceRequired === undefined
        ? {}
        : { externalAgreementReferenceRequired: value.constraints.externalAgreementReferenceRequired }),
      ...(value.constraints.permittedRegistries === undefined ? {} : { permittedRegistries: [...value.constraints.permittedRegistries] }),
    },
  };
}
