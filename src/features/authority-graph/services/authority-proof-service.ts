import type { AuthorityChain } from '../domain/authority-chain.js';
import type { AuthorityDecisionType } from '../domain/authority-decision.js';
import { createDigest } from '../domain/authority-proof.js';
import type { AuthorityProof } from '../domain/authority-proof.js';
import type { AuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';

export interface CreateAuthorityProofInput {
  readonly requestId: string;
  readonly authorityDecisionId: string;
  readonly trustDomainId: string;
  readonly actorId: string;
  readonly principalActorId?: string;
  readonly chain: AuthorityChain;
  readonly decisionType: AuthorityDecisionType;
  readonly valid: boolean;
}

export class AuthorityProofService {
  private readonly proofs: AuthorityProof[] = [];
  private readonly proofsByDecisionId = new Map<string, AuthorityProof>();

  constructor(private readonly ctx: AuthorityRuntimeContext) {}

  createProof(input: CreateAuthorityProofInput): AuthorityProof {
    const chainHash = createDigest({
      grants: input.chain.grants,
      delegations: input.chain.delegations,
      status: input.chain.status,
      depth: input.chain.depth,
      terminalActorId: input.chain.terminalActorId,
      rootIssuerActorId: input.chain.rootIssuerActorId,
    });
    const evaluatedGrantIds = input.chain.grants.map((grant) => grant.id);
    const evaluatedDelegationIds = input.chain.delegations.map((delegation) => delegation.id);
    const previousHash = this.proofs.at(-1)?.proofHash;
    const proofHash = createDigest({
      chainHash,
      authorityDecisionId: input.authorityDecisionId,
      decisionType: input.decisionType,
      valid: input.valid,
      evaluatedGrantIds,
      evaluatedDelegationIds,
      previousHash,
    });

    const proof: AuthorityProof = {
      id: this.ctx.ids.nextId('authority-proof'),
      requestId: input.requestId,
      authorityDecisionId: input.authorityDecisionId,
      trustDomainId: input.trustDomainId,
      actorId: input.actorId,
      chainHash,
      evaluatedGrantIds,
      evaluatedDelegationIds,
      decisionType: input.decisionType,
      valid: input.valid,
      proofHash,
      createdAt: this.ctx.clock.now(),
      ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };
    this.proofs.push(proof);
    this.proofsByDecisionId.set(input.authorityDecisionId, proof);
    return proof;
  }

  getProofByDecisionId(authorityDecisionId: string): AuthorityProof | undefined {
    return this.proofsByDecisionId.get(authorityDecisionId);
  }

  getAllProofs(): readonly AuthorityProof[] {
    return [...this.proofs];
  }
}
