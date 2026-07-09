import { AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH } from './aoc-pmfreak-remote-governance-endpoint-constants.js';
import type { AocPMFreakRemoteGovernanceHttpAdapterPlaceholder } from './aoc-pmfreak-remote-governance-endpoint-types.js';

/**
 * Documented HTTP-route adapter placeholder.
 *
 * This repo has exactly one stable HTTP route convention -- Next.js App
 * Router `route.ts` handlers under `apps/agent-passport-web/src/app/api/**`
 * -- and it belongs to a separate deployable app (`@aoc-enterprise/agent-passport-web`)
 * that only depends on `packages/*` workspace packages, never on this root
 * package's `src/features/**` tree (see that app's `package.json`
 * dependencies and this repo's `workspaces` field in the root
 * `package.json`: `["packages/*", "apps/*"]`). Wiring an actual route there
 * for this feature would mean adding a new cross-package dependency the
 * repo does not otherwise have, which is exactly the kind of route this PR
 * was told not to force ("Do not force a framework route into the repo if
 * the convention is unclear").
 *
 * `handleAocPMFreakRemoteGovernanceRequest` in
 * `aoc-pmfreak-remote-governance-endpoint-handler.ts` is already a pure,
 * framework-agnostic function of `{ method, path, headers, body }` in and
 * `{ status, headers, body }` out -- exactly the shape a thin Next.js Route
 * Handler (or any other HTTP framework) needs to delegate to. Once this repo
 * establishes (or extends) a route convention that can safely reach
 * `src/features/aoc-integrations/**`, a real route can be added at
 * `AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH` that:
 *   1. reads the framework request's method/headers/JSON body,
 *   2. calls `handleAocPMFreakRemoteGovernanceRequest({ request: { method, path, headers, body } })`,
 *   3. writes the returned `{ status, headers, body }` back out verbatim.
 *
 * That route must stay thin (no duplicated guard/parse/evaluate logic), must
 * never mutate state, and must never make an outbound network call.
 */
export function createAocPMFreakRemoteGovernanceHttpAdapterPlaceholder(): AocPMFreakRemoteGovernanceHttpAdapterPlaceholder {
  return {
    implemented: false,
    reason:
      'This repo\'s only stable HTTP route convention (Next.js App Router routes in apps/agent-passport-web) is not wired to import from src/features/aoc-integrations/**; forcing a route there would add an undocumented cross-package dependency rather than follow an existing, clear convention.',
    recommendedPath: AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH,
    recommendedDelegate: 'handleAocPMFreakRemoteGovernanceRequest',
    notes: [
      'handleAocPMFreakRemoteGovernanceRequest is framework-agnostic and ready to be called from a thin route handler once one exists.',
      'A future route must delegate to handleAocPMFreakRemoteGovernanceRequest and must not duplicate guard/parse/evaluate/serialize logic.',
      'A future route must not mutate state and must not perform an outbound network call.',
    ],
  };
}
