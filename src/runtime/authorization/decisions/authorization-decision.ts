import type { AuditEventEnvelope } from '@aoc/protocol/contracts';

export interface AuthorizationDecision {
  allowed: boolean;
  reasonCodes: string[];
  audit: AuditEventEnvelope;
}
