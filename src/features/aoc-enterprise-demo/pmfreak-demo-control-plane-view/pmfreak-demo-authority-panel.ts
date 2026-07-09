import type { PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import type { PMFreakDemoAuthorityScopePanel, PMFreakDemoPanelFinding } from './pmfreak-demo-control-plane-view-types.js';

/**
 * Builds a claim-safe authority scope panel from a scenario run result.
 * Never re-derives authority-scope membership -- only presents
 * `allowedByAuthorityScope`, already computed by
 * `resolvePMFreakAgentPassportAction`. Authority scope is evaluated for
 * every real resolution; the only case where it never ran is the runner's
 * own scenario-not-found short-circuit (`result.scenarioFound === false`).
 */
export function createPMFreakDemoAuthorityScopePanel(result: PMFreakProjectGovernanceScenarioRunResult): PMFreakDemoAuthorityScopePanel {
  const { allowedByAuthorityScope } = result.passportResolution;
  const evaluated = result.scenarioFound;

  const finding: PMFreakDemoPanelFinding = evaluated
    ? {
        id: 'authority_scope',
        label: 'Authority scope',
        status: allowedByAuthorityScope ? 'passed' : 'failed',
        detail: allowedByAuthorityScope ? 'The attempt is within the authority scope evaluated for this run.' : 'The attempt is outside the authority scope evaluated for this run.',
      }
    : {
        id: 'authority_scope',
        label: 'Authority scope',
        status: 'not_applicable',
        detail: 'Authority scope could not be evaluated because no matching demo scenario was found.',
      };

  const panel: PMFreakDemoAuthorityScopePanel = {
    allowedByAuthorityScope,
    workspaceChecked: evaluated,
    projectChecked: evaluated,
    customerChecked: evaluated && result.customerId !== undefined,
    phaseChecked: evaluated,
    status: evaluated ? (allowedByAuthorityScope ? 'satisfied' : 'failed') : 'not_applicable',
    findings: [finding],
  };

  assertNoPMFreakDemoControlPlaneOverclaim(panel);
  return panel;
}
