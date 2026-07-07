import type { AocGovernanceSource } from './control-plane-navigation.js';

export interface ProofReferenceRow {
  readonly id: string;
  readonly source: AocGovernanceSource;
  readonly proofHash: string;
  readonly previousHash?: string;
  readonly decisionId?: string;
  readonly requestId?: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly resourceScope?: string;
  readonly createdAt: string;
}

export interface ProofChainRow {
  readonly id: string;
  readonly title: string;
  readonly proofIds: readonly string[];
  readonly sources: readonly AocGovernanceSource[];
  readonly complete: boolean;
}
