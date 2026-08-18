import { legacyResourceIdentifier } from '@aoc-enterprise/scoped-access';

import type { DelegatedCapability, DelegatedCapabilityPayload, ExecutionGrant } from '../../context.js';

/**
 * How many hops a delegated-capability lineage may be walked before the walk
 * refuses it outright.
 *
 * Two jobs, and the second is the one that matters. It bounds work against a
 * store corrupted into a cycle the identity check below cannot see, and it is
 * the *default* ceiling on redelegation depth for a deployment that has not
 * declared one -- so "no ceiling configured" means a small number rather than
 * infinity. Before this existed, a six-hop chain issued without complaint and
 * nothing in the runtime had an opinion about a six hundredth.
 */
export const MAX_DELEGATION_LINEAGE_DEPTH = 8;

/**
 * The lineage-bearing constraints of a delegated capability, read out of the
 * open `constraints` bag into the closed shape the walk actually compares.
 *
 * `DelegatedCapabilityPayload.constraints` is `Record<string, unknown>` and has
 * to stay that way -- hosts put deployment-specific keys in it, and narrowing
 * the type would break every one of them. What must not stay open is the set of
 * keys that *bound authority*: those are read here, once, with a declared
 * meaning, so a comparison cannot silently skip a key because it arrived with
 * an unexpected type.
 *
 * Every field is optional, and an absent field means **no constraint on that
 * axis**, not a wildcard the child may then narrow from. That distinction is
 * what makes containment sound: a parent that constrains nothing genuinely
 * bounds nothing, so a child that names a resource is narrower than it, while
 * a parent that names `asset:A` bounds a child to `asset:A`.
 */
export interface DelegationLineageConstraints {
  /** The scopes the capability is confined to. A child's set must be a subset of its parent's. */
  readonly scope?: readonly string[];
  /** The single resource the capability is confined to, in `legacyResourceIdentifier` form. A child must name the same one. */
  readonly resource?: string;
  /** The single action the capability is confined to. A child must name the same one. */
  readonly action?: string;
  /** The deepest redelegation this capability tolerates beneath itself. A child may lower it and never raise it. */
  readonly maxDelegationDepth?: number;
  /** Whether this capability may be redelegated at all. Absent is read as permitted, which is what every capability issued before this existed meant. */
  readonly canRedelegate?: boolean;
}

/** Reads the lineage-bearing keys out of an open constraints bag, ignoring anything that is present with the wrong type rather than coercing it. */
export function readDelegationLineageConstraints(constraints: Readonly<Record<string, unknown>> | undefined): DelegationLineageConstraints {
  if (constraints === undefined) return {};
  const scope = constraints.scope;
  const resource = constraints.resource;
  const action = constraints.action;
  const maxDelegationDepth = constraints.maxDelegationDepth;
  const canRedelegate = constraints.canRedelegate;
  return {
    ...(typeof scope === 'string' ? { scope: [scope] } : {}),
    ...(Array.isArray(scope) && scope.every((entry) => typeof entry === 'string') ? { scope: scope as readonly string[] } : {}),
    ...(typeof resource === 'string' ? { resource } : {}),
    ...(typeof action === 'string' ? { action } : {}),
    ...(typeof maxDelegationDepth === 'number' && Number.isInteger(maxDelegationDepth) ? { maxDelegationDepth } : {}),
    ...(typeof canRedelegate === 'boolean' ? { canRedelegate } : {}),
  };
}

/**
 * Why a child delegated capability is not contained by the authority it claims
 * to derive from.
 *
 * One variant per axis, mapping onto one reason code each, because "this
 * delegation broadened the resource" and "this delegation outlives its parent"
 * are different operator remedies and a single `delegation_invalid` would make
 * them indistinguishable in an audit trail.
 */
export type DelegationLineageBreach =
  | { readonly kind: 'parent_unknown'; readonly parentRef: string }
  | { readonly kind: 'parent_revoked'; readonly parentRef: string }
  | { readonly kind: 'parent_expired'; readonly parentRef: string }
  | { readonly kind: 'parent_not_redelegable'; readonly parentRef: string }
  | { readonly kind: 'cycle'; readonly parentRef: string }
  | { readonly kind: 'depth_exceeded'; readonly depth: number; readonly maxDepth: number }
  | { readonly kind: 'tenant_expanded'; readonly parentOrgId: string; readonly childOrgId: string }
  | { readonly kind: 'resource_expanded'; readonly parent: string; readonly child?: string }
  | { readonly kind: 'action_expanded'; readonly parent: string; readonly child?: string }
  | { readonly kind: 'scope_expanded'; readonly scope: string }
  | { readonly kind: 'validity_expanded'; readonly parentExpiresAt: string; readonly childExpiresAt?: string };

