/**
 * Universal safe labels every system-authored or demo policy pack manifest
 * should carry. These are disclaimers, not claims -- they exist to keep the
 * pack from being mistaken for legal advice, a compliance certification, or
 * a complete policy model.
 */
export const POLICY_PACK_SAFE_LABELS = [
  'not_legal_advice',
  'partial_policy_model',
  'not_compliance_certification',
  'no_completeness_claim',
  'no_jurisdictional_compliance_claim',
  'requires_customer_validation',
  'requires_domain_expert_review_when_applicable',
  'requires_counsel_review_when_applicable',
] as const;

export type PolicyPackSafeLabel = (typeof POLICY_PACK_SAFE_LABELS)[number];

/**
 * Universal prohibited overclaim phrases. AOC must never emit these unless a
 * source-provided claim explicitly and safely allows them (see
 * `evaluatePolicyPackClaimSafety`'s `allowedSourceProvidedClaims` option) --
 * and even then the claim must be labeled as source-provided, not as AOC's
 * own conclusion.
 */
export const POLICY_PACK_PROHIBITED_OVERCLAIM_PHRASES = [
  'legally compliant',
  'legal compliance passed',
  'jurisdictionally compliant',
  'certified compliant',
  'guaranteed compliant',
  'valid under law',
  'approved by law',
  'fully legal',
  'regulatory approved',
  'regulatory approval',
  'complies with Costa Rica',
  'complies with Panama',
  'complies with US law',
  'complies with EU law',
  'banking compliant',
  'healthcare compliant',
  'labor compliant',
  'commercial compliant',
  'civil compliant',
  'criminal compliant',
  'tax compliant',
  'GDPR compliant',
  'HIPAA compliant',
  'AML compliant',
  'risk-free',
  'fully secure',
  'unbiased AI',
  'medically approved',
  'investment safe',
  'guaranteed outcome',
] as const;

export type PolicyPackProhibitedOverclaimPhrase = (typeof POLICY_PACK_PROHIBITED_OVERCLAIM_PHRASES)[number];

/** The safe-framing defaults every system-authored or demo policy pack manifest must start from. */
export const SYSTEM_AUTHORED_SAFE_FRAMING_DEFAULTS = {
  notLegalAdvice: true,
  notComplianceCertification: true,
  noCompletenessClaim: true,
  noJurisdictionalComplianceClaim: true,
  partialPolicyModel: true,
} as const;
