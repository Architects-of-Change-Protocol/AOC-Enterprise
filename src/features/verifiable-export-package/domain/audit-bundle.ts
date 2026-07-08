export interface AuditBundleScope {
  readonly trustDomainId: string;
  readonly actorIds: readonly string[];
  readonly actionIds: readonly string[];
  readonly decisionIds: readonly string[];
  readonly proofIds: readonly string[];
  readonly from?: string;
  readonly to?: string;
}

export interface AuditBundleSummary {
  readonly packageCount: number;
  readonly decisionCount: number;
  readonly proofCount: number;
  readonly eventCount: number;
  readonly issueCount: number;
}

export interface AuditBundle {
  readonly id: string;

  readonly packageId: string;

  readonly scope: AuditBundleScope;

  readonly packageIds: readonly string[];

  readonly summary: AuditBundleSummary;

  readonly bundleHash: string;

  readonly createdAt: string;
}
