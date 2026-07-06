export type AuthorityLineageStepType = 'authority_grant' | 'delegation_grant';

/**
 * One hop in the resolved authority lineage, ordered from the terminal actor
 * back to the root issuer. Used by AuthorityProofService to build a stable,
 * ordered digest of the chain that produced a decision.
 */
export interface AuthorityLineageStep {
  readonly stepType: AuthorityLineageStepType;
  readonly id: string;
  readonly actorId: string;
  readonly issuerActorId: string;
}
