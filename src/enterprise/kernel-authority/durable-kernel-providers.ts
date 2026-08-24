import { randomUUID } from 'node:crypto';

import type { KernelClock, KernelIdGenerator } from '../../kernel/index.js';
import type { KernelProviderSet } from '../providers/kernel-provider-composition.js';
import type { KernelAuthorityAccessContext, KernelAuthorityRecord } from './contracts.js';
import { hydrateKernelAuthorityWorld } from './hydration.js';
import type { KernelAuthorityStore } from './kernel-authority-store.js';
import { createDurableRecognitionProvider } from './recognition-bridge.js';

export interface CreateDurableKernelProvidersOptions {
  /** The durable authority source. Memory or SQLite -- the composition is identical; only the survival guarantee differs. */
  readonly store: KernelAuthorityStore;
  /** The organization whose authority world this provider set decides for. One provider set serves exactly one organization. */
  readonly organizationId: string;
  readonly clock?: KernelClock;
  readonly idGenerator?: KernelIdGenerator;
}

/**
 * A `KernelProviderSet` whose world was restored from durable,
 * operator-provisioned state rather than seeded in-process.
 *
 * The runtime handles it exposes are real and honest: they hold exactly the
 * records the store holds for `organizationId`, and nothing else. They are a
 * *projection* of the store, never a second source of truth -- which is why
 * they are rebuilt by `reload()` rather than mutated in place.
 */
export interface DurableKernelProviderSet extends KernelProviderSet {
  readonly authorityStore: KernelAuthorityStore;
  readonly organizationId: string;
  /** The records this world was last hydrated from -- the exact provenance of every decision it can produce. */
  readonly records: () => readonly KernelAuthorityRecord[];
  /**
   * Rebuilds the world from the store.
   *
   * The provisioning service calls this after every committed write, so a
   * single-process deployment never observes a stale world. A deployment where
   * a *different* process provisions must call it (or restart) to observe that
   * process's writes -- this is documented rather than papered over, because a
   * world that silently lags its store is exactly the kind of thing this layer
   * must not claim to be. See `docs/enterprise/AOC_DURABLE_KERNEL_AUTHORITY.md`,
   * "Propagation across processes".
   */
  reload(): Promise<void>;
}

function defaultClockAndIds(): { readonly now: () => string; readonly nextId: (prefix: string) => string } {
  return {
    now: () => new Date().toISOString(),
    nextId: (prefix: string) => `${prefix}-${randomUUID()}`,
  };
}

/**
 * Restores the operator-provisioned Recognition/Authority world for one
 * organization from a durable Kernel Authority Store and composes it into the
 * `KernelProviderSet` `AocKernel` accepts.
 *
 * The sibling of `createDefaultKernelProviders()`, not a replacement for it.
 * That factory keeps its exact behaviour -- a real but empty, fail-closed
 * world -- and remains correct for every deployment that has not adopted
 * durable authority. This one differs in exactly one respect: where the
 * world's contents come from.
 *
 * Fail-closed is preserved end to end. A store holding no records for this
 * organization hydrates an empty world, and an empty world denies every
 * request with `RECOGNITION_ACTOR_UNKNOWN` exactly as before. Nothing here
 * auto-creates an actor, a trust domain, an authority grant or a token, and
 * no request can cause one to be created: this function reads the store, and
 * the returned provider set carries no write surface at all.
 */
export async function createDurableKernelProviders(options: CreateDurableKernelProvidersOptions): Promise<DurableKernelProviderSet> {
  const fallback = defaultClockAndIds();
  const clock: KernelClock = options.clock ?? { now: fallback.now };
  const idGenerator: KernelIdGenerator = options.idGenerator ?? { nextId: fallback.nextId };
  const { store, organizationId } = options;

  // A read context, never an operator context. This provider set is
  // structurally incapable of writing to the authority source: it never holds
  // `system: true`, and `requireKernelAuthorityOperator` refuses every write
  // without it.
  const readContext: KernelAuthorityAccessContext = { system: false, organizationId };

  let world = hydrateKernelAuthorityWorld(await store.listRecords(readContext, { organizationId }), { now: clock.now, nextId: idGenerator.nextId });

  const recognitionProvider = createDurableRecognitionProvider({
    organizationId,
    world: () => ({ recognitionRuntime: world.recognitionRuntime, records: world.records }),
  });

  return {
    get recognitionRuntime() {
      return world.recognitionRuntime;
    },
    get authorityRuntime() {
      return world.authorityRuntime;
    },
    get approvalRuntime() {
      return world.approvalRuntime;
    },
    get handshakeRuntime() {
      return world.handshakeRuntime;
    },
    recognitionProvider,
    clock,
    idGenerator,
    authorityStore: store,
    organizationId,
    records: () => world.records,
    async reload(): Promise<void> {
      world = hydrateKernelAuthorityWorld(await store.listRecords(readContext, { organizationId }), { now: clock.now, nextId: idGenerator.nextId });
    },
  };
}
