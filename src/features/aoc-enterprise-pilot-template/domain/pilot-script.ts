export interface PilotDemoFlowStep {
  readonly step: number;
  readonly title: string;
  readonly instruction: string;
  readonly expectedObservation: string;
}

/**
 * The deterministic demo script text a pilot generates. Content here is
 * always derived from the owning `PilotTemplate`'s own fields (see
 * `services/pilot-script-service.ts`) -- never an LLM-authored narrative.
 */
export interface PilotScript {
  readonly id: string;

  readonly executiveTalkTrack: readonly string[];
  readonly operatorTalkTrack: readonly string[];
  readonly technicalTalkTrack: readonly string[];
  readonly buyerTalkTrack: readonly string[];

  readonly demoFlow: readonly PilotDemoFlowStep[];

  readonly closingStatement: string;
  readonly legalDisclaimer: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
