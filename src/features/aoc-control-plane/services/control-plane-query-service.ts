import type { AocGovernanceSource } from '../domain/control-plane-navigation.js';
import type { AocControlPlaneFilter } from '../domain/control-plane-filter.js';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';

export interface ControlPlaneSearchableItem {
  readonly id: string;
  readonly source: AocGovernanceSource;
  readonly trustDomainId?: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly capability?: string;
  readonly resourceScope?: string;
  readonly status?: string;
  readonly riskLevel?: string;
  readonly reasonCode?: string;
  readonly proofHash?: string;
  readonly idempotencyKey?: string;
  readonly createdAt: string;
}

/**
 * Flattens every row across the read model into one uniform, searchable
 * shape. This performs no governance evaluation -- it only re-labels fields
 * that already exist on the read model's rows so the query service has one
 * consistent surface to filter and search over.
 */
export function flattenSearchableItems(readModel: AocControlPlaneReadModel): ControlPlaneSearchableItem[] {
  const items: ControlPlaneSearchableItem[] = [];

  for (const actor of readModel.recognition.actors) {
    items.push({ id: actor.id, source: 'recognition', trustDomainId: actor.trustDomainId, actorId: actor.id, status: actor.status, createdAt: actor.createdAt ?? readModel.generatedAt });
  }
  for (const token of readModel.recognition.capabilityTokens) {
    for (const action of token.allowedActions.length > 0 ? token.allowedActions : [undefined]) {
      for (const resourceScope of token.resourceScopes.length > 0 ? token.resourceScopes : [undefined]) {
        items.push({
          id: token.id,
          source: 'recognition',
          trustDomainId: token.trustDomainId,
          actorId: token.subjectActorId,
          ...(action !== undefined ? { action } : {}),
          ...(resourceScope !== undefined ? { resourceScope } : {}),
          status: token.status,
          ...(token.tokenHash !== undefined ? { proofHash: token.tokenHash } : {}),
          createdAt: token.issuedAt,
        });
      }
    }
  }
  for (const decision of readModel.recognition.decisions) {
    items.push({
      id: decision.id,
      source: 'recognition',
      trustDomainId: decision.trustDomainId,
      actorId: decision.actorId,
      status: decision.type,
      reasonCode: decision.reasonCode,
      createdAt: decision.evaluatedAt,
    });
  }

  for (const grant of readModel.authority.grants) {
    items.push({
      id: grant.id,
      source: 'authority',
      trustDomainId: grant.trustDomainId,
      actorId: grant.subjectActorId,
      capability: grant.capability,
      status: grant.status,
      createdAt: grant.issuedAt,
    });
  }
  for (const delegation of readModel.authority.delegations) {
    items.push({
      id: delegation.id,
      source: 'authority',
      trustDomainId: delegation.trustDomainId,
      actorId: delegation.delegateActorId,
      capability: delegation.capability,
      status: delegation.status,
      createdAt: delegation.issuedAt,
    });
  }
  for (const decision of readModel.authority.decisions) {
    items.push({
      id: decision.id,
      source: 'authority',
      trustDomainId: decision.trustDomainId,
      actorId: decision.actorId,
      status: decision.type,
      reasonCode: decision.reasonCode,
      createdAt: decision.evaluatedAt,
    });
  }

  for (const request of readModel.approvals.requests) {
    items.push({
      id: request.id,
      source: 'approval',
      trustDomainId: request.trustDomainId,
      actorId: request.requestedByActorId,
      action: request.action,
      resourceScope: request.resourceScope,
      status: request.status,
      riskLevel: request.riskLevel,
      createdAt: request.createdAt,
    });
  }
  for (const decision of readModel.approvals.decisions) {
    items.push({
      id: decision.id,
      source: 'approval',
      ...(decision.approverActorId !== undefined ? { actorId: decision.approverActorId } : {}),
      status: decision.type,
      reasonCode: decision.reasonCode,
      createdAt: decision.decidedAt,
    });
  }

  for (const agent of readModel.externalAgents.externalAgents) {
    items.push({ id: agent.id, source: 'handshake', actorId: agent.id, status: agent.status, createdAt: agent.firstSeenAt });
  }
  for (const visa of readModel.externalAgents.visas) {
    for (const action of visa.allowedActions.length > 0 ? visa.allowedActions : [undefined]) {
      items.push({
        id: visa.id,
        source: 'handshake',
        trustDomainId: visa.localTrustDomainId,
        actorId: visa.externalAgentId,
        ...(action !== undefined ? { action } : {}),
        status: visa.status,
        createdAt: visa.issuedAt,
      });
    }
  }
  for (const grant of readModel.externalAgents.ingressGrants) {
    items.push({
      id: grant.id,
      source: 'handshake',
      trustDomainId: grant.localTrustDomainId,
      actorId: grant.externalAgentId,
      status: grant.status,
      createdAt: grant.issuedAt,
    });
  }

  for (const request of readModel.enforcement.requests) {
    items.push({
      id: request.id,
      source: 'enforcement',
      trustDomainId: request.trustDomainId,
      actorId: request.actorId,
      ...(request.capability !== undefined ? { capability: request.capability } : {}),
      action: request.action,
      resourceScope: request.resourceScope,
      status: request.status,
      ...(request.idempotencyKey !== undefined ? { idempotencyKey: request.idempotencyKey } : {}),
      createdAt: request.submittedAt,
    });
  }
  for (const decision of readModel.enforcement.decisions) {
    items.push({
      id: decision.id,
      source: 'enforcement',
      status: decision.type,
      reasonCode: decision.reasonCode,
      createdAt: decision.decidedAt,
    });
  }
  for (const violation of readModel.enforcement.violations) {
    items.push({
      id: violation.id,
      source: 'enforcement',
      status: violation.type,
      reasonCode: violation.reasonCode,
      createdAt: violation.detectedAt,
    });
  }

  for (const proof of [
    ...readModel.proofs.recognitionProofs,
    ...readModel.proofs.authorityProofs,
    ...readModel.proofs.approvalProofs,
    ...readModel.proofs.handshakeProofs,
    ...readModel.proofs.enforcementProofs,
  ]) {
    items.push({
      id: proof.id,
      source: proof.source,
      ...(proof.actorId !== undefined ? { actorId: proof.actorId } : {}),
      ...(proof.action !== undefined ? { action: proof.action } : {}),
      ...(proof.resourceScope !== undefined ? { resourceScope: proof.resourceScope } : {}),
      proofHash: proof.proofHash,
      createdAt: proof.createdAt,
    });
  }

  return items;
}

