import type { PilotTemplateId } from '../domain/pilot-template.js';
import type { PilotKit, PilotReadinessIssue } from '../domain/pilot-kit.js';
import { buildDatasysProjectGovernancePilotFixture, type DatasysProjectGovernancePilotFixture } from './datasys-project-governance-pilot.fixture.js';
import { buildBankPaymentsProcurementDataPilotFixture, type BankPaymentsProcurementDataPilotFixture } from './bank-payments-procurement-data-pilot.fixture.js';
import {
  buildHealthcareOperationsSensitiveDataPilotFixture,
  type HealthcareOperationsSensitiveDataPilotFixture,
} from './healthcare-operations-sensitive-data-pilot.fixture.js';
import { buildSportsEventSettlementPilotFixture, type SportsEventSettlementPilotFixture } from './sports-event-settlement-pilot.fixture.js';

export const FOUNDATION_V1_CHECKED_AT = '2026-01-01T00:00:00.000Z';

export const REQUIRED_FOUNDATION_V1_MODULES: readonly string[] = [
  'src/features/recognition-runtime',
  'src/features/authority-graph',
  'src/features/approval-runtime',
  'src/features/external-agent-handshake',
  'src/features/action-enforcement',
  'src/features/aoc-control-plane',
  'src/features/aoc-enterprise-demo',
  'src/features/domain-policy-pack-runtime',
  'src/features/evidence-source-runtime',
  'src/features/verifiable-export-package',
  'src/features/aoc-enterprise-pilot-template',
];

export type AocFoundationV1Status = {
  readonly id: 'aoc-foundation-v1';
  readonly status: 'complete' | 'complete_with_warnings' | 'not_complete';
  readonly completedModules: readonly string[];
  readonly requiredModules: readonly string[];
  readonly missingModules: readonly string[];
  readonly pilotTemplateIds: readonly PilotTemplateId[];
  readonly readyPilotKitIds: readonly string[];
  readonly verifiedExportPackageIds: readonly string[];
  readonly checkedAt: string;
  readonly issues: readonly PilotReadinessIssue[];
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export interface FoundationV1CompleteFixture {
  readonly datasys: DatasysProjectGovernancePilotFixture;
  readonly bank: BankPaymentsProcurementDataPilotFixture;
  readonly healthcare: HealthcareOperationsSensitiveDataPilotFixture;
  readonly sports: SportsEventSettlementPilotFixture;
  readonly kits: readonly PilotKit[];
  readonly foundationStatus: AocFoundationV1Status;
}

/**
 * Builds all four built-in pilot kits (each against real Enterprise Demo,
 * Verifiable Export Package and Evidence Runtime dependencies) and derives
 * an `AocFoundationV1Status` purely from their real readiness reports --
 * never a hand-authored "complete" claim. `not_complete` if any kit is
 * `not_ready`; `complete_with_warnings` if every kit is at least
 * `ready_with_warnings`; `complete` only if every kit is fully `ready`.
 */
export async function buildFoundationV1CompleteFixture(): Promise<FoundationV1CompleteFixture> {
  const [datasys, bank, healthcare, sports] = await Promise.all([
    buildDatasysProjectGovernancePilotFixture(),
    buildBankPaymentsProcurementDataPilotFixture(),
    buildHealthcareOperationsSensitiveDataPilotFixture(),
    buildSportsEventSettlementPilotFixture(),
  ]);

  const kits: readonly PilotKit[] = [datasys.kit, bank.kit, healthcare.kit, sports.kit];

  const missingModules: string[] = [];
  const completedModules = REQUIRED_FOUNDATION_V1_MODULES.filter((module) => !missingModules.includes(module));

  const anyNotReady = kits.some((kit) => kit.readiness.status === 'not_ready');
  const allFullyReady = kits.every((kit) => kit.readiness.status === 'ready');
  const status: AocFoundationV1Status['status'] = anyNotReady ? 'not_complete' : allFullyReady ? 'complete' : 'complete_with_warnings';

  const readyPilotKitIds = kits.filter((kit) => kit.readiness.status !== 'not_ready').map((kit) => kit.id);
  const verifiedExportPackageIds = kits.flatMap((kit) => kit.readiness.verifiedExportPackageIds);
  const issues = kits.flatMap((kit) => kit.readiness.issues).filter((issue) => issue.severity === 'error' || issue.severity === 'critical');

  const foundationStatus: AocFoundationV1Status = {
    id: 'aoc-foundation-v1',
    status,
    completedModules,
    requiredModules: REQUIRED_FOUNDATION_V1_MODULES,
    missingModules,
    pilotTemplateIds: kits.map((kit) => kit.templateId),
    readyPilotKitIds,
    verifiedExportPackageIds,
    checkedAt: FOUNDATION_V1_CHECKED_AT,
    issues,
  };

  return { datasys, bank, healthcare, sports, kits, foundationStatus };
}
