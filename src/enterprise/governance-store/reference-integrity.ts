import { computeDigest, isWellFormedDigest } from './digest.js';
import {
  GOVERNANCE_REFERENCE_INTEGRITY_VERSION,
  type GovernanceIntegrityFailure,
  type GovernanceReferenceChainState,
  type GovernanceReferenceIntegrityStatus,
  type GovernanceReferenceIntegritySummary,
  type GovernanceReferenceInput,
  type GovernanceReferenceRecord,
} from './contracts.js';

/**
 * Reference integrity for the Governance Store: a per-evaluation,
 * append-only hash chain over persisted `governance_references` rows.
 *
 * **Why this is a second integrity domain rather than an extension of the
 * first.** The aggregate digest is sealed inside `appendEvaluation`'s
 * transaction, at which point the artifacts a reference names do not exist
 * yet — a `TokenizationMandate` is issued after the aggregate commits, and an
 * `execution_record` can arrive months later. References are therefore
 * appended *after* the seal, permanently outside it. Folding them in would
 * mean recomputing every historical aggregate digest, which would destroy the
 * one property those digests have: that they attest to bytes committed at a
 * known past moment. So references get their own chain, and history keeps its
 * own truth.
 *
 * **The primitive is not new.** This reuses the Agent Passport Runtime's
 * event-chain shape verbatim (`../passport/events.ts`): an explicit
 * field-set digest input, `aoc.canonical-json.v1` + SHA-256 from
 * `./digest.js`, a per-aggregate (not store-wide) chain, and a stored head
 * projection. Nothing here defines a second canonicalizer or a second digest
 * algorithm.
 *
 * **What it is not.** Not a signature, not non-repudiation, and not proof
 * that the referenced mandate is legitimate, that the actor owned the asset,
 * or that an external system really executed. It proves one thing: this
 * persisted reference row has not changed since the Store sealed it. See
 * "Reference integrity" in `docs/enterprise/AOC_ENTERPRISE_GOVERNANCE_STORE.md`.
 */

/**
 * The exact field set digested for one reference. Absent optional values are
 * pinned to `null` rather than omitted, so "no `uri`" and "`uri` deleted by a
 * tamperer" cannot canonicalize to the same bytes.
 *
 * `organizationId` is the owning aggregate's organization, resolved from the
 * governance request at append time. It is included so a reference is bound
 * to the tenant it was appended under, not merely to an evaluation id.
 */
export interface GovernanceReferenceDigestInput {
  readonly referenceId: string;
  readonly evaluationId: string;
  readonly organizationId?: string;
  readonly sequence: number;
  readonly referenceType: string;
  readonly externalId: string;
  readonly externalVersion?: string;
  readonly digest?: string;
  readonly uri?: string;
  readonly createdAt: string;
  readonly integrityVersion: string;
  readonly previousReferenceDigest?: string;
}

/** The canonical object digested for one reference. Field *order* is irrelevant (canonical JSON sorts keys), but the field *set* is the contract and must not change within a version. */
export function referenceDigestInput(input: GovernanceReferenceDigestInput): Record<string, unknown> {
  return {
    referenceId: input.referenceId,
    evaluationId: input.evaluationId,
    organizationId: input.organizationId ?? null,
    sequence: input.sequence,
    referenceType: input.referenceType,
    externalId: input.externalId,
    externalVersion: input.externalVersion ?? null,
    digest: input.digest ?? null,
    uri: input.uri ?? null,
    createdAt: input.createdAt,
    integrityVersion: input.integrityVersion,
    previousReferenceDigest: input.previousReferenceDigest ?? null,
  };
}

export function computeGovernanceReferenceDigest(input: GovernanceReferenceDigestInput): string {
  return computeDigest(referenceDigestInput(input));
}

/** Chain position and tenant binding the Store resolves inside the append transaction. */
export interface GovernanceReferenceSealContext {
  readonly organizationId?: string;
  readonly sequence: number;
  readonly previousReferenceDigest?: string;
}

/**
 * Seals one caller-supplied reference into a protected
 * `GovernanceReferenceRecord`. Both providers call exactly this, so the
 * sealed bytes cannot drift between the in-memory and SQLite stores. Any
 * integrity fields present on the input are ignored by construction — the
 * input type does not carry them, and only the values computed here are
 * persisted.
 */
