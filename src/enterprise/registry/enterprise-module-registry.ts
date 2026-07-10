import type {
  EnterpriseModule,
  EnterpriseModuleDescriptor,
  EnterpriseModuleId,
  EnterpriseModuleRegistryView,
  EnterpriseModuleSnapshot,
  EnterpriseModuleState,
} from '../modules/enterprise-module.js';
import { isValidModuleTransition } from '../lifecycle/lifecycle-state.js';
import { EnterpriseModuleDependencyError, EnterpriseModuleRegistrationError, EnterpriseModuleStateError } from '../lifecycle/lifecycle-errors.js';
import { isVersionCompatible, resolveTopologicalOrder } from './dependency-graph.js';

export interface EnterpriseModuleRegistration {
  readonly descriptor: EnterpriseModuleDescriptor;
  readonly state: EnterpriseModuleState;
}

export interface EnterpriseDependencyValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * The official Enterprise Module Registry (mission section 5). Generic to
 * Enterprise *operational* modules -- it knows nothing about Kernel decision
 * contracts (mission section 36: "registry must not depend on Kernel
 * decision contracts") and nothing about HTTP.
 */
export interface EnterpriseModuleRegistry {
  register(module: EnterpriseModule): void;
  get(moduleId: EnterpriseModuleId): EnterpriseModule | undefined;
  list(): readonly EnterpriseModuleRegistration[];
  validate(): EnterpriseDependencyValidationResult;
  resolveInitializationOrder(): readonly EnterpriseModuleId[];
  /** Freezes registration (mission section 33: "Prefer freezing registration before startup"). Registering after this throws `EnterpriseModuleRegistrationError`. */
  freeze(): void;
  setState(moduleId: EnterpriseModuleId, state: EnterpriseModuleState): void;
  getState(moduleId: EnterpriseModuleId): EnterpriseModuleState;
  snapshot(): readonly EnterpriseModuleSnapshot[];
  /** The bounded, read-only view handed to modules via `EnterpriseModuleContext.registry`. */
  asView(): EnterpriseModuleRegistryView;
}

export function createEnterpriseModuleRegistry(): EnterpriseModuleRegistry {
  const modules = new Map<EnterpriseModuleId, EnterpriseModule>();
  const registrationOrder: EnterpriseModuleId[] = [];
  const states = new Map<EnterpriseModuleId, EnterpriseModuleState>();
  let frozen = false;

  function register(module: EnterpriseModule): void {
    if (frozen) {
      throw new EnterpriseModuleRegistrationError(module.descriptor.id + ' (registry is frozen -- registration is only permitted before startup)');
    }
    if (modules.has(module.descriptor.id)) {
      throw new EnterpriseModuleRegistrationError(module.descriptor.id);
    }
    modules.set(module.descriptor.id, module);
    registrationOrder.push(module.descriptor.id);
    states.set(module.descriptor.id, 'registered');
  }

  function list(): readonly EnterpriseModuleRegistration[] {
    return registrationOrder.map((id) => ({ descriptor: (modules.get(id) as EnterpriseModule).descriptor, state: states.get(id) as EnterpriseModuleState }));
  }

  function validate(): EnterpriseDependencyValidationResult {
    const errors: string[] = [];
    for (const id of registrationOrder) {
      const descriptor = (modules.get(id) as EnterpriseModule).descriptor;
      for (const dependency of descriptor.dependencies ?? []) {
        const dependencyModule = modules.get(dependency.moduleId);
        if (dependencyModule === undefined) {
          if (!dependency.optional) {
            errors.push(`Module '${id}' requires missing dependency '${dependency.moduleId}'.`);
          }
          continue;
        }
        if (!isVersionCompatible(dependency.versionRange, dependencyModule.descriptor.version)) {
          errors.push(
            `Module '${id}' requires '${dependency.moduleId}' version '${dependency.versionRange}', but the registered version is '${dependencyModule.descriptor.version}'.`,
          );
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  function resolveInitializationOrder(): readonly EnterpriseModuleId[] {
    const descriptors = registrationOrder.map((id) => (modules.get(id) as EnterpriseModule).descriptor);
    return resolveTopologicalOrder(descriptors);
  }

  function setState(moduleId: EnterpriseModuleId, state: EnterpriseModuleState): void {
    const current = states.get(moduleId);
    if (current === undefined) throw new EnterpriseModuleStateError(`Cannot set state for unknown module '${moduleId}'.`);
    if (!isValidModuleTransition(current, state)) {
      throw new EnterpriseModuleStateError(`Invalid module state transition for '${moduleId}': '${current}' -> '${state}'.`);
    }
    states.set(moduleId, state);
  }

  function getState(moduleId: EnterpriseModuleId): EnterpriseModuleState {
    const state = states.get(moduleId);
    if (state === undefined) throw new EnterpriseModuleStateError(`Unknown module '${moduleId}'.`);
    return state;
  }

  function snapshot(): readonly EnterpriseModuleSnapshot[] {
    return registrationOrder.map((id) => {
      const descriptor = (modules.get(id) as EnterpriseModule).descriptor;
      return {
        id: descriptor.id,
        version: descriptor.version,
        state: states.get(id) as EnterpriseModuleState,
        required: descriptor.criticality === 'required',
        dependencies: descriptor.dependencies ?? [],
        capabilities: descriptor.capabilities ?? [],
      };
    });
  }

  return {
    register,
    get: (moduleId) => modules.get(moduleId),
    list,
    validate,
    resolveInitializationOrder,
    freeze: () => {
      frozen = true;
    },
    setState,
    getState,
    snapshot,
    asView: () => ({ get: (moduleId) => modules.get(moduleId), list }),
  };
}
