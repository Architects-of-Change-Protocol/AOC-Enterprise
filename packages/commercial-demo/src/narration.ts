import type { EnterpriseAccessDecision } from '@aoc-enterprise/access-decision';
import type { EnterpriseAccessGrant } from '@aoc-enterprise/access-grant';
import type { EnterpriseAccessObligation } from '@aoc-enterprise/access-obligation';
import type { EnterpriseEvidenceCorrelation } from '@aoc-enterprise/evidence-correlation';
import type { EnterpriseGrantRevocation } from '@aoc-enterprise/grant-revocation';
import type { EnterpriseResourceEnvelope } from '@aoc-enterprise/resource-envelope';
import type { EnterpriseProviderTranslation } from '@aoc-enterprise/provider-translation';
import type { PinataProviderExecutionResult } from '@aoc-enterprise/pinata-adapter';
import type { EnterpriseUsageEvent } from '@aoc-enterprise/usage-event';
import type { ArtifactCard } from './types.js';

/**
 * Card builders: one per lifecycle artifact type, each producing exactly
 * the five fields Phase 4 ("Visualization") requires -- identifier,
 * timestamp, owner, relationship, purpose -- from an already-constructed,
 * already-valid contract instance. These functions read fields; they never
 * invent one, and the "owner" and "purpose" text mirrors
 * `docs/architecture/ADR-ACCESS-LIFECYCLE.md`'s own transition-ownership
 * table rather than restating it loosely.
 */

export function resourceEnvelopeCard(envelope: EnterpriseResourceEnvelope): ArtifactCard {
  return {
    stage: 'Enterprise Resource',
    identifier: `${envelope.resource.kind}:${envelope.resource.id}`,
    timestamp: envelope.registeredAt,
    owner: 'Meridian Diligence — deal room registration',
    relationship: `Located at ${envelope.location.system ?? 'an external system'} (${envelope.location.systemReference ?? envelope.location.uri}); referenced by every decision, grant, and usage event below via its resource identity.`,
    purpose: 'Describes where the governed document lives and what it is — never how to reach or authorize against it. This is the one fact every later record points back to.',
  };
}

export function decisionCard(decision: EnterpriseAccessDecision): ArtifactCard {
  const outcomeLabel = decision.outcome === 'allow' ? 'Allowed' : decision.outcome === 'deny' ? 'Denied' : 'Allowed, conditionally';
  return {
    stage: 'Access Decision',
    identifier: decision.correlationId,
    timestamp: decision.evaluatedAt,
    owner: 'Meridian Diligence — policy evaluation',
    relationship: `Evaluates ${decision.request.principalId}'s request against the registered resource. ${decision.reason ?? ''}`.trim(),
    purpose: `${outcomeLabel}: the immutable, provable record of who asked for access to what, and what was decided — independent of whether any provider is ever reachable.`,
  };
}

export function obligationCard(obligation: EnterpriseAccessObligation, opts: { readonly providerCanEnforce: boolean }): ArtifactCard {
  const enforceability = opts.providerCanEnforce
    ? 'The current provider (Pinata) has declared it can enforce this.'
    : 'The current provider (Pinata) has NOT declared it can enforce this — a governance gap surfaced before the grant is used, not discovered after a leak.';
  return {
    stage: 'Access Obligation',
    identifier: obligation.id,
    timestamp: '(declared alongside its decision, no independent timestamp)',
    owner: 'Meridian Diligence — policy evaluation',
    relationship: `Attached to decision ${obligation.decisionRef}; referenced by the grant that resolves it.`,
    purpose: `${obligation.mandatory ? 'Mandatory' : 'Advisory'} condition '${obligation.type}': ${obligation.description ?? 'a declared condition of access.'} ${enforceability}`,
  };
}

