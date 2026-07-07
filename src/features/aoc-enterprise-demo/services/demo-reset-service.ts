import type { EnterpriseDemoWorld } from '../fixtures/enterprise-demo-world.fixture.js';
import { DemoFixtureOrchestrator } from './demo-fixture-orchestrator.js';

/**
 * Provides deterministic reset/factory behavior between scenario runs. None
 * of the five governance runtimes expose a "clear my stores" operation (nor
 * should they -- their stores are meant to be an append-only ledger), so
 * "reset" here means what DemoFixtureOrchestrator already does: build a
 * brand-new EnterpriseDemoWorld, with brand-new runtime instances and empty
 * stores, rather than mutating a shared one. This guarantees one scenario
 * run's idempotency keys, revocations or emergency-deny flag can never leak
 * into the next run.
 */
export class DemoResetService {
  constructor(private readonly orchestrator: DemoFixtureOrchestrator = new DemoFixtureOrchestrator()) {}

  resetWorld(): EnterpriseDemoWorld {
    return this.orchestrator.createWorld();
  }
}

export function createDemoResetService(orchestrator?: DemoFixtureOrchestrator): DemoResetService {
  return new DemoResetService(orchestrator);
}
