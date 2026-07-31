import { createEd25519Signer, createVerifierForSigners } from '../crypto.js';
import { createInMemoryRuntimeEvidenceLog } from '../evidence.js';
import { createRuntimeAuthorityGateway } from '../gateway.js';
import { createRuntimeAuthorityService, type RuntimeAuthorityService } from '../service.js';
import {
  createInMemoryCapabilityGrantStore,
  createInMemoryGovernedAgentStore,
  createInMemoryGovernedRuntimeStore,
  createInMemoryLeaseStore,
  type RuntimeAuthorityAccessContext,
} from '../stores.js';
import { PROHIBITED_CAPABILITIES } from '../contracts.js';
import type { GatewayDecision, GovernedRuntime, ProtectedActionRequest, SignedAuthorityLease } from '../contracts.js';
import { createPmfreakResourceServer, type PmfreakResourceServer } from './pmfreak-resource.js';
import { SCHEDULE_HEALTH_AGENT_CAPABILITIES, type ScheduleHealthAgentDeps } from './schedule-health-agent.js';

/** Capabilities the PMFreak Schedule Health Agent must never be able to obtain, exercised as a negative check in the scenario (mission section 8, "explicitly prohibited"). */
export const PMFREAK_EXPLICITLY_PROHIBITED_CAPABILITIES: readonly string[] = PROHIBITED_CAPABILITIES;

export interface PmfreakScenario {
  readonly service: RuntimeAuthorityService;
  readonly gateway: { authorizeAction(request: ProtectedActionRequest): GatewayDecision };
  readonly resource: PmfreakResourceServer;
  readonly context: RuntimeAuthorityAccessContext;
  readonly tenantId: string;
  readonly agentId: string;
  readonly runtimeId: string;
  readonly projectId: string;
  readonly runtime: GovernedRuntime;
  readonly lease: SignedAuthorityLease;
  agentDeps(): ScheduleHealthAgentDeps;
}

export interface BuildPmfreakScenarioOptions {
  readonly now?: () => string;
  readonly nextId?: (prefix: string) => string;
  readonly leaseTtlSeconds?: number;
}

/**
 * Builds one fully-authorized PMFreak Schedule Health Agent runtime end to
 * end -- register agent, create+authorize+start runtime, grant the four
 * allowed capabilities, issue the first lease -- so tests and the demo
 * script share one construction path and can never drift from each other.
 */
export function buildPmfreakScenario(options: BuildPmfreakScenarioOptions = {}): PmfreakScenario {
  const baseMs = Date.UTC(2026, 6, 31, 12, 0, 0);
  let clockOffsetMs = 0;
  // Advances by 1ms per call (not 1s) -- the scenario issues dozens of
  // timestamps across a full run (evidence events, lease issuance, control
  // actions), and the default 30s lease TTL must not be exhausted purely by
  // deterministic clock advancement during a single synchronous test.
  const now = options.now ?? (() => new Date(baseMs + (clockOffsetMs += 1)).toISOString());
  let counter = 0;
  const nextId = options.nextId ?? ((prefix: string) => `${prefix}-${(counter += 1)}`);

  const agents = createInMemoryGovernedAgentStore();
  const runtimes = createInMemoryGovernedRuntimeStore();
  const grants = createInMemoryCapabilityGrantStore();
  const leases = createInMemoryLeaseStore();
  const evidence = createInMemoryRuntimeEvidenceLog({ now, nextId });
  const signer = createEd25519Signer('pmfreak-demo-key-1');
  const verifier = createVerifierForSigners([signer]);

  const service = createRuntimeAuthorityService({
    agents,
    runtimes,
    grants,
    leases,
    evidence,
    signer,
    now,
    nextId,
    defaultLeaseTtlSeconds: options.leaseTtlSeconds ?? 30,
  });
  const gateway = createRuntimeAuthorityGateway({ agents, runtimes, grants, leases, evidence, verifier, now });

  const context: RuntimeAuthorityAccessContext = { system: true };
  const tenantId = 'tenant-pmfreak-co';
  const agentId = 'agent-schedule-health-1';
  const projectId = 'proj-aoc-enterprise-launch';

  service.registerAgent(context, { agentId, tenantId, displayName: 'PMFreak Schedule Health Agent', agentType: 'workflow_agent', ownerAuthorityId: 'authority-pmfreak-platform-team' }, 'human-operator-alice');

  const created = service.createRuntime(context, { tenantId, agentId, environmentId: 'env-pmfreak-production', policyVersion: 'policy-v1' }, 'human-operator-alice');
  service.authorizeRuntime(context, created.runtimeId, 'human-operator-alice');
  const runtime = service.startRuntime(context, created.runtimeId, 'system-orchestrator');

  for (const capability of SCHEDULE_HEALTH_AGENT_CAPABILITIES) {
    service.grantCapability(context, {
      tenantId,
      runtimeId: runtime.runtimeId,
      agentId,
      capability,
      resourceScope: { projectId },
      constraints: {},
      issuedBy: 'human-operator-alice',
    });
  }

  const lease = service.issueLease(context, { tenantId, runtimeId: runtime.runtimeId, agentId, capabilities: SCHEDULE_HEALTH_AGENT_CAPABILITIES, issuedBy: 'system-orchestrator' });

  const resource = createPmfreakResourceServer(evidence, now);

  let nonceCounter = 0;
  let correlationCounter = 0;

  return {
    service,
    gateway,
    resource,
    context,
    tenantId,
    agentId,
    runtimeId: runtime.runtimeId,
    projectId,
    runtime,
    lease,
    agentDeps(): ScheduleHealthAgentDeps {
      return {
        gateway,
        resource,
        tenantId,
        runtimeId: runtime.runtimeId,
        agentId,
        projectId,
        nextNonce: () => `nonce-${(nonceCounter += 1)}`,
        nextCorrelationId: () => `correlation-${(correlationCounter += 1)}`,
      };
    },
  };
}
