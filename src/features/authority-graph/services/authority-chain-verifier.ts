import type { AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityPolicy, AuthorityPolicyContext } from '../domain/authority-chain.js';
import type { AuthorityDecision, AuthorityDecisionType } from '../domain/authority-decision.js';
import { createDefaultAuthorityPolicyChain } from '../policies/index.js';
import type { AuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';
import type { AuthorityGraphStore } from './authority-graph-store.js';
import type { AuthorityLineageLedger } from './authority-lineage-ledger.js';
import type { AuthorityProofService } from './authority-proof-service.js';
import type { AuthorityResolver } from './authority-resolver.js';

export class AuthorityChainVerifier {
  constructor(
    private readonly ctx: AuthorityRuntimeContext,
    private readonly store: AuthorityGraphStore,
    private readonly resolver: AuthorityResolver,
    private readonly proofService: AuthorityProofService,
    private readonly ledger: AuthorityLineageLedger,
    private readonly policies: readonly AuthorityPolicy[] = createDefaultAuthorityPolicyChain(),
  ) {}

  verifyAuthority(request: AuthorityChainRequest): AuthorityDecision {
    const chain = this.resolver.resolveAuthorityChain(request);
    this.ledger.recordEvent({
      type: 'authority_chain_resolved',
      trustDomainId: request.trustDomainId,
      actorId: request.actorId,
      payload: { status: chain.status, depth: chain.depth },
    });

    const rootGrant = chain.grants[chain.grants.length - 1];
    const rootIssuerAccepted = rootGrant ? this.store.isRootIssuer(chain.trustDomainId, rootGrant.issuerActorId) : false;
    const crossDomainAccepted = this.store.isCrossDomainAuthorityAccepted(request.trustDomainId);
    const now = this.ctx.clock.now();

    const context: AuthorityPolicyContext = { now, chain, rootIssuerAccepted, crossDomainAccepted };

    let decisionType: AuthorityDecisionType = 'authority_valid';
    let reasonCode = 'AUTHORITY_CHAIN_VALID';
    let reason = 'Every authority policy passed for the resolved chain.';

    for (const policy of this.policies) {
      const outcome = policy.evaluate(request, context);
      if (!outcome.passed) {
        decisionType = outcome.decisionType ?? 'authority_missing';
        reasonCode = outcome.reasonCode;
        reason = outcome.reason;
        break;
      }
    }

    const valid = decisionType === 'authority_valid';
    const decisionId = this.ctx.ids.nextId('authority-decision');
    const principalActorId = request.principalActorId ?? chain.principalActorId;

    const proof = this.proofService.createProof({
      requestId: request.id,
      authorityDecisionId: decisionId,
      trustDomainId: request.trustDomainId,
      actorId: request.actorId,
      chain,
      decisionType,
      valid,
      ...(principalActorId !== undefined ? { principalActorId } : {}),
    });

    this.ledger.recordEvent({
      type: valid ? 'authority_chain_valid' : 'authority_chain_invalid',
      trustDomainId: request.trustDomainId,
      actorId: request.actorId,
      authorityDecisionId: decisionId,
      payload: { decisionType, reasonCode },
    });
    this.ledger.recordEvent({
      type: 'authority_proof_created',
      trustDomainId: request.trustDomainId,
      actorId: request.actorId,
      authorityDecisionId: decisionId,
      authorityProofId: proof.id,
      payload: { proofHash: proof.proofHash },
    });

    return {
      id: decisionId,
      requestId: request.id,
      type: decisionType,
      valid,
      reasonCode,
      reason,
      actorId: request.actorId,
      trustDomainId: request.trustDomainId,
      chain,
      proofId: proof.id,
      evaluatedAt: now,
      ...(principalActorId !== undefined ? { principalActorId } : {}),
    };
  }
}
