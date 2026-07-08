import type { PilotTemplate, PilotTemplateIndustry, PilotTemplateStatus } from '../domain/pilot-template.js';
import type { PilotScenarioExportPackageType } from '../domain/pilot-scenario.js';
import type { PilotReadinessStatus } from '../domain/pilot-kit.js';
import { PilotTemplateStore } from './pilot-template-store.js';

export interface PilotQueryFilter {
  readonly industry?: PilotTemplateIndustry;
  readonly status?: PilotTemplateStatus;
  readonly useCase?: string;
  readonly personaId?: string;
  readonly requiredCapability?: string;
  readonly policyPackId?: string;
  readonly exportPackageType?: PilotScenarioExportPackageType;
  readonly readinessStatus?: PilotReadinessStatus;
  readonly text?: string;
}

function byId(a: PilotTemplate, b: PilotTemplate): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function matchesText(template: PilotTemplate, needle: string): boolean {
  const haystacks: string[] = [
    template.name,
    template.description,
    template.businessPain,
    template.aocValueProposition,
    ...template.actions.map((action) => `${action.name} ${action.action}`),
    ...template.scenarios.map((scenario) => `${scenario.name} ${scenario.description}`),
    ...template.acceptanceCriteria.map((criterion) => `${criterion.title} ${criterion.description}`),
  ];
  return haystacks.some((haystack) => haystack.toLowerCase().includes(needle));
}

/** Read-only, deterministic query surface over registered pilot templates. */
export class PilotQueryService {
  constructor(private readonly store: PilotTemplateStore) {}

  query(filter: PilotQueryFilter): readonly PilotTemplate[] {
    let templates = this.store.listTemplates();

    if (filter.industry !== undefined) {
      const industry = filter.industry;
      templates = templates.filter((template) => template.industry === industry);
    }
    if (filter.status !== undefined) {
      const status = filter.status;
      templates = templates.filter((template) => template.status === status);
    }
    if (filter.useCase !== undefined) {
      const needle = filter.useCase.toLowerCase();
      templates = templates.filter((template) => template.primaryUseCase.toLowerCase().includes(needle));
    }
    if (filter.personaId !== undefined) {
      const personaId = filter.personaId;
      templates = templates.filter((template) => template.targetBuyerPersonaIds.includes(personaId) || template.targetOperatorPersonaIds.includes(personaId));
    }
    if (filter.requiredCapability !== undefined) {
      const capability = filter.requiredCapability;
      templates = templates.filter((template) => template.capabilities.some((entry) => entry.id === capability || entry.name === capability));
    }
    if (filter.policyPackId !== undefined) {
      const policyPackId = filter.policyPackId;
      templates = templates.filter((template) => template.policyModel.policyPackIds.includes(policyPackId));
    }
    if (filter.exportPackageType !== undefined) {
      const exportPackageType = filter.exportPackageType;
      templates = templates.filter((template) => template.exportPackages.some((entry) => entry.packageType === exportPackageType));
    }
    if (filter.readinessStatus !== undefined) {
      const readinessStatus = filter.readinessStatus;
      templates = templates.filter((template) => this.store.getLatestReadinessReportByTemplate(template.id)?.status === readinessStatus);
    }
    if (filter.text !== undefined) {
      const needle = filter.text.toLowerCase();
      templates = templates.filter((template) => matchesText(template, needle));
    }

    return [...templates].sort(byId);
  }
}

export function createPilotQueryService(store: PilotTemplateStore): PilotQueryService {
  return new PilotQueryService(store);
}
