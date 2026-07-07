import { buildEnterpriseDemoWorld, type EnterpriseDemoWorld } from '../fixtures/enterprise-demo-world.fixture.js';
import { ENTERPRISE_DEMO_PERSONAS } from '../fixtures/enterprise-demo-personas.fixture.js';
import type { DemoPersona } from '../domain/demo-persona.js';

/**
 * Builds a fresh EnterpriseDemoWorld -- five real, brand-new runtime
 * instances wired together exactly as `buildDatasysEnforcementFixture` does
 * -- for every scenario run. Because every store inside is newly created,
 * running scenarios back to back through this orchestrator never leaks state
 * from one run into the next: isolation comes from building new runtimes,
 * not from resetting old ones.
 */
export class DemoFixtureOrchestrator {
  createWorld(): EnterpriseDemoWorld {
    return buildEnterpriseDemoWorld();
  }

  getPersonas(): readonly DemoPersona[] {
    return ENTERPRISE_DEMO_PERSONAS;
  }

  getTrustDomainId(world: EnterpriseDemoWorld): string {
    return world.trustDomainId;
  }

  getProjectScopes(world: EnterpriseDemoWorld): { readonly primary: string; readonly secondary: string } {
    return { primary: world.projectScope, secondary: world.secondaryProjectScope };
  }
}

export function createDemoFixtureOrchestrator(): DemoFixtureOrchestrator {
  return new DemoFixtureOrchestrator();
}
