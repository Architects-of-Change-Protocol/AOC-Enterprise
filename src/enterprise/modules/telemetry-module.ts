import type { EnterpriseTelemetry } from '../telemetry/enterprise-telemetry.js';
import { AOC_ENTERPRISE_HOST_VERSION } from '../version.js';
import type { EnterpriseModule } from './enterprise-module.js';

export const TELEMETRY_MODULE_ID = 'aoc.enterprise.telemetry';

/**
 * Wraps the in-memory Enterprise telemetry counters as an optional module --
 * a telemetry outage must never block governance evaluations.
 */
export function createTelemetryModule(telemetry: EnterpriseTelemetry, enabled: boolean, now: () => string): EnterpriseModule {
  return {
    descriptor: {
      id: TELEMETRY_MODULE_ID,
      version: AOC_ENTERPRISE_HOST_VERSION,
      displayName: 'Telemetry',
      description: 'In-process Enterprise operational metrics.',
      criticality: 'optional',
      capabilities: enabled ? ['telemetry.enterprise-metrics'] : [],
    },
    async initialize() {
      if (!enabled) throw new Error('Telemetry is disabled by configuration.');
      if (telemetry === undefined) throw new Error('EnterpriseTelemetry is missing.');
    },
    async health() {
      return enabled
        ? { status: 'healthy', checkedAt: now() }
        : { status: 'degraded', checkedAt: now(), message: 'Telemetry is disabled by configuration.' };
    },
    async shutdown() {
      // In-memory counters; nothing to flush or close.
    },
  };
}
