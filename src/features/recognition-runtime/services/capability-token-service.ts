import { createProof } from '../domain/proof.js';
import type {
  ApprovalRequirement,
  RecognitionCapabilityToken,
  EvidenceRequirement,
  RiskLevel,
} from '../domain/capability-token.js';
import type { CapabilityCheckResult } from '../domain/policy.js';
import type { RuntimeContext } from '../runtime/runtime-context.js';
import {
  ActorNotFoundError,
  CapabilityTokenNotFoundError,
  DelegationNotPermittedError,
  TrustDomainNotFoundError,
} from '../runtime/runtime-errors.js';
import type { ActorRegistry } from './actor-registry.js';
import type { TrustDomainService } from './trust-domain-service.js';

export interface IssueCapabilityTokenInput {
  readonly id?: string;
  readonly subjectActorId: string;
  readonly principalActorId: string;
  readonly issuerActorId: string;
  readonly trustDomainId: string;
  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly jurisdiction?: string;
  readonly prohibitedActions?: readonly string[];
  readonly delegatedFromTokenId?: string;
  readonly delegable?: boolean;
  readonly maxDelegationDepth?: number;
  readonly evidenceRequirements?: readonly EvidenceRequirement[];
  readonly approvalRequirement?: ApprovalRequirement;
  readonly riskLevel: RiskLevel;
  readonly expiresAt?: string;
}

export interface CapabilityTokenVerificationResult {
  readonly valid: boolean;
  readonly capabilityToken?: RecognitionCapabilityToken;
  readonly reasonCode: string;
  readonly reason: string;
}

export class CapabilityTokenService {
  private readonly tokens = new Map<string, RecognitionCapabilityToken>();

  constructor(
    private readonly ctx: RuntimeContext,
    private readonly actorRegistry: ActorRegistry,
    private readonly trustDomainService: TrustDomainService,
  ) {}