export function sealGovernanceReference(reference: GovernanceReferenceInput, context: GovernanceReferenceSealContext): GovernanceReferenceRecord {
  const digestInput: GovernanceReferenceDigestInput = {
    referenceId: reference.referenceId,
    evaluationId: reference.evaluationId,
    ...(context.organizationId !== undefined ? { organizationId: context.organizationId } : {}),
    sequence: context.sequence,
    referenceType: reference.referenceType,
    externalId: reference.externalId,
    ...(reference.externalVersion !== undefined ? { externalVersion: reference.externalVersion } : {}),
    ...(reference.digest !== undefined ? { digest: reference.digest } : {}),
    ...(reference.uri !== undefined ? { uri: reference.uri } : {}),
    createdAt: reference.createdAt,
    integrityVersion: GOVERNANCE_REFERENCE_INTEGRITY_VERSION,
    ...(context.previousReferenceDigest !== undefined ? { previousReferenceDigest: context.previousReferenceDigest } : {}),
  };
  return {
    referenceId: reference.referenceId,
    evaluationId: reference.evaluationId,
    referenceType: reference.referenceType,
    externalId: reference.externalId,
    ...(reference.externalVersion !== undefined ? { externalVersion: reference.externalVersion } : {}),
    ...(reference.digest !== undefined ? { digest: reference.digest } : {}),
    ...(reference.uri !== undefined ? { uri: reference.uri } : {}),
    createdAt: reference.createdAt,
    sequence: context.sequence,
    integrityVersion: GOVERNANCE_REFERENCE_INTEGRITY_VERSION,
    ...(context.previousReferenceDigest !== undefined ? { previousReferenceDigest: context.previousReferenceDigest } : {}),
    referenceDigest: computeGovernanceReferenceDigest(digestInput),
  };
}

/**
 * True when a row carries no reference-integrity metadata whatsoever — the
 * only shape that is honestly "legacy". A row carrying *some* of the metadata
 * is not legacy: it is a protected row that lost part of itself, and it is
 * reported as corrupted rather than quietly demoted.
 */
function isLegacyUnprotected(reference: GovernanceReferenceRecord): boolean {
  return reference.sequence === undefined && reference.integrityVersion === undefined && reference.previousReferenceDigest === undefined && reference.referenceDigest === undefined;
}

export interface GovernanceReferenceIntegrityResult {
  readonly valid: boolean;
  readonly summary: GovernanceReferenceIntegritySummary;
  readonly statuses: ReadonlyMap<string, GovernanceReferenceIntegrityStatus>;
  readonly failures: readonly GovernanceIntegrityFailure[];
}

const CHECK = 'referenceIntegrity';

/**
 * Recomputes and validates the protected reference chain of one aggregate.
 *
 * `chain` is the stored head for this evaluation, and is three-valued:
 *
 * - a `GovernanceReferenceChainState` — full verification, including
 *   tail-truncation detection;
 * - `null` — the store looked and there is no head row. Correct for an
 *   aggregate with only legacy references or none; a **failure** if protected
 *   references exist, because their head was removed;
 * - `undefined` — no head was supplied, so the tail check is skipped. Every
 *   other check still runs. This is not treated as tampering: both providers
 *   always pass an explicit value, so `undefined` only arises when an external
 *   caller uses the three-argument `verifyGovernanceRecordIntegrity`, and
 *   failing them would report intact records as invalid.
 *
 * Failure messages name reference ids and sequences only — never external
 * identifiers, uris, or payloads.
 */
