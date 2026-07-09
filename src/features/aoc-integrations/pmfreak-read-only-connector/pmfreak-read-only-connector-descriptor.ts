import {
  AOC_PMFREAK_FORBIDDEN_CONNECTOR_OPERATIONS,
  AOC_PMFREAK_READ_ONLY_CONNECTOR_CAPABILITIES,
  AOC_PMFREAK_READ_ONLY_CONNECTOR_DISCLAIMERS,
  AOC_PMFREAK_READ_ONLY_CONNECTOR_ID,
  AOC_PMFREAK_READ_ONLY_CONNECTOR_NAME,
  AOC_PMFREAK_READ_ONLY_CONNECTOR_SAFE_LABELS,
  AOC_PMFREAK_SYSTEM_ID,
} from './pmfreak-read-only-connector-constants.js';

/**
 * Static, self-describing scope statement for the PMFreak Read-Only
 * Connector. `productionMutationCapable` and `governanceDecisionCapable`
 * are always `false` -- this connector reads and normalizes PMFreak data
 * only; it never decides, mutates, or executes.
 */
export interface AocPMFreakReadOnlyConnectorDescriptor {
  readonly connectorId: string;
  readonly connectorName: string;
  readonly systemId: 'pmfreak';
  readonly version: 'v1';
  readonly mode: 'read_only';
  readonly demoCompatible: true;
  readonly productionMutationCapable: false;
  readonly governanceDecisionCapable: false;
  readonly capabilities: readonly string[];
  readonly forbiddenOperations: readonly string[];
  readonly safeLabels: readonly string[];
  readonly disclaimers: readonly string[];
}

export function createAocPMFreakReadOnlyConnectorDescriptor(): AocPMFreakReadOnlyConnectorDescriptor {
  return {
    connectorId: AOC_PMFREAK_READ_ONLY_CONNECTOR_ID,
    connectorName: AOC_PMFREAK_READ_ONLY_CONNECTOR_NAME,
    systemId: AOC_PMFREAK_SYSTEM_ID,
    version: 'v1',
    mode: 'read_only',
    demoCompatible: true,
    productionMutationCapable: false,
    governanceDecisionCapable: false,
    capabilities: Object.values(AOC_PMFREAK_READ_ONLY_CONNECTOR_CAPABILITIES),
    forbiddenOperations: [...AOC_PMFREAK_FORBIDDEN_CONNECTOR_OPERATIONS],
    safeLabels: [...AOC_PMFREAK_READ_ONLY_CONNECTOR_SAFE_LABELS],
    disclaimers: [...AOC_PMFREAK_READ_ONLY_CONNECTOR_DISCLAIMERS],
  };
}
