import type { CanonicalId, UtcDateTime } from '@aoc/protocol';

import type { GovernedRightType } from './governed-right.js';

/**
 * The action-neutral core of a record that **an external system reported
 * acting under a previously-issued authorization artifact**.
 *
 * Nine fields, identical across `TOKENIZE`, `COLLATERALIZE`, `LICENSE` and
 * `TRANSFER`, together with the posture that matters more than any of them:
 * **recording evidence never re-authorizes anything.** These records observe;
 * they do not decide. It is the same observation-only relationship
 * `EnterpriseUsageEvent` has to `EnterpriseAccessGrant`.
 *
 * A mandate proves Soberanía authorized something. One of these is the only thing
 * that says it actually happened — and even then it says so on someone else's
 * word: it is a report Soberanía preserved, never a fact Soberanía verified.
 *
 * ## What is deliberately not here
 *
 * **The actor is not in the envelope, and that is a finding rather than an
 * oversight.** Four actions split two-and-two, and the split is semantic:
 *
 * ```
 * TOKENIZE       executorRef   a BOUND identity — checked, always
 * COLLATERALIZE  executorRef   a BOUND identity — checked, always
 * LICENSE        executedBy    an OBSERVATION — checked only if one was bound
 * TRANSFER       executedBy    an OBSERVATION — checked only if one was bound
 * ```
 *
 * Minting a token and creating a security interest are acts someone must
 * perform externally, so those actions require an executor and bind it.
 * Granting a permission and moving a right may be done directly by the party
 * whose right it is, so those actions make the binding optional and record the
 * performer as an observation when none was bound. A single field would have
 * had to mean "checked" and "merely recorded" at once, which is how a
 * contract stops constraining anything. Each action declares its own.
 *
 * **The payload is not here either.** Issued scope and token standards,
 * committed scope and priority rank, granted uses and exclusivity, transferred
 * scope and registration references — four domains, nothing in common.
 *
 * `externalSystem` and `externalTransactionReference` are opaque,
 * provider-neutral values Soberanía stores and echoes and never parses, resolves,
 * validates, or acts on.
 */
export interface GovernedExecutionEvidenceCore {
  readonly schemaVersion: string;
  readonly id: CanonicalId;
  /** The authorization artifact this report is measured against. Never dereferenced by the contracts themselves. */
  readonly mandateRef: CanonicalId;
  readonly executedAt: UtcDateTime;
  /** Which governed rights the external act concerned. Never wider than the artifact authorized. */
  readonly rights: readonly GovernedRightType[];
  readonly correlationId: CanonicalId;
  /** Opaque provider label. Never a credential, endpoint, or client. */
  readonly externalSystem?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly CanonicalId[];
}

/**
 * The action-neutral core of a record that **an external system reported what
 * subsequently became of an act it had already reported** — collateral
 * released or discharged, a licence expired or terminated, a transfer
 * registered or reversed.
 *
 * Eight fields shared by the three actions that have such a concept, plus
 * three more (`occurredAt`, the reported category, and an external reference)
 * that `LICENSE` and `TRANSFER` spell identically and `COLLATERALIZE` spells
 * as `releasedAt` / `releaseType` / `externalReleaseReference`. Those three are
 * the same concepts under an earlier action's naming, so they are declared by
 * each action rather than forced into this core; the audit records the
 * divergence as naming rather than meaning.
 *
 * `TOKENIZE` has no analogue, and after four actions the reason is clear
 * enough to state: minting produces a token whose own subsequent life —
 * burned, moved, split — would be a governed act *over the token*, not a
 * report about the minting. The other three each leave a standing external
 * arrangement that the same arrangement can later be reported to have exited.
 *
 * Three properties travel with this core and are not negotiable per action:
 *
 * - **It is not a governed action.** No authority is evaluated, no decision is
 *   produced, and nothing is authorized. Should ending an arrangement ever
 *   need to be *authorized* rather than *observed*, that is a separate
 *   governed action with its own request, decision and mandate.
 * - **It is not a status.** Presenting an externally-reported fact as
 *   governance state would be Soberanía claiming to know, or to have caused,
 *   something it did not.
 * - **It restores nothing.** Recording a release, a termination or a reversal
 *   never decrements the artifact's execution count or its cumulative
 *   quantity, because Soberanía cannot verify the report and must not manufacture
 *   fresh capacity from an unverified one.
 */
export interface GovernedLifecycleEvidenceCore {
  readonly schemaVersion: string;
  readonly id: CanonicalId;
  readonly mandateRef: CanonicalId;
  /** The specific external act being reported on. A lifecycle report concerns one act, never an artifact in the abstract. */
  readonly executionRef: CanonicalId;
  /** Who reported it. An opaque party pointer — Soberanía neither requires nor infers which role the reporter holds. */
  readonly reportedBy: CanonicalId;
  readonly correlationId: CanonicalId;
  readonly externalSystem?: string;
  readonly evidenceRefs?: readonly CanonicalId[];
}
