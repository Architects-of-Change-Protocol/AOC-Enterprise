import type { Actor, ActorStatus, ActorType } from '../domain/actor.js';
import type { RuntimeContext } from '../runtime/runtime-context.js';
import { ActorNotFoundError } from '../runtime/runtime-errors.js';

export interface RegisterActorInput {
  readonly id?: string;
  readonly type: ActorType;
  readonly displayName: string;
  readonly status?: ActorStatus;
  readonly issuerId?: string;
  readonly trustDomainId?: string;
  readonly jurisdiction?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export class ActorRegistry {
  private readonly actors = new Map<string, Actor>();

  constructor(private readonly ctx: RuntimeContext) {}

  registerActor(input: RegisterActorInput): Actor {
    const id = input.id ?? this.ctx.idGenerator.next('actor');
    const timestamp = this.ctx.clock.now();
    const actor: Actor = {
      id,
      type: input.type,
      displayName: input.displayName,
      status: input.status ?? 'recognized',
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.issuerId !== undefined ? { issuerId: input.issuerId } : {}),
      ...(input.trustDomainId !== undefined ? { trustDomainId: input.trustDomainId } : {}),
      ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    this.actors.set(actor.id, actor);
    return actor;
  }

  getActor(actorId: string): Actor | undefined {
    return this.actors.get(actorId);
  }

  updateActorStatus(actorId: string, status: ActorStatus): Actor {
    const existing = this.actors.get(actorId);
    if (!existing) {
      throw new ActorNotFoundError(actorId);
    }
    const updated: Actor = { ...existing, status, updatedAt: this.ctx.clock.now() };
    this.actors.set(actorId, updated);
    return updated;
  }

  classifyActor(actorId: string): ActorStatus {
    return this.actors.get(actorId)?.status ?? 'unknown';
  }
}
