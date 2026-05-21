export const RUNTIME_REASON_CODES = {
  RUNTIME_ASSERTION_FAILED: 'runtime_assertion_failed',
  RUNTIME_INTERNAL_ERROR: 'runtime_internal_error',
  RUNTIME_CONFIGURATION_INVALID: 'runtime_configuration_invalid',
  RUNTIME_PORT_UNAVAILABLE: 'runtime_port_unavailable',
  RUNTIME_VERSION_INCOMPATIBLE: 'runtime_version_incompatible',
  LIFECYCLE_ERROR: 'lifecycle_error',
} as const;

export type RuntimeReasonCode = typeof RUNTIME_REASON_CODES[keyof typeof RUNTIME_REASON_CODES];
