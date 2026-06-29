import type { AgentRuntimeGuardEvent } from '@aoc-enterprise/agent-governance';

export interface PassportStatusEventInput {
  readonly eventId?: string;
  readonly passportId: string;
  readonly eventType: string;
  readonly previousStatus?: string;
  readonly newStatus?: string;
  readonly reason?: string;
  readonly actorId?: string;
  readonly occurredAt?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface PassportVerificationEventInput {
  readonly eventId?: string;
  readonly passportId: string;
  readonly verificationResult: string;
  readonly reasonCodes: readonly string[];
  readonly actorId?: string;
  readonly requestContext?: Readonly<Record<string, unknown>>;
  readonly occurredAt?: string;
}

export interface AuditEventRepository {
  recordPassportStatusEvent(input: PassportStatusEventInput): Promise<void>;
  recordPassportVerificationEvent(input: PassportVerificationEventInput): Promise<void>;
  recordRuntimeGuardEvent(event: AgentRuntimeGuardEvent): Promise<void>;
  listRuntimeGuardEventsForPassport(passportId: string): Promise<AgentRuntimeGuardEvent[]>;
  listPassportStatusEvents?(passportId: string): Promise<PassportStatusEventInput[]>;
}
