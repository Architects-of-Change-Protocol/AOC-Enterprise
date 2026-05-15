import { AocAuthError, AocError, AocForbiddenError, AocNotFoundError, AocRateLimitError, AocServerError, AocValidationError } from "./errors";
import type { Agent, AgentId, AgentScope, AocClientConfig, AuditTimelineItem, CapabilityGrant, CapabilityRequest, Delegation, Policy, WorkspaceId } from "./types";

type RequestOptions = { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined>; headers?: HeadersInit; retry?: boolean; maxAttempts?: number; signal?: AbortSignal };

export class AocClient {
  private baseUrl: string;
  private token?: string;
  private apiKey?: string;
  private workspaceId?: WorkspaceId;
  private agentId?: AgentId;
  private delegationToken?: string;
  private executionGrant?: string;
  private agentToken?: string;
  private fetchImpl: typeof fetch;

  constructor(config: AocClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.apiKey = config.apiKey;
    this.workspaceId = config.workspaceId;
    this.agentId = config.agentId;
    this.delegationToken = config.delegationToken;
    this.executionGrant = config.executionGrant;
    this.agentToken = config.agentToken;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
  }

  setToken(token: string | undefined) { this.token = token; return this; }
  setWorkspace(workspaceId: WorkspaceId | undefined) { this.workspaceId = workspaceId; return this; }
  setAgent(agentId: AgentId | undefined) { this.agentId = agentId; return this; }
  setDelegationToken(token: string | undefined) { this.delegationToken = token; return this; }
  setExecutionGrant(grant: string | undefined) { this.executionGrant = grant; return this; }

