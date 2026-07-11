import { AgentPassportError } from './errors.js';
import type {
  AgentPassport,
  AgentPassportEvent,
  AgentPassportLoadResult,
  AgentPassportStoreHealth,
  AgentPassportVerificationResult,
  AppendPassportEventInput,
  AppendPassportEventResult,
  PassportAccessContext,
  PassportIdempotencyProbe,
  PassportIdempotencyResolution,
} from './contracts.js';

/**
 * The Agent Passport Store (mission section 10): an independent store,
 * never persisted inside the Governance Store, Evidence Bundle Store,
 * Kernel state, or a UI-only database table. There is deliberately no
 * `update`/`delete` method -- every change is an appended event
 * (`appendEvent`), and the current Passport is always reconstructed
 * (`reconstruct`), never read from a mutable row treated as authoritative.
 */
export interface AgentPassportStore {
  readonly providerKind: 'memory' | 'sqlite';

  /**
   * Appends one Passport event atomically, enforcing the lifecycle state
   * machine (`lifecycle.ts`) and the event-chain digest before commit.
   * Idempotency is resolved by the caller (`service.ts`) via
   * `findByAgentId`/`reconstruct` before calling this for a
   * `AgentPassportCreated` event -- the Store itself enforces only the
   * `(organizationId, agentId)` active-Passport uniqueness constraint
   * (mission section 11).
   */
  appendEvent(context: PassportAccessContext, event: AppendPassportEventInput): Promise<AppendPassportEventResult>;

  /** Pre-append idempotency resolution for issuance (mission section 29), so the caller can skip appending a duplicate `AgentPassportCreated` event. Tenant-scoped via `probe.idempotency.scope`. */
  resolveIdempotency(context: PassportAccessContext, probe: PassportIdempotencyProbe): Promise<PassportIdempotencyResolution>;

  reconstruct(context: PassportAccessContext, passportId: string): Promise<AgentPassportLoadResult>;

  listEvents(context: PassportAccessContext, passportId: string): Promise<readonly AgentPassportEvent[]>;

  verify(context: PassportAccessContext, passportId: string): Promise<AgentPassportVerificationResult>;

  /** Finds the currently active Passport for one `(organizationId, agentId)` binding, or `null`. Never crosses tenant scope. */
  findByAgentId(context: PassportAccessContext, agentId: string): Promise<AgentPassport | null>;

  health(): Promise<AgentPassportStoreHealth>;

  close(): Promise<void>;
}

/** True when `context` may see a record scoped to `recordOrganizationId`. Mirrors `evidence-store.ts`'s `canSeeBundle`. */
export function canAccessPassportOrganization(context: PassportAccessContext, recordOrganizationId: string): boolean {
  if (context.system) return true;
  return context.organizationId !== undefined && context.organizationId === recordOrganizationId;
}

export function requirePassportTenantScope(context: PassportAccessContext): void {
  if (!context.system && (context.organizationId === undefined || context.organizationId.length === 0)) {
    throw new AgentPassportError('PASSPORT_TENANT_SCOPE_REQUIRED', 'A non-system caller must provide an organization scope for Agent Passport access.');
  }
}

export function requireAccessToOrganization(context: PassportAccessContext, organizationId: string): void {
  requirePassportTenantScope(context);
  if (!canAccessPassportOrganization(context, organizationId)) {
    throw new AgentPassportError('PASSPORT_ACCESS_SCOPE_VIOLATION', `The caller is not authorized to access Agent Passport data for organization '${organizationId}'.`);
  }
}
