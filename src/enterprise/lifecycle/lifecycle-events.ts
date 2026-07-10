import type { EnterpriseLifecycleState, EnterpriseModuleId, EnterpriseModuleState } from '../modules/enterprise-module.js';

/**
 * The lifecycle event catalog (mission section 26). These describe
 * Enterprise Host operational transitions, never governance decisions --
 * they are a distinct, additive union from the existing
 * `GovernanceEvaluation*` events (`events/enterprise-events.ts`), which are
 * unchanged.
 */
export type EnterpriseLifecycleEventType =
  | 'EnterpriseStartupRequested'
  | 'EnterpriseModuleInitializationStarted'
  | 'EnterpriseModuleReady'
  | 'EnterpriseModuleDegraded'
  | 'EnterpriseModuleFailed'
  | 'EnterpriseReady'
  | 'EnterpriseStartupFailed'
  | 'EnterpriseShutdownRequested'
  | 'EnterpriseModuleShutdownStarted'
  | 'EnterpriseModuleStopped'
  | 'EnterpriseStopped';

/**
 * Every lifecycle event carries the fields mission section 26 requires:
 * event id, module id (where applicable), module version, Enterprise
 * version, timestamp, a correlation id scoping one startup-or-shutdown
 * sequence, previous/new state, and a failure code where applicable. Never
 * secrets, tokens, or raw configuration.
 */
export interface EnterpriseLifecycleEvent {
  readonly eventId: string;
  readonly type: EnterpriseLifecycleEventType;
  readonly occurredAt: string;
  readonly enterpriseVersion: string;
  readonly lifecycleCorrelationId: string;
  readonly moduleId?: EnterpriseModuleId;
  readonly moduleVersion?: string;
  readonly previousState?: EnterpriseModuleState | EnterpriseLifecycleState;
  readonly newState?: EnterpriseModuleState | EnterpriseLifecycleState;
  readonly durationMs?: number;
  readonly failureCode?: string;
}
