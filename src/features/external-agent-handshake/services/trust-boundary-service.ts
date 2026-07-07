import type { DataBoundaryDirection } from '../domain/trust-boundary.js';
import type { TrustBoundary, TrustBoundaryStatus } from '../domain/trust-boundary.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { TrustBoundaryNotFoundError } from '../runtime/handshake-runtime-errors.js';
import type { HandshakeStore } from './handshake-store.js';

export type CreateTrustBoundaryInput = Omit<TrustBoundary, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
  readonly id?: string;
  readonly status?: TrustBoundaryStatus;
};

export interface BoundaryEvaluation {
  readonly allowedCapabilities: readonly string[];
  readonly deniedCapabilities: readonly string[];
  readonly allowedActions: readonly string[];
  readonly deniedActions: readonly string[];
  readonly allowedResourceScopes: readonly string[];
  readonly deniedResourceScopes: readonly string[];
}

const DEFAULT_MAX_VISA_TTL_MINUTES = 60;

/**
 * Evaluates requested capabilities/actions/scopes/data-domains against a
 * TrustBoundary -- the final local authority that no external claim
 * (passport, authority, approval, prior visa) may override.
 */
export class TrustBoundaryService {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
  ) {}

  createTrustBoundary(input: CreateTrustBoundaryInput): TrustBoundary {
    const now = this.ctx.clock.now();
    const boundary: TrustBoundary = {
      ...input,
      id: input.id ?? this.ctx.ids.nextId('trust-boundary'),
      status: input.status ?? 'active',
      createdAt: now,
      updatedAt: now,
    };
    return this.store.putTrustBoundary(boundary);
  }

  getTrustBoundary(trustBoundaryId: string): TrustBoundary | undefined {
    return this.store.getTrustBoundary(trustBoundaryId);
  }

  getTrustBoundaryForLocalDomain(localTrustDomainId: string): TrustBoundary | undefined {
    return this.store.getTrustBoundariesByLocalTrustDomain(localTrustDomainId).at(-1);
  }

  suspendTrustBoundary(trustBoundaryId: string): TrustBoundary {
    return this.setStatus(trustBoundaryId, 'suspended');
  }

  revokeTrustBoundary(trustBoundaryId: string): TrustBoundary {
    return this.setStatus(trustBoundaryId, 'revoked');
  }

  private setStatus(trustBoundaryId: string, status: TrustBoundaryStatus): TrustBoundary {
    const existing = this.store.getTrustBoundary(trustBoundaryId);
    if (!existing) {
      throw new TrustBoundaryNotFoundError(trustBoundaryId);
    }
    const updated: TrustBoundary = { ...existing, status, updatedAt: this.ctx.clock.now() };
    return this.store.putTrustBoundary(updated);
  }

  isCapabilityAllowed(boundary: TrustBoundary, capability: string): boolean {
    if (boundary.prohibitedCapabilities.includes(capability)) {
      return false;
    }
    return boundary.allowedCapabilities.length === 0 || boundary.allowedCapabilities.includes(capability);
  }

  isActionAllowed(boundary: TrustBoundary, action: string): boolean {
    return !boundary.prohibitedActions.includes(action);
  }

  isResourceScopeAllowed(boundary: TrustBoundary, resourceScope: string): boolean {
    if (boundary.prohibitedResourceScopes.includes(resourceScope)) {
      return false;
    }
    return boundary.allowedResourceScopes.length === 0 || boundary.allowedResourceScopes.includes(resourceScope);
  }

  isDataDomainAllowed(boundary: TrustBoundary, dataDomain: string, direction: DataBoundaryDirection): boolean {
    if (boundary.dataBoundaries.length === 0) {
      return true;
    }
    return boundary.dataBoundaries.some((rule) => {
      if (rule.prohibitedDataDomains.includes(dataDomain)) {
        return false;
      }
      if (!rule.allowedDirections.includes(direction)) {
        return false;
      }
      return rule.allowedDataDomains.length === 0 || rule.allowedDataDomains.includes(dataDomain);
    });
  }

  evaluateCapabilities(boundary: TrustBoundary, capabilities: readonly string[]): { allowed: readonly string[]; denied: readonly string[] } {
    const allowed = capabilities.filter((capability) => this.isCapabilityAllowed(boundary, capability));
    const denied = capabilities.filter((capability) => !this.isCapabilityAllowed(boundary, capability));
    return { allowed, denied };
  }

  evaluateActions(boundary: TrustBoundary, actions: readonly string[]): { allowed: readonly string[]; denied: readonly string[] } {
    const allowed = actions.filter((action) => this.isActionAllowed(boundary, action));
    const denied = actions.filter((action) => !this.isActionAllowed(boundary, action));
    return { allowed, denied };
  }

  evaluateResourceScopes(boundary: TrustBoundary, resourceScopes: readonly string[]): { allowed: readonly string[]; denied: readonly string[] } {
    const allowed = resourceScopes.filter((scope) => this.isResourceScopeAllowed(boundary, scope));
    const denied = resourceScopes.filter((scope) => !this.isResourceScopeAllowed(boundary, scope));
    return { allowed, denied };
  }

  computeMaxVisaTtlMinutes(boundary: TrustBoundary, issuerMaxVisaTtlMinutes?: number): number {
    const candidates = [boundary.maxVisaTtlMinutes, issuerMaxVisaTtlMinutes].filter(
      (value): value is number => typeof value === 'number' && value > 0,
    );
    return candidates.length > 0 ? Math.min(...candidates) : DEFAULT_MAX_VISA_TTL_MINUTES;
  }

  isApprovalRequiredForUnknownIssuer(boundary: TrustBoundary): boolean {
    return boundary.requiresApprovalForUnknownIssuers;
  }

  isApprovalRequiredForHighRisk(boundary: TrustBoundary): boolean {
    return boundary.requiresApprovalForHighRisk;
  }
}
