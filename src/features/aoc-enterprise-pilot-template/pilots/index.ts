import { DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE } from './datasys-project-governance.pilot.js';
import { BANK_PAYMENTS_PROCUREMENT_DATA_PILOT_TEMPLATE } from './bank-payments-procurement-data.pilot.js';
import { HEALTHCARE_OPERATIONS_SENSITIVE_DATA_PILOT_TEMPLATE } from './healthcare-operations-sensitive-data.pilot.js';
import { SPORTS_EVENT_SETTLEMENT_PILOT_TEMPLATE } from './sports-event-settlement.pilot.js';
import type { PilotTemplate } from '../domain/pilot-template.js';

export { DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE } from './datasys-project-governance.pilot.js';
export { BANK_PAYMENTS_PROCUREMENT_DATA_PILOT_TEMPLATE } from './bank-payments-procurement-data.pilot.js';
export { HEALTHCARE_OPERATIONS_SENSITIVE_DATA_PILOT_TEMPLATE } from './healthcare-operations-sensitive-data.pilot.js';
export { SPORTS_EVENT_SETTLEMENT_PILOT_TEMPLATE } from './sports-event-settlement.pilot.js';

export const ALL_BUILT_IN_PILOT_TEMPLATES: readonly PilotTemplate[] = [
  DATASYS_PROJECT_GOVERNANCE_PILOT_TEMPLATE,
  BANK_PAYMENTS_PROCUREMENT_DATA_PILOT_TEMPLATE,
  HEALTHCARE_OPERATIONS_SENSITIVE_DATA_PILOT_TEMPLATE,
  SPORTS_EVENT_SETTLEMENT_PILOT_TEMPLATE,
];
