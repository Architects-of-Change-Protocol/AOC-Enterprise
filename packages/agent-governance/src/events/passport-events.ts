import { randomBytes } from 'crypto';

export type AgentPassportEventType =
  | 'agent_passport.drafted'
  | 'agent_passport.issued'
  | 'agent_passport.activated'
  | 'agent_passport.suspended'
  | 'agent_passport.revoked'
  | 'agent_passport.expired'
  | 'agent_passport.verified'
  | 'agent_passport.verification_failed'
  | 'agent_passport.runtime_seal_created'
  | 'agent_passport.runtime_seal_verification_failed';

export interface AgentPassportEvent {
  readonly eventId: string;
  readonly passportId: string;
  readonly type: AgentPassportEventType;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly reasonCodes: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreatePassportEventInput {
  readonly passportId: string;
  readonly type: AgentPassportEventType;
  readonly actorId: string;
  readonly reasonCodes: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function createPassportEvent(input: CreatePassportEventInput): AgentPassportEvent {
  return {
    eventId: `EVT-${randomBytes(8).toString('hex').toUpperCase()}`,
    passportId: input.passportId,
    type: input.type,
    occurredAt: new Date().toISOString(),
    actorId: input.actorId,
    reasonCodes: input.reasonCodes,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}
