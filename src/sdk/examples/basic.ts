import { createAocClient } from "../index";

const client = createAocClient({ baseUrl: "https://your-app.example.com", token: process.env.PMFREAK_TOKEN, workspaceId: "workspace_123" });

export async function demo() {
  await client.createCapabilityRequest({ workspaceId: "workspace_123", targetResourceType: "project", targetResourceId: "project_1", requestedPermission: "read", justification: "Need read access" });
  await client.evaluatePolicy({ workspaceId: "workspace_123", resourceType: "project", resourceId: "project_1", permission: "read", rbacAllowed: false });
}
