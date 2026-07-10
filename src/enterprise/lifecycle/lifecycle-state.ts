import type { EnterpriseLifecycleState, EnterpriseModuleState } from '../modules/enterprise-module.js';

export type { EnterpriseLifecycleState, EnterpriseModuleState } from '../modules/enterprise-module.js';

/**
 * The full allowed module-state transition table (mission section 6/7).
 * Anything not listed here is an invalid transition and must be rejected,
 * not silently allowed. `failed` and `stopped` are terminal for a given
 * module instance -- there is no automatic retry in v1 (mission section 6:
 * "For v1, prefer no automatic retry").
 */
const MODULE_TRANSITIONS: Readonly<Record<EnterpriseModuleState, readonly EnterpriseModuleState[]>> = {
  registered: ['validating'],
  validating: ['initializing', 'failed'],
  initializing: ['ready', 'degraded', 'failed'],
  ready: ['stopping'],
  degraded: ['stopping'],
  failed: ['stopping', 'stopped'],
  stopping: ['stopped'],
  stopped: [],
};

export function isValidModuleTransition(from: EnterpriseModuleState, to: EnterpriseModuleState): boolean {
  return MODULE_TRANSITIONS[from].includes(to);
}

/**
 * Host-level lifecycle transition table (mission section 12). Small and
 * closed on purpose -- every state here is actually reachable and observable
 * from `enterprise-lifecycle-controller.ts`.
 */
const HOST_TRANSITIONS: Readonly<Record<EnterpriseLifecycleState, readonly EnterpriseLifecycleState[]>> = {
  created: ['validating'],
  validating: ['starting', 'failed'],
  starting: ['ready', 'degraded', 'failed'],
  ready: ['stopping'],
  degraded: ['stopping'],
  failed: ['stopping', 'stopped'],
  stopping: ['stopped'],
  stopped: [],
};

export function isValidHostTransition(from: EnterpriseLifecycleState, to: EnterpriseLifecycleState): boolean {
  return HOST_TRANSITIONS[from].includes(to);
}
