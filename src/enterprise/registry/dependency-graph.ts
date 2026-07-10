import type { EnterpriseModuleDependency, EnterpriseModuleDescriptor, EnterpriseModuleId } from '../modules/enterprise-module.js';
import { EnterpriseModuleCycleError } from '../lifecycle/lifecycle-errors.js';

/**
 * Minimal version-compatibility check (mission: "do not build a custom full
 * semver parser"). Supports exactly two shapes: an exact version string, or
 * a `^major.minor.patch` caret range meaning "same major version." Omitting
 * `range` entirely means "no constraint."
 */
export function isVersionCompatible(range: string | undefined, actualVersion: string): boolean {
  if (range === undefined) return true;
  if (range.startsWith('^')) {
    const wantMajor = range.slice(1).split('.')[0];
    const actualMajor = actualVersion.split('.')[0];
    return wantMajor !== undefined && wantMajor === actualMajor;
  }
  return range === actualVersion;
}

/**
 * Builds the dependency edges that actually participate in ordering: a
 * required dependency on a module that is not registered is a validation
 * error handled elsewhere (`registry.validate()`), not a graph edge. An
 * absent *optional* dependency simply contributes no edge -- it is not an
 * error and does not constrain ordering.
 */
function edgesFor(descriptor: EnterpriseModuleDescriptor, registeredIds: ReadonlySet<EnterpriseModuleId>): readonly EnterpriseModuleId[] {
  const dependencies: readonly EnterpriseModuleDependency[] = descriptor.dependencies ?? [];
  return dependencies.filter((dep) => registeredIds.has(dep.moduleId)).map((dep) => dep.moduleId);
}

/**
 * Deterministic topological order over every registered module id.
 * Deterministic tie-break rule (mission section 9: "choose one and
 * document it"): when multiple modules have no remaining unresolved
 * dependency, the one that was *registered first* is initialized first.
 * A cycle throws `EnterpriseModuleCycleError` carrying the exact cycle path,
 * never a bare "cycle detected" message.
 */
export function resolveTopologicalOrder(descriptors: readonly EnterpriseModuleDescriptor[]): readonly EnterpriseModuleId[] {
  const registrationIndex = new Map<EnterpriseModuleId, number>(descriptors.map((d, i) => [d.id, i]));
  const registeredIds = new Set(registrationIndex.keys());
  const dependsOn = new Map<EnterpriseModuleId, readonly EnterpriseModuleId[]>();
  for (const descriptor of descriptors) dependsOn.set(descriptor.id, edgesFor(descriptor, registeredIds));

  // dependents[x] = modules that declare a dependency on x (edges point dependency -> dependent).
  const dependents = new Map<EnterpriseModuleId, EnterpriseModuleId[]>();
  const remainingDependencyCount = new Map<EnterpriseModuleId, number>();
  for (const descriptor of descriptors) {
    const deps = dependsOn.get(descriptor.id) ?? [];
    remainingDependencyCount.set(descriptor.id, deps.length);
    for (const dep of deps) {
      const list = dependents.get(dep) ?? [];
      list.push(descriptor.id);
      dependents.set(dep, list);
    }
  }

  const order: EnterpriseModuleId[] = [];
  const ready = descriptors.filter((d) => (remainingDependencyCount.get(d.id) ?? 0) === 0).map((d) => d.id);

  while (ready.length > 0) {
    ready.sort((a, b) => (registrationIndex.get(a) ?? 0) - (registrationIndex.get(b) ?? 0));
    const next = ready.shift() as EnterpriseModuleId;
    order.push(next);
    for (const dependent of dependents.get(next) ?? []) {
      const remaining = (remainingDependencyCount.get(dependent) ?? 0) - 1;
      remainingDependencyCount.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }

  if (order.length < descriptors.length) {
    const unresolved = descriptors.map((d) => d.id).filter((id) => !order.includes(id));
    throw new EnterpriseModuleCycleError(findCyclePath(unresolved, dependsOn));
  }

  return order;
}

/** DFS over the still-unresolved subset to produce a concrete cycle path (e.g. `a -> b -> c -> a`), never a bare "cycle detected." */
function findCyclePath(unresolvedIds: readonly EnterpriseModuleId[], dependsOn: ReadonlyMap<EnterpriseModuleId, readonly EnterpriseModuleId[]>): readonly EnterpriseModuleId[] {
  const unresolved = new Set(unresolvedIds);
  const stack: EnterpriseModuleId[] = [];
  const onStack = new Set<EnterpriseModuleId>();
  const visited = new Set<EnterpriseModuleId>();

  function visit(id: EnterpriseModuleId): readonly EnterpriseModuleId[] | undefined {
    if (onStack.has(id)) {
      const cycleStart = stack.indexOf(id);
      return [...stack.slice(cycleStart), id];
    }
    if (visited.has(id)) return undefined;
    visited.add(id);
    stack.push(id);
    onStack.add(id);
    for (const dep of dependsOn.get(id) ?? []) {
      if (!unresolved.has(dep)) continue;
      const found = visit(dep);
      if (found !== undefined) return found;
    }
    stack.pop();
    onStack.delete(id);
    return undefined;
  }

  for (const id of unresolvedIds) {
    const found = visit(id);
    if (found !== undefined) return found;
  }
  return unresolvedIds; // Should be unreachable if a cycle truly exists; a safe fallback that still names the involved modules.
}
