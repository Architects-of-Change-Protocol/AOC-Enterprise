import type { RuntimeOperationalCounters, RuntimeOperationalMetadata, RuntimeOperationalSession, RuntimeOperationalSnapshot, RuntimeOperationalState } from './runtime-operational-state-types.js';
const deterministicId = (prefix: string, parts: string[]) => `${prefix}:${parts.join(':')}`;
export function createRuntimeOperationalState(input: { runtimeId: string; trustDomain: string; now?: string; continuityEpoch?: number }): RuntimeOperationalState {
  const now = input.now ?? new Date(0).toISOString();
  const counters: RuntimeOperationalCounters = { authorizationEnforcements: 0, grantsIssued: 0, grantsConsumed: 0, grantsRevoked: 0, delegationsIssued: 0, delegationsRevoked: 0, replayDenials: 0, auditsEmitted: 0 };
  const session: RuntimeOperationalSession = { startedAt: now, lastActivityAt: now };
  const metadata: RuntimeOperationalMetadata = { runtimeId: input.runtimeId, trustDomain: input.trustDomain, snapshotVersion: 1, createdAt: now, updatedAt: now, health: 'nominal' };
  return { continuity: { runtimeSessionId: deterministicId('runtime-session', [input.runtimeId, String(input.continuityEpoch ?? 1)]), orchestrationSessionId: deterministicId('orchestration-session', [input.trustDomain, String(input.continuityEpoch ?? 1)]), continuityEpoch: input.continuityEpoch ?? 1, continuityVersion: 1, operationalSequenceNumber: 0 }, session, metadata, activeGrants: {}, activeDelegations: {}, replay: { deniedNonces: [] }, counters, lifecycle: [{ sequence: 0, eventType: 'runtime_initialized', occurredAt: now }], auditLineage: {} };
}
export function snapshotRuntimeOperationalState(state: RuntimeOperationalState): RuntimeOperationalSnapshot { return JSON.parse(JSON.stringify(state)) as RuntimeOperationalSnapshot; }
