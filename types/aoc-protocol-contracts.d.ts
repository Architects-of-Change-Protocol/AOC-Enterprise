declare module '@aoc/protocol/contracts' {
  export interface AocIdentityClaims {
    sub: string;
    tenant_id?: string;
    org_id?: string;
    [k: string]: unknown;
  }

  export interface CapabilityToken {
    [k: string]: unknown;
  }

  export interface ConsentGrant {
    grant_id?: string;
    [k: string]: unknown;
  }

  export interface ScopedAccessRequest {
    scope: string[];
    [k: string]: unknown;
  }

  export interface AuditEventEnvelope {
    event_id: string;
    occurred_at: string;
    [k: string]: unknown;
  }
}
