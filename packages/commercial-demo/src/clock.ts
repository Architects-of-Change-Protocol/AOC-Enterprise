import type { UtcDateTime } from '@aoc/protocol';

/**
 * A fixed, replayable clock for the demo narrative. Every timestamp in this
 * package is derived from this single base instant so a run is deterministic
 * and reproducible (in a test, in a terminal, in a screenshot) rather than
 * depending on wall-clock time when the demo happens to execute. This is
 * demo-orchestration code only -- none of the seven frozen Access Governance
 * contracts read or depend on this clock; each still records whatever
 * `UtcDateTime` value the caller supplies.
 */
const DEMO_EPOCH_MS = Date.parse('2026-08-04T09:00:00.000Z');

/** Minutes offset from the demo's base instant, rendered as an ISO 8601 UTC timestamp. */
export function isoAt(offsetMinutes: number): UtcDateTime {
  return new Date(DEMO_EPOCH_MS + offsetMinutes * 60_000).toISOString();
}
