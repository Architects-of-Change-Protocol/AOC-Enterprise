import type { PolicyPackManifest } from '../../../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import type { PolicyPackCompositionDecision } from '../../../../policy-pack-foundation/composition/policy-pack-composition-types.js';
import { satisfiesPolicyPackValidationStatus } from '../../../../policy-pack-foundation/validation/policy-pack-validation-status.js';
import { resolveJurisdictionPacks } from '../../jurisdiction-pack-resolver.js';
import type { JurisdictionPackRegistry } from '../../jurisdiction-pack-registry.js';
import type { JurisdictionPackResolution, JurisdictionValidationStatus } from '../../jurisdiction-pack-types.js';
import { COSTA_RICA_BASE_PACK_ID, COSTA_RICA_JURISDICTION_COUNTRY_CODE, COSTA_RICA_JURISDICTION_ID } from './costa-rica-constants.js';
import type { CostaRicaReviewTrigger, CostaRicaReviewTriggerContext } from './costa-rica-review-triggers.js';
import { evaluateCostaRicaReviewTriggers } from './costa-rica-review-triggers.js';

/**
 * Costa Rica action-level resolution.
 *
 * Baseline dependency gating (missing/expired/disabled baseline, safe-framing
 * combination) is always delegated to `resolveJurisdictionPacks`, which
 * itself calls `composePolicyPacks` -- this module never re-implements that.
 *
 * `requiredValidationStatus` is deliberately checked directly against the
 * Costa Rica pack's *own* manifest status via `satisfiesPolicyPackValidationStatus`
 * (the same shared lattice every status check in this codebase uses), rather
 * than being passed into the `resolveJurisdictionPacks`/`composePolicyPacks`
 * call. `composePolicyPacks` checks `requiredValidationStatus` against every
 * *included* manifest, root and dependencies alike -- passing it through
 * would also demand the shared global legal baseline itself carry
 * `counsel_reviewed` status, conflating "is the Costa Rica-specific content
 * counsel-reviewed" with "is the ambient global baseline counsel-reviewed",
 * which are different questions. Whether the *composition as a whole*
 * (including the baseline) meets a required status remains inspectable via
 * `packResolutions[].composition.validationStatusSatisfied` for callers that
 * want that stricter, whole-chain semantics.
 *
 * On top of that, this module adds two concepts the shared Jurisdiction Pack
 * Runtime does not model at all -- jurisdiction ambiguity/conflict, and
 * review triggers firing for the specific action -- expressed using the
 * *existing* `PolicyPackCompositionDecision` vocabulary (there is no separate
 * "require_legal_review" decision literal; `require_review` is this
 * runtime's existing general-purpose "escalate for review" decision, used
 * here for jurisdiction ambiguity/conflict and for a missing Costa Rica
 * pack).
 */

/** The minimal jurisdiction-context shape this resolver needs -- `CostaRicaJurisdictionDescriptor` satisfies this directly. */
export interface CostaRicaActionJurisdictionContext {
  readonly countryCode?: string;
  readonly ambiguous?: boolean;
  readonly conflictDetected?: boolean;
}

export interface ResolveCostaRicaJurisdictionActionInput {
  readonly compositionId: string;
  readonly jurisdiction: CostaRicaActionJurisdictionContext;
  readonly legallySensitive: boolean;
  readonly registry: JurisdictionPackRegistry;
  readonly baselineManifests?: readonly PolicyPackManifest[];
  /** Only applied when `legallySensitive` is true -- a non-sensitive action never gates on validation status. */
  readonly requiredValidationStatus?: JurisdictionValidationStatus;
  readonly triggerContext?: CostaRicaReviewTriggerContext;
}

export interface CostaRicaJurisdictionActionResolution {
  readonly compositionId: string;
  /** `false` when the declared jurisdiction is not Costa Rica -- this pack has nothing to say about the action. */
  readonly applicable: boolean;
  readonly decision: PolicyPackCompositionDecision;
  readonly validationStatusSatisfied: boolean;
  readonly packResolutions: readonly JurisdictionPackResolution[];
  readonly firedTriggers: readonly CostaRicaReviewTrigger[];
  readonly missingPackIds: readonly string[];
  readonly notes: readonly string[];
}

/** Same relative decision priority `composePolicyPacks` uses internally, reused here (not redefined) only to merge this module's additive signals with the composition's own decision -- never to re-derive dependency/status gating. */
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

