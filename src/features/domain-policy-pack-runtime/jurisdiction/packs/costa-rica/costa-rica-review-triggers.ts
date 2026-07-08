import type { PolicyPackApprovalReviewType } from '../../../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import type { PolicyPackCompositionDecision } from '../../../../policy-pack-foundation/composition/policy-pack-composition-types.js';

/**
 * Costa Rica jurisdiction context review-trigger catalog.
 *
 * These are operational trigger *categories*, not Costa Rican law. Each
 * entry says only "this action shape may mean Costa Rica jurisdiction
 * context matters, so route it to the listed review path" -- never that any
 * specific Costa Rican statute, regulation, or legal requirement applies,
 * has been checked, or has been satisfied. Firing a trigger is a routing
 * signal, not a legal conclusion.
 */

export type CostaRicaReviewTriggerCategory =
  | 'jurisdiction_context_required'
  | 'governing_law_or_venue_unclear'
  | 'party_location_in_costa_rica'
  | 'customer_or_counterparty_in_costa_rica'
  | 'service_delivery_in_costa_rica'
  | 'payment_flow_touching_costa_rica'
  | 'tax_or_invoice_implication'
  | 'personal_data_processing_in_costa_rica'
  | 'consumer_or_end_user_impact'
  | 'minor_or_age_sensitive_participant'
  | 'employment_or_contractor_relationship'
  | 'healthcare_or_sensitive_data_context'
  | 'financial_or_payment_service_context'
  | 'public_sector_or_procurement_context'
  | 'regulated_goods_or_services_context'
  | 'dispute_or_claim_present'
  | 'contract_template_modified'
  | 'authority_boundary_unclear'
  | 'cross_border_execution'
  | 'automated_agent_action_with_legal_effect'
  | 'smart_contract_or_settlement_action';

export type CostaRicaReviewTriggerSeverity = 'info' | 'warning' | 'blocker' | 'critical';

/**
 * Restricted to the subset of `PolicyPackCompositionDecision` this catalog
 * ever recommends -- reusing the shared composition decision vocabulary
 * directly rather than inventing a parallel one (there is no separate
 * "legal review" decision literal; `require_review` is this runtime's
 * existing general-purpose "escalate for review" decision).
 */
export type CostaRicaReviewTriggerRecommendedDecision = Extract<
  PolicyPackCompositionDecision,
  'allow' | 'hold' | 'require_review' | 'require_approval' | 'require_customer_validation' | 'require_counsel_review' | 'require_compliance_review'
>;

export interface CostaRicaReviewTrigger {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: CostaRicaReviewTriggerCategory;
  readonly severity: CostaRicaReviewTriggerSeverity;
  readonly recommendedDecision: CostaRicaReviewTriggerRecommendedDecision;
  readonly requiredApprovalTypes: readonly PolicyPackApprovalReviewType[];
  readonly requiredEvidenceTypes: readonly string[];
}

function trigger(input: CostaRicaReviewTrigger): CostaRicaReviewTrigger {
  return input;
}

