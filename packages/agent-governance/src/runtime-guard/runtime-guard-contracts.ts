import { randomBytes } from 'crypto';
import type { AgentRuntimeGuardDecision } from './runtime-decision.js';
import type { AgentRuntimeActionRequest } from './runtime-action.js';

export type AgentRuntimeHumanApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface AgentRuntimeHumanApprovalRequest {
  readonly approvalRequestId: string;
  readonly decisionId: string;
  readonly requestId: string;
  readonly passportId: string;
  readonly requestedAction: string;
  readonly reasonCodes: readonly string[];
  readonly createdAt: string;
  readonly status: AgentRuntimeHumanApprovalStatus;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function createHumanApprovalRequest(
  decision: AgentRuntimeGuardDecision,
  request: AgentRuntimeActionRequest,
  now?: () => string,
): AgentRuntimeHumanApprovalRequest {
  const createdAt = now ? now() : new Date().toISOString();
  return {
    approvalRequestId: `APPR-${randomBytes(8).toString('hex').toUpperCase()}`,
    decisionId: decision.decisionId,
    requestId: decision.requestId,
    passportId: decision.passportId,
    requestedAction: request.requestedAction,
    reasonCodes: decision.reasonCodes,
    createdAt,
    status: 'pending',
  };
}
