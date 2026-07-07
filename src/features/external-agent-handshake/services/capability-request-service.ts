import type { DataBoundaryDirection } from '../domain/trust-boundary.js';
import type { ExternalCapabilityRequest, ExternalCapabilityRequestStatus, ExternalCapabilityRiskLevel } from '../domain/external-capability-request.js';
import type { TrustBoundary } from '../domain/trust-boundary.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import type { HandshakeStore } from './handshake-store.js';
import type { TrustBoundaryService } from './trust-boundary-service.js';

export interface CreateCapabilityRequestInput {
  readonly id?: string;
  readonly externalAgentId: string;
  readonly handshakeRequestId: string;
  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly riskLevel: ExternalCapabilityRiskLevel;
  readonly dataDomains?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CapabilityRequestEvaluation {
  readonly status: ExternalCapabilityRequestStatus;
  readonly allowedActions: readonly string[];
  readonly allowedResourceScopes: readonly string[];
  readonly deniedActions: readonly string[];
  readonly deniedResourceScopes: readonly string[];
  readonly reasonCode: string;
  readonly reason: string;
}

const RISK_ORDER: Readonly<Record<ExternalCapabilityRiskLevel, number>> = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Builds and evaluates ExternalCapabilityRequests -- what an external agent
 * is asking to be able to do -- against the local TrustBoundary and (when
 * present) the issuer's own allowed capability/scope set. Never widens
 * access; only narrows or denies.
 */
export class CapabilityRequestService {
  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
    private readonly trustBoundaryService: TrustBoundaryService,
  ) {}

  createCapabilityRequest(input: CreateCapabilityRequestInput): ExternalCapabilityRequest {
    const request: ExternalCapabilityRequest = {
      id: input.id ?? this.ctx.ids.nextId('capability-request'),
      externalAgentId: input.externalAgentId,
      handshakeRequestId: input.handshakeRequestId,
      capability: input.capability,
      actions: input.actions,
      resourceScopes: input.resourceScopes,
      requestedAt: this.ctx.clock.now(),
      status: 'requested',
      riskLevel: input.riskLevel,
      ...(input.dataDomains !== undefined ? { dataDomains: input.dataDomains } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    return this.store.putCapabilityRequest(request);
  }

  getCapabilityRequest(capabilityRequestId: string): ExternalCapabilityRequest | undefined {
    return this.store.getCapabilityRequest(capabilityRequestId);
  }

  getCapabilityRequestsByHandshakeRequest(handshakeRequestId: string): readonly ExternalCapabilityRequest[] {
    return this.store.getCapabilityRequestsByHandshakeRequest(handshakeRequestId);
  }

  evaluateAgainstBoundary(
    request: ExternalCapabilityRequest,
    boundary: TrustBoundary,
    issuerAllowedCapabilities?: readonly string[],
    issuerAllowedResourceScopes?: readonly string[],
  ): CapabilityRequestEvaluation {
    const capabilityAllowedByBoundary = this.trustBoundaryService.isCapabilityAllowed(boundary, request.capability);
    const capabilityAllowedByIssuer = issuerAllowedCapabilities === undefined || issuerAllowedCapabilities.length === 0 || issuerAllowedCapabilities.includes(request.capability);

    if (!capabilityAllowedByBoundary || !capabilityAllowedByIssuer) {
      return {
        status: 'denied',
        allowedActions: [],
        allowedResourceScopes: [],
        deniedActions: request.actions,
        deniedResourceScopes: request.resourceScopes,
        reasonCode: 'CAPABILITY_DENIED',
        reason: `Capability "${request.capability}" is not permitted for this trust boundary/issuer.`,
      };
    }

    const actionEval = this.trustBoundaryService.evaluateActions(boundary, request.actions);
    const scopeEvalBoundary = this.trustBoundaryService.evaluateResourceScopes(boundary, request.resourceScopes);
    const allowedResourceScopes = scopeEvalBoundary.allowed.filter(
      (scope) => issuerAllowedResourceScopes === undefined || issuerAllowedResourceScopes.length === 0 || issuerAllowedResourceScopes.includes(scope),
    );
    const deniedResourceScopes = request.resourceScopes.filter((scope) => !allowedResourceScopes.includes(scope));

    if (actionEval.allowed.length === 0 || allowedResourceScopes.length === 0) {
      return {
        status: 'denied',
        allowedActions: actionEval.allowed,
        allowedResourceScopes,
        deniedActions: actionEval.denied,
        deniedResourceScopes,
        reasonCode: allowedResourceScopes.length === 0 ? 'SCOPE_DENIED' : 'CAPABILITY_DENIED',
        reason: `No requested actions/scopes for "${request.capability}" remain within the trust boundary.`,
      };
    }

    const limited = actionEval.denied.length > 0 || deniedResourceScopes.length > 0;
    return {
      status: limited ? 'limited' : 'allowed',
      allowedActions: actionEval.allowed,
      allowedResourceScopes,
      deniedActions: actionEval.denied,
      deniedResourceScopes,
      reasonCode: limited ? 'CAPABILITY_LIMITED' : 'CAPABILITY_ALLOWED',
      reason: limited
        ? `Capability "${request.capability}" was limited to what the trust boundary/issuer allow.`
        : `Capability "${request.capability}" is fully allowed.`,
    };
  }

  isDataDomainRequestAllowed(boundary: TrustBoundary, dataDomains: readonly string[] | undefined, direction: DataBoundaryDirection): boolean {
    if (!dataDomains || dataDomains.length === 0) {
      return true;
    }
    return dataDomains.every((domain) => this.trustBoundaryService.isDataDomainAllowed(boundary, domain, direction));
  }

  updateStatus(capabilityRequestId: string, status: ExternalCapabilityRequestStatus, reasonCode?: string, reason?: string): ExternalCapabilityRequest {
    const existing = this.store.getCapabilityRequest(capabilityRequestId);
    if (!existing) {
      throw new Error(`Capability request not found: ${capabilityRequestId}`);
    }
    const updated: ExternalCapabilityRequest = { ...existing, status, ...(reasonCode !== undefined ? { reasonCode } : {}), ...(reason !== undefined ? { reason } : {}) };
    return this.store.putCapabilityRequest(updated);
  }

  /** The aggregate risk of a HandshakeRequest is the highest risk among its individual capability requests. */
  computeAggregateRiskLevel(requests: readonly ExternalCapabilityRequest[]): ExternalCapabilityRiskLevel {
    if (requests.length === 0) {
      return 'low';
    }
    return requests.reduce<ExternalCapabilityRiskLevel>(
      (highest, request) => (RISK_ORDER[request.riskLevel] > RISK_ORDER[highest] ? request.riskLevel : highest),
      'low',
    );
  }
}
