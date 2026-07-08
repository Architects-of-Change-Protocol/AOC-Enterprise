import type { ExportPackageRuntime } from '../../verifiable-export-package/services/export-package-runtime.js';
import type { PilotExportPackageDefinition } from '../domain/pilot-export-package.js';
import { checkExportPackageBinding, exportPackageBindingIsSatisfied, type ExportPackageBindingCheck } from '../integrations/verifiable-export-pilot-adapter.js';

export type PilotExportPackageBindingStatus = 'bound' | 'missing_package' | 'failed_verification' | 'mismatched';

export interface PilotExportPackageBindingResult {
  readonly pilotExportPackageDefinitionId: string;
  readonly exportPackageId?: string;
  readonly status: PilotExportPackageBindingStatus;
  readonly bound: boolean;
  readonly reason: string;
  readonly check?: ExportPackageBindingCheck;
}

export interface PilotExportPackageBindingDeps {
  readonly runtime?: ExportPackageRuntime;
}

/**
 * Binds `PilotExportPackageDefinition`s to real Verifiable Export Package
 * outputs. Never creates a package itself -- a caller must supply the real
 * `exportPackageId` a Verifiable Export Package runtime already produced.
 */
export class PilotExportPackageBindingService {
  constructor(private readonly deps: PilotExportPackageBindingDeps = {}) {}

  bindOne(definition: PilotExportPackageDefinition, exportPackageId?: string): PilotExportPackageBindingResult {
    if (this.deps.runtime === undefined || exportPackageId === undefined) {
      return {
        pilotExportPackageDefinitionId: definition.id,
        status: 'missing_package',
        bound: false,
        reason: 'No Verifiable Export Package runtime/package id was supplied to bind against.',
      };
    }

    const pkg = this.deps.runtime.getPackage(exportPackageId);
    if (pkg === undefined) {
      return {
        pilotExportPackageDefinitionId: definition.id,
        exportPackageId,
        status: 'missing_package',
        bound: false,
        reason: `Export package "${exportPackageId}" was not found.`,
      };
    }

    const manifest = this.deps.runtime.getPackageManifest(exportPackageId);
    const verification = this.deps.runtime.getPackageVerification(exportPackageId);
    const check = checkExportPackageBinding(definition, pkg, manifest, verification);
    const bound = exportPackageBindingIsSatisfied(check);
    const status: PilotExportPackageBindingStatus = bound ? 'bound' : verification?.status === 'failed' ? 'failed_verification' : 'mismatched';

    return {
      pilotExportPackageDefinitionId: definition.id,
      exportPackageId,
      status,
      bound,
      reason: bound
        ? `Export package "${exportPackageId}" satisfies definition "${definition.id}".`
        : `Export package "${exportPackageId}" does not satisfy definition "${definition.id}" (${status}).`,
      check,
    };
  }

  bindAll(definitions: readonly PilotExportPackageDefinition[], packageIdsByDefinitionId: Readonly<Record<string, string>> = {}): readonly PilotExportPackageBindingResult[] {
    return definitions.map((definition) => this.bindOne(definition, packageIdsByDefinitionId[definition.id]));
  }
}

export function createPilotExportPackageBindingService(deps: PilotExportPackageBindingDeps = {}): PilotExportPackageBindingService {
  return new PilotExportPackageBindingService(deps);
}
