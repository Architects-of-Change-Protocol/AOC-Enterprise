import type { EnterpriseEventPublisher } from '../events/enterprise-events.js';
import { AOC_ENTERPRISE_HOST_VERSION } from '../version.js';
import type { EnterpriseModule } from './enterprise-module.js';

export const EVENTS_MODULE_ID = 'aoc.enterprise.events';

/**
 * Wraps the in-process event publisher (`events/enterprise-events.ts`) as an
 * optional module: `configuration.eventPublishing.enabled` can legitimately
 * be `false`, and that must never block Enterprise readiness. When disabled,
 * `initialize()` reports the module as intentionally degraded rather than
 * pretending it is healthy -- an honest signal, not a special case bolted
 * onto the aggregation rules.
 */
export function createEventsModule(eventPublisher: EnterpriseEventPublisher, enabled: boolean, now: () => string): EnterpriseModule {
  return {
    descriptor: {
      id: EVENTS_MODULE_ID,
      version: AOC_ENTERPRISE_HOST_VERSION,
      displayName: 'Events',
      description: 'In-process Enterprise event publisher.',
      criticality: 'optional',
      capabilities: enabled ? ['events.enterprise-events'] : [],
    },
    async initialize() {
      if (!enabled) throw new Error('Event publishing is disabled by configuration.');
      if (eventPublisher === undefined) throw new Error('EnterpriseEventPublisher is missing.');
    },
    async health() {
      return enabled
        ? { status: 'healthy', checkedAt: now() }
        : { status: 'degraded', checkedAt: now(), message: 'Event publishing is disabled by configuration.' };
    },
    async shutdown() {
      // The in-process publisher owns no external resource.
    },
  };
}
