export type PilotPersonaType =
  | 'buyer'
  | 'operator'
  | 'technical_evaluator'
  | 'risk_owner'
  | 'compliance_reviewer'
  | 'executive_sponsor'
  | 'project_manager';

/**
 * A named stakeholder lens a pilot template is written for. Personas never
 * carry runtime truth themselves -- they exist so PilotScript/PilotTemplate
 * content can be tailored to "what does the buyer need to hear" versus
 * "what does the operator need to click through".
 */
export interface PilotPersona {
  readonly id: string;
  readonly type: PilotPersonaType;
  readonly title: string;
  readonly description: string;
  readonly concerns: readonly string[];
  readonly successQuestions: readonly string[];
  readonly messages: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
