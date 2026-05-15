import type { AuditEventEnvelope } from '@aoc/protocol/contracts';

export interface RuntimeAuditEmitter {
  emit(event: AuditEventEnvelope): Promise<void>;
}

export async function emitRuntimeEvent(emitter: RuntimeAuditEmitter, event: AuditEventEnvelope): Promise<void> {
  await emitter.emit(event);
}
