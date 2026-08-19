import type { GovernedAuthorityEncumbrance } from '@aoc-enterprise/governed-authority';

/**
 * The shared vocabulary of the `RELEASE_ENCUMBRANCE` governed action: what a
 * governed release authorization is *about* (one persistent authority
 * constraint), *who asked for it* (a requester with recognized release action
 * authority), *what carries it out* (a trusted executor), and *what makes its
 * effect trusted rather than claimed* (confirmed execution evidence).
 *
 * `RELEASE_ENCUMBRANCE` means: authorizing the discharge of one identified
 * `GovernedAuthorityEncumbrance`, so the portion of a holder's governed
 * authority that constraint has been holding becomes committable again.
 *
 * ## Why this is a governed action and not a status flag
 *
 * A persistent constraint is the one piece of authority state that outlives
 * every artifact that produced it. Its mandate can be exhausted, expired or
 * revoked while it still stands, and until this action existed the only way it
 * could stop standing was a privileged operator override. Ending it has a
 * durable governed effect that is exactly as consequential as creating it:
 *
 * ```
 * persistent authority constraint
 *     -> authorized release
 *     -> constraint becomes terminal
 *     -> previously unavailable authority becomes available
 * ```
 *
 * That is a change in what future governed actions may do, which is the
 * threshold the four existing actions meet and internal authority
 * configuration does not. See
 * `docs/architecture/ADR-GOVERNED-ENCUMBRANCE-RELEASE.md`.
 *
 * ## The five roles this action keeps apart
 *
 * Conflating any two of them is precisely the substitution this module exists
 * to prevent:
 *
 * ```
 * encumbered holder   whose authority stays constrained     (read from the constraint)
 * requester           who asks Soberanía to release it            (needs release action authority)
 * secured party       who benefited from the arrangement    (a COLLATERALIZE role; not authority)
 * executor            what performs the external release    (a trusted port, never a caller)
 * operator            who may override in a repair          (system context only)
 * ```
 *
 * None of the first three grants any of the others. In particular, being the
 * encumbered holder confers no release authority whatsoever — a holder who
 * could discharge her own constraint by asking would make the constraint worth
 * nothing.
 *
 * ## What it emphatically is not
 *
 * - **Not a transfer, and not a credit.** Release moves no authority and
 *   creates none. The holder's `GovernedAuthorityPosition` is byte-identical
 *   before and after; only the set of constraints counted against it changes.
 * - **Not a deletion.** A released constraint is kept, with the lineage that
 *   ended it. History stays reconstructible.
 * - **Not a legal discharge.** A confirmed release means the configured
 *   execution system reported that it released the arrangement. Soberanía does not
 *   claim a lien was discharged, a security interest extinguished, a registry
 *   updated, a creditor paid or a debt satisfied.
 * - **Not partial.** One mandate discharges one constraint in whole. See
 *   `docs/enterprise/AOC_GOVERNED_ENCUMBRANCE_RELEASE.md`, "Partial release".
 * - **Not an un-release.** `'active' -> 'released'` is the whole lifecycle.
 *   Re-encumbering requires a new governed `COLLATERALIZE`.
 */
export const ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY = 'release-encumbrance' as const;

export type EnterpriseReleaseEncumbranceCapability = typeof ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY;

export const ENTERPRISE_ENCUMBRANCE_RELEASE_SCHEMA_VERSION = 'aoc.enterprise.encumbrance-release.v1' as const;

/**
 * Tenant scope for every Encumbrance Release Governance call. Identical in
 * shape to `CollateralizationGovernanceContext`,
 * `TransferGovernanceContext` and `AuthorityGovernanceContext`, on purpose: a
 * caller that already holds one of those holds this one.
 */
export interface EncumbranceReleaseGovernanceContext {
  readonly system: boolean;
  readonly organizationId?: string;
  readonly actorId?: string;
}

