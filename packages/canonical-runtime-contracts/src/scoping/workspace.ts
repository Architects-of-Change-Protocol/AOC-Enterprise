export interface WorkspaceResolutionContext {
  readonly tenantId: string;
  readonly orgId: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
}

export interface WorkspaceLineage {
  readonly tenantId: string;
  readonly orgId: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly resolvedAt: string;
}

export interface ProjectContinuityState {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly lastUpdated: string;
  readonly continuityVersion: number;
}
