import type { PolicyPack, PolicyPackDomain, PolicyPackKind } from '../domain/policy-pack.js';
import type { PolicyPackLegalCompleteness, PolicyPackVersion } from '../domain/policy-pack-version.js';
import type { PolicyPackScope } from '../domain/policy-pack-scope.js';
import type { PolicyPackRule } from '../domain/policy-pack-rule.js';
import type { PolicyPackSource } from '../domain/policy-pack-source.js';
import type { PolicyEvaluationInput, PolicyPackEvaluationResult } from '../domain/policy-pack-evaluation.js';
import type { PolicyPackDecision } from '../domain/policy-pack-decision.js';
import type { PolicyPackProof } from '../domain/policy-pack-proof.js';
import type { PolicyPackEvent } from '../domain/policy-pack-event.js';
import type { PolicyPackSimulationInput, PolicyPackSimulationResult } from '../domain/policy-pack-simulation.js';
import type { PolicyPackRuntimeContext } from '../runtime/policy-pack-runtime-context.js';
import { PolicyPackDecisionNotFoundError, PolicyPackProofNotFoundError } from '../runtime/policy-pack-runtime-errors.js';
import { PolicyPackStore } from './policy-pack-store.js';
import { PolicyPackLedger } from './policy-pack-ledger.js';
import { PolicyPackRegistry, type RegisterPolicyPackInput, type RegisterPolicyPackVersionInput } from './policy-pack-registry.js';
import { PolicyPackEvaluationService } from './policy-pack-evaluation-service.js';
import { PolicyPackSimulationService } from './policy-pack-simulation-service.js';

export type { RegisterPolicyPackInput, RegisterPolicyPackVersionInput } from './policy-pack-registry.js';

export interface RegisterPolicyPackVersionParams {
  readonly id: string;
  readonly policyPackId: string;
  readonly version: string;
  readonly scope: PolicyPackScope;
  readonly rules: readonly PolicyPackRule[];
  readonly sources: readonly PolicyPackSource[];
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly supersedesVersionId?: string;
  readonly demoOnly: boolean;
  readonly legalCompleteness: PolicyPackLegalCompleteness;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RegisterPolicyPackParams {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: PolicyPackKind;
  readonly domain: PolicyPackDomain;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Single composition root for the Domain Policy Pack Runtime. Wires
 * PolicyPackStore, PolicyPackLedger, PolicyPackRegistry,
 * PolicyPackEvaluationService and PolicyPackSimulationService together and
 * exposes the small, stable API surface other Soberanía runtimes and the demo/
 * control-plane adapters are expected to call.
 */
export class PolicyPackRuntime {
  readonly store: PolicyPackStore;
  readonly ledger: PolicyPackLedger;
  readonly registry: PolicyPackRegistry;
  private readonly evaluationService: PolicyPackEvaluationService;
  private readonly simulationService: PolicyPackSimulationService;

  constructor(private readonly ctx: PolicyPackRuntimeContext) {
    this.store = new PolicyPackStore();
    this.ledger = new PolicyPackLedger(ctx, this.store);
    this.registry = new PolicyPackRegistry(ctx, this.store, this.ledger);
    this.evaluationService = new PolicyPackEvaluationService(ctx, this.store, this.ledger);
    this.simulationService = new PolicyPackSimulationService(ctx, this.store, this.ledger);
  }

  registerPolicyPack(input: RegisterPolicyPackParams): PolicyPack {
    return this.registry.registerPolicyPack(input satisfies RegisterPolicyPackInput);
  }

  registerPolicyPackVersion(input: RegisterPolicyPackVersionParams): PolicyPackVersion {
    return this.registry.registerPolicyPackVersion(input satisfies RegisterPolicyPackVersionInput);
  }

  activatePolicyPackVersion(policyPackVersionId: string): PolicyPackVersion {
    return this.registry.activatePolicyPackVersion(policyPackVersionId);
  }

  deprecatePolicyPackVersion(policyPackVersionId: string): PolicyPackVersion {
    return this.registry.deprecatePolicyPackVersion(policyPackVersionId);
  }

  revokePolicyPackVersion(policyPackVersionId: string): PolicyPackVersion {
    return this.registry.revokePolicyPackVersion(policyPackVersionId);
  }

  evaluatePolicy(input: PolicyEvaluationInput): PolicyPackEvaluationResult {
    return this.evaluationService.evaluate(input);
  }

  simulatePolicyPack(input: PolicyPackSimulationInput): PolicyPackSimulationResult {
    return this.simulationService.simulate(input);
  }

  getPolicyPackDecision(decisionId: string): PolicyPackDecision {
    const decision = this.store.getDecision(decisionId);
    if (!decision) {
      throw new PolicyPackDecisionNotFoundError(decisionId);
    }
    return decision;
  }

  getPolicyPackProof(proofId: string): PolicyPackProof {
    const proof = this.store.getProof(proofId);
    if (!proof) {
      throw new PolicyPackProofNotFoundError(proofId);
    }
    return proof;
  }

  getPolicyPackTrail(evaluationId: string): readonly PolicyPackEvent[] {
    return this.ledger.getTrailByEvaluation(evaluationId);
  }

  listActivePolicyPacks(): readonly PolicyPack[] {
    return this.registry.listActivePacks();
  }

  listActivePolicyPackVersions(): readonly PolicyPackVersion[] {
    return this.registry.listActiveVersions();
  }
}

export function createPolicyPackRuntime(ctx: PolicyPackRuntimeContext): PolicyPackRuntime {
  return new PolicyPackRuntime(ctx);
}
