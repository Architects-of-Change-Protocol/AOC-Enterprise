/**
 * Demo-local reporting shapes. None of these are Access Governance
 * contracts -- they carry no field a frozen contract owns, they are never
 * validated, serialized, or persisted the way `EnterpriseAccessDecision` et
 * al. are, and they exist only so Phase 4 ("Visualization") of this demo
 * can render every artifact the lifecycle produces as a business-readable
 * card instead of a raw object dump.
 */

/** One lifecycle artifact, rendered exactly as Phase 4 requires: identifier, timestamp, owner, relationship, purpose -- never raw SDK/contract JSON. */
export interface ArtifactCard {
  readonly stage: string;
  readonly identifier: string;
  readonly timestamp: string;
  readonly owner: string;
  readonly relationship: string;
  readonly purpose: string;
}

/** One business-purpose sentence for one lifecycle transition (Phase 5: "why", never "how"). */
export interface TransitionNarrative {
  readonly transition: string;
  readonly businessPurpose: string;
}

/** The full observable output of one scenario run: every artifact card in order, every transition narrative, and a closing outcome line for the CTO-facing summary. */
export interface ScenarioResult {
  readonly scenarioTitle: string;
  readonly outcomeSummary: string;
  readonly cards: readonly ArtifactCard[];
  readonly narrative: readonly TransitionNarrative[];
}
