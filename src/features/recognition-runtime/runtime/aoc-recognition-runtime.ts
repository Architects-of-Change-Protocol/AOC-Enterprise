import type { Actor } from '../domain/actor.js';
import type { ActionRequest } from '../domain/action-request.js';
import type { AuditEvent } from '../domain/audit-event.js';
import type { RecognitionCapabilityToken } from '../domain/capability-token.js';
import type { Passport } from '../domain/passport.js';
import type { Policy } from '../domain/policy.js';
import type { RecognitionDecision } from '../domain/recognition-decision.js';
import type { TrustDomain } from '../domain/trust-domain.js';
import { createDefaultPolicyChain } from '../policies/index.js';
import { ActorRegistry, type RegisterActorInput } from '../services/actor-registry.js';
import {
  CapabilityTokenService,
  type CapabilityTokenVerificationResult,
  type IssueCapabilityTokenInput,
} from '../services/capability-token-service.js';
import { EvidenceLedger, type ActionProofExport, type AuditTrailFilter } from '../services/evidence-ledger.js';
import { PassportService, type IssuePassportInput, type PassportVerificationResult } from '../services/passport-service.js';
import { PolicyEvaluator } from '../services/policy-evaluator.js';
import { RecognitionVerifier } from '../services/recognition-verifier.js';
import { RevocationEngine } from '../services/revocation-engine.js';
import { TrustDomainService, type CreateTrustDomainInput } from '../services/trust-domain-service.js';
import type { RuntimeContext } from './runtime-context.js';

export type BuildActionRequestInput = Omit<ActionRequest, 'id' | 'requestedAt'> & { readonly id?: string };

export class AocRecognitionRuntime {
  readonly actorRegistry: ActorRegistry;
  readonly trustDomainService: TrustDomainService;
  readonly passportService: PassportService;
  readonly capabilityTokenService: CapabilityTokenService;
  readonly policyEvaluator: PolicyEvaluator;
  readonly revocationEngine: RevocationEngine;
  readonly evidenceLedger: EvidenceLedger;
  readonly recognitionVerifier: RecognitionVerifier;

  constructor(
    private readonly ctx: RuntimeContext,
    policies: readonly Policy[] = createDefaultPolicyChain(),
  ) {
    this.actorRegistry = new ActorRegistry(ctx);
    this.trustDomainService = new TrustDomainService(ctx);
    this.passportService = new PassportService(ctx, this.actorRegistry, this.trustDomainService);
    this.capabilityTokenService = new CapabilityTokenService(ctx, this.actorRegistry, this.trustDomainService);
    this.evidenceLedger = new EvidenceLedger(ctx);
    this.revocationEngine = new RevocationEngine(this.actorRegistry, this.passportService, this.capabilityTokenService, this.evidenceLedger);
    this.policyEvaluator = new PolicyEvaluator(policies);
    this.recognitionVerifier = new RecognitionVerifier(
      ctx,
      this.actorRegistry,
      this.trustDomainService,
      this.passportService,
      this.capabilityTokenService,
      this.policyEvaluator,
      this.revocationEngine,
      this.evidenceLedger,
    );
  }

  registerActor(input: RegisterActorInput): Actor {
    return this.actorRegistry.registerActor(input);
  }

  createTrustDomain(input: CreateTrustDomainInput): TrustDomain {
    return this.trustDomainService.createTrustDomain(input);
  }

  issuePassport(input: IssuePassportInput): Passport {
    return this.passportService.issuePassport(input);
  }

  verifyPassport(passportId: string): PassportVerificationResult {
    return this.passportService.verifyPassport(passportId);
  }

  issueCapabilityToken(input: IssueCapabilityTokenInput): RecognitionCapabilityToken {
    return this.capabilityTokenService.issueCapabilityToken(input);
  }

  verifyCapabilityToken(capabilityTokenId: string): CapabilityTokenVerificationResult {
    return this.capabilityTokenService.verifyCapabilityToken(capabilityTokenId);
  }

  buildActionRequest(input: BuildActionRequestInput): ActionRequest {
    return {
      ...input,
      id: input.id ?? this.ctx.idGenerator.next('action-request'),
      requestedAt: this.ctx.clock.now(),
    };
  }

  submitActionRequest(request: ActionRequest): RecognitionDecision {
    return this.recognitionVerifier.verifyAction(request);
  }

  revokeActor(actorId: string, trustDomainId: string): Actor {
    return this.revocationEngine.revokeActor(actorId, trustDomainId);
  }

  revokePassport(passportId: string, trustDomainId: string): Passport {
    return this.revocationEngine.revokePassport(passportId, trustDomainId);
  }

  revokeCapabilityToken(capabilityTokenId: string, trustDomainId: string): RecognitionCapabilityToken {
    return this.revocationEngine.revokeCapabilityToken(capabilityTokenId, trustDomainId);
  }

  getAuditTrail(filter?: AuditTrailFilter): readonly AuditEvent[] {
    return this.evidenceLedger.getAuditTrail(filter);
  }

  exportActionProof(requestId: string): ActionProofExport | undefined {
    return this.evidenceLedger.exportActionProof(requestId);
  }
}

export function createAocRecognitionRuntime(ctx: RuntimeContext, policies?: readonly Policy[]): AocRecognitionRuntime {
  return policies ? new AocRecognitionRuntime(ctx, policies) : new AocRecognitionRuntime(ctx);
}
