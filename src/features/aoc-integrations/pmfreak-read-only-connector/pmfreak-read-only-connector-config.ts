import { AOC_PMFREAK_READ_ONLY_CONNECTOR_ID } from './pmfreak-read-only-connector-constants.js';
import type { AocPMFreakReadOnlyConnectorEnvironment, AocPMFreakReadOnlyConnectorSourceKind } from './pmfreak-read-only-connector-types.js';

export type AocPMFreakReadOnlyConnectorRedactionMode = 'none' | 'safe_demo' | 'strict';

/**
 * Connector configuration. `readOnly` and `allowMutations` are fixed literal
 * types (`true`/`false`) -- there is no configuration shape in which this
 * connector can be told to mutate PMFreak data.
 */
export interface AocPMFreakReadOnlyConnectorConfig {
  readonly connectorId: string;
  readonly environment: AocPMFreakReadOnlyConnectorEnvironment;
  readonly sourceKind: AocPMFreakReadOnlyConnectorSourceKind;

  readonly baseUrl?: string;
  readonly projectId?: string;
  readonly tenantId?: string;
  readonly workspaceId?: string;

  readonly readOnly: true;
  readonly allowMutations: false;

  readonly timeoutMs: number;
  readonly maxRecords: number;

  readonly redactionMode: AocPMFreakReadOnlyConnectorRedactionMode;

  readonly notes: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Input shape accepted by `createAocPMFreakReadOnlyConnectorConfig`. Unlike
 * `AocPMFreakReadOnlyConnectorConfig` itself, `readOnly`/`allowMutations`
 * here are plain `boolean` -- callers are allowed to *attempt* an unsafe
 * value, but the factory always forces the safe value and records a warning.
 */
export interface AocPMFreakReadOnlyConnectorConfigInput {
  readonly connectorId?: string;
  readonly environment?: AocPMFreakReadOnlyConnectorEnvironment;
  readonly sourceKind?: AocPMFreakReadOnlyConnectorSourceKind;

  readonly baseUrl?: string;
  readonly projectId?: string;
  readonly tenantId?: string;
  readonly workspaceId?: string;

  readonly readOnly?: boolean;
  readonly allowMutations?: boolean;

  readonly timeoutMs?: number;
  readonly maxRecords?: number;

  readonly redactionMode?: AocPMFreakReadOnlyConnectorRedactionMode;

  readonly notes?: readonly string[];
  readonly warnings?: readonly string[];
}

/**
 * Builds a safe-by-default connector config. `readOnly` is always forced to
 * `true` and `allowMutations` is always forced to `false`, regardless of
 * what the caller passes -- if the caller attempted an unsafe value, a
 * deterministic warning is appended rather than throwing, per this
 * connector's "safe-forcing preferred" convention.
 */
export function createAocPMFreakReadOnlyConnectorConfig(input?: AocPMFreakReadOnlyConnectorConfigInput): AocPMFreakReadOnlyConnectorConfig {
  const warnings: string[] = [...(input?.warnings ?? [])];

  if (input?.readOnly === false) warnings.push('readOnly was forced to true.');
  if (input?.allowMutations === true) warnings.push('allowMutations was forced to false.');

  return {
    connectorId: input?.connectorId ?? AOC_PMFREAK_READ_ONLY_CONNECTOR_ID,
    environment: input?.environment ?? 'demo',
    sourceKind: input?.sourceKind ?? 'in_memory',

    ...(input?.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
    ...(input?.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input?.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
    ...(input?.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),

    readOnly: true,
    allowMutations: false,

    timeoutMs: input?.timeoutMs ?? 5000,
    maxRecords: input?.maxRecords ?? 100,

    redactionMode: input?.redactionMode ?? 'safe_demo',

    notes: input?.notes ? [...input.notes] : [],
    warnings,
  };
}
