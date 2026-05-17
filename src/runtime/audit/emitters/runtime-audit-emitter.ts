import type { AuditEventEnvelope } from '@aoc/protocol';

export interface RuntimeAuditEmitter {
  emit(event: AuditEventEnvelope): Promise<void>;
}

export async function emitRuntimeAuditEvent(emitter: RuntimeAuditEmitter, event: AuditEventEnvelope): Promise<void> {
  await emitter.emit(event);
}
