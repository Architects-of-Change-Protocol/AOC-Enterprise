import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';

/**
 * The lifecycle of a Soberanía Enterprise authorization artifact, as a deliberate
 * two-state union.
 *
 * `'active'` records that this is, as far as the artifact's own history is
 * concerned, the operative authorization; `'revoked'` records that a later,
 * separate act withdrew it.
 *
 * Four independently-written actions each reached this same two-state
 * vocabulary, each after considering and rejecting the same additional
 * candidates, and each for the same reason: every other state a caller might
 * ask about is *derivable* from facts already recorded, and a stored copy of a
 * derived state can disagree with the facts it was derived from.
 *
 * ```
 * expired      derived from effectiveFrom / expiresAt
 * exhausted    derived from recorded execution evidence against the terms
 * superseded   a relationship between two artifacts, not a property of either
 * ```
 *
 * And one rejection that is specific to what these artifacts *are*: an
 * external arrangement ending — a licence terminated, collateral released, a
 * transfer reversed — is a fact about that arrangement, not about this
 * authorization. Promoting an externally-reported fact into governance state
 * would be Soberanía claiming to know, or to have caused, something it did not.
 * Such reports are recorded as separate, append-only, observation-only
 * evidence that references the artifact, never as a status on it.
 */
export type GovernedAuthorizationStatus = 'active' | 'revoked';

/**
 * The action-neutral skeleton of a durable Soberanía Enterprise authorization
 * artifact: **the identity of an authorization, its linkage to the governance
 * decision that produced it, its validity window, and its revocation state.**
 *
 * This is the strongest result of the four-enforcement audit. `TOKENIZE`,
 * `COLLATERALIZE`, `LICENSE` and `TRANSFER` were written independently, months
 * apart, for four unrelated domains, and produced these same seventeen fields
 * with the same meanings, the same optionality, and the same "reference what is
 * owned elsewhere, never embed it" discipline — with **zero** extra fields in
 * any of the four. It is definable without naming any action, which is the
 * test this package applies.
 *
 * `TTerms` is the one thing that genuinely differs. Tokenization terms,
 * collateralization terms, licence terms and transfer terms share no field
 * beyond `rights`, so the terms are a parameter rather than a member, and each
 * action keeps its own terms type, its own validator, its own error taxonomy
 * and its own serializer. Extracting those would have produced a type where
 * almost every field is optional, which is how a contract stops constraining
 * anything.
 *
 * ## What an extending interface must still do
 *
 * This base narrows nothing and validates nothing. Each action's mandate
 * re-declares `schemaVersion` as its own literal and `status` as its own
 * union, so a serialized artifact still names its own schema on its face and
 * cannot be replayed through a sibling action's contract. Every action retains
 * its own `validate*` function, because the *domain* constraints genuinely
 * differ even where the shapes do not — this package deliberately centralizes
 * no domain constraint.
 *
 * ## What this artifact never claims
 *
 * An authorization artifact records that Soberanía authorized something. It never
 * records that the thing happened: no token was minted, no security interest
 * created, no licence granted, and no right moved by the existence of one of
 * these. That is what execution evidence is for.
 *
 * Nor does it move authority. Nothing in this package, and nothing in any
 * action built on it, writes to the Authority Graph — including after an
 * external act completes. See `docs/architecture/ADR-TRANSFER-ACTION.md`,
 * "Post-transfer authority".
 */
export interface GovernedAuthorizationArtifact<TTerms> {
  readonly schemaVersion: string;
  readonly id: CanonicalId;
  readonly status: GovernedAuthorizationStatus;
  /** The governed asset the authorization concerns — Protocol `ResourceRef` identity only, never a copy of the asset. */
  readonly asset: ResourceRef;
  /** Exactly what was authorized. The one member four actions could not agree on, and therefore a parameter. */
  readonly terms: TTerms;
  readonly requestRef: CanonicalId;
  readonly requestedBy: CanonicalId;
  /** The canonical Kernel decision that authorized this artifact. An artifact can only exist because a governance decision produced it. */
  readonly decisionRef: CanonicalId;
  /** When Soberanía's authority under this artifact begins. Never the external arrangement's own effective date. */
  readonly effectiveFrom: UtcDateTime;
  /** When Soberanía's authority under this artifact ends. Never a claim about anything already done externally. */
  readonly expiresAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  /** The Governance Store aggregate that durably proves the decision — its trace, reason codes, events and integrity chain. */
  readonly evaluationRef?: CanonicalId;
  readonly issuerRef?: CanonicalId;
  readonly approvalRefs?: readonly CanonicalId[];
  readonly obligationRefs?: readonly CanonicalId[];
  readonly evidenceRefs?: readonly CanonicalId[];
  readonly auditRefs?: readonly CanonicalId[];
}
