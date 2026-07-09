/**
 * PMFreak project phases and authority scope.
 *
 * Fresh, self-authored domain content for this foundation package -- not a
 * structural mirror. There is no project-phase or authority-scope concept
 * anywhere in `@aoc-enterprise/agent-governance`'s public surface (an
 * `AgentPassport` carries only a single `jurisdiction: string`, no
 * workspace/project/customer/phase scoping), and this package must not
 * depend on `src/features/aoc-enterprise-demo/pmfreak-agent-passport`,
 * which separately defines a similarly-named but unrelated concept for its
 * own demo purposes (see this package's README, "Why a new workspace
 * package").
 */
export type PMFreakProjectPhase = 'initiation' | 'planning' | 'execution' | 'monitoring' | 'closure' | 'billing';

export interface PMFreakAuthorityScope {
  readonly workspaceIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly customerIds: readonly string[];
  readonly allowedProjectPhases: readonly PMFreakProjectPhase[];
}

export function isWorkspaceWithinPMFreakAuthorityScope(scope: PMFreakAuthorityScope, workspaceId: string): boolean {
  return scope.workspaceIds.includes(workspaceId);
}

export function isProjectWithinPMFreakAuthorityScope(scope: PMFreakAuthorityScope, projectId: string): boolean {
  return scope.projectIds.includes(projectId);
}

export function isProjectPhaseWithinPMFreakAuthorityScope(
  scope: PMFreakAuthorityScope,
  projectPhase: PMFreakProjectPhase,
): boolean {
  return scope.allowedProjectPhases.includes(projectPhase);
}

/**
 * A customer scope list is a restriction only when non-empty; an empty
 * list means "no customer-specific restriction declared".
 */
export function isCustomerWithinPMFreakAuthorityScope(scope: PMFreakAuthorityScope, customerId?: string): boolean {
  if (customerId === undefined) return true;
  if (scope.customerIds.length === 0) return true;
  return scope.customerIds.includes(customerId);
}
