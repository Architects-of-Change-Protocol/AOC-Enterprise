export type PilotActorType = 'human' | 'organization' | 'internal_agent' | 'external_agent' | 'system';

export type PilotActorExpectedRecognitionState = 'recognized' | 'requires_evidence' | 'denied' | 'not_applicable';

/**
 * A participant referenced by a pilot template. `expectedRecognitionState`
 * is a pilot-authored expectation only -- it is never itself a Recognition
 * Runtime decision; PilotScenarioBindingService/tests confirm real runtime
 * output actually matches it.
 */
export interface PilotActor {
  readonly id: string;
  readonly name: string;
  readonly actorType: PilotActorType;
  readonly role: string;
  readonly trustDomainId: string;
  readonly passportId?: string;
  readonly expectedRecognitionState: PilotActorExpectedRecognitionState;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
