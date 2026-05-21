export const INTEGRATION_REASON_CODES = {
  ADAPTER_REGISTRATION_DENIED: 'adapter_registration_denied',
  ADAPTER_SCOPE_INSUFFICIENT: 'adapter_scope_insufficient',
  ADAPTER_VERSION_INCOMPATIBLE: 'adapter_version_incompatible',
  ADAPTER_KIND_UNSUPPORTED: 'adapter_kind_unsupported',
  INTEGRATION_CAPABILITY_MISSING: 'integration_capability_missing',
} as const;

export type IntegrationReasonCode = typeof INTEGRATION_REASON_CODES[keyof typeof INTEGRATION_REASON_CODES];
