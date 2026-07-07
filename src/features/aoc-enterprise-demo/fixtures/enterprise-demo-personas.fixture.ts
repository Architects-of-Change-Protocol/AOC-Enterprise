import type { DemoPersona } from '../domain/demo-persona.js';
import {
  DATASYS_ACTOR_ID,
  FINANCE_APPROVER_ACTOR_ID,
  PMFREAK_ACTOR_ID,
  TRUST_DOMAIN_ID,
  TRUSTED_PARTNER_AGENT_ID,
  UNKNOWN_AGENT_ACTOR_ID,
  VICTOR_ACTOR_ID,
} from './enterprise-demo-world.fixture.js';

export const VICTOR_PERSONA_ID = 'persona-victor-valverde';
export const DATASYS_PERSONA_ID = 'persona-datasys-organization';
export const PMFREAK_PERSONA_ID = 'persona-pmfreak-closure-agent';
export const FINANCE_APPROVER_PERSONA_ID = 'persona-finance-approver';
export const TRUSTED_PARTNER_PERSONA_ID = 'persona-trusted-partner-research-agent';
export const UNKNOWN_AGENT_PERSONA_ID = 'persona-unknown-external-agent';
export const AOC_OPERATOR_PERSONA_ID = 'persona-aoc-operator';

/**
 * Reusable demo personas. Every persona whose `actorId` is set corresponds to
 * a real Actor registered in the enterprise demo world's Recognition Runtime
 * (see enterprise-demo-world.fixture.ts) -- nothing here is a fabricated
 * identity. The AOC Operator is the only persona without an `actorId`: they
 * observe the Control Plane read model but are not themselves a recognized
 * actor inside the Datasys Agent Republic trust domain.
 */
export const ENTERPRISE_DEMO_PERSONAS: readonly DemoPersona[] = [
  {
    id: VICTOR_PERSONA_ID,
    displayName: 'Victor Valverde',
    type: 'human',
    role: 'Human Operator / Project Manager',
    description:
      'Recognized human actor who can approve project-closure and client-communication actions, and inspect the Control Plane.',
    trustDomainId: TRUST_DOMAIN_ID,
    actorId: VICTOR_ACTOR_ID,
  },
  {
    id: DATASYS_PERSONA_ID,
    displayName: 'Datasys',
    type: 'organization',
    role: 'Root Issuer / Local Organization',
    description: 'Issues the Datasys Agent Republic trust domain and is the root authority for every local actor.',
    trustDomainId: TRUST_DOMAIN_ID,
    actorId: DATASYS_ACTOR_ID,
  },
  {
    id: PMFREAK_PERSONA_ID,
    displayName: 'PMFreak Closure Agent',
    type: 'agent',
    role: 'Internal Autonomous Agent',
    description:
      'Drafts project-closure outputs under authority delegated from Victor; client-facing communication requires human approval.',
    trustDomainId: TRUST_DOMAIN_ID,
    actorId: PMFREAK_ACTOR_ID,
  },
  {
    id: FINANCE_APPROVER_PERSONA_ID,
    displayName: 'Finance Approver',
    type: 'human',
    role: 'Human Approver, Finance-Critical Actions',
    description: 'Recognized approver for finance-critical actions such as payments and bank-detail changes.',
    trustDomainId: TRUST_DOMAIN_ID,
    actorId: FINANCE_APPROVER_ACTOR_ID,
  },
  {
    id: TRUSTED_PARTNER_PERSONA_ID,
    displayName: 'Trusted Partner Research Agent',
    type: 'external_agent',
    role: 'External Agent, Trusted Partner Issuer',
    description: 'External agent from a trusted partner issuer that can receive a limited visa to read project summaries.',
    trustDomainId: TRUST_DOMAIN_ID,
    actorId: TRUSTED_PARTNER_AGENT_ID,
  },
  {
    id: UNKNOWN_AGENT_PERSONA_ID,
    displayName: 'Unknown External Agent',
    type: 'external_agent',
    role: 'External Agent, No Standing',
    description: 'External agent with no completed handshake or issuer trust -- blocked without recognized standing.',
    actorId: UNKNOWN_AGENT_ACTOR_ID,
  },
  {
    id: AOC_OPERATOR_PERSONA_ID,
    displayName: 'AOC Operator',
    type: 'human',
    role: 'Human Operator, Control Plane',
    description: 'Views the Control Plane and understands proof chains and blocked-execution reasons; not itself a recognized actor.',
    trustDomainId: TRUST_DOMAIN_ID,
  },
];