/** A governed resource, in the same `kind`/`id` shape every action module persists as `assetKind`/`assetId`. */
export interface EncumbranceReleaseResourceRef {
  readonly kind: string;
  readonly id: string;
  readonly tenantId?: string;
}

/**
 * The two states a governance act can put a release mandate in, plus the one
 * its own successful execution puts it in.
 *
 * ```
 * active     the authorization stands and may still be executed
 * executed   its execution was confirmed successful; the grant is spent
 * revoked    the authorization was withdrawn before it was spent
 * ```
 *
 * `'executed'` is terminal and one-per-mandate: a release mandate authorizes
 * exactly one discharge, so once the discharge is confirmed there is nothing
 * left for it to authorize. There is deliberately no `'expired'` — expiry is
 * derived from `expiresAt` against the clock, exactly as the four existing
 * actions derive it, rather than written into a row that would then have to be
 * swept.
 */
export type EncumbranceReleaseMandateStatus = 'active' | 'executed' | 'revoked';

/**
 * The durable authorization artifact.
 *
 * Note how little of the constraint it copies. It names the target by
 * reference and nothing else: no holder, no right, no scope, no source action,
 * no source execution. Every one of those is read from the canonical
 * `GovernedAuthorityEncumbrance` at execution time, because a mandate that
 * restated them could authorize a discharge on terms that had drifted from the
 * constraint Soberanía actually holds — and because a caller able to supply them
 * could choose which constraint a release "really" meant.
 */
export interface EncumbranceReleaseMandateRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly status: EncumbranceReleaseMandateStatus;

  readonly resourceKind: string;
  readonly resourceId: string;
  readonly resourceTenantId?: string;

  /** The one persistent constraint this authorization may discharge. Never widened, never re-pointed, and never plural. */
  readonly encumbranceRef: string;

  readonly requestRef: string;
  readonly requestedBy: string;
  readonly decisionRef: string;
  readonly evaluationRef?: string;

  readonly effectiveFrom: string;
  readonly expiresAt: string;
  readonly correlationId: string;

  readonly issuerRef?: string;
  readonly approvalRefs?: readonly string[];
  readonly obligationRefs?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs?: readonly string[];

  /** The confirmed execution that spent this grant, once one has. Absent while `'active'`, and what makes "was this mandate ever executed?" answerable without scanning evidence. */
  readonly executionRef?: string;

  readonly createdAt: string;
}

/**
 * How a release execution ended, in the executor's own terms.
 *
 * Three, and the third is the important one. A discharge whose outcome is
 * *unknown* is not a failure and must not be treated as one: reporting it as
 * failure would invite a retry that double-releases externally, and reporting
 * it as success would free capacity for an arrangement that may still stand.
 * It is its own state, it leaves the constraint `'active'`, and it is safe to
 * retry under the same idempotency key.
 *
 * ```
 * confirmed_success   the executor reported the release happened
 * confirmed_failure   the executor reported it definitively did not
 * indeterminate       the executor could not say; includes timeouts
 * ```
 *
 * Only `'confirmed_success'` may terminalize a constraint.
 */
export type EncumbranceReleaseExecutionOutcomeKind = 'confirmed_success' | 'confirmed_failure' | 'indeterminate';

/**
 * The immutable record of one attempt to have a constraint released
 * externally.
 *
 * Evidence, never a decision. It records what a trusted executor reported and
 * when; it does not itself authorize anything, and a caller cannot construct
 * one — the only thing that writes these is the service, from a port
 * invocation it made itself.
 */
export interface EncumbranceReleaseExecutionRecord {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  /** The constraint this attempt was aimed at, copied from the mandate rather than from the executor's reply. */
  readonly encumbranceRef: string;