  issueCapabilityToken(input: IssueCapabilityTokenInput): RecognitionCapabilityToken {
    if (!this.actorRegistry.getActor(input.subjectActorId)) {
      throw new ActorNotFoundError(input.subjectActorId);
    }
    if (!this.trustDomainService.getTrustDomain(input.trustDomainId)) {
      throw new TrustDomainNotFoundError(input.trustDomainId);
    }

    const parent = input.delegatedFromTokenId !== undefined ? this.tokens.get(input.delegatedFromTokenId) : undefined;
    if (input.delegatedFromTokenId !== undefined && !parent) {
      throw new CapabilityTokenNotFoundError(input.delegatedFromTokenId);
    }

    let delegationDepth = 0;
    let maxDelegationDepth = input.maxDelegationDepth ?? 0;
    if (parent) {
      if (parent.status !== 'valid') {
        throw new DelegationNotPermittedError(`parent token ${parent.id} is not valid`);
      }
      if (!parent.delegation.delegable) {
        throw new DelegationNotPermittedError(`parent token ${parent.id} is not delegable`);
      }
      delegationDepth = parent.delegation.delegationDepth + 1;
      maxDelegationDepth = Math.min(input.maxDelegationDepth ?? parent.delegation.maxDelegationDepth, parent.delegation.maxDelegationDepth);
      if (delegationDepth > parent.delegation.maxDelegationDepth) {
        throw new DelegationNotPermittedError(`delegation depth ${delegationDepth} exceeds parent limit ${parent.delegation.maxDelegationDepth}`);
      }
      if (!input.actions.every((action) => parent.actions.includes(action))) {
        throw new DelegationNotPermittedError('delegated actions exceed the scope of the parent token');
      }
      if (!input.resourceScopes.every((scope) => parent.resourceScopes.includes(scope))) {
        throw new DelegationNotPermittedError('delegated resource scopes exceed the scope of the parent token');
      }
    }

    const id = input.id ?? this.ctx.idGenerator.next('capability-token');
    const issuedAt = this.ctx.clock.now();
    const evidenceRequirements = input.evidenceRequirements ?? [];
    const token: RecognitionCapabilityToken = {
      id,
      subjectActorId: input.subjectActorId,
      principalActorId: input.principalActorId,
      issuerActorId: input.issuerActorId,
      trustDomainId: input.trustDomainId,
      capability: input.capability,
      actions: input.actions,
      resourceScopes: input.resourceScopes,
      constraints: { prohibitedActions: input.prohibitedActions ?? [] },
      delegation: {
        delegable: input.delegable ?? false,
        delegationDepth,
        maxDelegationDepth,
        ...(input.delegatedFromTokenId !== undefined ? { delegatedFromTokenId: input.delegatedFromTokenId } : {}),
      },
      evidenceRequirements,
      riskLevel: input.riskLevel,
      status: 'valid',
      issuedAt,
      proof: createProof({
        signedBy: input.issuerActorId,
        signedAt: issuedAt,
        payload: { id, subjectActorId: input.subjectActorId, capability: input.capability, actions: input.actions },
      }),
      ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
      ...(input.approvalRequirement !== undefined ? { approvalRequirement: input.approvalRequirement } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    };
    this.tokens.set(token.id, token);
    return token;
  }

  getCapabilityToken(capabilityTokenId: string): RecognitionCapabilityToken | undefined {
    return this.tokens.get(capabilityTokenId);
  }

  // Registers a token built out-of-band (e.g. a forged/imported token in tests), skipping issuance validation.
  importCapabilityToken(token: RecognitionCapabilityToken): RecognitionCapabilityToken {
    this.tokens.set(token.id, token);
    return token;
  }

  verifyCapabilityToken(capabilityTokenId: string): CapabilityTokenVerificationResult {
    const capabilityToken = this.tokens.get(capabilityTokenId);
    if (!capabilityToken) {
      return { valid: false, reasonCode: 'CAPABILITY_TOKEN_NOT_FOUND', reason: `No capability token found for id ${capabilityTokenId}.` };
    }
    if (capabilityToken.status === 'revoked') {
      return { valid: false, capabilityToken, reasonCode: 'CAPABILITY_TOKEN_REVOKED', reason: 'Capability token has been revoked.' };
    }
    if (capabilityToken.status === 'suspended') {
      return { valid: false, capabilityToken, reasonCode: 'CAPABILITY_TOKEN_SUSPENDED', reason: 'Capability token is suspended.' };
    }
    if (capabilityToken.expiresAt !== undefined && capabilityToken.expiresAt <= this.ctx.clock.now()) {
      return { valid: false, capabilityToken, reasonCode: 'CAPABILITY_TOKEN_EXPIRED', reason: 'Capability token has expired.' };
    }
    return { valid: true, capabilityToken, reasonCode: 'CAPABILITY_TOKEN_VALID', reason: 'Capability token is valid.' };
  }

  checkCapabilityForAction(token: RecognitionCapabilityToken, action: string, resource: string): CapabilityCheckResult {
    const actionGranted = token.actions.includes(action) || (token.approvalRequirement?.actions.includes(action) ?? false);
    const prohibited = token.constraints.prohibitedActions.includes(action);
    const inResourceScope = token.resourceScopes.some((scope) => resource === scope || resource.startsWith(`${scope}:`));
    return { actionGranted, prohibited, inResourceScope };
  }

  revokeCapabilityToken(capabilityTokenId: string): RecognitionCapabilityToken {
    return this.transitionStatus(capabilityTokenId, 'revoked');
  }

  suspendCapabilityToken(capabilityTokenId: string): RecognitionCapabilityToken {
    return this.transitionStatus(capabilityTokenId, 'suspended');
  }

  private transitionStatus(capabilityTokenId: string, status: RecognitionCapabilityToken['status']): RecognitionCapabilityToken {
    const existing = this.tokens.get(capabilityTokenId);
    if (!existing) {
      throw new CapabilityTokenNotFoundError(capabilityTokenId);
    }
    const updated: RecognitionCapabilityToken = { ...existing, status };
    this.tokens.set(capabilityTokenId, updated);
    return updated;
  }
}
