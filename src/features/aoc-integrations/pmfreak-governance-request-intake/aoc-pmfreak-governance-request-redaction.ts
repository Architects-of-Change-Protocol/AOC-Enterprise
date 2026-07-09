import type { AocPMFreakGovernanceIntakeRedactionMode, AocPMFreakGovernanceRequest } from './aoc-pmfreak-governance-intake-types.js';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+/gi;
const CONNECTION_STRING_PATTERN = /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s'"]+/g;
const SECRET_KEY_VALUE_PATTERN = /\b(api[_-]?key|secret|token|password|authorization)\s*[:=]\s*["']?[^\s"'&]+/gi;
const SENSITIVE_KEY_NAME_PATTERN = /(api[_-]?key|secret|token|password|authorization)/i;

function redactString(text: string): string {
  return text
    .replace(CONNECTION_STRING_PATTERN, '[redacted-connection-string]')
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [redacted-token]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(SECRET_KEY_VALUE_PATTERN, (_match, key: string) => `${key}=[redacted]`);
}

/**
 * Redacts obvious emails, tokens, secrets, authorization values, and
 * connection strings out of an arbitrary value. `strict` mode additionally
 * clears every object payload (never a claim-bearing array or scalar) down
 * to an empty object, since a metadata payload is the least-structured and
 * most likely place for a PMFreak caller to embed sensitive data. Never
 * mutates `value`; always returns a new value.
 */
export function redactAocPMFreakGovernanceRequestValue(value: unknown, mode: AocPMFreakGovernanceIntakeRedactionMode): unknown {
  if (mode === 'none') return value;

  if (typeof value === 'string') return redactString(value);

  if (Array.isArray(value)) return value.map((item) => redactAocPMFreakGovernanceRequestValue(item, mode));

  if (value !== null && typeof value === 'object') {
    if (mode === 'strict') return {};

    const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
      if (typeof entryValue === 'string' && SENSITIVE_KEY_NAME_PATTERN.test(key)) return [key, '[redacted]'] as const;
      return [key, redactAocPMFreakGovernanceRequestValue(entryValue, mode)] as const;
    });
    return Object.fromEntries(entries);
  }

  return value;
}

/**
 * Redacts a PMFreak governance request's free-text and metadata fields.
 * Never mutates `request`; every returned request is a new object, and
 * fields untouched by redaction keep their original references.
 */
export function redactAocPMFreakGovernanceRequest(request: AocPMFreakGovernanceRequest, mode: AocPMFreakGovernanceIntakeRedactionMode): AocPMFreakGovernanceRequest {
  if (mode === 'none') return request;

  const redactedMetadata = redactAocPMFreakGovernanceRequestValue(request.actionAttempt.metadata, mode) as Record<string, unknown>;

  return {
    ...request,
    actionAttempt: {
      ...request.actionAttempt,
      actionTitle: redactString(request.actionAttempt.actionTitle),
      ...(request.actionAttempt.actionDescription !== undefined ? { actionDescription: redactString(request.actionAttempt.actionDescription) } : {}),
      metadata: redactedMetadata,
    },
  };
}