  readonly outcome: EncumbranceReleaseExecutionOutcomeKind;
  /** Opaque provider label — a platform, an agent, a registry. Never a credential, an endpoint or a client. */
  readonly providerSystem: string;
  readonly attemptedAt: string;
  /** When the executor reported the release happened. `'confirmed_success'` only. */
  readonly confirmedAt?: string;
  /** Opaque reference the executor returned for whatever it produced. Preserved, never interpreted, and never treated as legal proof of anything. */
  readonly providerReleaseReference?: string;
  /** The executor's own code for a definitive failure, or this module's own code for a reply that did not match its target. */
  readonly failureCode?: string;
  readonly failureReason?: string;

  readonly correlationId: string;
  readonly recordedAt: string;
}

/** Withdrawing a release authorization before it is spent. Nothing external is released, and the constraint stays exactly as it was. */
export interface EncumbranceReleaseMandateRevocationRecord {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly revokedAt: string;
  readonly reason: string;
  readonly issuerRef: string;
  readonly correlationId: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface IssueEncumbranceReleaseMandateInput {
  readonly id: string;
  readonly organizationId: string;
  readonly resourceKind: string;
  readonly resourceId: string;
  readonly resourceTenantId?: string;
  readonly encumbranceRef: string;
  readonly requestRef: string;
  readonly requestedBy: string;
  readonly decisionRef: string;
  readonly evaluationRef?: string;
  readonly effectiveFrom: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly issuerRef?: string;
  readonly approvalRefs?: readonly string[];
  readonly obligationRefs?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
}

export interface RecordEncumbranceReleaseExecutionInput {
  readonly id: string;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly encumbranceRef: string;
  readonly outcome: EncumbranceReleaseExecutionOutcomeKind;
  readonly providerSystem: string;
  readonly attemptedAt: string;
  readonly confirmedAt?: string;
  readonly providerReleaseReference?: string;
  readonly failureCode?: string;
  readonly failureReason?: string;
  readonly correlationId: string;
}

export interface RevokeEncumbranceReleaseMandateInput {
  readonly revocationId: string;
  readonly mandateId: string;
  readonly organizationId: string;
  readonly revokedAt: string;
  readonly reason: string;
  readonly issuerRef: string;
  readonly correlationId: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface EncumbranceReleaseRevokeOutcome {
  readonly mandate: EncumbranceReleaseMandateRecord;
  readonly revocation: EncumbranceReleaseMandateRevocationRecord;
}

export interface EncumbranceReleaseMandateStoreHealth {
  readonly providerKind: 'memory' | 'sqlite';
  readonly available: boolean;
  readonly schemaVersion: string;
  readonly mandateCount: number;
  readonly executionCount: number;
  /** How many mandates currently carry `status: 'active'`. Counts stored status only: an active-but-lapsed mandate is still stored active, and is refused at execution by the clock rather than by a rewrite. */
  readonly activeMandateCount: number;
}

/**
 * The complete governance chain behind one release, assembled from references
 * already stored — never a second audit log.
 *
 * This is what makes the phase's central claim checkable end to end: a
 * reviewer can follow one persistent constraint from the collateralization
 * that created it, through the release request, decision, approvals,
 * obligations and mandate, to the executor invocation that confirmed it and
 * the terminal state that resulted.
 */
export interface EncumbranceReleaseEvidenceLineage {
  readonly mandateId: string;
  readonly organizationId: string;
  readonly resource: EncumbranceReleaseResourceRef;
  readonly encumbranceRef: string;
  readonly requestRef: string;
  readonly requestedBy: string;
  readonly decisionRef: string;
  readonly evaluationRef?: string;
  readonly approvalRefs: readonly string[];
  readonly obligationRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly auditRefs: readonly string[];
  readonly executionRefs: readonly string[];
  readonly revocationRef?: string;
  /** The confirmed execution that terminalized the constraint, if one has. */
  readonly releaseExecutionRef?: string;
  /** The constraint as it now stands, when the caller asked for it to be resolved. Absent when the release has not been executed or the constraint is no longer readable. */
  readonly encumbrance?: GovernedAuthorityEncumbrance;
}
