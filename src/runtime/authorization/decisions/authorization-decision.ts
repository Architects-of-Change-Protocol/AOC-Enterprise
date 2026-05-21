import type { AuditEventEnvelope } from '@aoc/protocol';

export interface AuthorizationDecision {
  allowed: boolean;
  reasonCodes: string[];
  audit: AuditEventEnvelope;
}
