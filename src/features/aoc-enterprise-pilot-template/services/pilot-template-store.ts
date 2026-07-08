import type { PilotTemplate, PilotTemplateId, PilotTemplateStatus, PilotTemplateIndustry } from '../domain/pilot-template.js';
import type { PilotKit, PilotKitStatus, PilotReadinessReport, PilotGeneratedArtifact } from '../domain/pilot-kit.js';
import type { PilotPersona } from '../domain/pilot-persona.js';

function byId<T extends { readonly id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Single source of truth for pilot-template-runtime records. Mirrors the
 * store pattern used across the other AOC feature runtimes (e.g.
 * `evidence-source-runtime/services/evidence-store.ts`): higher-level
 * services read/write through this store, and it never computes business
 * rules itself.
 */
export class PilotTemplateStore {
  private readonly templates = new Map<PilotTemplateId, PilotTemplate>();
  private readonly kits = new Map<string, PilotKit>();
  private readonly personas = new Map<string, PilotPersona>();
  private readonly readinessReports = new Map<string, PilotReadinessReport>();
  private readonly generatedArtifacts = new Map<string, PilotGeneratedArtifact>();

  // -- PilotTemplate -------------------------------------------------

  saveTemplate(template: PilotTemplate): PilotTemplate {
    this.templates.set(template.id, template);
    return template;
  }

  getTemplate(id: PilotTemplateId): PilotTemplate | undefined {
    return this.templates.get(id);
  }

  hasTemplate(id: PilotTemplateId): boolean {
    return this.templates.has(id);
  }

  updateTemplateStatus(id: PilotTemplateId, status: PilotTemplateStatus, updatedAt: string): PilotTemplate | undefined {
    const existing = this.templates.get(id);
    if (existing === undefined) {
      return undefined;
    }
    const updated: PilotTemplate = { ...existing, status, updatedAt };
    this.templates.set(id, updated);
    return updated;
  }

  listTemplates(): readonly PilotTemplate[] {
    return [...this.templates.values()].sort(byId);
  }

  listTemplatesByIndustry(industry: PilotTemplateIndustry): readonly PilotTemplate[] {
    return this.listTemplates().filter((template) => template.industry === industry);
  }

  listTemplatesByStatus(status: PilotTemplateStatus): readonly PilotTemplate[] {
    return this.listTemplates().filter((template) => template.status === status);
  }

  listTemplatesByUseCase(useCaseQuery: string): readonly PilotTemplate[] {
    const needle = useCaseQuery.toLowerCase();
    return this.listTemplates().filter((template) => template.primaryUseCase.toLowerCase().includes(needle));
  }

  // -- PilotKit -------------------------------------------------

  saveKit(kit: PilotKit): PilotKit {
    this.kits.set(kit.id, kit);
    return kit;
  }

  getKit(id: string): PilotKit | undefined {
    return this.kits.get(id);
  }

  updateKitStatus(id: string, status: PilotKitStatus): PilotKit | undefined {
    const existing = this.kits.get(id);
    if (existing === undefined) {
      return undefined;
    }
    const updated: PilotKit = { ...existing, status };
    this.kits.set(id, updated);
    return updated;
  }

  listKits(): readonly PilotKit[] {
    return [...this.kits.values()].sort(byId);
  }

  listKitsByTemplate(templateId: PilotTemplateId): readonly PilotKit[] {
    return this.listKits().filter((kit) => kit.templateId === templateId);
  }

  // -- PilotPersona -------------------------------------------------

  savePersona(persona: PilotPersona): PilotPersona {
    this.personas.set(persona.id, persona);
    return persona;
  }

  getPersona(id: string): PilotPersona | undefined {
    return this.personas.get(id);
  }

  listPersonas(): readonly PilotPersona[] {
    return [...this.personas.values()].sort(byId);
  }

  // -- PilotReadinessReport -------------------------------------------------

  saveReadinessReport(report: PilotReadinessReport): PilotReadinessReport {
    this.readinessReports.set(report.id, report);
    return report;
  }

  getReadinessReport(id: string): PilotReadinessReport | undefined {
    return this.readinessReports.get(id);
  }

  getLatestReadinessReportByTemplate(templateId: PilotTemplateId): PilotReadinessReport | undefined {
    const matches = [...this.readinessReports.values()].filter((report) => report.templateId === templateId);
    return matches.length === 0 ? undefined : matches[matches.length - 1];
  }

  // -- PilotGeneratedArtifact -------------------------------------------------

  saveGeneratedArtifact(artifact: PilotGeneratedArtifact): PilotGeneratedArtifact {
    this.generatedArtifacts.set(artifact.id, artifact);
    return artifact;
  }

  getGeneratedArtifact(id: string): PilotGeneratedArtifact | undefined {
    return this.generatedArtifacts.get(id);
  }

  listGeneratedArtifacts(): readonly PilotGeneratedArtifact[] {
    return [...this.generatedArtifacts.values()].sort(byId);
  }
}

export function createPilotTemplateStore(): PilotTemplateStore {
  return new PilotTemplateStore();
}