/** The stable reason code each breach surfaces as, in the runtime's existing snake_case lifecycle vocabulary. */
export function delegationLineageReasonCode(breach: DelegationLineageBreach): string {
  switch (breach.kind) {
    case 'parent_unknown':
      return 'delegation_source_unknown';
    case 'parent_revoked':
      return 'delegation_source_revoked';
    case 'parent_expired':
      return 'delegation_source_expired';
    case 'parent_not_redelegable':
      return 'delegation_redelegation_not_permitted';
    case 'cycle':
      return 'delegation_lineage_cycle';
    case 'depth_exceeded':
      return 'delegation_depth_exceeded';
    case 'tenant_expanded':
      return 'delegation_tenant_mismatch';
    case 'resource_expanded':
    case 'action_expanded':
    case 'scope_expanded':
      return 'delegation_scope_expansion';
    case 'validity_expanded':
      return 'delegation_validity_expansion';
  }
}

/**
 * What a child capability must not broaden relative to the one it derives
 * from, checked on every axis in one place.
 *
 * Called at issuance *and* at every evaluation. Checking only at issuance would
 * make the guarantee exactly as strong as the weakest way a record can reach
 * the store, and this runtime's stores are host-supplied ports -- a restored
 * backup, a migration or a second writer are all routes that never pass through
 * `issueDelegatedCapability`.
 */
export function delegationConstraintBreach(
  parent: { readonly orgId: string; readonly expiresAt?: string; readonly constraints: DelegationLineageConstraints; readonly ref: string },
  child: { readonly orgId: string; readonly expiresAt?: string; readonly constraints: DelegationLineageConstraints },
): DelegationLineageBreach | null {
  // Tenancy first. A capability that crossed organizations is not a narrowing
  // question at all -- it is a different deployment's authority being spent.
  if (parent.orgId !== child.orgId) {
    return { kind: 'tenant_expanded', parentOrgId: parent.orgId, childOrgId: child.orgId };
  }

  if (parent.constraints.canRedelegate === false) {
    return { kind: 'parent_not_redelegable', parentRef: parent.ref };
  }

  const parentResource = parent.constraints.resource;
  if (parentResource !== undefined && child.constraints.resource !== parentResource) {
    return {
      kind: 'resource_expanded',
      parent: parentResource,
      ...(child.constraints.resource !== undefined ? { child: child.constraints.resource } : {}),
    };
  }

  const parentAction = parent.constraints.action;
  if (parentAction !== undefined && child.constraints.action !== parentAction) {
    return {
      kind: 'action_expanded',
      parent: parentAction,
      ...(child.constraints.action !== undefined ? { child: child.constraints.action } : {}),
    };
  }

  const parentScope = parent.constraints.scope;
  if (parentScope !== undefined) {
    // An unconstrained child under a scope-constrained parent is a widening,
    // not an inheritance: it would be usable for scopes the parent never was.
    const childScope = child.constraints.scope ?? [];
    if (childScope.length === 0) return { kind: 'scope_expanded', scope: '(unconstrained)' };
    const wider = childScope.find((entry) => !parentScope.includes(entry));
    if (wider !== undefined) return { kind: 'scope_expanded', scope: wider };
  }

  if (parent.expiresAt !== undefined) {
    if (child.expiresAt === undefined || Date.parse(child.expiresAt) > Date.parse(parent.expiresAt)) {
      return {
        kind: 'validity_expanded',
        parentExpiresAt: parent.expiresAt,
        ...(child.expiresAt !== undefined ? { childExpiresAt: child.expiresAt } : {}),
      };
    }
  }

  const parentMaxDepth = parent.constraints.maxDelegationDepth;
  const childMaxDepth = child.constraints.maxDelegationDepth;
  if (parentMaxDepth !== undefined && childMaxDepth !== undefined && childMaxDepth > parentMaxDepth) {
    return { kind: 'depth_exceeded', depth: childMaxDepth, maxDepth: parentMaxDepth };
  }

  return null;
}

