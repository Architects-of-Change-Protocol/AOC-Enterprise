import type { AgentPassportId } from '../passport/passport-id.js';
import type { AgentPassport, IssuedAgentPassportBundle } from '../passport/passport-contracts.js';
import type { AgentPassportEvent } from '../events/passport-events.js';

export interface AgentPassportStorePort {
  savePassportBundle(bundle: IssuedAgentPassportBundle): Promise<void>;
  getPassport(passportId: AgentPassportId): Promise<AgentPassport | undefined>;
  getPassportBundle(passportId: AgentPassportId): Promise<IssuedAgentPassportBundle | undefined>;
  appendPassportEvent(event: AgentPassportEvent): Promise<void>;
  listPassportEvents(passportId: AgentPassportId): Promise<readonly AgentPassportEvent[]>;
}

export function createInMemoryAgentPassportStore(): AgentPassportStorePort {
  const bundles = new Map<string, IssuedAgentPassportBundle>();
  const events = new Map<string, AgentPassportEvent[]>();

  return {
    async savePassportBundle(bundle) {
      bundles.set(bundle.passport.passportId, bundle);
    },
    async getPassport(passportId) {
      return bundles.get(passportId)?.passport;
    },
    async getPassportBundle(passportId) {
      return bundles.get(passportId);
    },
    async appendPassportEvent(event) {
      const list = events.get(event.passportId) ?? [];
      list.push(event);
      events.set(event.passportId, list);
    },
    async listPassportEvents(passportId) {
      return events.get(passportId) ?? [];
    },
  };
}
