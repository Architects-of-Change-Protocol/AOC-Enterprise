import type { PolicyPackApprovalRequirement, PolicyPackControlPlaneRequirement, PolicyPackEvidenceRequirement, PolicyPackExportRequirement, PolicyPackManifest, PolicyPackSafeFraming, PolicyPackValidationStatus } from '../manifest/policy-pack-manifest-types.js';
import { satisfiesPolicyPackValidationStatus } from '../validation/policy-pack-validation-status.js';
import { resolvePolicyPackDependencies } from './policy-pack-dependency-resolver.js';
import type { PolicyPackCompositionDecision, PolicyPackCompositionInput, PolicyPackCompositionResult } from './policy-pack-composition-types.js';

function dedupeById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

/** AND-combines the five core disclaimer flags (safe only if every included pack agrees) and OR-combines the three "requires review" flags (needed if any included pack needs it). */
function combineSafeFraming(manifests: readonly PolicyPackManifest[]): PolicyPackSafeFraming {
  const all = <K extends keyof PolicyPackSafeFraming>(flag: K): boolean => manifests.every((manifest) => manifest.safeFraming[flag] === true);
  const any = <K extends keyof PolicyPackSafeFraming>(flag: K): boolean => manifests.some((manifest) => manifest.safeFraming[flag] === true);

  return {
    notLegalAdvice: manifests.length === 0 ? true : all('notLegalAdvice'),
    notComplianceCertification: manifests.length === 0 ? true : all('notComplianceCertification'),
    noCompletenessClaim: manifests.length === 0 ? true : all('noCompletenessClaim'),
    noJurisdictionalComplianceClaim: manifests.length === 0 ? true : all('noJurisdictionalComplianceClaim'),
    partialPolicyModel: manifests.length === 0 ? true : all('partialPolicyModel'),
    ...(any('requiresCustomerValidation') ? { requiresCustomerValidation: true } : {}),
    ...(any('requiresCounselReviewWhenApplicable') ? { requiresCounselReviewWhenApplicable: true } : {}),
    ...(any('requiresDomainExpertReviewWhenApplicable') ? { requiresDomainExpertReviewWhenApplicable: true } : {}),
  };
}

const COUNSEL_STATUSES: readonly PolicyPackValidationStatus[] = ['counsel_review_requested', 'counsel_reviewed', 'counsel_attested'];
const CUSTOMER_STATUSES: readonly PolicyPackValidationStatus[] = ['customer_provided', 'customer_validated'];
const DOMAIN_EXPERT_STATUSES: readonly PolicyPackValidationStatus[] = ['privacy_reviewed', 'security_reviewed'];

function decisionForUnsatisfiedStatus(status: PolicyPackValidationStatus): PolicyPackCompositionDecision | undefined {
  if (COUNSEL_STATUSES.includes(status)) return 'require_counsel_review';
  if (status === 'compliance_reviewed') return 'require_compliance_review';
  if (DOMAIN_EXPERT_STATUSES.includes(status)) return 'require_domain_expert_review';
  if (CUSTOMER_STATUSES.includes(status)) return 'require_customer_validation';
  return undefined;
}

/** First match in this order wins; matches the composition's required deterministic decision priority. */
const DECISION_PRIORITY: readonly PolicyPackCompositionDecision[] = [
  'deny',
  'require_counsel_review',
  'require_compliance_review',
  'require_domain_expert_review',
  'require_customer_validation',
  'require_approval',
  'require_review',
  'hold',
  'allow',
];

function pickHighestPriorityDecision(candidates: ReadonlySet<PolicyPackCompositionDecision>): PolicyPackCompositionDecision {
  for (const decision of DECISION_PRIORITY) {
    if (candidates.has(decision)) return decision;
  }
  return 'allow';
}

/**
 * Composes policy packs generically -- global baseline, legal baseline,
 * jurisdiction, domain, use-case, customer, operator-override, any kind --
 * without hardcoding any specific pack's content. This function never
 * evaluates rule conditions; it only resolves dependencies, aggregates
 * requirements, and derives a deterministic composition decision.
 */
