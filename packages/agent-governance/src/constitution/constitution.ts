import type { AgentEnrollmentInput } from '../enrollment/enrollment-contracts.js';
import type { AgentConstitution, ConstitutionArticle } from './constitution-contracts.js';

export function createAgentConstitution(
  input: AgentEnrollmentInput,
  passportId: string,
): AgentConstitution {
  const jurisdiction = input.region ?? input.jurisdiction ?? 'GLOBAL';
  const dataList = input.dataAccess.length > 0 ? input.dataAccess.join(', ') : 'none declared';
  const toolList = input.tools.length > 0 ? input.tools.join(', ') : 'none declared';
  const prohibitedList =
    input.prohibitedActions.length > 0 ? input.prohibitedActions.join(', ') : 'none declared';
  const escalationText =
    input.escalationRules.length > 0
      ? input.escalationRules
          .map(
            (r) =>
              `Trigger: ${r.trigger} → Action: ${r.action}${r.escalateTo ? ` (escalate to: ${r.escalateTo})` : ''}`,
          )
          .join('; ')
      : 'No specific escalation rules declared.';

  const articles: readonly ConstitutionArticle[] = [
    {
      number: 'I',
      title: 'Identity and Purpose',
      content: `${input.agentName} is a governed AI agent operating under the Soberanía Protocol. Its declared purpose is: ${input.purpose}. This agent is owned by ${input.ownerName} (${input.ownerId}) and operates under jurisdiction: ${jurisdiction}.`,
    },
    {
      number: 'II',
      title: 'Scope of Authority',
      content: `This agent is authorized to operate with autonomy level "${input.autonomyLevel}" and risk tier "${input.riskTier}". The agent's authority is bounded by its declared tools and data access boundaries.`,
    },
    {
      number: 'III',
      title: 'Data Boundaries',
      content: `This agent is authorized to access the following data categories: ${dataList}. Access beyond these categories is prohibited.`,
    },
    {
      number: 'IV',
      title: 'Tool and Action Boundaries',
      content: `This agent is authorized to use the following tools and capabilities: ${toolList}. The following actions are explicitly prohibited: ${prohibitedList}.`,
    },
    {
      number: 'V',
      title: 'Human Oversight',
      content: [
        `Human oversight is ${input.humanOversight.requirement}.`,
        input.humanOversight.description,
      ]
        .filter(Boolean)
        .join(' '),
    },
    {
      number: 'VI',
      title: 'Escalation Rules',
      content: `This agent must follow the defined escalation rules. ${escalationText}`,
    },
    {
      number: 'VII',
      title: 'Auditability',
      content:
        'All actions taken by this agent must be auditable. The agent must maintain a complete audit trail of all governance decisions, data access events, and tool invocations.',
    },
    {
      number: 'VIII',
      title: 'Suspension, Revocation, and Termination',
      content:
        "This agent's passport may be suspended, revoked, or expired according to the Soberanía governance lifecycle. Removing the passport does not destroy the agent, but it destroys the agent's Soberanía-governed verification status. In governed runtimes, missing or invalid passports must cause governed execution to fail.",
    },
  ];

  return {
    constitutionId: `CONST-${passportId}`,
    passportId,
    version: '1.0',
    agentName: input.agentName,
    owner: { id: input.ownerId, name: input.ownerName },
    purpose: input.purpose,
    scopeOfAuthority: [
      `autonomy:${input.autonomyLevel}`,
      `risk:${input.riskTier}`,
      `jurisdiction:${jurisdiction}`,
    ],
    dataBoundaries: [...input.dataAccess],
    toolBoundaries: [...input.tools],
    prohibitedActions: [...input.prohibitedActions],
    humanOversight: input.humanOversight,
    escalationRules: [...input.escalationRules],
    auditObligations: ['full_audit_trail', 'governance_event_logging', 'data_access_logging'],
    terminationConditions: [
      'passport_revoked',
      'passport_expired',
      'owner_request',
      'governance_violation',
    ],
    articles,
    createdAt: input.issuedAt,
  };
}
