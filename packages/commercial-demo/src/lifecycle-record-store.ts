import type { CanonicalId } from '@aoc/protocol';
import type { EnterpriseAccessDecision } from '@aoc-enterprise/access-decision';
import type { EnterpriseAccessGrant } from '@aoc-enterprise/access-grant';
import type { EnterpriseAccessObligation } from '@aoc-enterprise/access-obligation';
import type { EnterpriseEvidenceCorrelation } from '@aoc-enterprise/evidence-correlation';
import type { EnterpriseGrantRevocation } from '@aoc-enterprise/grant-revocation';
import type { EnterpriseResourceEnvelope } from '@aoc-enterprise/resource-envelope';
import type { EnterpriseUsageEvent } from '@aoc-enterprise/usage-event';

/**
 * An in-memory index over the seven frozen Access Governance record types,
 * keyed by each record's own identity field. This is demo scaffolding, not
 * a contract: it stores and retrieves already-immutable records, it never
 * mutates one, and it invents no field or vocabulary of its own. Its only
 * job is to let `reconstructAccessHistory` (below) prove Phase 7 of this
 * demo -- that a complete access history can be rebuilt starting from
 * nothing but an `EnterpriseEvidenceCorrelation` id, dereferencing every
 * opaque reference the correlation graph carries.
 */
export class LifecycleRecordStore {
  private readonly resourceEnvelopes = new Map<string, EnterpriseResourceEnvelope>();
  private readonly decisions = new Map<CanonicalId, EnterpriseAccessDecision>();
  private readonly obligations = new Map<CanonicalId, EnterpriseAccessObligation>();
  private readonly grants = new Map<CanonicalId, EnterpriseAccessGrant>();
  private readonly usageEvents = new Map<CanonicalId, EnterpriseUsageEvent>();
  private readonly revocations = new Map<CanonicalId, EnterpriseGrantRevocation>();
  private readonly correlations = new Map<CanonicalId, EnterpriseEvidenceCorrelation>();

  recordResourceEnvelope(envelope: EnterpriseResourceEnvelope): EnterpriseResourceEnvelope {
    this.resourceEnvelopes.set(resourceKey(envelope.resource.kind, envelope.resource.id, envelope.resource.tenantId), envelope);
    return envelope;
  }

  recordDecision(decision: EnterpriseAccessDecision): EnterpriseAccessDecision {
    this.decisions.set(decision.correlationId, decision);
    return decision;
  }

  recordObligation(obligation: EnterpriseAccessObligation): EnterpriseAccessObligation {
    this.obligations.set(obligation.id, obligation);
    return obligation;
  }

  recordGrant(grant: EnterpriseAccessGrant): EnterpriseAccessGrant {
    this.grants.set(grant.id, grant);
    return grant;
  }

  recordUsageEvent(event: EnterpriseUsageEvent): EnterpriseUsageEvent {
    this.usageEvents.set(event.id, event);
    return event;
  }

  recordRevocation(revocation: EnterpriseGrantRevocation): EnterpriseGrantRevocation {
    this.revocations.set(revocation.id, revocation);
    return revocation;
  }

  recordCorrelation(correlation: EnterpriseEvidenceCorrelation): EnterpriseEvidenceCorrelation {
    this.correlations.set(correlation.id, correlation);
    return correlation;
  }

  getResourceEnvelope(kind: string, id: CanonicalId, tenantId?: CanonicalId): EnterpriseResourceEnvelope | undefined {
    return this.resourceEnvelopes.get(resourceKey(kind, id, tenantId));
  }

  getCorrelation(id: CanonicalId): EnterpriseEvidenceCorrelation | undefined {
    return this.correlations.get(id);
  }

  /**
   * Rebuilds a complete, human-readable access history starting from
   * nothing but one `EnterpriseEvidenceCorrelation` id -- Phase 7 of this
   * demo. This function performs no new evaluation and records no new fact;
   * it only dereferences opaque ids the correlation graph already carries,
   * through the reference directionality R005.0 Phase 6 documents
   * (correlation -> decision/obligation/grant/usage/revocation, one layer,
   * never embedded).
   */
  reconstructAccessHistory(correlationId: CanonicalId): ReconstructedAccessHistory {
    const correlation = this.correlations.get(correlationId);
    if (correlation === undefined) {
      throw new Error(`No EnterpriseEvidenceCorrelation recorded for id '${correlationId}'.`);
    }

    const decisions = correlation.decisionRefs.map((ref) => mustGet(this.decisions, ref, 'EnterpriseAccessDecision'));
    const obligations = (correlation.obligationRefs ?? []).map((ref) => mustGet(this.obligations, ref, 'EnterpriseAccessObligation'));
    const grants = (correlation.grantRefs ?? []).map((ref) => mustGet(this.grants, ref, 'EnterpriseAccessGrant'));
    const usageEvents = [...(correlation.usageRefs ?? []).map((ref) => mustGet(this.usageEvents, ref, 'EnterpriseUsageEvent'))].sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
    );
    const revocations = (correlation.revocationRefs ?? []).map((ref) => mustGet(this.revocations, ref, 'EnterpriseGrantRevocation'));

    return { correlation, decisions, obligations, grants, usageEvents, revocations };
  }
}

function resourceKey(kind: string, id: CanonicalId, tenantId?: CanonicalId): string {
  return tenantId === undefined ? `${kind}:${id}` : `${tenantId}:${kind}:${id}`;
}

function mustGet<T>(map: Map<CanonicalId, T>, ref: CanonicalId, label: string): T {
  const value = map.get(ref);
  if (value === undefined) throw new Error(`Evidence correlation references an unknown ${label} '${ref}'.`);
  return value;
}

/**
 * The result of `reconstructAccessHistory`: every record reachable from one
 * `EnterpriseEvidenceCorrelation`, dereferenced and grouped for narration.
 * A demo-local reporting shape, not a contract -- it owns none of the facts
 * it carries and adds no field to any of them.
 */
export interface ReconstructedAccessHistory {
  readonly correlation: EnterpriseEvidenceCorrelation;
  readonly decisions: readonly EnterpriseAccessDecision[];
  readonly obligations: readonly EnterpriseAccessObligation[];
  readonly grants: readonly EnterpriseAccessGrant[];
  readonly usageEvents: readonly EnterpriseUsageEvent[];
  readonly revocations: readonly EnterpriseGrantRevocation[];
}
