import { EVIDENCE_FIELD_KEYS, type DisclosureLevel, type DisclosurePolicy, type EvidenceFieldKey } from './contracts.js';
import { EvidenceError } from './errors.js';

/**
 * The canonical, typed Disclosure Policies (mission section "Disclosure
 * Levels"): FULL, AUDITOR, PARTNER, CUSTOMER, PUBLIC. Each policy
 * classifies every `EvidenceFieldKey` into exactly one of
 * visible/hidden/redacted, and splits `visibleFields` into
 * required/optional -- `validateDisclosurePolicy` enforces that partition
 * at module load, so a malformed policy can never be registered silently.
 */

function validateDisclosurePolicy(policy: DisclosurePolicy): DisclosurePolicy {
  const allFields = new Set<EvidenceFieldKey>(EVIDENCE_FIELD_KEYS);
  const visible = new Set(policy.visibleFields);
  const hidden = new Set(policy.hiddenFields);

  for (const field of visible) {
    if (hidden.has(field)) throw new Error(`Disclosure policy '${policy.policyId}': field '${field}' cannot be both visible and hidden.`);
  }
  const union = new Set([...visible, ...hidden]);
  if (union.size !== allFields.size || [...allFields].some((field) => !union.has(field))) {
    throw new Error(`Disclosure policy '${policy.policyId}': visibleFields + hiddenFields must exactly partition EVIDENCE_FIELD_KEYS.`);
  }
  for (const field of policy.redactedFields) {
    if (!visible.has(field)) throw new Error(`Disclosure policy '${policy.policyId}': redacted field '${field}' must also be a visible field.`);
  }
  const required = new Set(policy.requiredFields);
  const optional = new Set(policy.optionalFields);
  for (const field of required) {
    if (optional.has(field)) throw new Error(`Disclosure policy '${policy.policyId}': field '${field}' cannot be both required and optional.`);
  }
  const requiredOptionalUnion = new Set([...required, ...optional]);
  if (requiredOptionalUnion.size !== visible.size || [...visible].some((field) => !requiredOptionalUnion.has(field))) {
    throw new Error(`Disclosure policy '${policy.policyId}': requiredFields + optionalFields must exactly partition visibleFields.`);
  }
  return policy;
}

function definePolicy(policy: DisclosurePolicy): DisclosurePolicy {
  return validateDisclosurePolicy(policy);
}

/** FULL: every field. Internal use only -- never handed to an external party. */
export const FULL_DISCLOSURE_POLICY: DisclosurePolicy = definePolicy({
  policyId: 'evidence.disclosure.full.v1',
  level: 'FULL',
  version: '1.0.0',
  visibleFields: [...EVIDENCE_FIELD_KEYS],
  hiddenFields: [],
  redactedFields: [],
  requiredFields: ['evidence.status', 'evidence.summary', 'evidence.reasonCodes'],
  optionalFields: ['source.organizationId', 'subject.actionType', 'subject.resourceScope', 'subject.description', 'evidence.trace', 'evidence.events', 'evidence.metadata'],
});

/** AUDITOR: everything an external auditor needs to reconstruct and trust the decision, except internal runtime metadata (mission: "Todo excepto secretos internos"). */
export const AUDITOR_DISCLOSURE_POLICY: DisclosurePolicy = definePolicy({
  policyId: 'evidence.disclosure.auditor.v1',
  level: 'AUDITOR',
  version: '1.0.0',
  visibleFields: ['source.organizationId', 'subject.actionType', 'subject.resourceScope', 'subject.description', 'evidence.status', 'evidence.summary', 'evidence.reasonCodes', 'evidence.trace', 'evidence.events'],
  hiddenFields: ['evidence.metadata'],
  redactedFields: [],
  requiredFields: ['evidence.status', 'evidence.summary', 'evidence.reasonCodes', 'evidence.trace'],
  optionalFields: ['source.organizationId', 'subject.actionType', 'subject.resourceScope', 'subject.description', 'evidence.events'],
});

