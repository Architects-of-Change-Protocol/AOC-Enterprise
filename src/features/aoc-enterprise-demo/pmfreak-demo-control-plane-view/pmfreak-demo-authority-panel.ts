import type { PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import type { PMFreakDemoAuthorityScopePanel, PMFreakDemoPanelFinding } from './pmfreak-demo-control-plane-view-types.js';

/**
 * A passport or action could not be resolved at all, so authority scope was
 * never actually evaluated by the resolver -- distinct from an authority
 * scope evaluation that ran and failed.
 */
function wasAuthorityScopeEvaluated(result: PMFreakProjectGovernanceScenarioRunResult): boolean {
  return !result.passportResolution.errors.some((error) => error.includes('Unknown PMFreak action') || error.includes('No PMFreak agent passport found'));
}

/**
 * Builds a claim-safe authority scope panel from a scenario run result.
 * Never re-derives authority-scope membership -- only presents
 * `allowedByAuthorityScope`, already computed by
 * `resolvePMFreakAgentPassportAction`.
 */
export function createPMFreakDemoAuthorityScopePanel(result: PMFreakProjectGovernanceScenarioRunResult): PMFreakDemoAuthorityScopePanel {
  const { allowedByAuthorityScope } = result.passportResolution;
  const evaluated = wasAuthorityScopeEvaluated(result);

  const finding: PMFreakDemoPanelFinding = evaluated
    ? {
        id: 'authority_scope',
        label: 'Authority scope',
        status: allowedByAuthorityScope ? 'passed' : 'failed',
        detail: allowedByAuthorityScope ? "The attempt is within the demo passport's authority scope." : "The attempt is outside the demo passport's authority scope.",
      }
    : {
        id: 'authority_scope',
        label: 'Authority scope',
        status: 'not_applicable',
        detail: 'Authority scope could not be evaluated because no matching demo passport or action was found.',
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
