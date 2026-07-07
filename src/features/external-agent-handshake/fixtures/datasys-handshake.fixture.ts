import type { ExternalTrustIssuer } from '../domain/external-trust-issuer.js';
import type { TrustBoundary } from '../domain/trust-boundary.js';
import type { ExternalAgentHandshakeRuntime } from '../runtime/external-agent-handshake-runtime.js';

export const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';

export const PROJECT_SCOPE = 'project:HMP-14665';
export const OTHER_PROJECT_SCOPE = 'project:GCH-15992';

export const READ_PROJECT_SUMMARY = 'read_project_summary';
export const SUBMIT_PROJECT_UPDATE = 'submit_project_update';
export const REQUEST_CLIENT_FOLLOW_UP = 'request_client_follow_up';

export const APPROVE_PAYMENT_ACTION = 'approve_payment';
export const SIGN_CONTRACT_ACTION = 'sign_contract';
export const SEND_FINAL_INVOICE_ACTION = 'send_final_invoice';
export const CHANGE_BANK_ACCOUNT_ACTION = 'change_bank_account';

export const APPROVE_FINANCIAL_ACTION_CAPABILITY = 'approve_financial_action';
export const SIGN_LEGAL_COMMITMENT_CAPABILITY = 'sign_legal_commitment';
export const MODIFY_BANK_DETAILS_CAPABILITY = 'modify_bank_details';

export const TRUSTED_PARTNER_ISSUER_ID = 'external-issuer-trusted-partner-org';
export const LIMITED_PARTNER_ISSUER_ID = 'external-issuer-limited-partner-org';
export const UNKNOWN_ISSUER_ID = 'external-issuer-unknown-issuer';
export const REVOKED_ISSUER_ID = 'external-issuer-revoked-issuer';

export const TRUSTED_PARTNER_AGENT_ID = 'external-agent-trusted-partner-research-agent';
export const LIMITED_PARTNER_AGENT_ID = 'external-agent-limited-partner-reporting-agent';
export const UNKNOWN_AGENT_ID = 'external-agent-unknown-external-agent';
export const REVOKED_ISSUER_AGENT_ID = 'external-agent-revoked-issuer-agent';
export const EXPIRED_PASSPORT_AGENT_ID = 'external-agent-expired-passport-agent';

export const TRUST_BOUNDARY_ID = 'trust-boundary-datasys-partner-ingress';

export interface DatasysHandshakeWorld {
  readonly trustDomainId: string;
  readonly trustBoundary: TrustBoundary;
  readonly trustedPartnerIssuer: ExternalTrustIssuer;
  readonly limitedPartnerIssuer: ExternalTrustIssuer;
  readonly revokedIssuer: ExternalTrustIssuer;
}

/**
 * Establishes the "Datasys Agent Republic" trust domain's border: which
 * external issuers/agent types/capabilities/scopes/data-domains it accepts
 * from outside partners, matching the External Agent Handshake sprint spec's
 * canonical demo scenario set.
 */
