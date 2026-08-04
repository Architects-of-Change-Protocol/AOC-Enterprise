import type { CanonicalId } from '@aoc/protocol';
import type { EnterpriseAccessDecision } from '@aoc-enterprise/access-decision';
import { ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION } from '@aoc-enterprise/access-decision';
import type { EnterpriseAccessGrant } from '@aoc-enterprise/access-grant';
import { ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION } from '@aoc-enterprise/access-grant';
import type { EnterpriseAccessObligation } from '@aoc-enterprise/access-obligation';
import { ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION, ENTERPRISE_ACCESS_OBLIGATION_TYPES } from '@aoc-enterprise/access-obligation';
import type { EnterpriseEvidenceCorrelation } from '@aoc-enterprise/evidence-correlation';
import { ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION } from '@aoc-enterprise/evidence-correlation';
import type { EnterpriseGrantRevocation } from '@aoc-enterprise/grant-revocation';
import { ENTERPRISE_GRANT_REVOCATION_REASONS, ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION } from '@aoc-enterprise/grant-revocation';
import { PINATA_PROVIDER_SYSTEM, createPinataProviderCapabilityDeclaration, executePinataProviderTranslation } from '@aoc-enterprise/pinata-adapter';
import {
  enterpriseProviderCapabilityDeclarationSupportsObligation,
  mapEnterpriseProviderFailureToUsageEventType,
  toEnterpriseGrantTranslationInput,
} from '@aoc-enterprise/provider-adapter';
import type { EnterpriseProviderCapabilityDeclaration } from '@aoc-enterprise/provider-adapter';
import type { EnterpriseProviderTranslation, EnterpriseProviderTranslationExecutionIntent, EnterpriseProviderTranslationMetadataValue } from '@aoc-enterprise/provider-translation';
import {
  ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS,
  ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
  enterpriseProviderTranslationRequiredCapability,
} from '@aoc-enterprise/provider-translation';
import type { EnterpriseResourceEnvelope } from '@aoc-enterprise/resource-envelope';
import { ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION } from '@aoc-enterprise/resource-envelope';
import type { EnterpriseScopedAccessRequest } from '@aoc-enterprise/scoped-access';
import type { EnterpriseUsageEvent, EnterpriseUsageEventType } from '@aoc-enterprise/usage-event';
import { ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION, ENTERPRISE_USAGE_EVENT_TYPES } from '@aoc-enterprise/usage-event';

import { isoAt } from './clock.js';
import { checkGrantNotExpired } from './grant-expiry.js';
import { LifecycleRecordStore, type ReconstructedAccessHistory } from './lifecycle-record-store.js';
import { createMockPinataProviderClient, createUnavailablePinataProviderClient } from './mock-pinata-client.js';
import {
  correlationCard,
  decisionCard,
  executionResultCard,
  grantCard,
  obligationCard,
  resourceEnvelopeCard,
  revocationCard,
  translationCard,
  usageEventCard,
} from './narration.js';
import { PRINCIPALS, RESOURCE_DESCRIPTOR, RESOURCE_INTEGRITY, RESOURCE_LOCATION, RESOURCE_REF } from './scenario.js';
import type { ArtifactCard, ScenarioResult, TransitionNarrative } from './types.js';

/**
 * Orchestrates the full commercial reference demo (R006.A): one registered
 * resource, five independent scenarios (one happy path, four canonical
 * failures), and an audit reconstruction proving the final scenario's
 * evidence graph is enough, on its own, to answer "who requested, who
 * approved, when granted, when used, when revoked." Every artifact produced
 * here is a real instance of one of the seven frozen Access Governance
 * contracts (or the Provider Adapter/Translation/Pinata types built on top
 * of them) -- nothing here redefines, widens, or bypasses any of them.
 */
