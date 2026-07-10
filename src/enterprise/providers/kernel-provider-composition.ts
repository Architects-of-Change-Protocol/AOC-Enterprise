import { randomUUID } from 'node:crypto';

import { createAuthorityGraphRuntime, type AuthorityGraphRuntime } from '../../features/authority-graph/runtime/authority-graph-runtime.js';
import type { AuthorityRuntimeContext } from '../../features/authority-graph/runtime/authority-runtime-context.js';
import { ApprovalRuntime } from '../../features/approval-runtime/runtime/approval-runtime.js';
import type { ApprovalRuntimeContext } from '../../features/approval-runtime/runtime/approval-runtime-context.js';
import { ExternalAgentHandshakeRuntime, createExternalAgentStandingIntegration } from '../../features/external-agent-handshake/runtime/index.js';
import type { HandshakeRuntimeContext } from '../../features/external-agent-handshake/runtime/handshake-runtime-context.js';
import { createAocRecognitionRuntime, type AocRecognitionRuntime } from '../../features/recognition-runtime/runtime/aoc-recognition-runtime.js';
import type { RuntimeContext as RecognitionRuntimeContext } from '../../features/recognition-runtime/runtime/runtime-context.js';
import { bridgeRecognitionRuntime } from '../../features/action-enforcement/fixtures/datasys-enforcement.fixture.js';
import type { KernelClock, KernelIdGenerator, RecognitionProvider } from '../../kernel/index.js';

/**
 * The AOC Enterprise Host's one composition root for the transitive engines a
 * `RecognitionProvider` bridges together. `AocKernel`'s own real port
 * surface is exactly `recognitionProvider` (+ optional `policyPackProvider`,
 * `clock`, `idGenerator`) -- see `kernel/contracts/ports.ts`. Authority,
 * approval, and evidence/handshake evaluation are reached transitively
 * *inside* whatever concrete `RecognitionProvider` is injected here, never
 * as separate Kernel-level ports. This module is where the Enterprise Host
 * constructs that concrete infrastructure and hands the Kernel only the
 * narrow interface it actually accepts.
 */
export interface KernelWorldHandles {
  readonly recognitionRuntime: AocRecognitionRuntime;
  readonly authorityRuntime: AuthorityGraphRuntime;
  readonly approvalRuntime: ApprovalRuntime;
  readonly handshakeRuntime: ExternalAgentHandshakeRuntime;
}

export interface KernelProviderSet extends KernelWorldHandles {
  readonly recognitionProvider: RecognitionProvider;
  readonly clock: KernelClock;
  readonly idGenerator: KernelIdGenerator;
}

function createRealTimeClockAndIds(): { readonly now: () => string; readonly nextId: (prefix: string) => string } {
  return {
    now: () => new Date().toISOString(),
    nextId: (prefix: string) => `${prefix}-${randomUUID()}`,
  };
}

/**
 * Builds a real, empty (no actors/trust domains/tokens registered) world
 * across Recognition Runtime, Authority Graph, Approval Runtime, and
 * External Agent Handshake, wired with a live wall-clock rather than the
 * frozen/manual clocks the feature modules export for their own tests.
 *
 * "Empty" is a deliberate fail-closed default: with nothing registered,
 * every `kernel.evaluate()` call recognizes no actor and denies
 * (`RECOGNITION_ACTOR_UNKNOWN`) until an operator seeds real actors, trust
 * domains, and capability tokens through the returned runtime handles --
 * exactly the same registration APIs the engine's own fixtures use, not a
 * Enterprise-Host-specific shortcut. Seeding real governance data is a
 * deployment/operations concern, not something this Enterprise Host may
 * fabricate on an operator's behalf.
 */
export function createDefaultKernelProviders(): KernelProviderSet {
  const clockAndIds = createRealTimeClockAndIds();

  const authorityCtx: AuthorityRuntimeContext = { clock: { now: clockAndIds.now }, ids: { nextId: clockAndIds.nextId } };
  const authorityRuntime = createAuthorityGraphRuntime(authorityCtx);

  const approvalCtx: ApprovalRuntimeContext = { clock: { now: clockAndIds.now }, ids: { nextId: clockAndIds.nextId } };
  const approvalRuntime = new ApprovalRuntime(approvalCtx, { authorityGraph: authorityRuntime });

  const handshakeCtx: HandshakeRuntimeContext = { clock: { now: clockAndIds.now }, ids: { nextId: clockAndIds.nextId } };
  const handshakeRuntime = new ExternalAgentHandshakeRuntime(handshakeCtx);
  const externalAgentHandshake = createExternalAgentStandingIntegration(handshakeRuntime);

  const recognitionCtx: RecognitionRuntimeContext = { clock: { now: clockAndIds.now }, idGenerator: { next: clockAndIds.nextId } };
  const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, authorityRuntime, approvalRuntime, externalAgentHandshake);

  const recognitionProvider = bridgeRecognitionRuntime(recognitionRuntime);

  return {
    recognitionRuntime,
    authorityRuntime,
    approvalRuntime,
    handshakeRuntime,
    recognitionProvider,
    clock: { now: clockAndIds.now },
    idGenerator: { nextId: clockAndIds.nextId },
  };
}
