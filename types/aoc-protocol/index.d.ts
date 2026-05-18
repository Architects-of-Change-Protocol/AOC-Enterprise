type ProtocolRecord = Record<string, unknown>;
type ProtocolIdentityClaims = ProtocolRecord & { sub?: string };
type ProtocolCapabilityToken = ProtocolRecord;
type ProtocolConsentGrant = ProtocolRecord;
type ProtocolScopedAccessRequest = { action?: string; resource?: string; scope?: string[]; [key: string]: unknown };
type ProtocolAuditEventEnvelope = { event_id?: string; event_type?: string; occurred_at: string; subject_id?: string; requester_id?: string; request_id?: string; [key: string]: unknown };
type ProtocolTrustDomainIdentifier = string;
type ProtocolCapabilityGrant = ProtocolRecord;
type ProtocolDelegation = ProtocolRecord;
type ProtocolPolicyDecision = ProtocolRecord & { allowed?: boolean; reasonCodes?: string[] };
type ProtocolAgentScope = ProtocolRecord;

declare module '@aoc/protocol' {
  export {
    type ProtocolAgentScope as AgentScope,
    type ProtocolAuditEventEnvelope as AuditEventEnvelope,
    type ProtocolCapabilityGrant as CapabilityGrant,
    type ProtocolCapabilityToken as CapabilityToken,
    type ProtocolConsentGrant as ConsentGrant,
    type ProtocolDelegation as Delegation,
    type ProtocolIdentityClaims as AocIdentityClaims,
    type ProtocolPolicyDecision as PolicyDecision,
    type ProtocolScopedAccessRequest as ScopedAccessRequest,
    type ProtocolTrustDomainIdentifier as TrustDomainIdentifier,
  };
}