export function verifyGovernanceReferenceIntegrity(
  references: readonly GovernanceReferenceRecord[],
  organizationId: string | undefined,
  chain: GovernanceReferenceChainState | null | undefined,
): GovernanceReferenceIntegrityResult {
  const failures: GovernanceIntegrityFailure[] = [];
  const statuses = new Map<string, GovernanceReferenceIntegrityStatus>();

  const legacy: GovernanceReferenceRecord[] = [];
  const claimed: GovernanceReferenceRecord[] = [];
  for (const reference of references) {
    if (isLegacyUnprotected(reference)) legacy.push(reference);
    else claimed.push(reference);
  }
  for (const reference of legacy) statuses.set(reference.referenceId, 'legacy_unprotected');

  // -- rows claiming a version this build cannot verify: fail closed, and do
  // -- not attempt to recompute bytes whose definition we do not know.
  const verifiable: GovernanceReferenceRecord[] = [];
  for (const reference of claimed) {
    if (reference.integrityVersion !== undefined && reference.integrityVersion !== GOVERNANCE_REFERENCE_INTEGRITY_VERSION) {
      statuses.set(reference.referenceId, 'protected_unsupported_version');
      failures.push({
        check: CHECK,
        message: `Reference '${reference.referenceId}' declares reference-integrity version '${reference.integrityVersion}', which this build cannot verify.`,
      });
      continue;
    }
    verifiable.push(reference);
  }

  // -- structurally incomplete protected rows --
  const complete: GovernanceReferenceRecord[] = [];
  for (const reference of verifiable) {
    const problems: string[] = [];
    if (reference.integrityVersion === undefined) problems.push('integrityVersion');
    if (reference.sequence === undefined || !Number.isInteger(reference.sequence) || reference.sequence < 1) problems.push('sequence');
    if (reference.referenceDigest === undefined) problems.push('referenceDigest');
    else if (!isWellFormedDigest(reference.referenceDigest)) problems.push('referenceDigest (malformed)');
    if (problems.length > 0) {
      statuses.set(reference.referenceId, 'protected_corrupted');
      failures.push({ check: CHECK, message: `Reference '${reference.referenceId}' claims reference-integrity protection but has invalid or missing ${problems.join(', ')}.` });
      continue;
    }
    complete.push(reference);
  }

  // -- chain: contiguous 1..N, each digest recomputes, each link matches --
  const ordered = [...complete].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  let previousDigest: string | undefined;
  for (const [index, reference] of ordered.entries()) {
    const expectedSequence = index + 1;
    let ok = true;

    if (reference.sequence !== expectedSequence) {
      ok = false;
      failures.push({
        check: CHECK,
        message: `Reference '${reference.referenceId}' has sequence ${String(reference.sequence)}, expected ${expectedSequence} (a protected reference was removed, reordered, or duplicated).`,
      });
    }

    const recomputed = computeGovernanceReferenceDigest({
      referenceId: reference.referenceId,
      evaluationId: reference.evaluationId,
      ...(organizationId !== undefined ? { organizationId } : {}),
      sequence: reference.sequence ?? expectedSequence,
      referenceType: reference.referenceType,
      externalId: reference.externalId,
      ...(reference.externalVersion !== undefined ? { externalVersion: reference.externalVersion } : {}),
      ...(reference.digest !== undefined ? { digest: reference.digest } : {}),
      ...(reference.uri !== undefined ? { uri: reference.uri } : {}),
      createdAt: reference.createdAt,
      integrityVersion: GOVERNANCE_REFERENCE_INTEGRITY_VERSION,
      ...(reference.previousReferenceDigest !== undefined ? { previousReferenceDigest: reference.previousReferenceDigest } : {}),
    });
    if (recomputed !== reference.referenceDigest) {
      ok = false;
      failures.push({ check: CHECK, message: `Reference '${reference.referenceId}' does not match its stored referenceDigest (reference row tampering detected).` });
    }

    if (index === 0) {
      if (reference.previousReferenceDigest !== undefined) {
        ok = false;
        failures.push({ check: CHECK, message: `Reference '${reference.referenceId}' is first in this evaluation's chain but carries a previousReferenceDigest.` });
      }
    } else if (reference.previousReferenceDigest !== previousDigest) {
      ok = false;
      failures.push({ check: CHECK, message: `Reference '${reference.referenceId}' previousReferenceDigest does not match the preceding reference's digest (chain break detected).` });
    }

    statuses.set(reference.referenceId, ok ? 'protected_valid' : 'protected_corrupted');
    previousDigest = reference.referenceDigest;
  }

  // -- stored head: what makes tail deletion (and wholesale chain removal) detectable --
  //
  // `undefined` means the caller did not supply a head, so this one check is
  // skipped — everything above (per-row digests, sequence contiguity, chain
  // links) has already run. It deliberately does not fail: "you did not ask
  // for the tail check" is not evidence of tampering, and treating it as such
  // would report every intact record as invalid for any caller using the
  // three-argument `verifyGovernanceRecordIntegrity`. `null` is the different,
  // stronger statement that the store looked and there is no head row.
  const last = ordered[ordered.length - 1];
  if (chain === undefined) {
    // no head supplied — tail-truncation cannot be checked, nothing else changes
  } else if (chain === null) {
    if (ordered.length > 0) {
      failures.push({ check: CHECK, message: `This evaluation has ${ordered.length} protected reference(s) but no stored reference chain head.` });
      for (const reference of ordered) statuses.set(reference.referenceId, 'protected_corrupted');
    }
  } else if (chain.integrityVersion !== GOVERNANCE_REFERENCE_INTEGRITY_VERSION) {
    failures.push({ check: CHECK, message: `The stored reference chain head declares version '${chain.integrityVersion}', which this build cannot verify.` });
  } else if (last === undefined) {
    failures.push({ check: CHECK, message: `A reference chain head records sequence ${chain.latestSequence} but no verifiable protected references remain on this evaluation.` });
  } else if (chain.latestSequence !== last.sequence || chain.latestReferenceDigest !== last.referenceDigest) {
    failures.push({
      check: CHECK,
      message: `The stored reference chain head (sequence ${chain.latestSequence}) does not match the newest protected reference (sequence ${String(last.sequence)}); references were removed or replaced.`,
    });
    statuses.set(last.referenceId, 'protected_corrupted');
  }

  let protectedValid = 0;
  let protectedCorrupted = 0;
  let protectedUnsupportedVersion = 0;
  let legacyUnprotected = 0;
  for (const status of statuses.values()) {
    if (status === 'protected_valid') protectedValid += 1;
    else if (status === 'protected_corrupted') protectedCorrupted += 1;
    else if (status === 'protected_unsupported_version') protectedUnsupportedVersion += 1;
    else legacyUnprotected += 1;
  }

  return {
    valid: failures.length === 0,
    summary: { legacyUnprotected, protectedValid, protectedCorrupted, protectedUnsupportedVersion },
    statuses,
    failures,
  };
}
