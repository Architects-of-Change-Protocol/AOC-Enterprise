import type { PolicyPackManifest } from '../manifest/policy-pack-manifest-types.js';
import type { PolicyPackDependencyEdge } from './policy-pack-composition-types.js';

export interface ResolvedPolicyPackDependencies {
  readonly includedPackIds: readonly string[];
  readonly missingPackIds: readonly string[];
  readonly expiredPackIds: readonly string[];
  readonly supersededPackIds: readonly string[];
  readonly disabledPackIds: readonly string[];
  readonly dependencyGraph: readonly PolicyPackDependencyEdge[];
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Walks `extendsPackIds`/`requiredPackIds` transitively from the root and
 * every requested pack -- anything reachable this way is "required" and can
 * block composition. `optionalPackIds` are walked separately: an
 * unresolved optional dependency is recorded as an unsatisfied edge but
 * never added to `missingPackIds`, and a resolved optional dependency's own
 * status (expired/superseded/disabled) never blocks composition either --
 * only packs reachable via a required/extends path do that.
 */
export function resolvePolicyPackDependencies(rootPackId: string, requestedPackIds: readonly string[], availableManifests: readonly PolicyPackManifest[]): ResolvedPolicyPackDependencies {
  const manifestsById = new Map(availableManifests.map((manifest) => [manifest.id, manifest] as const));
  const edges: PolicyPackDependencyEdge[] = [];

  const requiredVisited = new Set<string>();
  const requiredMissing = new Set<string>();
  const requiredQueue = dedupe([rootPackId, ...requestedPackIds]);

  for (let i = 0; i < requiredQueue.length; i += 1) {
    const packId = requiredQueue[i] as string;
    if (requiredVisited.has(packId)) continue;
    requiredVisited.add(packId);

    const manifest = manifestsById.get(packId);
    if (!manifest) {
      requiredMissing.add(packId);
      continue;
    }

    for (const toId of manifest.extendsPackIds) {
      edges.push({ fromPackId: packId, toPackId: toId, dependencyType: 'extends', satisfied: manifestsById.has(toId) });
      if (!requiredQueue.includes(toId)) requiredQueue.push(toId);
    }
    for (const toId of manifest.requiredPackIds) {
      edges.push({ fromPackId: packId, toPackId: toId, dependencyType: 'requires', satisfied: manifestsById.has(toId) });
      if (!requiredQueue.includes(toId)) requiredQueue.push(toId);
    }
  }

  const optionalVisited = new Set<string>();
  const optionalQueue: string[] = [];
  for (const packId of requiredVisited) {
    const manifest = manifestsById.get(packId);
    if (!manifest) continue;
    for (const toId of manifest.optionalPackIds) {
      const satisfied = manifestsById.has(toId);
      edges.push({ fromPackId: packId, toPackId: toId, dependencyType: 'optional', satisfied });
      if (satisfied && !requiredVisited.has(toId) && !optionalQueue.includes(toId)) optionalQueue.push(toId);
    }
  }

  for (let i = 0; i < optionalQueue.length; i += 1) {
    const packId = optionalQueue[i] as string;
    if (optionalVisited.has(packId) || requiredVisited.has(packId)) continue;
    optionalVisited.add(packId);

    const manifest = manifestsById.get(packId);
    if (!manifest) continue;

    for (const [toIds, dependencyType] of [
      [manifest.extendsPackIds, 'extends'],
      [manifest.requiredPackIds, 'requires'],
      [manifest.optionalPackIds, 'optional'],
    ] as const) {
      for (const toId of toIds) {
        const satisfied = manifestsById.has(toId);
        edges.push({ fromPackId: packId, toPackId: toId, dependencyType, satisfied });
        if (satisfied && !requiredVisited.has(toId) && !optionalQueue.includes(toId)) optionalQueue.push(toId);
      }
    }
  }

  const includedPackIds = dedupe([...requiredVisited, ...optionalVisited].filter((id) => manifestsById.has(id)));
  const expiredPackIds: string[] = [];
  const supersededPackIds: string[] = [];
  const disabledPackIds: string[] = [];
  for (const packId of requiredVisited) {
    const manifest = manifestsById.get(packId);
    if (!manifest) continue;
    if (manifest.status === 'expired') expiredPackIds.push(packId);
    if (manifest.status === 'superseded') supersededPackIds.push(packId);
    if (manifest.status === 'disabled') disabledPackIds.push(packId);
  }

  return {
    includedPackIds,
    missingPackIds: [...requiredMissing],
    expiredPackIds,
    supersededPackIds,
    disabledPackIds,
    dependencyGraph: edges,
  };
}
