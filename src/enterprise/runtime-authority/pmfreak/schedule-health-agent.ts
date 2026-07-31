import type { GatewayDecision, ProtectedActionRequest, SignedAuthorityLease } from '../contracts.js';
import type { PmfreakResourceServer } from './pmfreak-resource.js';

/**
 * The PMFreak Schedule Health Agent (mission section 8) -- the first real
 * consumer of AOC Runtime Authority. It never talks to `PmfreakResourceServer`
 * directly; every step goes through the Enforcement Gateway first, and the
 * agent only calls the resource with the `GatewayDecision` the Gateway
 * actually returned. If the Gateway denies a step, the agent stops -- it
 * does not, and structurally cannot, reach the target system anyway (the
 * resource independently re-verifies, see `pmfreak-resource.ts`), but the
 * agent's own control flow also respects the denial rather than attempting
 * the call regardless. `runNextStep`/`attemptNextProtectedAction` exist
 * separately from `runScheduleHealthAnalysis` specifically so a test can
 * simulate "the agent keeps trying after being paused" (mission's
 * acceptance test: "even when the agent continues attempting execution").
 */
export type ScheduleHealthCapability = 'project.read' | 'schedule.read' | 'dependency.read' | 'recommendation.create';

export const SCHEDULE_HEALTH_AGENT_CAPABILITIES: readonly ScheduleHealthCapability[] = ['project.read', 'schedule.read', 'dependency.read', 'recommendation.create'];

export interface ScheduleHealthAgentDeps {
  readonly gateway: { authorizeAction(request: ProtectedActionRequest): GatewayDecision };
  readonly resource: PmfreakResourceServer;
  readonly tenantId: string;
  readonly runtimeId: string;
  readonly agentId: string;
  readonly projectId: string;
  readonly nextNonce: () => string;
  readonly nextCorrelationId: () => string;
}

export interface ScheduleHealthStepOutcome {
  readonly capability: ScheduleHealthCapability;
  readonly decision: GatewayDecision;
  readonly executed: boolean;
  readonly result?: unknown;
}

/** Attempts exactly one protected action. Never throws on denial -- a denial is a normal, expected outcome the caller inspects via `outcome.decision`. */
export function attemptNextProtectedAction(deps: ScheduleHealthAgentDeps, lease: SignedAuthorityLease, capability: ScheduleHealthCapability): ScheduleHealthStepOutcome {
  const resource = { projectId: deps.projectId };
  const request: ProtectedActionRequest = {
    tenantId: deps.tenantId,
    runtimeId: deps.runtimeId,
    agentId: deps.agentId,
    capability,
    resource,
    lease,
    requestNonce: deps.nextNonce(),
    correlationId: deps.nextCorrelationId(),
  };
  const decision = deps.gateway.authorizeAction(request);
  if (decision.decision !== 'ALLOW') {
    return { capability, decision, executed: false };
  }

  const ctx = { runtimeId: deps.runtimeId, capability, resource, decision };
  switch (capability) {
    case 'project.read':
      return { capability, decision, executed: true, result: deps.resource.readProject(ctx) };
    case 'schedule.read':
      return { capability, decision, executed: true, result: deps.resource.readSchedule(ctx) };
    case 'dependency.read':
      return { capability, decision, executed: true, result: deps.resource.readDependencies(ctx) };
    case 'recommendation.create':
      return { capability, decision, executed: true, result: deps.resource.createRecommendation(ctx, 'Integration freeze is at risk; pull in 2 days of slack from Design review.') };
  }
}

export interface ScheduleHealthAnalysisResult {
  readonly steps: readonly ScheduleHealthStepOutcome[];
  readonly completed: boolean;
  readonly deniedAt?: ScheduleHealthStepOutcome;
}

/** Runs the full multi-step schedule analysis (mission section 8, steps 5-6): read project, read schedule, read dependencies, then write one recommendation. Stops at the first denial. */
export function runScheduleHealthAnalysis(deps: ScheduleHealthAgentDeps, lease: SignedAuthorityLease): ScheduleHealthAnalysisResult {
  const steps: ScheduleHealthStepOutcome[] = [];
  for (const capability of SCHEDULE_HEALTH_AGENT_CAPABILITIES) {
    const outcome = attemptNextProtectedAction(deps, lease, capability);
    steps.push(outcome);
    if (!outcome.executed) {
      return { steps, completed: false, deniedAt: outcome };
    }
  }
  return { steps, completed: true };
}
