declare module '@aoc/protocol' {
  export type AgentScope = Record<string, unknown>;
  export type AuditEventEnvelope = {
    event_id?: string;
    event_type?: string;
    occurred_at: string;
    subject_id?: string;
    requester_id?: string;
    request_id?: string;
    [key: string]: unknown;
  };
  export type CapabilityGrant = Record<string, unknown>;
  export type CapabilityToken = Record<string, unknown>;
  export type ConsentGrant = Record<string, unknown>;
  export type Delegation = Record<string, unknown>;
  export type AocIdentityClaims = Record<string, unknown> & { sub?: string };
  export type PolicyDecision = Record<string, unknown> & {
    allowed?: boolean;
    reasonCodes?: string[];
  };
  export type ScopedAccessRequest = {
    action?: string;
    resource?: string;
    scope?: string[];
    [key: string]: unknown;
  };
  export type TrustDomainIdentifier = string;
}