function compareSearchableItems(a: ControlPlaneSearchableItem, b: ControlPlaneSearchableItem): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? 1 : -1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function matchesFilter(item: ControlPlaneSearchableItem, filter: AocControlPlaneFilter): boolean {
  if (filter.trustDomainId !== undefined && item.trustDomainId !== filter.trustDomainId) return false;
  if (filter.actorId !== undefined && item.actorId !== filter.actorId) return false;
  if (filter.action !== undefined && item.action !== filter.action) return false;
  if (filter.capability !== undefined && item.capability !== filter.capability) return false;
  if (filter.resourceScope !== undefined && item.resourceScope !== filter.resourceScope) return false;
  if (filter.status !== undefined && item.status !== filter.status) return false;
  if (filter.source !== undefined && item.source !== filter.source) return false;
  if (filter.riskLevel !== undefined && item.riskLevel !== filter.riskLevel) return false;
  if (filter.search !== undefined && filter.search.length > 0) {
    const needle = filter.search.toLowerCase();
    const haystack = [item.id, item.actorId, item.action, item.resourceScope, item.reasonCode, item.proofHash, item.idempotencyKey]
      .filter((value): value is string => value !== undefined)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/** Filters and deterministically sorts (createdAt desc, then id) a set of searchable items. Applies no governance logic -- every predicate is a plain field comparison. */
export function filterItems(items: readonly ControlPlaneSearchableItem[], filter: AocControlPlaneFilter): ControlPlaneSearchableItem[] {
  return items.filter((item) => matchesFilter(item, filter)).sort(compareSearchableItems);
}

export function queryReadModel(readModel: AocControlPlaneReadModel, filter: AocControlPlaneFilter): ControlPlaneSearchableItem[] {
  return filterItems(flattenSearchableItems(readModel), filter);
}