/**
 * An execution grant's authorized access, expressed in the same vocabulary a
 * delegated capability's constraints use.
 *
 * An `ExecutionGrant` is not a delegation envelope -- it carries an
 * `AuthorizationGrantInput`, whose `access` names exactly one action, one
 * resource and one requested scope. Projecting it into
 * `DelegationLineageConstraints` lets the identical containment check run
 * against it, rather than a second, subtly different comparison written for
 * this one case.
 *
 * Without this the grant was checked for existence, revocation, expiry and
 * organization and then declared a valid root, so a capability rooted in a
 * grant for `LICENSE` on asset A could carry `TRANSFER` on asset B -- the exact
 * broadening this module exists to refuse, one hop from where it refuses it.
 */
function executionGrantConstraints(grant: ExecutionGrant): DelegationLineageConstraints {
  const access = grant.payload.input.access;
  return {
    resource: legacyResourceIdentifier(access.resource),
    ...(access.action !== undefined ? { action: access.action } : {}),
    ...(access.requestedScope !== undefined ? { scope: access.requestedScope } : {}),
  };
}

/** What a lineage walk established. `depth` is 0 for a capability that claims no parent -- a root, which is what every capability issued before this existed is. */
export interface DelegationLineageResult {
  readonly valid: boolean;
  readonly depth: number;
  /** Every ancestor reference walked, nearest first. References only; the records themselves stay in their stores. */
  readonly chainRefs: readonly string[];
  readonly breach: DelegationLineageBreach | null;
}

/** The two stores a lineage walk reads. Both already exist on `RuntimeContext`; nothing new is required of a host to get this enforcement. */
export interface DelegationLineagePorts {
  getDelegation(delegationId: string): Promise<DelegatedCapability | undefined>;
  isDelegationRevoked(delegationId: string): Promise<boolean>;
  getExecutionGrant(grantId: string): Promise<ExecutionGrant | undefined>;
  isExecutionGrantRevoked(grantId: string): Promise<boolean>;
}

function isExpiredAt(expiresAt: string | undefined, at: number): boolean {
  return expiresAt !== undefined && Date.parse(expiresAt) <= at;
}

/**
 * Walks a delegated capability's ancestry and reports whether it is a
 * legitimate, currently live derivation.
 *
 * ## What "currently" means, and why it is the whole point
 *
 * Every ancestor's existence, revocation state and expiry are re-read from the
 * stores on each call. Nothing about an ancestor is copied into a descendant at
 * issuance, so revoking one link disables its entire subtree immediately and
 * without rewriting a single descendant record. Measured before this existed:
 * revoking a parent delegated capability left every child allowed, a child
 * naming a parent that had never been issued was allowed, and a child rooted in
 * a revoked execution grant was allowed.
 *
 * ## Roots, and the compatibility boundary
 *
 * A capability naming neither `parentDelegationId` nor `parentGrantId` is a
 * root: it derives from nothing, so there is nothing to contain it, and it
 * behaves exactly as it did before this function existed. That is deliberately
 * the enrolment boundary -- a deployment that never populated the lineage
 * fields sees no change, and the moment a capability claims a parent, the claim
 * must prove out or the capability fails closed. Naming a parent is a one-way
 * door: it cannot be downgraded to "unconstrained root" by the parent
 * subsequently disappearing, because a missing parent is a breach and not an
 * absence.
 *
 * ## Execution grants terminate a chain, they do not continue one
 *
 * A `parentGrantId` names the execution authorization a delegation was carved
 * out of. It is checked for existence, revocation and expiry and then the walk
 * stops: an `ExecutionGrant` carries an `AuthorizationGrantInput` rather than a
 * delegation envelope, so there is no further ancestry to follow and no
 * constraint bag to compare against.
 */
