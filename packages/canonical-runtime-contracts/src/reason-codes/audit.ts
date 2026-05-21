export const AUDIT_REASON_CODES = {
  AUDIT_EMIT_FAILED: 'audit_emit_failed',
  AUDIT_ROUTE_UNAVAILABLE: 'audit_route_unavailable',
  AUDIT_SINK_REJECTED: 'audit_sink_rejected',
  AUDIT_DROPPED: 'audit_dropped',
  AUDIT_DELIVERED: 'audit_delivered',
} as const;

export type AuditReasonCode = typeof AUDIT_REASON_CODES[keyof typeof AUDIT_REASON_CODES];