/** PARTNER: the decision and its outcome, without internal execution trace, runtime metadata, or tenant identifiers. */
export const PARTNER_DISCLOSURE_POLICY: DisclosurePolicy = definePolicy({
  policyId: 'evidence.disclosure.partner.v1',
  level: 'PARTNER',
  version: '1.0.0',
  visibleFields: ['subject.actionType', 'subject.resourceScope', 'subject.description', 'evidence.status', 'evidence.summary', 'evidence.reasonCodes', 'evidence.events'],
  hiddenFields: ['source.organizationId', 'evidence.trace', 'evidence.metadata'],
  redactedFields: [],
  requiredFields: ['evidence.status', 'evidence.summary'],
  optionalFields: ['subject.actionType', 'subject.resourceScope', 'subject.description', 'evidence.reasonCodes', 'evidence.events'],
});

/** CUSTOMER: only what the customer needs -- the outcome and why, nothing about how it was produced. */
export const CUSTOMER_DISCLOSURE_POLICY: DisclosurePolicy = definePolicy({
  policyId: 'evidence.disclosure.customer.v1',
  level: 'CUSTOMER',
  version: '1.0.0',
  visibleFields: ['subject.description', 'evidence.status', 'evidence.summary', 'evidence.reasonCodes'],
  hiddenFields: ['source.organizationId', 'subject.actionType', 'subject.resourceScope', 'evidence.trace', 'evidence.events', 'evidence.metadata'],
  redactedFields: [],
  requiredFields: ['evidence.status'],
  optionalFields: ['subject.description', 'evidence.summary', 'evidence.reasonCodes'],
});

/** PUBLIC: minimal facts only -- that a decision was made, and its outcome. The subject description is disclosed as a field but its value is redacted to a generic statement. */
export const PUBLIC_DISCLOSURE_POLICY: DisclosurePolicy = definePolicy({
  policyId: 'evidence.disclosure.public.v1',
  level: 'PUBLIC',
  version: '1.0.0',
  visibleFields: ['subject.description', 'evidence.status'],
  hiddenFields: ['source.organizationId', 'subject.actionType', 'subject.resourceScope', 'evidence.summary', 'evidence.reasonCodes', 'evidence.trace', 'evidence.events', 'evidence.metadata'],
  redactedFields: ['subject.description'],
  requiredFields: ['evidence.status'],
  optionalFields: ['subject.description'],
});

const DISCLOSURE_POLICIES: Readonly<Record<DisclosureLevel, DisclosurePolicy>> = {
  FULL: FULL_DISCLOSURE_POLICY,
  AUDITOR: AUDITOR_DISCLOSURE_POLICY,
  PARTNER: PARTNER_DISCLOSURE_POLICY,
  CUSTOMER: CUSTOMER_DISCLOSURE_POLICY,
  PUBLIC: PUBLIC_DISCLOSURE_POLICY,
};

/** Looks up the canonical policy for a disclosure level. Throws `EvidenceError('EVIDENCE_DISCLOSURE_POLICY_UNKNOWN')` for anything else, rather than silently defaulting to a level -- an unrecognized level must never fall back to a more permissive one. */
export function getDisclosurePolicy(level: string): DisclosurePolicy {
  const policy = (DISCLOSURE_POLICIES as Record<string, DisclosurePolicy | undefined>)[level];
  if (policy === undefined) {
    throw new EvidenceError('EVIDENCE_DISCLOSURE_POLICY_UNKNOWN', `Unknown disclosure level '${level}'. Supported levels: ${Object.keys(DISCLOSURE_POLICIES).join(', ')}.`);
  }
  return policy;
}

/** Looks up the canonical policy this contract id belongs to -- used by the verifier to compare a Bundle's claimed policy against the one actually registered under that id. */
export function findDisclosurePolicyById(policyId: string): DisclosurePolicy | undefined {
  return Object.values(DISCLOSURE_POLICIES).find((policy) => policy.policyId === policyId);
}

export function listDisclosurePolicies(): readonly DisclosurePolicy[] {
  return Object.values(DISCLOSURE_POLICIES);
}
