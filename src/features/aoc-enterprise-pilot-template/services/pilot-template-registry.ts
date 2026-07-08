import type { PilotTemplate, PilotTemplateId } from '../domain/pilot-template.js';
import { PilotTemplateStore } from './pilot-template-store.js';

export class PilotTemplateRegistryError extends Error {}

export interface PilotTemplateValidationResult {
  readonly templateId: PilotTemplateId;
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Pure function -- same template in, same validation result out. */
export function validatePilotTemplate(template: PilotTemplate): PilotTemplateValidationResult {
  const errors: string[] = [];
  if (template.legalDisclaimer.trim().length === 0) {
    errors.push('Pilot template is missing a legal disclaimer.');
  }
  if (template.nonGoals.length === 0) {
    errors.push('Pilot template is missing non-goals.');
  }
  if (template.acceptanceCriteria.length === 0) {
    errors.push('Pilot template is missing acceptance criteria.');
  }
  if (template.successMetrics.length === 0) {
    errors.push('Pilot template is missing success metrics.');
  }
  if (template.scenarios.length === 0) {
    errors.push('Pilot template must include at least one scenario.');
  }
  if (template.exportPackages.length === 0) {
    errors.push('Pilot template must include at least one export package definition.');
  }
  return { templateId: template.id, valid: errors.length === 0, errors };
}

/**
 * Registers built-in and custom `PilotTemplate`s into a `PilotTemplateStore`,
 * validating required fields and preventing duplicate ids. A template that
 * validates cleanly and is still `draft` is promoted to `ready` -- this
 * registry never promotes a template past `ready` on its own (`validated`
 * requires a real readiness check via `PilotReadinessService`).
 */
export class PilotTemplateRegistry {
  constructor(private readonly store: PilotTemplateStore) {}

  registerBuiltIn(template: PilotTemplate): PilotTemplateValidationResult {
    return this.register(template);
  }

  registerCustom(template: PilotTemplate): PilotTemplateValidationResult {
    return this.register(template);
  }

  revalidate(templateId: PilotTemplateId): PilotTemplateValidationResult {
    const template = this.store.getTemplate(templateId);
    if (template === undefined) {
      throw new PilotTemplateRegistryError(`Unknown pilot template "${templateId}".`);
    }
    return validatePilotTemplate(template);
  }

  private register(template: PilotTemplate): PilotTemplateValidationResult {
    if (this.store.hasTemplate(template.id)) {
      throw new PilotTemplateRegistryError(`Duplicate pilot template id "${template.id}".`);
    }
    const result = validatePilotTemplate(template);
    const stored: PilotTemplate = result.valid && template.status === 'draft' ? { ...template, status: 'ready' } : template;
    this.store.saveTemplate(stored);
    return result;
  }
}

export function createPilotTemplateRegistry(store: PilotTemplateStore): PilotTemplateRegistry {
  return new PilotTemplateRegistry(store);
}