export function grantCard(grant: EnterpriseAccessGrant): ArtifactCard {
  return {
    stage: 'Access Grant',
    identifier: grant.id,
    timestamp: `issued ${grant.issuedAt}, expires ${grant.expiresAt}`,
    owner: `Meridian Diligence — issuance (issuer: ${grant.issuerRef ?? 'unspecified'})`,
    relationship: `Authorizes ${grant.principalId} against decision ${grant.decisionRef}, resolving obligations [${(grant.obligationRefs ?? []).join(', ') || 'none'}].`,
    purpose: 'The provable fact that authorization was issued — to whom, until when, on what basis. Not a token, not a URL: revoking or expiring it never requires rotating a secret anyone else holds.',
  };
}

export function translationCard(translation: EnterpriseProviderTranslation): ArtifactCard {
  return {
    stage: 'Provider Translation',
    identifier: translation.id,
    timestamp: translation.translatedAt,
    owner: 'Provider Adapter boundary (grant read, never embedded)',
    relationship: `Translates grant ${translation.grantRef} into a '${translation.executionIntent}' instruction for provider '${translation.providerSystem}', requiring capability '${translation.capability}'.`,
    purpose: 'The one crossing point between "Enterprise decided" and "a provider executes." Swapping Pinata for S3, Azure Blob, or SharePoint changes only this step — nothing upstream.',
  };
}

export function executionResultCard(result: PinataProviderExecutionResult): ArtifactCard {
  const timestamp = result.outcome === 'executed' ? result.executedAt : result.failedAt;
  const relationship =
    result.outcome === 'executed'
      ? `Realizes translation ${result.translationId} for grant ${result.grantRef}.`
      : `Refused to realize translation ${result.translationId} for grant ${result.grantRef} — reason: '${result.failureReason}'.`;
  const purpose =
    result.outcome === 'executed'
      ? 'The provider actually served the access — a fact Enterprise records next as a Usage Event, never as a field on this result itself.'
      : `A provider-side refusal, normalized into a canonical category. Never a raw ${result.providerSystem} exception, HTTP status, or stack trace — safe to show a customer, a regulator, or an auditor as-is.`;
  return {
    stage: 'Provider Execution',
    identifier: result.translationId,
    timestamp,
    owner: `Provider ('${result.providerSystem}'), observed by its Adapter`,
    relationship,
    purpose,
  };
}

export function usageEventCard(event: EnterpriseUsageEvent): ArtifactCard {
  return {
    stage: 'Usage Event',
    identifier: event.id,
    timestamp: event.occurredAt,
    owner: 'Provider Adapter (observes), Meridian Diligence (records)',
    relationship: `Records '${event.eventType}' by ${event.principalId} against grant ${event.grantRef}.`,
    purpose: event.description ?? 'What actually happened, as observed at the provider boundary — the raw material every later audit reconstruction reads.',
  };
}

export function revocationCard(revocation: EnterpriseGrantRevocation): ArtifactCard {
  return {
    stage: 'Grant Revocation',
    identifier: revocation.id,
    timestamp: revocation.revokedAt,
    owner: `${revocation.issuerRef} — administrative action`,
    relationship: `Invalidates grant ${revocation.grantRef}.`,
    purpose: `${revocation.description ?? 'The grant is no longer valid.'} Recorded as a fact, never a mutation of the original grant record.`,
  };
}

export function correlationCard(correlation: EnterpriseEvidenceCorrelation): ArtifactCard {
  const parts = [
    `${correlation.decisionRefs.length} decision(s)`,
    `${(correlation.obligationRefs ?? []).length} obligation(s)`,
    `${(correlation.grantRefs ?? []).length} grant(s)`,
    `${(correlation.usageRefs ?? []).length} usage event(s)`,
    `${(correlation.revocationRefs ?? []).length} revocation(s)`,
  ];
  return {
    stage: 'Evidence Correlation',
    identifier: correlation.id,
    timestamp: correlation.correlatedAt,
    owner: 'Meridian Diligence — relational indexing (generates no new fact)',
    relationship: `Ties together ${parts.join(', ')} for resource ${correlation.resource.kind}:${correlation.resource.id}.`,
    purpose: correlation.description ?? 'The single starting point a compliance officer, insurer, or opposing counsel needs to reconstruct the complete access history for this document.',
  };
}
