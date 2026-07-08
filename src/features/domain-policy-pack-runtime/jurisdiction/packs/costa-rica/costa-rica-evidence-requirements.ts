import type { PolicyPackEvidenceRequirement } from '../../../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';

/**
 * Costa Rica base evidence-requirement catalog, using the shared
 * `PolicyPackEvidenceRequirement` shape directly. Every `evidenceType` here
 * is an operational evidence *signal* -- a record this pack's review
 * triggers may ask for -- never a legal conclusion. None of these claim
 * Costa Rica compliance, legal validity, or regulatory approval.
 *
 * `required` is `false` on every catalog entry: whether a given evidence
 * type is actually required for a specific action is decided by which
 * `CostaRicaReviewTrigger`s fire for that action (see
 * `costa-rica-review-triggers.ts`), not by static manifest declaration --
 * a jurisdiction pack existing must never itself force every action into an
 * evidence requirement regardless of context.
 */
export const COSTA_RICA_EVIDENCE_TYPES = [
  'jurisdiction_basis_source',
  'customer_policy_source',
  'customer_validation_record',
  'counsel_review_record',
  'counsel_attestation_source',
  'contract_template_source',
  'authority_source',
  'party_location_basis',
  'governing_law_or_venue_source',
  'service_delivery_location_source',
  'payment_flow_description',
  'invoice_or_tax_review_record',
  'data_processing_context_source',
  'consumer_or_end_user_context_source',
  'minor_or_age_sensitive_context_source',
  'employment_or_contractor_context_source',
  'healthcare_or_sensitive_data_context_source',
  'financial_or_payment_context_source',
  'public_sector_context_source',
  'regulated_goods_or_services_context_source',
  'dispute_or_claim_record',
  'cross_border_execution_context_source',
  'automated_agent_action_context_source',
  'smart_contract_or_settlement_context_source',
] as const;

export type CostaRicaEvidenceType = (typeof COSTA_RICA_EVIDENCE_TYPES)[number];

export const COSTA_RICA_EVIDENCE_REQUIREMENTS: readonly PolicyPackEvidenceRequirement[] = COSTA_RICA_EVIDENCE_TYPES.map((evidenceType) => ({
  id: `costa-rica-evidence-${evidenceType.replace(/_/g, '-')}`,
  evidenceType,
  required: false,
}));
