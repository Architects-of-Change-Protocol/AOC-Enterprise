import type { DemoScenarioId } from './demo-scenario.js';

export type DemoProofChainSource = 'recognition' | 'authority' | 'approval' | 'handshake' | 'enforcement';

export interface DemoProofChain {
  readonly id: string;
  readonly scenarioId: DemoScenarioId;
  readonly complete: boolean;
  readonly proofIds: readonly string[];
  readonly proofHashes: readonly string[];
  readonly sources: readonly DemoProofChainSource[];
  readonly missingSources: readonly DemoProofChainSource[];
}
