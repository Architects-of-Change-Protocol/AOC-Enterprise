import type { SideEffectType } from '../../action-enforcement/domain/side-effect.js';
import type { DemoRiskLevel } from '../domain/demo-risk.js';
import {
  APPROVE_PAYMENT,
  CHANGE_BANK_ACCOUNT,
  DRAFT_CLOSURE_EMAIL,
  PREPARE_INVOICE_SUPPORT,
  SEND_CLIENT_FOLLOW_UP,
} from '../../action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { READ_PROJECT_SUMMARY } from '../../external-agent-handshake/fixtures/datasys-handshake.fixture.js';

export const EXPORT_CLIENT_DATA = 'export_client_data';

export {
  APPROVE_PAYMENT,
  CHANGE_BANK_ACCOUNT,
  DRAFT_CLOSURE_EMAIL,
  PREPARE_INVOICE_SUPPORT,
  READ_PROJECT_SUMMARY,
  SEND_CLIENT_FOLLOW_UP,
};

export interface DemoActionDefinition {
  readonly action: string;
  readonly capability: string;
  readonly title: string;
  readonly description: string;
  readonly sideEffectType: SideEffectType;
  readonly riskLevel: DemoRiskLevel;
}

/**
 * Descriptive catalog of the enterprise setting's core actions, for narrative
 * and script generation only. It carries no governance logic -- whether these
 * actions are actually allowed is decided exclusively by Recognition
 * Runtime, Authority Graph, Approval Runtime and Action Enforcement.
 */
export const ENTERPRISE_DEMO_ACTIONS: readonly DemoActionDefinition[] = [
  {
    action: DRAFT_CLOSURE_EMAIL,
    capability: 'project_closure',
    title: 'Draft Closure Email',
    description: 'Draft the project closure email for a Datasys engagement.',
    sideEffectType: 'write',
    riskLevel: 'medium',
  },
  {
    action: SEND_CLIENT_FOLLOW_UP,
    capability: 'client_communication',
    title: 'Send Client Follow-Up',
    description: 'Send a client-facing follow-up message on behalf of the project team.',
    sideEffectType: 'send_message',
    riskLevel: 'high',
  },
  {
    action: PREPARE_INVOICE_SUPPORT,
    capability: 'invoice_support',
    title: 'Prepare Invoice Support',
    description: 'Prepare supporting documentation for an outstanding invoice.',
    sideEffectType: 'write',
    riskLevel: 'medium',
  },
  {
    action: READ_PROJECT_SUMMARY,
    capability: 'project_read',
    title: 'Read Project Summary',
    description: 'Read a non-sensitive summary of project status.',
    sideEffectType: 'read',
    riskLevel: 'low',
  },
  {
    action: APPROVE_PAYMENT,
    capability: 'finance_approval',
    title: 'Approve Payment',
    description: 'Approve a payment against project funds.',
    sideEffectType: 'financial',
    riskLevel: 'critical',
  },
  {
    action: CHANGE_BANK_ACCOUNT,
    capability: 'bank_details_management',
    title: 'Change Bank Account',
    description: 'Change the bank account on file for settlement.',
    sideEffectType: 'financial',
    riskLevel: 'critical',
  },
  {
    action: EXPORT_CLIENT_DATA,
    capability: 'data_export',
    title: 'Export Client Data',
    description: 'Export client data out of the trust domain.',
    sideEffectType: 'data_export',
    riskLevel: 'critical',
  },
];