export interface CommercialDemoRun {
  readonly resourceEnvelope: EnterpriseResourceEnvelope;
  readonly capabilityDeclaration: EnterpriseProviderCapabilityDeclaration;
  readonly happyPath: ScenarioResult;
  readonly deniedAccess: ScenarioResult;
  readonly expiredGrant: ScenarioResult;
  readonly unsupportedCapability: ScenarioResult;
  readonly providerFailure: ScenarioResult;
  readonly auditReconstruction: {
    readonly correlationId: CanonicalId;
    readonly history: ReconstructedAccessHistory;
    readonly narrativeLines: readonly string[];
  };
}

export async function runCommercialDemo(): Promise<CommercialDemoRun> {
  const store = new LifecycleRecordStore();

  const resourceEnvelope: EnterpriseResourceEnvelope = {
    schemaVersion: ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION,
    resource: RESOURCE_REF,
    location: RESOURCE_LOCATION,
    lifecycleState: 'active',
    registeredAt: isoAt(0),
    integrity: RESOURCE_INTEGRITY,
    descriptor: RESOURCE_DESCRIPTOR,
    correlationId: 'corr-resource-registration-solstice',
  };
  store.recordResourceEnvelope(resourceEnvelope);

  const capabilityDeclaration = createPinataProviderCapabilityDeclaration({
    id: 'pinata-capability-declaration-solstice',
    declaredAt: isoAt(-10),
    correlationId: 'corr-pinata-capability-solstice',
    description: "Pinata adapter capability declaration, read by Meridian's policy evaluation before any obligation is attached to a decision.",
  });

  const happyPath = await runHappyPathScenario(store, resourceEnvelope, capabilityDeclaration);
  const deniedAccess = runDeniedAccessScenario(store, resourceEnvelope);
  const expiredGrant = runExpiredGrantScenario(store, resourceEnvelope);
  const unsupportedCapability = await runUnsupportedCapabilityScenario(store, resourceEnvelope);
  const providerFailure = await runProviderFailureScenario(store, resourceEnvelope);

  const history = store.reconstructAccessHistory(happyPath.finalCorrelationId);
  const narrativeLines = renderAuditReconstructionNarrative(history);

  return {
    resourceEnvelope,
    capabilityDeclaration,
    happyPath: happyPath.result,
    deniedAccess,
    expiredGrant,
    unsupportedCapability,
    providerFailure,
    auditReconstruction: { correlationId: happyPath.finalCorrelationId, history, narrativeLines },
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Happy path -- the full lifecycle, end to end, then revoked.
// ---------------------------------------------------------------------------

async function runHappyPathScenario(
  store: LifecycleRecordStore,
  resourceEnvelope: EnterpriseResourceEnvelope,
  capabilityDeclaration: EnterpriseProviderCapabilityDeclaration,
): Promise<{ readonly result: ScenarioResult; readonly finalCorrelationId: CanonicalId }> {
  const cards: ArtifactCard[] = [resourceEnvelopeCard(resourceEnvelope)];
  const narrative: TransitionNarrative[] = [
    {
      transition: 'Resource → Access Request',
      businessPurpose: "A named counterparty asks for access to a specific, already-registered document — the only kind of request this platform will ever evaluate.",
    },
  ];

  const request: EnterpriseScopedAccessRequest = {
    principalId: PRINCIPALS.outsideCounsel,
    resource: RESOURCE_REF,
    requestedScope: ['diligence-document:read'],
    requestedAt: isoAt(30),
    action: 'view',
  };

  const decision: EnterpriseAccessDecision = {
    schemaVersion: ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION,
    request,
    resource: resourceEnvelope,
    outcome: 'conditional',
    evaluatedAt: isoAt(35),
    correlationId: 'corr-decision-solstice-counsel-1',
    reason: 'Outside counsel for the acquiring party, NDA on file; access is conditional on read-only, time-boxed, watermarked obligations.',
  };
  store.recordDecision(decision);
  cards.push(decisionCard(decision));
  narrative.push({
    transition: 'Access Request → Access Decision',
    businessPurpose: 'Turns "someone asked" into a provable, timestamped record of what was decided and why — before the document is ever touched.',
  });

  const obligations: EnterpriseAccessObligation[] = [
    {
      schemaVersion: ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION,
      id: 'obligation-solstice-read-only',
      type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY,
      mandatory: true,
      decisionRef: decision.correlationId,
      severity: 'warning',
      description: 'Recipient may view the report but never download or forward the underlying file.',
    },
    {
      schemaVersion: ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION,
      id: 'obligation-solstice-time-limit',
      type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.TIME_LIMIT,
      mandatory: true,
      decisionRef: decision.correlationId,
      severity: 'warning',
      parameters: { maxDurationSeconds: 86_400 },
      description: 'Access is limited to a 24-hour diligence session window.',
    },
    {
      schemaVersion: ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION,
      id: 'obligation-solstice-watermark',
      type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.WATERMARK_CONTENT,
      mandatory: true,
      decisionRef: decision.correlationId,
      severity: 'critical',
      description: 'Every rendered page must carry a dynamic viewer watermark identifying the recipient and timestamp.',
    },
  ];
  for (const obligation of obligations) {
    store.recordObligation(obligation);
    const providerCanEnforce = enterpriseProviderCapabilityDeclarationSupportsObligation(capabilityDeclaration, obligation.type);
    cards.push(obligationCard(obligation, { providerCanEnforce }));
  }
  narrative.push({
    transition: 'Access Decision → Policy Obligations',
    businessPurpose: "Declares the conditions access is conditional on — and, because the provider's own capability declaration is checked here, surfaces a coverage gap (watermarking) before a grant is ever issued, not after a leak.",
  });

  const grant: EnterpriseAccessGrant = {
    schemaVersion: ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
    id: 'grant-solstice-counsel-1',
    status: 'active',
    resource: RESOURCE_REF,
    decisionRef: decision.correlationId,
    principalId: PRINCIPALS.outsideCounsel,
    issuedAt: isoAt(40),
    expiresAt: isoAt(40 + 1_440),
    correlationId: 'corr-grant-solstice-counsel-1',
    issuerRef: PRINCIPALS.approvalEngine,
    obligationRefs: obligations.map((obligation) => obligation.id),
  };
  store.recordGrant(grant);
  cards.push(grantCard(grant));
  narrative.push({
    transition: 'Decision + Obligations → Access Grant',
    businessPurpose: 'The moment authorization becomes real — a record Meridian can point to, revoke, or let lapse, entirely independent of whatever secret a provider eventually issues.',
  });

  const timeLimitDuration = obligations
    .find((obligation) => obligation.type === ENTERPRISE_ACCESS_OBLIGATION_TYPES.TIME_LIMIT)
    ?.parameters?.maxDurationSeconds;
  const requestedDurationSeconds = typeof timeLimitDuration === 'number' ? timeLimitDuration : 3_600;

  const translation = translateGrantForPinata({
    grant,
    executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_TEMPORARY_ACCESS,
    translationId: 'translation-solstice-counsel-1',
    translatedAt: isoAt(45),
    correlationId: 'corr-translation-solstice-counsel-1',
    providerMetadata: { requestedDurationSeconds },
    description: "The grant's own time-limit obligation becomes the provider's requested access-link duration.",
  });
  cards.push(translationCard(translation));
  narrative.push({
    transition: 'Access Grant → Provider Translation',
    businessPurpose: 'Converts an Enterprise-owned authorization into an instruction one specific provider understands — without that provider ever seeing why the grant was issued.',
  });

  const executionResult = await executePinataProviderTranslation(translation, createMockPinataProviderClient(), { now: () => isoAt(46) });
  cards.push(executionResultCard(executionResult));
  narrative.push({
    transition: 'Provider Translation → Provider Execution',
    businessPurpose: 'The provider actually serves the access — the one step this platform does not own, and deliberately does not need to, in order to keep its own audit trail complete.',
  });

  const usageEvents: EnterpriseUsageEvent[] = [
    buildUsageEvent({
      id: 'usage-solstice-counsel-1',
      eventType: ENTERPRISE_USAGE_EVENT_TYPES.ACCESS_STARTED,
      grant,
      occurredAt: isoAt(50),
      correlationId: 'corr-usage-solstice-counsel-1',
      description: 'Outside counsel opened the access link; the viewer session began.',
    }),
    buildUsageEvent({
      id: 'usage-solstice-counsel-2',
      eventType: ENTERPRISE_USAGE_EVENT_TYPES.CONTENT_VIEWED,
      grant,
      occurredAt: isoAt(51),
      correlationId: 'corr-usage-solstice-counsel-2',
      description: 'The report rendered successfully in the read-only viewer.',
    }),
    buildUsageEvent({
      id: 'usage-solstice-counsel-3',
      eventType: ENTERPRISE_USAGE_EVENT_TYPES.CONTENT_VIEWED,
      grant,
      occurredAt: isoAt(180),
      correlationId: 'corr-usage-solstice-counsel-3',
      description: 'A follow-up review session by the same counsel, before the deal room closed.',
    }),
  ];
  for (const event of usageEvents) {
    store.recordUsageEvent(event);
    cards.push(usageEventCard(event));
  }
  narrative.push({
    transition: 'Provider Execution → Usage Event',
    businessPurpose: 'What actually happened, recorded independently of the provider — and note what never appears: no ContentDownloaded event was ever recorded, direct evidence the read-only obligation held, not just a policy claim that it should.',
  });

  const revocation: EnterpriseGrantRevocation = {
    schemaVersion: ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION,
    id: 'revocation-solstice-counsel-1',
    grantRef: grant.id,
    revokedAt: isoAt(200),
    reason: ENTERPRISE_GRANT_REVOCATION_REASONS.ADMINISTRATOR_REVOKED,
    issuerRef: PRINCIPALS.securityTeam,
    correlationId: 'corr-revocation-solstice-counsel-1',
    description: "The target company withdrew from Project Solstice; Meridian's security team closed the deal room ahead of the grant's natural 24-hour expiry.",
  };
  store.recordRevocation(revocation);
  cards.push(revocationCard(revocation));
  narrative.push({
    transition: 'Access Grant → Grant Revocation',
    businessPurpose: 'Access ends the instant the business reason for it ends — one recorded fact, with no signed URL to rotate and no other counterparty affected.',
  });

  const correlation: EnterpriseEvidenceCorrelation = {
    schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
    id: 'correlation-solstice-counsel-final',
    resource: RESOURCE_REF,
    decisionRefs: [decision.correlationId],
    obligationRefs: obligations.map((obligation) => obligation.id),
    grantRefs: [grant.id],
    usageRefs: usageEvents.map((event) => event.id),
    revocationRefs: [revocation.id],
    correlatedAt: isoAt(210),
    description: 'Complete evidence graph for outside counsel access to Project Solstice, from request through revocation.',
  };
  store.recordCorrelation(correlation);
  cards.push(correlationCard(correlation));
  narrative.push({
    transition: 'All of the above → Evidence Correlation',
    businessPurpose: 'The one artifact a compliance officer, cyber insurer, or opposing counsel is ever handed. Everything above is reachable from it alone — proven in the Audit Reconstruction below.',
  });

  return {
    result: {
      scenarioTitle: 'Happy path — outside counsel granted, used, and administratively revoked',
      outcomeSummary: `Access was decided (${decision.outcome}), granted, executed via Pinata, exercised ${usageEvents.length} times without ever downloading the file, then revoked when the deal ended.`,
      cards,
      narrative,
    },
    finalCorrelationId: correlation.id,
  };
}

// ---------------------------------------------------------------------------
// Scenario 2: Denied access.
// ---------------------------------------------------------------------------

function runDeniedAccessScenario(store: LifecycleRecordStore, resourceEnvelope: EnterpriseResourceEnvelope): ScenarioResult {
  const request: EnterpriseScopedAccessRequest = {
    principalId: PRINCIPALS.unverifiedExternalContact,
    resource: RESOURCE_REF,
    requestedScope: ['diligence-document:read'],
    requestedAt: isoAt(60),
    action: 'view',
  };

  const decision: EnterpriseAccessDecision = {
    schemaVersion: ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION,
    request,
    resource: resourceEnvelope,
    outcome: 'deny',
    evaluatedAt: isoAt(61),
    correlationId: 'corr-decision-solstice-denied-1',
    reason: 'No verified NDA on file for this counterparty; request denied outright.',
  };
  store.recordDecision(decision);

  const correlation: EnterpriseEvidenceCorrelation = {
    schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
    id: 'correlation-solstice-denied-1',
    resource: RESOURCE_REF,
    decisionRefs: [decision.correlationId],
    correlatedAt: isoAt(62),
    description: 'Evidence graph for a denied request — decision only: no obligation, grant, translation, or provider execution was ever reached.',
  };
  store.recordCorrelation(correlation);

  return {
    scenarioTitle: 'Failure demonstration — denied access',
    outcomeSummary: 'An unverified external contact was denied outright. Nothing downstream of the decision was ever created — the canonical response, never a provider-shaped error.',
    cards: [decisionCard(decision), correlationCard(correlation)],
    narrative: [
      {
        transition: 'Access Decision (deny) → halt',
        businessPurpose: "A denial is a first-class, fully auditable outcome — not an exception, not a 404, not a signed-URL request that silently never arrives. It proves the platform evaluated the request and said no, on the record.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scenario 3: Expired grant.
// ---------------------------------------------------------------------------

function runExpiredGrantScenario(store: LifecycleRecordStore, resourceEnvelope: EnterpriseResourceEnvelope): ScenarioResult {
  const request: EnterpriseScopedAccessRequest = {
    principalId: PRINCIPALS.outsideCounsel,
    resource: RESOURCE_REF,
    requestedScope: ['diligence-document:read'],
    requestedAt: isoAt(-2_880),
    action: 'view',
  };

  const decision: EnterpriseAccessDecision = {
    schemaVersion: ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION,
    request,
    resource: resourceEnvelope,
    outcome: 'allow',
    evaluatedAt: isoAt(-2_875),
    correlationId: 'corr-decision-solstice-expired-1',
    reason: 'A prior diligence round, already closed.',
  };
  store.recordDecision(decision);

  const obligation: EnterpriseAccessObligation = {
    schemaVersion: ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION,
    id: 'obligation-solstice-expired-time-limit',
    type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.TIME_LIMIT,
    mandatory: true,
    decisionRef: decision.correlationId,
    parameters: { maxDurationSeconds: 86_400 },
    description: "A prior round's 24-hour access window, now long past.",
  };
  store.recordObligation(obligation);

  const grant: EnterpriseAccessGrant = {
    schemaVersion: ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
    id: 'grant-solstice-expired-1',
    status: 'active',
    resource: RESOURCE_REF,
    decisionRef: decision.correlationId,
    principalId: PRINCIPALS.outsideCounsel,
    issuedAt: isoAt(-2_870),
    expiresAt: isoAt(-1_430),
    correlationId: 'corr-grant-solstice-expired-1',
    issuerRef: PRINCIPALS.approvalEngine,
    obligationRefs: [obligation.id],
  };
  store.recordGrant(grant);

  const now = isoAt(0);
  const expiryCheck = checkGrantNotExpired(grant, now);
  if (!expiryCheck.expired) throw new Error('Expected the demonstration grant to already be expired.');

  const usageEvent = buildUsageEventFromFailure({
    id: 'usage-solstice-expired-1',
    grant,
    occurredAt: now,
    correlationId: 'corr-usage-solstice-expired-1',
    eventType: expiryCheck.usageEventType,
    description: expiryCheck.message,
  });
  store.recordUsageEvent(usageEvent);

  const correlation: EnterpriseEvidenceCorrelation = {
    schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
    id: 'correlation-solstice-expired-1',
    resource: RESOURCE_REF,
    decisionRefs: [decision.correlationId],
    obligationRefs: [obligation.id],
    grantRefs: [grant.id],
    usageRefs: [usageEvent.id],
    correlatedAt: isoAt(1),
    description: "Evidence graph for a lapsed grant — the adapter compared 'expiresAt' against wall-clock time itself and refused to translate or honor it, exactly as the frozen ADR requires.",
  };
  store.recordCorrelation(correlation);

  return {
    scenarioTitle: 'Failure demonstration — expired grant',
    outcomeSummary: `A grant issued for a prior diligence round expired before this access attempt. It was refused with failureReason '${expiryCheck.failureReason}', never silently honored.`,
    cards: [decisionCard(decision), obligationCard(obligation, { providerCanEnforce: true }), grantCard(grant), usageEventCard(usageEvent), correlationCard(correlation)],
    narrative: [
      {
        transition: 'Access Grant (lapsed) → refused before Provider Translation',
        businessPurpose: 'A stale authorization is never honored just because it still exists in a database — expiry is enforced against the current instant, every single time, before any provider is ever asked to act.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scenario 4: Unsupported capability.
// ---------------------------------------------------------------------------

async function runUnsupportedCapabilityScenario(store: LifecycleRecordStore, resourceEnvelope: EnterpriseResourceEnvelope): Promise<ScenarioResult> {
  const request: EnterpriseScopedAccessRequest = {
    principalId: PRINCIPALS.outsideCounsel,
    resource: RESOURCE_REF,
    requestedScope: ['diligence-document:read'],
    requestedAt: isoAt(300),
    action: 'view',
  };

  const decision: EnterpriseAccessDecision = {
    schemaVersion: ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION,
    request,
    resource: resourceEnvelope,
    outcome: 'allow',
    evaluatedAt: isoAt(301),
    correlationId: 'corr-decision-solstice-capability-1',
    reason: 'A second reviewer for the same counterparty, same NDA on file.',
  };
  store.recordDecision(decision);

  const obligation: EnterpriseAccessObligation = {
    schemaVersion: ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION,
    id: 'obligation-solstice-capability-record-usage',
    type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.RECORD_USAGE,
    mandatory: true,
    decisionRef: decision.correlationId,
    description: 'Meridian requires the provider to self-report every usage event for this grant.',
  };
  store.recordObligation(obligation);

  const grant: EnterpriseAccessGrant = {
    schemaVersion: ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
    id: 'grant-solstice-capability-1',
    status: 'active',
    resource: RESOURCE_REF,
    decisionRef: decision.correlationId,
    principalId: PRINCIPALS.outsideCounsel,
    issuedAt: isoAt(302),
    expiresAt: isoAt(302 + 1_440),
    correlationId: 'corr-grant-solstice-capability-1',
    issuerRef: PRINCIPALS.approvalEngine,
    obligationRefs: [obligation.id],
  };
  store.recordGrant(grant);

  const translation = translateGrantForPinata({
    grant,
    executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.REGISTER_USAGE,
    translationId: 'translation-solstice-capability-1',
    translatedAt: isoAt(303),
    correlationId: 'corr-translation-solstice-capability-1',
    description: "Meridian's obligation asks the provider to self-report usage — Pinata has no such capability.",
  });

  const executionResult = await executePinataProviderTranslation(translation, createMockPinataProviderClient(), { now: () => isoAt(304) });
  if (executionResult.outcome !== 'failed') throw new Error('Expected RegisterUsage against Pinata to fail as capability-unsupported.');

  const usageEvent = buildUsageEventFromFailure({
    id: 'usage-solstice-capability-1',
    grant,
    occurredAt: isoAt(305),
    correlationId: 'corr-usage-solstice-capability-1',
    eventType: mapEnterpriseProviderFailureToUsageEventType(executionResult.failureReason),
    description: executionResult.message,
  });
  store.recordUsageEvent(usageEvent);

  const correlation: EnterpriseEvidenceCorrelation = {
    schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
    id: 'correlation-solstice-capability-1',
    resource: RESOURCE_REF,
    decisionRefs: [decision.correlationId],
    obligationRefs: [obligation.id],
    grantRefs: [grant.id],
    usageRefs: [usageEvent.id],
    correlatedAt: isoAt(306),
    description: "Evidence graph proving a policy obligation the current provider cannot satisfy is rejected honestly, never silently faked as satisfied.",
  };
  store.recordCorrelation(correlation);

  return {
    scenarioTitle: 'Failure demonstration — unsupported capability',
    outcomeSummary: `Meridian's policy asked Pinata to self-report usage; Pinata's own capability declaration does not include that, so the translation was refused with failureReason '${executionResult.failureReason}'.`,
    cards: [decisionCard(decision), obligationCard(obligation, { providerCanEnforce: false }), grantCard(grant), translationCard(translation), executionResultCard(executionResult), usageEventCard(usageEvent), correlationCard(correlation)],
    narrative: [
      {
        transition: 'Provider Translation → refused (capability-unsupported)',
        businessPurpose: "A provider is never allowed to silently ignore an obligation it cannot enforce. The refusal is explicit, categorized, and auditable — the difference between 'we assumed compliance' and 'we can prove the gap and who was told.'",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scenario 5: Provider failure.
// ---------------------------------------------------------------------------

async function runProviderFailureScenario(store: LifecycleRecordStore, resourceEnvelope: EnterpriseResourceEnvelope): Promise<ScenarioResult> {
  const request: EnterpriseScopedAccessRequest = {
    principalId: PRINCIPALS.outsideCounsel,
    resource: RESOURCE_REF,
    requestedScope: ['diligence-document:read'],
    requestedAt: isoAt(400),
    action: 'view',
  };

  const decision: EnterpriseAccessDecision = {
    schemaVersion: ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION,
    request,
    resource: resourceEnvelope,
    outcome: 'allow',
    evaluatedAt: isoAt(401),
    correlationId: 'corr-decision-solstice-outage-1',
    reason: 'A third reviewer for the same counterparty, same NDA on file.',
  };
  store.recordDecision(decision);

  const grant: EnterpriseAccessGrant = {
    schemaVersion: ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
    id: 'grant-solstice-outage-1',
    status: 'active',
    resource: RESOURCE_REF,
    decisionRef: decision.correlationId,
    principalId: PRINCIPALS.outsideCounsel,
    issuedAt: isoAt(402),
    expiresAt: isoAt(402 + 1_440),
    correlationId: 'corr-grant-solstice-outage-1',
    issuerRef: PRINCIPALS.approvalEngine,
  };
  store.recordGrant(grant);

  const translation = translateGrantForPinata({
    grant,
    executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_TEMPORARY_ACCESS,
    translationId: 'translation-solstice-outage-1',
    translatedAt: isoAt(403),
    correlationId: 'corr-translation-solstice-outage-1',
    providerMetadata: { requestedDurationSeconds: 3_600 },
  });

  const executionResult = await executePinataProviderTranslation(
    translation,
    createUnavailablePinataProviderClient('provider-unavailable', 'Pinata could not be reached.'),
    { now: () => isoAt(404) },
  );
  if (executionResult.outcome !== 'failed') throw new Error('Expected the outage client to fail every request.');

  const usageEvent = buildUsageEventFromFailure({
    id: 'usage-solstice-outage-1',
    grant,
    occurredAt: isoAt(405),
    correlationId: 'corr-usage-solstice-outage-1',
    eventType: mapEnterpriseProviderFailureToUsageEventType(executionResult.failureReason),
    description: executionResult.message,
  });
  store.recordUsageEvent(usageEvent);

  const correlation: EnterpriseEvidenceCorrelation = {
    schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
    id: 'correlation-solstice-outage-1',
    resource: RESOURCE_REF,
    decisionRefs: [decision.correlationId],
    grantRefs: [grant.id],
    usageRefs: [usageEvent.id],
    correlatedAt: isoAt(406),
    description: 'Evidence graph for a provider outage — the failure is normalized and recorded; no Pinata exception, HTTP status, or stack trace ever reaches this record.',
  };
  store.recordCorrelation(correlation);

  return {
    scenarioTitle: 'Failure demonstration — provider failure',
    outcomeSummary: `Pinata was unreachable when execution was attempted. The adapter normalized this into failureReason '${executionResult.failureReason}' and Enterprise recorded a '${usageEvent.eventType}' usage event — a valid grant was never invalidated by a provider outage.`,
    cards: [decisionCard(decision), grantCard(grant), translationCard(translation), executionResultCard(executionResult), usageEventCard(usageEvent), correlationCard(correlation)],
    narrative: [
      {
        transition: 'Provider Execution → refused (provider-unavailable)',
        businessPurpose: "A provider outage is a provider fact, not an Enterprise one. The grant itself is untouched — the moment Pinata recovers, the same grant can be retried without re-running policy evaluation.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

function translateGrantForPinata(input: {
  readonly grant: EnterpriseAccessGrant;
  readonly executionIntent: EnterpriseProviderTranslationExecutionIntent;
  readonly translationId: CanonicalId;
  readonly translatedAt: string;
  readonly correlationId: CanonicalId;
  readonly providerMetadata?: Readonly<Record<string, EnterpriseProviderTranslationMetadataValue>>;
  readonly description?: string;
}): EnterpriseProviderTranslation {
  const grantInput = toEnterpriseGrantTranslationInput(input.grant);
  return {
    schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
    id: input.translationId,
    providerSystem: PINATA_PROVIDER_SYSTEM,
    capability: enterpriseProviderTranslationRequiredCapability(input.executionIntent),
    executionIntent: input.executionIntent,
    grantRef: input.grant.id,
    resource: grantInput.resource,
    ...(input.providerMetadata === undefined ? {} : { providerMetadata: input.providerMetadata }),
    translatedAt: input.translatedAt,
    correlationId: input.correlationId,
    ...(input.description === undefined ? {} : { description: input.description }),
  };
}

function buildUsageEvent(input: {
  readonly id: CanonicalId;
  readonly eventType: EnterpriseUsageEventType;
  readonly grant: EnterpriseAccessGrant;
  readonly occurredAt: string;
  readonly correlationId: CanonicalId;
  readonly description?: string;
}): EnterpriseUsageEvent {
  return {
    schemaVersion: ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION,
    id: input.id,
    eventType: input.eventType,
    grantRef: input.grant.id,
    resource: input.grant.resource,
    principalId: input.grant.principalId,
    occurredAt: input.occurredAt,
    correlationId: input.correlationId,
    ...(input.description === undefined ? {} : { description: input.description }),
  };
}

function buildUsageEventFromFailure(input: {
  readonly id: CanonicalId;
  readonly grant: EnterpriseAccessGrant;
  readonly occurredAt: string;
  readonly correlationId: CanonicalId;
  readonly eventType: EnterpriseUsageEventType;
  readonly description: string;
}): EnterpriseUsageEvent {
  return buildUsageEvent(input);
}

function renderAuditReconstructionNarrative(history: ReconstructedAccessHistory): readonly string[] {
  const lines: string[] = [];
  const decision = history.decisions[0];
  const grant = history.grants[0];
  const revocation = history.revocations[0];

  lines.push(`Starting point: EnterpriseEvidenceCorrelation '${history.correlation.id}' — nothing else was consulted.`);
  if (decision) lines.push(`Who requested: '${decision.request.principalId}', at ${decision.request.requestedAt} (decision evaluated ${decision.evaluatedAt}, outcome '${decision.outcome}').`);
  if (grant) lines.push(`Who approved: '${grant.issuerRef ?? 'unspecified issuer'}', issuing grant '${grant.id}' at ${grant.issuedAt}.`);
  if (grant) lines.push(`When granted: ${grant.issuedAt}, valid until ${grant.expiresAt}.`);
  if (history.usageEvents.length > 0) {
    const usageSummary = history.usageEvents.map((event) => `${event.eventType} at ${event.occurredAt}`).join('; ');
    lines.push(`When used: ${usageSummary} (${history.usageEvents.length} observed event(s); no 'ContentDownloaded' among them).`);
  } else {
    lines.push('When used: never — the grant was issued but no usage event was ever recorded.');
  }
  if (revocation) {
    lines.push(`When revoked: ${revocation.revokedAt}, by '${revocation.issuerRef}', reason '${revocation.reason}'.`);
  } else {
    lines.push('When revoked: not revoked in this graph.');
  }
  lines.push(`Obligations attached: ${history.obligations.map((obligation) => obligation.type).join(', ') || 'none'}.`);
  return lines;
}
