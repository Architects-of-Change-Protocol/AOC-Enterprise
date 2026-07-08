import type { PilotControlPlaneFocus } from './pilot-scenario.js';

export interface PilotControlPlaneWalkthroughSection {
  readonly section: PilotControlPlaneFocus;
  readonly title: string;
  readonly whatToShow: readonly string[];
  readonly whyItMatters: string;
  readonly expectedRowsOrReferences: readonly string[];
}

/**
 * A read-only script for touring the AOC Control Plane during a pilot demo.
 * It never mutates Control Plane state -- see
 * `integrations/control-plane-pilot-adapter.ts` and
 * `services/pilot-control-plane-walkthrough-service.ts`.
 */
export interface PilotControlPlaneWalkthrough {
  readonly id: string;
  readonly sections: readonly PilotControlPlaneWalkthroughSection[];
  readonly operatorScript: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
