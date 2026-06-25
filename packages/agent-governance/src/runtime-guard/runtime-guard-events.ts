import { randomBytes } from 'crypto';

export type AgentRuntimeGuardEventType =
  | 'agent_runtime_guard.evaluated'
  | 'agent_runtime_guard.allowed'
  | 'agent_runtime_guard.denied'
  | 'agent_runtime_guard.human_approval_required'
  | 'agent_runtime_guard.enforced';

export interface AgentRuntimeGuardEvent {
  readonly eventId: string;
  readonly passportId: string;
  readonly requestId: string;
  readonly decisionId?: string;
  readonly type: AgentRuntimeGuardEventType;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly reasonCodes: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreateRuntimeGuardEventInput {
  readonly passportId: string;
  readonly requestId: string;
  readonly decisionId?: string;
  readonly type: AgentRuntimeGuardEventType;
  readonly actorId: string;
  readonly reasonCodes: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly now?: () => string;
}

export function createRuntimeGuardEvent(input: CreateRuntimeGuardEventInput): AgentRuntimeGuardEvent {
  const occurredAt = input.now ? input.now() : new Date().toISOString();
  return {
    eventId: `RGEVT-${randomBytes(8).toString('hex').toUpperCase()}`,
    passportId: input.passportId,
    requestId: input.requestId,
    ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
    type: input.type,
    occurredAt,
    actorId: input.actorId,
    reasonCodes: input.reasonCodes,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}

export interface RuntimeGuardEventSink {
  emit(event: AgentRuntimeGuardEvent): void | Promise<void>;
}
