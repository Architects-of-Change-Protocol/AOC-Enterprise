import type { EnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import type { EnterpriseLogger } from '../telemetry/enterprise-logger.js';
import type { EnterpriseTelemetry } from '../telemetry/enterprise-telemetry.js';

/**
 * A stable, machine-readable module identity, e.g. `aoc.kernel` or
 * `aoc.enterprise.persistence`. Never a human-readable display name --
 * `EnterpriseModuleDescriptor.displayName` is the place for that.
 */
export type EnterpriseModuleId = string;

/** Observable lifecycle state of one registered module. See `docs/enterprise/AOC_ENTERPRISE_MODULE_LIFECYCLE.md` for the full transition table. */
export type EnterpriseModuleState = 'registered' | 'validating' | 'initializing' | 'ready' | 'degraded' | 'failed' | 'stopping' | 'stopped';

/** Host-level lifecycle state, distinct from any single module's state. */
export type EnterpriseLifecycleState = 'created' | 'validating' | 'starting' | 'ready' | 'degraded' | 'failed' | 'stopping' | 'stopped';

export type EnterpriseHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface EnterpriseModuleHealth {
  readonly status: EnterpriseHealthStatus;
  readonly checkedAt: string;
  readonly message?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * A declared dependency edge. `versionRange` supports only the two shapes the
 * mission permits without a full semver parser: an exact version string
 * (`'1.0.0'`) or a caret major-compatibility range (`'^1.0.0'`, meaning "any
 * 1.x"). Omit it entirely for "no constraint, any version accepted."
 */
export interface EnterpriseModuleDependency {
  readonly moduleId: EnterpriseModuleId;
  readonly versionRange?: string;
  readonly optional?: boolean;
}

/**
 * `criticality: 'required'` means: if this module fails to initialize (or
 * becomes unhealthy), the Enterprise Host is not ready to accept governance
 * evaluations. `'optional'` means the Host may still be `ready` (possibly
 * `degraded`) even if this module never became healthy.
 */
export interface EnterpriseModuleDescriptor {
  readonly id: EnterpriseModuleId;
  readonly version: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly dependencies?: readonly EnterpriseModuleDependency[];
  readonly criticality: 'required' | 'optional';
  readonly capabilities?: readonly string[];
}

/**
 * Bounded, read-only view of the registry handed to modules via
 * `EnterpriseModuleContext.registry`. Modules can observe what else is
 * registered (e.g. to look up a sibling module's declared capabilities) but
 * can never register, mutate state, or reach another module's private
 * internals through this view.
 */
export interface EnterpriseModuleRegistryView {
  get(moduleId: EnterpriseModuleId): EnterpriseModule | undefined;
  list(): readonly { readonly descriptor: EnterpriseModuleDescriptor; readonly state: EnterpriseModuleState }[];
}

/**
 * Bounded capability set a module receives at `initialize()` time. Modules
 * never receive the mutable registry, HTTP server internals, raw persistence
 * internals, secrets, or another module's private state -- only what this
 * mission's "Enterprise Module Context" section allows.
 */
export interface EnterpriseModuleContext {
  readonly enterpriseVersion: string;
  readonly configuration: EnterpriseConfiguration;
  readonly logger: EnterpriseLogger;
  readonly telemetry: EnterpriseTelemetry;
  readonly registry: EnterpriseModuleRegistryView;
}

/**
 * The canonical Enterprise Module contract (mission section 1). Deliberately
 * minimal -- `initialize`/`health`/`shutdown` only. No speculative hooks
 * (`beforeRegister`, `onEveryDecision`, etc.) exist because no built-in
 * module in this PR needs them.
 */
export interface EnterpriseModule {
  readonly descriptor: EnterpriseModuleDescriptor;
  initialize(context: EnterpriseModuleContext): Promise<void>;
  health(): Promise<EnterpriseModuleHealth>;
  shutdown(): Promise<void>;
}

/** Read-only diagnostic snapshot of one registered module -- what `AocEnterprise.modules()` returns. */
export interface EnterpriseModuleSnapshot {
  readonly id: EnterpriseModuleId;
  readonly version: string;
  readonly state: EnterpriseModuleState;
  readonly required: boolean;
  readonly dependencies: readonly EnterpriseModuleDependency[];
  readonly capabilities: readonly string[];
}
