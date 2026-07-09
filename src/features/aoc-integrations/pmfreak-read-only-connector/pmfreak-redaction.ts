import { createAocPMFreakConnectorError } from './pmfreak-connector-errors.js';
import type { AocPMFreakReadOnlyConnectorRedactionMode } from './pmfreak-read-only-connector-config.js';
import type { AocPMFreakConnectorSnapshot } from './pmfreak-connector-snapshot.js';

/**
 * AOC PMFreak Read-Only Connector v1 -- redaction / safe-normalization
 * helpers.
 *
 * This is a connector safety layer, not a DLP product: it catches obvious
 * email addresses and obviously-named secret/token/authorization/connection
 * fields, nothing more. Redaction never mutates its input -- every helper
 * returns a new value.
 */

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Metadata/field key names that are treated as sensitive regardless of their value's shape. */
const SENSITIVE_KEY_PATTERN = /token|secret|authorization|auth[_-]?header|connection[_-]?string|password|api[_-]?key|bearer/i;

/** Value shapes that look like a secret/token/connection string even when the key name itself is not obviously sensitive. */
const SECRET_LIKE_VALUE_PATTERN = /^(?:bearer\s+\S+|[a-z]+:\/\/[^:]+:[^@]+@\S+|sk-[a-zA-Z0-9]{8,}|[A-Za-z0-9_-]{24,})$/;

function redactString(value: string): string {
  if (EMAIL_PATTERN.test(value)) return value.replace(EMAIL_PATTERN, '[redacted-email]');
  if (SECRET_LIKE_VALUE_PATTERN.test(value)) return '[redacted-secret]';
  return value;
}

function redactEntry(key: string, value: unknown, mode: Exclude<AocPMFreakReadOnlyConnectorRedactionMode, 'none'>): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[redacted-secret]';
  return redactAocPMFreakConnectorValue(value, mode);
}

/**
 * Redacts a single value (recursively, for objects/arrays) according to
 * `mode`:
 *
 * - `none`: returns the value unchanged.
 * - `safe_demo`: replaces email-like strings with `[redacted-email]` and
 *   token/secret/authorization/connection-string-like values (by key name
 *   or by shape) with `[redacted-secret]`.
 * - `strict`: applies every `safe_demo` rule.
 *
 * Never mutates `value` -- always returns a new value for objects/arrays.
 */
export function redactAocPMFreakConnectorValue(value: unknown, mode: AocPMFreakReadOnlyConnectorRedactionMode): unknown {
  if (mode === 'none') return value;

  if (typeof value === 'string') return redactString(value);

  if (Array.isArray(value)) return value.map((entry) => redactAocPMFreakConnectorValue(entry, mode));

  if (value !== null && typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      redacted[key] = redactEntry(key, entryValue, mode);
    }
    return redacted;
  }

  return value;
}

function redactMetadata(metadata: Readonly<Record<string, unknown>>, mode: AocPMFreakReadOnlyConnectorRedactionMode): Readonly<Record<string, unknown>> {
  if (mode === 'none') return metadata;
  if (mode === 'strict') return {};
  return redactAocPMFreakConnectorValue(metadata, mode) as Readonly<Record<string, unknown>>;
}

function redactSourceUrl(sourceUrl: string, mode: AocPMFreakReadOnlyConnectorRedactionMode): string {
  if (mode === 'strict') return '[redacted-url]';
  return redactString(sourceUrl);
}

/**
 * Redacts every read model in a connector snapshot according to `mode`.
 * Returns a new snapshot; never mutates the input snapshot or any of its
 * nested read models/arrays.
 */
export function redactAocPMFreakConnectorSnapshot(snapshot: AocPMFreakConnectorSnapshot, mode: AocPMFreakReadOnlyConnectorRedactionMode): AocPMFreakConnectorSnapshot {
  try {
    if (mode === 'none') return snapshot;

    return {
      ...snapshot,
      projects: snapshot.projects.map((project) => ({
        ...project,
        ...(project.sourceUrl !== undefined ? { sourceUrl: redactSourceUrl(project.sourceUrl, mode) } : {}),
        metadata: redactMetadata(project.metadata, mode),
      })),
      agents: snapshot.agents.map((agent) => ({ ...agent, metadata: redactMetadata(agent.metadata, mode) })),
      milestones: snapshot.milestones.map((milestone) => ({ ...milestone, metadata: redactMetadata(milestone.metadata, mode) })),
      tasks: snapshot.tasks.map((task) => ({ ...task, metadata: redactMetadata(task.metadata, mode) })),
      risks: snapshot.risks.map((risk) => ({ ...risk, metadata: redactMetadata(risk.metadata, mode) })),
      evidenceReferences: snapshot.evidenceReferences.map((evidenceReference) => ({
        ...evidenceReference,
        redacted: mode === 'strict' || evidenceReference.redacted,
        metadata: redactMetadata(evidenceReference.metadata, mode),
      })),
      approvalReferences: snapshot.approvalReferences.map((approvalReference) => ({
        ...approvalReference,
        redacted: mode === 'strict' || approvalReference.redacted,
        metadata: redactMetadata(approvalReference.metadata, mode),
      })),
      actionProposals: snapshot.actionProposals.map((actionProposal) => ({ ...actionProposal, metadata: redactMetadata(actionProposal.metadata, mode) })),
    };
  } catch (error) {
    throw createAocPMFreakConnectorError('redaction_failed', 'Failed to redact PMFreak connector snapshot.', { reason: error instanceof Error ? error.message : 'unknown' });
  }
}
