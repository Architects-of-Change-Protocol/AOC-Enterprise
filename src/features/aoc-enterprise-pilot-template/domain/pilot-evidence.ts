export type PilotExpectedEvidenceBehavior =
  | 'not_required'
  | 'missing'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'satisfied';

export interface PilotEvidenceScenario {
  readonly action: string;
  readonly requiredEvidenceTypes: readonly string[];
  readonly expectedEvidenceBehavior: PilotExpectedEvidenceBehavior;
  readonly description: string;
}

/**
 * Describes which Evidence / Source / Citation Runtime records a pilot
 * expects to be in play. Never infers legal sufficiency -- see README.
 */
export interface PilotEvidenceModel {
  readonly sourceDocumentIds: readonly string[];
  readonly evidenceArtifactIds: readonly string[];
  readonly evidenceRequirementIds: readonly string[];
  readonly evidenceSatisfactionIds: readonly string[];
  readonly evidenceProofIds: readonly string[];
  readonly citationIds: readonly string[];

  readonly evidenceScenarios: readonly PilotEvidenceScenario[];

  readonly walkthrough: readonly string[];
}