export function buildDatasysHandshakeWorld(runtime: ExternalAgentHandshakeRuntime): DatasysHandshakeWorld {
  const trustedPartnerIssuer = runtime.registerExternalIssuer({
    id: TRUSTED_PARTNER_ISSUER_ID,
    displayName: 'Trusted Partner Org',
    acceptedByTrustDomainId: TRUST_DOMAIN_ID,
    allowedAgentTypes: ['agent', 'service_account'],
    allowedCapabilities: [READ_PROJECT_SUMMARY, SUBMIT_PROJECT_UPDATE, REQUEST_CLIENT_FOLLOW_UP],
    allowedResourceScopes: [PROJECT_SCOPE],
    requiresApproval: false,
    maxVisaTtlMinutes: 60,
  });
  runtime.trustExternalIssuer(TRUSTED_PARTNER_ISSUER_ID);

  const limitedPartnerIssuer = runtime.registerExternalIssuer({
    id: LIMITED_PARTNER_ISSUER_ID,
    displayName: 'Limited Partner Org',
    acceptedByTrustDomainId: TRUST_DOMAIN_ID,
    allowedAgentTypes: ['agent'],
    allowedCapabilities: [READ_PROJECT_SUMMARY, SUBMIT_PROJECT_UPDATE],
    allowedResourceScopes: [PROJECT_SCOPE],
    requiresApproval: true,
    maxVisaTtlMinutes: 30,
  });
  runtime.limitExternalIssuer(LIMITED_PARTNER_ISSUER_ID);

  runtime.registerExternalIssuer({
    id: UNKNOWN_ISSUER_ID,
    displayName: 'Unknown Issuer',
    acceptedByTrustDomainId: TRUST_DOMAIN_ID,
    allowedAgentTypes: ['agent'],
    allowedCapabilities: [READ_PROJECT_SUMMARY],
    allowedResourceScopes: [PROJECT_SCOPE],
    requiresApproval: true,
    maxVisaTtlMinutes: 15,
  });
  // Deliberately left at its default 'unknown' status -- never explicitly trusted/limited/revoked.

  const revokedIssuer = runtime.registerExternalIssuer({
    id: REVOKED_ISSUER_ID,
    displayName: 'Revoked Issuer',
    acceptedByTrustDomainId: TRUST_DOMAIN_ID,
    allowedAgentTypes: ['agent'],
    allowedCapabilities: [READ_PROJECT_SUMMARY],
    allowedResourceScopes: [PROJECT_SCOPE],
    requiresApproval: false,
    maxVisaTtlMinutes: 60,
  });
  runtime.trustExternalIssuer(REVOKED_ISSUER_ID);
  runtime.revokeExternalIssuer(REVOKED_ISSUER_ID);

  const trustBoundary = runtime.createTrustBoundary({
    id: TRUST_BOUNDARY_ID,
    localTrustDomainId: TRUST_DOMAIN_ID,
    allowedExternalIssuerIds: [TRUSTED_PARTNER_ISSUER_ID, LIMITED_PARTNER_ISSUER_ID],
    allowedAgentTypes: ['agent', 'agent_cluster', 'service_account'],
    allowedCapabilities: [READ_PROJECT_SUMMARY, SUBMIT_PROJECT_UPDATE, REQUEST_CLIENT_FOLLOW_UP],
    allowedResourceScopes: [PROJECT_SCOPE],
    prohibitedCapabilities: [APPROVE_FINANCIAL_ACTION_CAPABILITY, SIGN_LEGAL_COMMITMENT_CAPABILITY, MODIFY_BANK_DETAILS_CAPABILITY],
    prohibitedActions: [APPROVE_PAYMENT_ACTION, SIGN_CONTRACT_ACTION, SEND_FINAL_INVOICE_ACTION, CHANGE_BANK_ACCOUNT_ACTION],
    prohibitedResourceScopes: [],
    requiresApprovalForUnknownIssuers: true,
    requiresApprovalForHighRisk: true,
    maxVisaTtlMinutes: 60,
    dataBoundaries: [
      {
        id: 'data-boundary-datasys-partner-ingress',
        allowedDataDomains: ['project_status', 'delivery_summary', 'non_sensitive_client_context'],
        prohibitedDataDomains: ['credentials', 'secrets', 'bank_account', 'payroll', 'medical_data'],
        allowedDirections: ['inbound', 'outbound', 'bidirectional'],
      },
    ],
  });

  runtime.registerExternalAgent({
    id: TRUSTED_PARTNER_AGENT_ID,
    type: 'agent',
    status: 'known',
    displayName: 'Trusted Partner Research Agent',
    externalIssuerId: TRUSTED_PARTNER_ISSUER_ID,
  });

  runtime.registerExternalAgent({
    id: LIMITED_PARTNER_AGENT_ID,
    type: 'agent',
    status: 'known',
    displayName: 'Limited Partner Reporting Agent',
    externalIssuerId: LIMITED_PARTNER_ISSUER_ID,
  });

  runtime.registerExternalAgent({
    id: UNKNOWN_AGENT_ID,
    type: 'agent',
    status: 'unknown',
    displayName: 'Unknown External Agent',
  });

  runtime.registerExternalAgent({
    id: REVOKED_ISSUER_AGENT_ID,
    type: 'agent',
    status: 'known',
    displayName: 'Revoked Issuer Agent',
    externalIssuerId: REVOKED_ISSUER_ID,
  });

  runtime.registerExternalAgent({
    id: EXPIRED_PASSPORT_AGENT_ID,
    type: 'agent',
    status: 'known',
    displayName: 'Expired Passport Agent',
    externalIssuerId: TRUSTED_PARTNER_ISSUER_ID,
  });

  return { trustDomainId: TRUST_DOMAIN_ID, trustBoundary, trustedPartnerIssuer, limitedPartnerIssuer, revokedIssuer };
}
