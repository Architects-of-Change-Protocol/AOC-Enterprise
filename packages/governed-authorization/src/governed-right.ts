/**
 * The action-neutral vocabulary of AOC Enterprise's governed authorization
 * layer.
 *
 * Everything in this package earned its place by appearing, with identical
 * meaning, in **four independently-motivated governed actions** — `TOKENIZE`,
 * `COLLATERALIZE`, `LICENSE` and `TRANSFER` — and by being definable without
 * naming any of them. Nothing here is speculative, and nothing here is a
 * framework: this package contains no orchestration, no policy engine, no
 * persistence, no service, no API, no provider SDK, and no execution. It is
 * pure data vocabulary.
 *
 * It deliberately does **not** contain, and must never contain:
 *
 * - any action's `terms` (tokenization, collateralization, licence and
 *   transfer terms share no field beyond `rights`);
 * - any action's validation rules, error taxonomy, or serializer — those stay
 *   local, because each action's *domain* constraints genuinely differ even
 *   where its *shapes* do not;
 * - any notion of requiredness or accumulation for a scope, which four actions
 *   proved to be action-specific;
 * - any party role. Four actions produced `executorRef`, `securedPartyRef`,
 *   `licenseeRef`, `transferorRef` and `transfereeRef`, and they share
 *   identity representation and nothing else.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/governed-authorization`).
 *
 * See `docs/architecture/ADR-ENTERPRISE-ENFORCEMENT-VOCABULARY.md` for the
 * four-enforcement audit that authorized this extraction, and for the
 * candidates it deliberately rejected.
 */

/**
 * The canonical vocabulary of governed right categories an AOC Enterprise
 * action may concern.
 *
 * Each value names **which right of the asset is engaged**, and that is a
 * property of the asset's rights rather than of the action applied to them.
 * This was the audit's central and hardest-won finding, and `TRANSFER` is what
 * settled it: for `LICENSE`, `'ownership-interest'` names the right a
 * permission *draws on* while the permission granted is something narrower;
 * for `TRANSFER` the very same value names the thing that *moves*. One
 * vocabulary, two completely different relations to it — which is only
 * possible because the vocabulary is asset-side.
 *
 * So a `GovernedRightType` is not "a right an action grants". It is a category
 * of right attached to a governed asset, which four different exercises of
 * authority each select from: representing it externally, encumbering it,
 * permitting its exercise, and moving it.
 *
 * Deliberately a closed union: the categories are stable, provider-neutral,
 * shared vocabulary, and a future category is a schema-version change in every
 * consuming action, not an escape hatch.
 *
 * No value is marked transferable, licensable, encumberable or tokenizable
 * here, and that refusal is deliberate. Whether a usage right may be assigned,
 * whether an ownership interest may be split, and whether a contractual claim
 * is capable of novation are matters of the arrangement and the jurisdiction.
 * AOC evaluates configured authority, policy, approvals and obligations; it
 * encodes no universal legal rule in this vocabulary.
 *
 * **A value from this union is never, by itself, a statement that anyone holds
 * anything.** That has not changed and cannot: this package is vocabulary, and
 * naming a right in an action's terms says what the action concerns, not who
 * controls it.
 *
 * What *has* changed is that the vocabulary is no longer inert with respect to
 * authority. When `TRANSFER` was implemented, the Authority Graph scoped
 * authority by capability, action and resource-scope string alone, held no
 * governed-right field, and no authority check consulted this union at all —
 * so an actor scoped to `asset:work-a:usage-right` could move that asset's
 * ownership interest and nothing objected. A governed authority layer was
 * subsequently built *on top of* this vocabulary
 * (`@aoc-enterprise/governed-authority`), which pairs a value from this union
 * with a holder, a resource and a `GovernedRightsScope` to express recognized
 * authority, and which `AocKernel` consults for every right an action
 * declares.
 *
 * The `AuthorityGrant` statement above still holds exactly as written: it
 * carries no governed-right field and was not modified. The governed-right
 * check is an adjacent, typed layer, not a change to this package's meaning.
 * See `docs/architecture/ADR-TRANSFER-ACTION.md`, "Authority-source right vs
 * action-target right", and
 * `docs/architecture/ADR-GOVERNED-AUTHORITY-TRANSITION.md`.
 */
export const GOVERNED_RIGHT_TYPES = {
  ECONOMIC_INTEREST: 'economic-interest',
  REVENUE_RIGHT: 'revenue-right',
  OWNERSHIP_INTEREST: 'ownership-interest',
  USAGE_RIGHT: 'usage-right',
  CONTRACTUAL_CLAIM: 'contractual-claim',
} as const;

export type GovernedRightType = (typeof GOVERNED_RIGHT_TYPES)[keyof typeof GOVERNED_RIGHT_TYPES];

const RIGHT_TYPES: readonly GovernedRightType[] = Object.values(GOVERNED_RIGHT_TYPES);

export function isGovernedRightType(value: unknown): value is GovernedRightType {
  return typeof value === 'string' && RIGHT_TYPES.includes(value as GovernedRightType);
}

/** The canonical right categories as a readonly list, for building error messages without re-deriving the union at each call site. */
export function governedRightTypes(): readonly GovernedRightType[] {
  return RIGHT_TYPES;
}
