import type { HumanOversight, EscalationRule } from '../enrollment/enrollment-contracts.js';

export interface ConstitutionArticle {
  readonly number: string;
  readonly title: string;
  readonly content: string;
}

export interface AgentConstitutionOwner {
  readonly id: string;
  readonly name: string;
}

export interface AgentConstitution {
  readonly constitutionId: string;
  readonly passportId: string;
  readonly version: string;
  readonly agentName: string;
  readonly owner: AgentConstitutionOwner;
  readonly purpose: string;
  readonly scopeOfAuthority: readonly string[];
  readonly dataBoundaries: readonly string[];
  readonly toolBoundaries: readonly string[];
  readonly prohibitedActions: readonly string[];
  readonly humanOversight: HumanOversight;
  readonly escalationRules: readonly EscalationRule[];
  readonly auditObligations: readonly string[];
  readonly terminationConditions: readonly string[];
  readonly articles: readonly ConstitutionArticle[];
  readonly createdAt: string;
}
