export type AgentPassportStatus =
  | 'draft'
  | 'issued'
  | 'active'
  | 'suspended'
  | 'revoked'
  | 'expired';

const VALID_TRANSITIONS: ReadonlyMap<AgentPassportStatus, ReadonlySet<AgentPassportStatus>> = new Map([
  ['draft', new Set<AgentPassportStatus>(['issued'])],
  ['issued', new Set<AgentPassportStatus>(['active', 'revoked'])],
  ['active', new Set<AgentPassportStatus>(['suspended', 'revoked', 'expired'])],
  ['suspended', new Set<AgentPassportStatus>(['active', 'revoked'])],
  ['revoked', new Set<AgentPassportStatus>()],
  ['expired', new Set<AgentPassportStatus>()],
]);

export function canTransitionAgentPassportStatus(
  from: AgentPassportStatus,
  to: AgentPassportStatus,
): boolean {
  return VALID_TRANSITIONS.get(from)?.has(to) ?? false;
}

export function transitionAgentPassportStatus<T extends { readonly status: AgentPassportStatus }>(
  passport: T,
  to: AgentPassportStatus,
  _metadata?: Readonly<Record<string, unknown>>,
): T {
  if (!canTransitionAgentPassportStatus(passport.status, to)) {
    throw new Error(
      `Invalid agent passport status transition: ${passport.status} → ${to}`,
    );
  }
  return { ...passport, status: to };
}