  private buildHeaders(extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    headers.set("Content-Type", "application/json");
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    if (this.apiKey) headers.set("x-api-key", this.apiKey);
    if (this.workspaceId) headers.set("x-pmf-workspace-id", this.workspaceId);
    if (this.agentId) headers.set("x-pmf-agent-id", this.agentId);
    if (this.agentToken) headers.set("x-pmf-agent-token", this.agentToken);
    if (this.delegationToken) headers.set("x-pmf-delegation-token", this.delegationToken);
    if (this.executionGrant) headers.set("x-pmf-execution-grant", this.executionGrant);
    return headers;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = (options.method ?? "GET").toUpperCase();
    const maxAttempts = options.maxAttempts ?? 2;
    const retryEnabled = options.retry ?? method === "GET";
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(options.query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
    let response: Response | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      response = await this.fetchImpl(url, { method, headers: this.buildHeaders(options.headers), body: options.body ? JSON.stringify(options.body) : undefined, signal: options.signal });
      if (!retryEnabled || ![408, 429, 500, 502, 503, 504].includes(response.status) || attempt >= maxAttempts) break;
      const base = 120 * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * 100);
      await new Promise((resolve) => setTimeout(resolve, base + jitter));
    }
    const requestId = response?.headers.get("x-request-id");
    const payload = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      const envelope = payload?.error ?? payload;
      const message = envelope?.message ?? payload?.message ?? `Request failed (${response?.status})`;
      const code = envelope?.code ?? envelope?.reason;
      const details = envelope?.details;
      const recoverable = Boolean(envelope?.recoverable ?? [408, 429, 500, 502, 503, 504].includes(response?.status ?? 0));
      const suggestedAction = envelope?.suggestedAction;
      if (response?.status === 401) throw new AocAuthError(message, 401, code, requestId, recoverable, suggestedAction, details);
      if (response?.status === 403) throw new AocForbiddenError(message, 403, code, requestId, recoverable, suggestedAction, details);
      if (response?.status === 404) throw new AocNotFoundError(message, 404, code, requestId, recoverable, suggestedAction, details);
      if (response?.status === 400 || response?.status === 422) throw new AocValidationError(message, response.status, code, requestId, recoverable, suggestedAction, details);
      if (response?.status === 429) throw new AocRateLimitError(message, 429, code, requestId, recoverable, suggestedAction, details);
      if ((response?.status ?? 0) >= 500) throw new AocServerError(message, response!.status, code, requestId, recoverable, suggestedAction, details);
      throw new AocError(message, response?.status ?? 0, code, requestId, recoverable, suggestedAction, details);
    }
    return ((payload && payload.ok && "data" in payload) ? payload.data : payload) as T;
  }

  createCapabilityRequest(input: Record<string, unknown>) { return this.request<{ ok: boolean; request?: CapabilityRequest }>("/api/v1/capability-requests", { method: "POST", body: input }); }
  approveCapabilityRequest(requestId: string) { return this.request<{ ok: boolean }>(`/api/v1/capability-requests/${requestId}/approve`, { method: "POST" }); }
  denyCapabilityRequest(requestId: string) { return this.request<{ ok: boolean }>(`/api/v1/capability-requests/${requestId}/deny`, { method: "POST" }); }
  revokeCapabilityGrant(grantId: string) { return this.request<{ ok: boolean }>(`/api/v1/capability-grants/${grantId}/revoke`, { method: "POST" }); }
  listCapabilityRequests(workspaceId = this.workspaceId) { return this.request<{ requests: CapabilityRequest[] }>("/api/v1/capability-requests", { query: { workspaceId: workspaceId ?? "" } }); }
  listCapabilityGrants(workspaceId = this.workspaceId) { return this.request<{ grants: CapabilityGrant[] }>("/api/v1/capability-grants", { query: { workspaceId: workspaceId ?? "" } }); }

  evaluatePolicy(input: Record<string, unknown>) { return this.request<{ decision: string; reason: string }>("/api/v1/policies/evaluate", { method: "POST", body: input }); }
  listPolicies(workspaceId = this.workspaceId) { return this.request<{ policies: Policy[] }>("/api/v1/policies", { query: { workspaceId: workspaceId ?? "" } }); }
  createPolicy(input: Record<string, unknown>) { return this.request<{ ok: boolean; policy?: Policy }>("/api/v1/policies", { method: "POST", body: input }); }
  togglePolicy(policyId: string, enabled: boolean) { return this.request<{ ok: boolean }>(`/api/v1/policies/${policyId}`, { method: "PATCH", body: { enabled } }); }

  listAgents(workspaceId = this.workspaceId) { return this.request<{ agents: Agent[] }>("/api/v1/agents", { query: { workspaceId: workspaceId ?? "" } }); }
  registerAgent(input: Record<string, unknown>) { return this.request<{ ok: boolean; agent?: Agent }>("/api/v1/agents", { method: "POST", body: input }); }
  grantAgentScope(input: Record<string, unknown>) { return this.request<{ ok: boolean; scope?: AgentScope }>("/api/v1/agent-scopes", { method: "POST", body: input }); }
  evaluateAgentAccess(input: Record<string, unknown>) { return this.request<{ decision: string; reason: string }>("/api/sdk/agents/evaluate", { method: "POST", body: input }); }
  disableAgent(agentId: string) { return this.request<{ ok: boolean }>(`/api/v1/agents/${agentId}`, { method: "PATCH", body: { status: "disabled" } }); }
  revokeAgent(agentId: string) { return this.request<{ ok: boolean }>(`/api/v1/agents/${agentId}`, { method: "PATCH", body: { status: "revoked" } }); }

  getAuditTimeline(workspaceId = this.workspaceId) { return this.request<{ timeline: AuditTimelineItem[] }>("/api/v1/audit-events", { query: { workspaceId: workspaceId ?? "" } }); }
  getCapabilityAudit(workspaceId = this.workspaceId) { return this.request<{ timeline: AuditTimelineItem[] }>("/api/sdk/audit/capabilities", { query: { workspaceId: workspaceId ?? "" } }); }
  getResourceAudit(resourceId: string, workspaceId = this.workspaceId) { return this.request<{ timeline: AuditTimelineItem[] }>("/api/sdk/audit/resources", { query: { workspaceId: workspaceId ?? "", resourceId } }); }
  getAgentAudit(agentId: string, workspaceId = this.workspaceId) { return this.request<{ timeline: AuditTimelineItem[] }>("/api/sdk/audit/agents", { query: { workspaceId: workspaceId ?? "", agentId } }); }
  delegateAuthority(input: Record<string, unknown>) { return this.request<{ ok: boolean; delegation: Delegation; delegationToken?: string }>("/api/v1/delegations", { method: "POST", body: input }); }
  revokeDelegation(delegationId: string, input: Record<string, unknown> = {}) { return this.request<{ ok: boolean; delegationId: string; status: string; propagatedRevocations?: number }>(`/api/v1/delegations/${delegationId}/revoke`, { method: "POST", body: input }); }
  listDelegations(workspaceId = this.workspaceId) { return this.request<{ ok: boolean; delegations: Delegation[] }>("/api/v1/delegations", { query: { workspaceId: workspaceId ?? "" } }); }
  evaluateDelegatedAccess(input: Record<string, unknown>) { return this.request<{ ok: boolean; decision: string; delegation?: Delegation; chain?: Delegation[] }>("/api/v1/delegations/evaluate", { method: "POST", body: input }); }

}

export const createAocClient = (config: AocClientConfig) => new AocClient(config);