const COUNSEL_STATUSES: readonly JurisdictionValidationStatus[] = ['counsel_review_requested', 'counsel_reviewed', 'counsel_attested'];
const CUSTOMER_STATUSES: readonly JurisdictionValidationStatus[] = ['customer_provided', 'customer_validated'];

/** Mirrors `composePolicyPacks`' own unsatisfied-status-to-decision mapping (for the subset of statuses `JurisdictionValidationStatus` covers), applied only to the Costa Rica pack's own status rather than the whole composition. */
function decisionForUnsatisfiedJurisdictionStatus(required: JurisdictionValidationStatus): PolicyPackCompositionDecision {
  if (COUNSEL_STATUSES.includes(required)) return 'require_counsel_review';
  if (CUSTOMER_STATUSES.includes(required)) return 'require_customer_validation';
  return 'require_review';
}

export function resolveCostaRicaJurisdictionAction(input: ResolveCostaRicaJurisdictionActionInput): CostaRicaJurisdictionActionResolution {
  const applicable = input.jurisdiction.countryCode === COSTA_RICA_JURISDICTION_COUNTRY_CODE;

  if (!applicable) {
    return {
      compositionId: input.compositionId,
      applicable: false,
      decision: 'allow',
      validationStatusSatisfied: true,
      packResolutions: [],
      firedTriggers: [],
      missingPackIds: [],
      notes: ['Declared jurisdiction is not Costa Rica; the Costa Rica Base Pack does not apply to this action.'],
    };
  }

  const ambiguousOrConflicting = input.jurisdiction.ambiguous === true || input.jurisdiction.conflictDetected === true;
  const firedTriggers = evaluateCostaRicaReviewTriggers(input.triggerContext ?? {});
  const requiredValidationStatus = input.legallySensitive ? input.requiredValidationStatus : undefined;

  const packResolutions = resolveJurisdictionPacks({
    compositionId: input.compositionId,
    jurisdictionId: COSTA_RICA_JURISDICTION_ID,
    registry: input.registry,
    ...(input.baselineManifests !== undefined ? { baselineManifests: input.baselineManifests } : {}),
  });

  const registeredCostaRicaPack = input.registry.get(COSTA_RICA_BASE_PACK_ID);
  const missingPackIds = registeredCostaRicaPack === undefined ? [COSTA_RICA_BASE_PACK_ID] : [];

  const ownStatusSatisfied =
    requiredValidationStatus === undefined || registeredCostaRicaPack === undefined
      ? true
      : satisfiesPolicyPackValidationStatus(registeredCostaRicaPack.manifest.status, requiredValidationStatus);

  const decisionCandidates = new Set<PolicyPackCompositionDecision>();
  if (ambiguousOrConflicting) decisionCandidates.add('require_review');
  if (missingPackIds.length > 0) decisionCandidates.add('require_review');
  if (!ownStatusSatisfied && requiredValidationStatus !== undefined) decisionCandidates.add(decisionForUnsatisfiedJurisdictionStatus(requiredValidationStatus));
  for (const resolution of packResolutions) decisionCandidates.add(resolution.decision);
  for (const trigger of firedTriggers) decisionCandidates.add(trigger.recommendedDecision);
  if (decisionCandidates.size === 0) decisionCandidates.add('allow');

  const validationStatusSatisfied = !ambiguousOrConflicting && missingPackIds.length === 0 && ownStatusSatisfied;

  const notes: string[] = [];
  if (ambiguousOrConflicting) notes.push('Costa Rica jurisdiction context is ambiguous or conflicting for this action; legal review is required to resolve which jurisdiction applies.');
  if (missingPackIds.length > 0) notes.push('No Costa Rica Base Pack is registered for this action; legal review is required rather than proceeding unreviewed.');
  if (!ownStatusSatisfied && requiredValidationStatus !== undefined) {
    notes.push(`The registered Costa Rica pack's status does not satisfy the required "${requiredValidationStatus}" status for this action.`);
  }
  if (firedTriggers.length > 0) notes.push(`${firedTriggers.length} Costa Rica review trigger(s) fired for this action; see firedTriggers for the recommended review paths.`);

  return {
    compositionId: input.compositionId,
    applicable: true,
    decision: pickHighestPriorityDecision(decisionCandidates),
    validationStatusSatisfied,
    packResolutions,
    firedTriggers,
    missingPackIds,
    notes,
  };
}
