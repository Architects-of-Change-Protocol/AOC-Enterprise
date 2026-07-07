import type { PolicyPackSimulationInput, PolicyPackSimulationResult, PolicyPackSimulationSummary } from '../domain/policy-pack-simulation.js';
import type { PolicyPackEvaluationResult } from '../domain/policy-pack-evaluation.js';
import type { PolicyPackRuntimeContext } from '../runtime/policy-pack-runtime-context.js';
import { PolicyPackEvaluationService } from './policy-pack-evaluation-service.js';
import { PolicyPackLedger } from './policy-pack-ledger.js';
import { PolicyPackStore } from './policy-pack-store.js';

/**
 * Simulates a batch of PolicyEvaluationInputs against a chosen set of
 * policy pack versions. Runs entirely against a throwaway in-memory store
 * seeded from the packs/versions the caller selects -- the live
 * PolicyPackStore's decisions, proofs and event ledger are never touched,
 * so a pack author can test a draft version before activating it.
 */
export class PolicyPackSimulationService {
  constructor(
    private readonly ctx: PolicyPackRuntimeContext,
    private readonly store: PolicyPackStore,
    private readonly ledger: PolicyPackLedger,
  ) {}

  simulate(input: PolicyPackSimulationInput): PolicyPackSimulationResult {
    this.ledger.recordEvent({
      type: 'policy_simulation_started',
      payload: { simulationInputId: input.id, policyPackVersionIds: input.policyPackVersionIds, inputCount: input.evaluationInputs.length },
    });

    const sandboxStore = new PolicyPackStore();
    for (const versionId of input.policyPackVersionIds) {
      const version = this.store.getVersion(versionId);
      if (!version) {
        continue;
      }
      const pack = this.store.getPack(version.policyPackId);
      if (pack && !sandboxStore.hasPack(pack.id)) {
        sandboxStore.savePack(pack);
      }
      sandboxStore.saveVersion(version);
    }

    const sandboxLedger = new PolicyPackLedger(this.ctx, sandboxStore);
    const sandboxEvaluationService = new PolicyPackEvaluationService(this.ctx, sandboxStore, sandboxLedger);

    const results: PolicyPackEvaluationResult[] = input.evaluationInputs.map((evaluationInput) =>
      sandboxEvaluationService.evaluate(evaluationInput),
    );

    const summary = this.summarize(results);

    this.ledger.recordEvent({
      type: 'policy_simulation_completed',
      payload: { simulationInputId: input.id, summary },
    });

    return {
      id: this.ctx.ids.nextId('policy-simulation'),
      simulationInputId: input.id,
      results,
      summary,
      createdAt: this.ctx.clock.now(),
    };
  }

  private summarize(results: readonly PolicyPackEvaluationResult[]): PolicyPackSimulationSummary {
    const summary: PolicyPackSimulationSummary = {
      allowed: 0,
      denied: 0,
      requiresEvidence: 0,
      requiresApproval: 0,
      warnings: 0,
      notApplicable: 0,
    };

    const counts = { ...summary } as Record<keyof PolicyPackSimulationSummary, number>;
    for (const result of results) {
      switch (result.decision.type) {
        case 'allowed':
          counts.allowed += 1;
          break;
        case 'denied':
          counts.denied += 1;
          break;
        case 'requires_evidence':
          counts.requiresEvidence += 1;
          break;
        case 'requires_approval':
          counts.requiresApproval += 1;
          break;
        case 'warning':
          counts.warnings += 1;
          break;
        case 'not_applicable':
          counts.notApplicable += 1;
          break;
        default:
          break;
      }
    }
    return counts;
  }
}