export const COSTA_RICA_REVIEW_TRIGGERS: readonly CostaRicaReviewTrigger[] = [
  trigger({
    id: 'costa-rica-trigger-jurisdiction-context-required',
    title: 'Costa Rica jurisdiction context required',
    description: 'Indicates that Costa Rica jurisdiction context may be relevant to this action and customer/counsel review may be required.',
    category: 'jurisdiction_context_required',
    severity: 'info',
    recommendedDecision: 'require_review',
    requiredApprovalTypes: ['operator_review'],
    requiredEvidenceTypes: ['jurisdiction_basis_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-governing-law-or-venue-unclear',
    title: 'Governing law or venue unclear',
    description: 'Indicates that the governing law or venue for this action is not clearly declared and may need legal review before proceeding.',
    category: 'governing_law_or_venue_unclear',
    severity: 'warning',
    recommendedDecision: 'require_review',
    requiredApprovalTypes: ['legal_review'],
    requiredEvidenceTypes: ['governing_law_or_venue_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-party-location-in-costa-rica',
    title: 'Party located in Costa Rica',
    description: 'Indicates that a party to this action is located in Costa Rica, which may make Costa Rica jurisdiction context relevant.',
    category: 'party_location_in_costa_rica',
    severity: 'info',
    recommendedDecision: 'require_review',
    requiredApprovalTypes: ['operator_review'],
    requiredEvidenceTypes: ['party_location_basis'],
  }),
  trigger({
    id: 'costa-rica-trigger-customer-or-counterparty-in-costa-rica',
    title: 'Customer or counterparty in Costa Rica',
    description: 'Indicates that a customer or counterparty for this action is in Costa Rica and customer validation of applicable policy may be needed.',
    category: 'customer_or_counterparty_in_costa_rica',
    severity: 'info',
    recommendedDecision: 'require_customer_validation',
    requiredApprovalTypes: ['customer_validation'],
    requiredEvidenceTypes: ['customer_validation_record'],
  }),
  trigger({
    id: 'costa-rica-trigger-service-delivery-in-costa-rica',
    title: 'Service delivery in Costa Rica',
    description: 'Indicates that this action involves service delivery in Costa Rica and the delivery-location basis may need review.',
    category: 'service_delivery_in_costa_rica',
    severity: 'info',
    recommendedDecision: 'require_review',
    requiredApprovalTypes: ['operator_review'],
    requiredEvidenceTypes: ['service_delivery_location_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-payment-flow-touching-costa-rica',
    title: 'Payment flow touching Costa Rica',
    description: 'Indicates that a payment flow in this action touches Costa Rica and may need compliance and tax review.',
    category: 'payment_flow_touching_costa_rica',
    severity: 'warning',
    recommendedDecision: 'require_compliance_review',
    requiredApprovalTypes: ['compliance_review', 'tax_review'],
    requiredEvidenceTypes: ['payment_flow_description'],
  }),
  trigger({
    id: 'costa-rica-trigger-tax-or-invoice-implication',
    title: 'Tax or invoice implication',
    description: 'Indicates that this action may carry a Costa Rica tax or invoicing implication and warrants tax review of the relevant records.',
    category: 'tax_or_invoice_implication',
    severity: 'warning',
    recommendedDecision: 'require_compliance_review',
    requiredApprovalTypes: ['tax_review'],
    requiredEvidenceTypes: ['invoice_or_tax_review_record'],
  }),
  trigger({
    id: 'costa-rica-trigger-personal-data-processing-in-costa-rica',
    title: 'Personal data processing in Costa Rica',
    description: 'Indicates that this action processes personal data in a Costa Rica context and privacy review of the data-processing context may be needed.',
    category: 'personal_data_processing_in_costa_rica',
    severity: 'warning',
    recommendedDecision: 'require_compliance_review',
    requiredApprovalTypes: ['privacy_review'],
    requiredEvidenceTypes: ['data_processing_context_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-consumer-or-end-user-impact',
    title: 'Consumer or end-user impact',
    description: 'Indicates that this action may affect a consumer or end user in Costa Rica and compliance review of that context may be needed.',
    category: 'consumer_or_end_user_impact',
    severity: 'warning',
    recommendedDecision: 'require_compliance_review',
    requiredApprovalTypes: ['compliance_review'],
    requiredEvidenceTypes: ['consumer_or_end_user_context_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-minor-or-age-sensitive-participant',
    title: 'Minor or age-sensitive participant',
    description: 'Indicates that a minor or age-sensitive participant may be involved in this action and counsel review is recommended before proceeding.',
    category: 'minor_or_age_sensitive_participant',
    severity: 'critical',
    recommendedDecision: 'require_counsel_review',
    requiredApprovalTypes: ['counsel_review', 'legal_review'],
    requiredEvidenceTypes: ['minor_or_age_sensitive_context_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-employment-or-contractor-relationship',
    title: 'Employment or contractor relationship',
    description: 'Indicates that this action touches an employment or contractor relationship in Costa Rica and legal/counsel review of that context is recommended.',
    category: 'employment_or_contractor_relationship',
    severity: 'warning',
    recommendedDecision: 'require_counsel_review',
    requiredApprovalTypes: ['legal_review', 'counsel_review'],
    requiredEvidenceTypes: ['employment_or_contractor_context_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-healthcare-or-sensitive-data-context',
    title: 'Healthcare or sensitive data context',
    description: 'Indicates that this action touches a healthcare or sensitive-data context in Costa Rica and counsel and privacy review are recommended.',
    category: 'healthcare_or_sensitive_data_context',
    severity: 'critical',
    recommendedDecision: 'require_counsel_review',
    requiredApprovalTypes: ['counsel_review', 'privacy_review'],
    requiredEvidenceTypes: ['healthcare_or_sensitive_data_context_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-financial-or-payment-service-context',
    title: 'Financial or payment service context',
    description: 'Indicates that this action touches a financial or payment-service context in Costa Rica and compliance/security review is recommended.',
    category: 'financial_or_payment_service_context',
    severity: 'warning',
    recommendedDecision: 'require_compliance_review',
    requiredApprovalTypes: ['compliance_review', 'security_review'],
    requiredEvidenceTypes: ['financial_or_payment_context_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-public-sector-or-procurement-context',
    title: 'Public sector or procurement context',
    description: 'Indicates that this action touches a public-sector or procurement context in Costa Rica and compliance/legal review is recommended.',
    category: 'public_sector_or_procurement_context',
    severity: 'warning',
    recommendedDecision: 'require_compliance_review',
    requiredApprovalTypes: ['compliance_review', 'legal_review'],
    requiredEvidenceTypes: ['public_sector_context_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-regulated-goods-or-services-context',
    title: 'Regulated goods or services context',
    description: 'Indicates that this action touches a recognized regulated goods-or-services pattern in a Costa Rica context and compliance review is recommended.',
    category: 'regulated_goods_or_services_context',
    severity: 'warning',
    recommendedDecision: 'require_compliance_review',
    requiredApprovalTypes: ['compliance_review'],
    requiredEvidenceTypes: ['regulated_goods_or_services_context_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-dispute-or-claim-present',
    title: 'Dispute or claim present',
    description: 'Indicates that an active dispute or claim is present for this action and counsel/legal review is recommended before proceeding.',
    category: 'dispute_or_claim_present',
    severity: 'critical',
    recommendedDecision: 'require_counsel_review',
    requiredApprovalTypes: ['counsel_review', 'legal_review'],
    requiredEvidenceTypes: ['dispute_or_claim_record'],
  }),
  trigger({
    id: 'costa-rica-trigger-contract-template-modified',
    title: 'Contract template modified',
    description: 'Indicates that the contract template used in this action was modified and a fresh legal review of the modified template is recommended.',
    category: 'contract_template_modified',
    severity: 'warning',
    recommendedDecision: 'require_review',
    requiredApprovalTypes: ['legal_review'],
    requiredEvidenceTypes: ['contract_template_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-authority-boundary-unclear',
    title: 'Authority boundary unclear',
    description: 'Indicates that the acting authority/boundary for this action is unclear and operator/legal review is recommended before proceeding.',
    category: 'authority_boundary_unclear',
    severity: 'critical',
    recommendedDecision: 'require_review',
    requiredApprovalTypes: ['operator_review', 'legal_review'],
    requiredEvidenceTypes: ['authority_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-cross-border-execution',
    title: 'Cross-border execution',
    description: 'Indicates that this action executes across a Costa Rica border and compliance review of the cross-border context is recommended.',
    category: 'cross_border_execution',
    severity: 'warning',
    recommendedDecision: 'require_compliance_review',
    requiredApprovalTypes: ['compliance_review'],
    requiredEvidenceTypes: ['cross_border_execution_context_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-automated-agent-action-with-legal-effect',
    title: 'Automated agent action with legal effect',
    description: 'Indicates that an automated agent action in Costa Rica context may carry legal effect and counsel/legal review is recommended before proceeding.',
    category: 'automated_agent_action_with_legal_effect',
    severity: 'warning',
    recommendedDecision: 'require_counsel_review',
    requiredApprovalTypes: ['counsel_review', 'legal_review'],
    requiredEvidenceTypes: ['automated_agent_action_context_source'],
  }),
  trigger({
    id: 'costa-rica-trigger-smart-contract-or-settlement-action',
    title: 'Smart contract or settlement action',
    description: 'Indicates that this action involves a smart contract or settlement step in Costa Rica context and counsel/security review is recommended before proceeding.',
    category: 'smart_contract_or_settlement_action',
    severity: 'critical',
    recommendedDecision: 'require_counsel_review',
    requiredApprovalTypes: ['counsel_review', 'legal_review', 'security_review'],
    requiredEvidenceTypes: ['smart_contract_or_settlement_context_source'],
  }),
];

export function findCostaRicaReviewTrigger(category: CostaRicaReviewTriggerCategory): CostaRicaReviewTrigger | undefined {
  return COSTA_RICA_REVIEW_TRIGGERS.find((entry) => entry.category === category);
}

/** Which review-trigger categories are flagged for a specific action -- an operational signal set, never a legal determination. */
export type CostaRicaReviewTriggerContext = Readonly<Partial<Record<CostaRicaReviewTriggerCategory, boolean>>>;

/** Deterministically returns every catalog trigger whose category is flagged `true` in `context`, in catalog order. */
export function evaluateCostaRicaReviewTriggers(context: CostaRicaReviewTriggerContext): readonly CostaRicaReviewTrigger[] {
  return COSTA_RICA_REVIEW_TRIGGERS.filter((entry) => context[entry.category] === true);
}
