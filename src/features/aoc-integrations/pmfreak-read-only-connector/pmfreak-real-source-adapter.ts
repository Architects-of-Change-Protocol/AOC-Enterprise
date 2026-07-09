import { createAocPMFreakConnectorError } from './pmfreak-connector-errors.js';
import type { AocPMFreakReadOnlyConnectorSourceKind } from './pmfreak-read-only-connector-types.js';
import type { AocPMFreakReadOnlySource } from './pmfreak-read-only-source.js';

/**
 * AOC PMFreak Read-Only Connector v1 -- unsupported real-source placeholder.
 *
 * This repository does not (yet) contain a discoverable real PMFreak API
 * client, Supabase client, database schema, or service contract to adapt --
 * see this module's README for the full list of contract details a future
 * real adapter (`createAocPMFreakApiReadOnlySource`,
 * `createAocPMFreakSupabaseReadOnlySource`, or
 * `createAocPMFreakDatabaseReadOnlySource`) would need.
 *
 * Until such a contract exists, every `list*` method on the source this
 * factory builds rejects with a safe `unsupported_source_kind` connector
 * error. It never makes a network call, never requires a secret or
 * credential, and never fakes a production read.
 */
export function createUnsupportedAocPMFreakRealReadOnlySource(sourceKind: 'api' | 'database' | 'supabase' | 'unknown'): AocPMFreakReadOnlySource {
  const reject = async <T>(): Promise<T> => {
    throw createAocPMFreakConnectorError(
      'unsupported_source_kind',
      `PMFreak read-only connector source kind "${sourceKind}" is not supported: no PMFreak source contract (API client, Supabase client, or database schema) is available in this repository yet.`,
      { sourceKind },
    );
  };

  const source: AocPMFreakReadOnlySource & { readonly sourceKind: AocPMFreakReadOnlyConnectorSourceKind } = {
    sourceKind,
    listProjects: reject,
    listAgents: reject,
    listMilestones: reject,
    listTasks: reject,
    listRisks: reject,
    listEvidenceReferences: reject,
    listApprovalReferences: reject,
    listActionProposals: reject,
  };

  return source;
}
