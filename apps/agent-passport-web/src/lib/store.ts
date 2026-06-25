/**
 * MVP in-memory passport store.
 *
 * WARNING: Non-production. Data is lost on server restart.
 * Replace with a persistent store before any production use.
 */

import type { IssuedAgentPassportBundle } from '@aoc-enterprise/agent-governance';

// Module-level singleton — persists across Next.js requests within a single process.
const passportStore = new Map<string, IssuedAgentPassportBundle>();

export function storePassportBundle(bundle: IssuedAgentPassportBundle): void {
  passportStore.set(bundle.passport.passportId, bundle);
}

export function getPassportBundle(passportId: string): IssuedAgentPassportBundle | undefined {
  return passportStore.get(passportId);
}

export function getAllPassportIds(): string[] {
  return Array.from(passportStore.keys());
}