export async function resolveDelegationLineage(
  payload: DelegatedCapabilityPayload,
  ports: DelegationLineagePorts,
  now: string,
): Promise<DelegationLineageResult> {
  const at = Date.parse(now);
  const chainRefs: string[] = [];
  const visited = new Set<string>([payload.delegationId]);

  let child: DelegatedCapabilityPayload = payload;
  let depth = 0;

  for (let hop = 0; hop <= MAX_DELEGATION_LINEAGE_DEPTH; hop += 1) {
    const parentDelegationId = child.parentDelegationId;
    const parentGrantId = child.parentGrantId;

    if (parentDelegationId === undefined && parentGrantId === undefined) {
      return { valid: true, depth, chainRefs, breach: null };
    }

    if (parentDelegationId !== undefined) {
      if (visited.has(parentDelegationId)) {
        return breach(depth, chainRefs, { kind: 'cycle', parentRef: parentDelegationId });
      }
      visited.add(parentDelegationId);
      chainRefs.push(parentDelegationId);
      depth += 1;

      const parent = await ports.getDelegation(parentDelegationId);
      if (parent === undefined) {
        return breach(depth, chainRefs, { kind: 'parent_unknown', parentRef: parentDelegationId });
      }
      if (await ports.isDelegationRevoked(parentDelegationId)) {
        return breach(depth, chainRefs, { kind: 'parent_revoked', parentRef: parentDelegationId });
      }
      if (isExpiredAt(parent.payload.expiresAt, at)) {
        return breach(depth, chainRefs, { kind: 'parent_expired', parentRef: parentDelegationId });
      }

      const containment = delegationConstraintBreach(
        {
          orgId: parent.payload.orgId,
          ref: parentDelegationId,
          constraints: readDelegationLineageConstraints(parent.payload.constraints),
          ...(parent.payload.expiresAt !== undefined ? { expiresAt: parent.payload.expiresAt } : {}),
        },
        {
          orgId: child.orgId,
          constraints: readDelegationLineageConstraints(child.constraints),
          ...(child.expiresAt !== undefined ? { expiresAt: child.expiresAt } : {}),
        },
      );
      if (containment !== null) return breach(depth, chainRefs, containment);

      // The ceiling is whatever the *nearest* ancestor that declares one says,
      // and a child can only ever have lowered it -- `delegationConstraintBreach`
      // refused every child that raised it above its parent's.
      const declaredMax = readDelegationLineageConstraints(parent.payload.constraints).maxDelegationDepth;
      const maxDepth = declaredMax ?? MAX_DELEGATION_LINEAGE_DEPTH;
      if (depth > maxDepth) {
        return breach(depth, chainRefs, { kind: 'depth_exceeded', depth, maxDepth });
      }

      child = parent.payload;
      continue;
    }

    // Only `parentGrantId` remains: the chain terminates at an execution grant.
    if (parentGrantId === undefined) return { valid: true, depth, chainRefs, breach: null };
    const grantId = parentGrantId;
    chainRefs.push(grantId);
    const grant = await ports.getExecutionGrant(grantId);
    if (grant === undefined) {
      return breach(depth, chainRefs, { kind: 'parent_unknown', parentRef: grantId });
    }
    if (await ports.isExecutionGrantRevoked(grantId)) {
      return breach(depth, chainRefs, { kind: 'parent_revoked', parentRef: grantId });
    }
    if (isExpiredAt(grant.payload.expiresAt, at)) {
      return breach(depth, chainRefs, { kind: 'parent_expired', parentRef: grantId });
    }

    const containment = delegationConstraintBreach(
      {
        orgId: grant.payload.subject.orgId,
        ref: grantId,
        constraints: executionGrantConstraints(grant),
        ...(grant.payload.expiresAt !== undefined ? { expiresAt: grant.payload.expiresAt } : {}),
      },
      {
        orgId: child.orgId,
        constraints: readDelegationLineageConstraints(child.constraints),
        ...(child.expiresAt !== undefined ? { expiresAt: child.expiresAt } : {}),
      },
    );
    if (containment !== null) return breach(depth, chainRefs, containment);

    return { valid: true, depth, chainRefs, breach: null };
  }

  // The hop budget ran out without reaching a root. Refused rather than
  // trusted: a lineage that never terminated has not been shown to have an origin.
  return breach(depth, chainRefs, { kind: 'depth_exceeded', depth, maxDepth: MAX_DELEGATION_LINEAGE_DEPTH });
}

function breach(depth: number, chainRefs: readonly string[], found: DelegationLineageBreach): DelegationLineageResult {
  return { valid: false, depth, chainRefs, breach: found };
}
