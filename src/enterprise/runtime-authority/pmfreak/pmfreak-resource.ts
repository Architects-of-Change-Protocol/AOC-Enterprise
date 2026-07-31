import type { GatewayDecision } from '../contracts.js';
import type { RuntimeEvidenceLog } from '../evidence.js';

/**
 * A simulated PMFreak service -- the "Enterprise Resource" at the far end of
 * the required execution path (mission section 2.2):
 *
 *   Agent Runtime -> AOC Enforcement Gateway -> Enterprise Resource
 *
 * This is the ONE place a protected side effect actually happens in the
 * vertical slice. It never trusts a caller's claim that an action was
 * authorized -- it independently re-derives that fact from the tamper-evident
 * evidence chain the Gateway itself appended to. A caller that fabricates a
 * `GatewayDecision` object (e.g. `{ decision: 'ALLOW', evidenceEventId:
 * 'made-up' }`) without actually calling `gateway.authorizeAction()` first
 * is rejected here, because no matching `ACTION_AUTHORIZED` event exists in
 * the real chain. This is the concrete "no silent bypass" enforcement point
 * (mission section 2.6) -- see
 * `src/enterprise/runtime-authority/__tests__/pmfreak-vertical-slice.test.ts`,
 * "a forged ALLOW decision is rejected by the resource boundary" for the
 * adversarial proof.
 */
export class PmfreakAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PmfreakAccessDeniedError';
  }
}

export interface PmfreakActionContext {
  readonly runtimeId: string;
  readonly capability: string;
  readonly resource: Readonly<Record<string, unknown>>;
  readonly decision: GatewayDecision;
}

function assertGenuinelyAuthorized(evidence: RuntimeEvidenceLog, ctx: PmfreakActionContext): void {
  if (ctx.decision.decision !== 'ALLOW') {
    throw new PmfreakAccessDeniedError(`PMFreak refuses the call: the supplied decision is '${ctx.decision.decision}', not ALLOW.`);
  }
  const chain = evidence.list(ctx.runtimeId);
  const matching = chain.find(
    (event) =>
      event.eventId === ctx.decision.evidenceEventId &&
      event.eventType === 'ACTION_AUTHORIZED' &&
      event.decision === 'ALLOW' &&
      event.capability === ctx.capability &&
      event.correlationId === ctx.decision.correlationId,
  );
  if (matching === undefined) {
    throw new PmfreakAccessDeniedError(
      `PMFreak refuses the call: no ACTION_AUTHORIZED evidence event '${ctx.decision.evidenceEventId}' for capability '${ctx.capability}' on runtime '${ctx.runtimeId}' exists in the tamper-evident evidence chain. A claimed authorization that the real Enforcement Gateway never issued is not honored.`,
    );
  }
  // Independently re-verify the whole chain is unmodified before trusting the matched entry -- a single forged/edited event anywhere in the chain invalidates the proof, not just a missing one.
  const verification = evidence.verify(ctx.runtimeId);
  if (!verification.valid) {
    throw new PmfreakAccessDeniedError(`PMFreak refuses the call: the evidence chain for runtime '${ctx.runtimeId}' failed integrity verification (${verification.failureReason ?? 'unknown'}).`);
  }
}

export interface PmfreakProjectSummary {
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
}

export interface PmfreakScheduleSummary {
  readonly projectId: string;
  readonly milestones: readonly { readonly name: string; readonly dueDate: string; readonly atRisk: boolean }[];
}

export interface PmfreakDependencySummary {
  readonly projectId: string;
  readonly dependencies: readonly { readonly from: string; readonly to: string; readonly slackDays: number }[];
}

export interface PmfreakRecommendation {
  readonly recommendationId: string;
  readonly projectId: string;
  readonly summary: string;
  readonly createdAt: string;
}

export interface PmfreakResourceServer {
  readProject(ctx: PmfreakActionContext): PmfreakProjectSummary;
  readSchedule(ctx: PmfreakActionContext): PmfreakScheduleSummary;
  readDependencies(ctx: PmfreakActionContext): PmfreakDependencySummary;
  createRecommendation(ctx: PmfreakActionContext, summary: string): PmfreakRecommendation;
  /** Test/demo introspection only: how many times a real side effect actually executed. Proves a denied action produced zero side effects. */
  recommendationCount(): number;
}

export function createPmfreakResourceServer(evidence: RuntimeEvidenceLog, now: () => string = () => new Date().toISOString()): PmfreakResourceServer {
  const recommendations: PmfreakRecommendation[] = [];

  return {
    readProject(ctx) {
      assertGenuinelyAuthorized(evidence, ctx);
      const projectId = typeof ctx.resource.projectId === 'string' ? ctx.resource.projectId : 'unknown-project';
      return { projectId, name: 'AOC Enterprise Launch', status: 'active' };
    },
    readSchedule(ctx) {
      assertGenuinelyAuthorized(evidence, ctx);
      const projectId = typeof ctx.resource.projectId === 'string' ? ctx.resource.projectId : 'unknown-project';
      return {
        projectId,
        milestones: [
          { name: 'Design review', dueDate: '2026-08-05', atRisk: false },
          { name: 'Integration freeze', dueDate: '2026-08-20', atRisk: true },
        ],
      };
    },
    readDependencies(ctx) {
      assertGenuinelyAuthorized(evidence, ctx);
      const projectId = typeof ctx.resource.projectId === 'string' ? ctx.resource.projectId : 'unknown-project';
      return { projectId, dependencies: [{ from: 'Integration freeze', to: 'Design review', slackDays: 2 }] };
    },
    createRecommendation(ctx, summary) {
      assertGenuinelyAuthorized(evidence, ctx);
      const projectId = typeof ctx.resource.projectId === 'string' ? ctx.resource.projectId : 'unknown-project';
      const recommendation: PmfreakRecommendation = { recommendationId: `rec-${recommendations.length + 1}`, projectId, summary, createdAt: now() };
      recommendations.push(recommendation);
      return recommendation;
    },
    recommendationCount() {
      return recommendations.length;
    },
  };
}
