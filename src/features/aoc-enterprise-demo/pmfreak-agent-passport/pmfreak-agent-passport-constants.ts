/**
 * Soberanía PMFreak Agent Passport Demo Pack v1 -- shared identifiers.
 *
 * This module carries no real PMFreak project, customer, or billing data.
 * Every id below is a deterministic, opaque demo identifier used to route
 * fixtures and resolver examples, never a claim about a real PMFreak
 * deployment. See this pack's README for the full safety framing.
 */

export const PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID = 'aoc.demo.pmfreak.agent_passport.v1' as const;

export const PMFREAK_AGENT_PASSPORT_DEMO_PACK_NAME = 'Soberanía PMFreak Agent Passport Demo Pack v1' as const;

export const PMFREAK_AGENT_PASSPORT_DEMO_PACK_VERSION = '1.0.0' as const;

/** The `PMFreakAgentPassport.systemId` every passport in this pack carries -- an opaque routing key, not a claim of real PMFreak system integration. */
export const PMFREAK_SYSTEM_ID = 'pmfreak' as const;

/** Deterministic demo issuer id used by every fixture passport in this pack. Not a real identity provider. */
export const PMFREAK_AGENT_PASSPORT_ISSUER = 'aoc.enterprise.demo_issuer' as const;

/** Deterministic demo workspace id. Not a real Datasys/PMFreak workspace. */
export const PMFREAK_DEMO_WORKSPACE_ID = 'workspace.demo.pmfreak' as const;

/** Deterministic demo project id. Not a real Datasys/PMFreak project. */
export const PMFREAK_DEMO_PROJECT_ID = 'project.demo.network-refresh' as const;

/** Deterministic demo customer id. Not a real Datasys customer. */
export const PMFREAK_DEMO_CUSTOMER_ID = 'customer.demo.acme' as const;

/** A second demo project id, deliberately outside every fixture passport's authority scope, used only to exercise the out-of-scope resolver path. */
export const PMFREAK_DEMO_OUT_OF_SCOPE_PROJECT_ID = 'project.demo.out-of-scope-harbor' as const;

/** Deterministic fixed timestamps used by demo fixtures -- never a runtime clock read. */
export const PMFREAK_DEMO_ISSUED_AT = '2026-01-01T00:00:00.000Z' as const;
export const PMFREAK_DEMO_EXPIRES_AT = '2027-01-01T00:00:00.000Z' as const;
export const PMFREAK_DEMO_EXPIRED_AT = '2025-01-01T00:00:00.000Z' as const;