export function composePolicyPacks(input: PolicyPackCompositionInput): PolicyPackCompositionResult {
  const manifestsById = new Map(input.availableManifests.map((manifest) => [manifest.id, manifest] as const));
  const resolved = resolvePolicyPackDependencies(input.rootPackId, input.requestedPackIds, input.availableManifests);

  const includedManifests = resolved.includedPackIds.map((id) => manifestsById.get(id)).filter((manifest): manifest is PolicyPackManifest => manifest !== undefined);

  const requiredValidationStatus = input.requiredValidationStatus ?? [];
  const unsatisfiedStatuses = new Set<PolicyPackValidationStatus>();
  for (const manifest of includedManifests) {
    for (const required of requiredValidationStatus) {
      if (!satisfiesPolicyPackValidationStatus(manifest.status, required)) unsatisfiedStatuses.add(required);
    }
  }
  const validationStatusSatisfied = unsatisfiedStatuses.size === 0;

  const requiredEvidence = dedupeById(includedManifests.flatMap((manifest): readonly PolicyPackEvidenceRequirement[] => manifest.evidenceRequirements));
  const requiredApprovals = dedupeById(includedManifests.flatMap((manifest): readonly PolicyPackApprovalRequirement[] => manifest.approvalRequirements));
  const requiredExports = dedupeById(includedManifests.flatMap((manifest): readonly PolicyPackExportRequirement[] => manifest.exportRequirements));
  const requiredControlPlaneSurfaces = dedupeById(includedManifests.flatMap((manifest): readonly PolicyPackControlPlaneRequirement[] => manifest.controlPlaneRequirements));

  const composed = resolved.missingPackIds.length === 0 && resolved.expiredPackIds.length === 0 && resolved.supersededPackIds.length === 0 && resolved.disabledPackIds.length === 0;

  const errors: string[] = [];
  const warnings: string[] = [];

  if (resolved.missingPackIds.length > 0) errors.push(`Missing required pack(s): ${resolved.missingPackIds.join(', ')}.`);
  if (resolved.expiredPackIds.length > 0) errors.push(`Expired required pack(s): ${resolved.expiredPackIds.join(', ')}.`);
  if (resolved.supersededPackIds.length > 0) errors.push(`Superseded required pack(s): ${resolved.supersededPackIds.join(', ')}.`);
  if (resolved.disabledPackIds.length > 0) errors.push(`Disabled required pack(s): ${resolved.disabledPackIds.join(', ')}.`);
  for (const edge of resolved.dependencyGraph) {
    if (edge.dependencyType === 'optional' && !edge.satisfied) {
      warnings.push(`Optional pack "${edge.toPackId}" referenced by "${edge.fromPackId}" is not available; composition continues without it.`);
    }
  }
  if (!validationStatusSatisfied) {
    warnings.push(`Composition does not satisfy required validation status(es): ${[...unsatisfiedStatuses].join(', ')}.`);
  }

  const decisionCandidates = new Set<PolicyPackCompositionDecision>();
  if (resolved.disabledPackIds.length > 0) decisionCandidates.add('deny');
  for (const status of unsatisfiedStatuses) {
    const decision = decisionForUnsatisfiedStatus(status);
    if (decision !== undefined) decisionCandidates.add(decision);
  }
  if (composed && validationStatusSatisfied && requiredApprovals.some((requirement) => requirement.required)) {
    decisionCandidates.add('require_approval');
  }
  if (resolved.missingPackIds.length > 0) decisionCandidates.add('require_review');
  if (resolved.expiredPackIds.length > 0 || resolved.supersededPackIds.length > 0) decisionCandidates.add('hold');

  return {
    compositionId: input.compositionId,
    rootPackId: input.rootPackId,
    composed,
    includedPackIds: resolved.includedPackIds,
    missingPackIds: resolved.missingPackIds,
    expiredPackIds: resolved.expiredPackIds,
    supersededPackIds: resolved.supersededPackIds,
    disabledPackIds: resolved.disabledPackIds,
    dependencyGraph: resolved.dependencyGraph,
    validationStatusSatisfied,
    requiredEvidence,
    requiredApprovals,
    requiredExports,
    requiredControlPlaneSurfaces,
    safeFraming: combineSafeFraming(includedManifests),
    decision: pickHighestPriorityDecision(decisionCandidates),
    warnings,
    errors,
  };
}
