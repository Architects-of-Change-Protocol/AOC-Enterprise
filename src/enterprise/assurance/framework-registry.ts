import { AssuranceError } from './errors.js';
import { validateAssuranceFramework } from './framework-validation.js';
import type { AssuranceFramework, AssuranceFrameworkSummary, AssuranceFrameworkValidationResult } from './contracts.js';

/**
 * The Assurance Framework Registry (mission section 46). Frameworks are
 * data, registered statically at composition time and frozen when Enterprise
 * startup completes -- no dynamic remote framework loading exists in v1,
 * and no executable code ever travels inside a framework definition.
 *
 * Immutability rules:
 * - a `(frameworkId, frameworkVersion)` pair registers exactly once;
 * - an ACTIVE version never mutates -- changed controls/weights/thresholds
 *   require a NEW version;
 * - `deprecate()` is the only permitted status transition after activation;
 * - deprecated frameworks remain readable, retired frameworks remain
 *   verifiable (`get()` serves every registered version forever).
 */
export interface AssuranceFrameworkRegistry {
  register(framework: AssuranceFramework): void;
  get(frameworkId: string, frameworkVersion: string): AssuranceFramework | undefined;
  list(): readonly AssuranceFrameworkSummary[];
  activate(frameworkId: string, frameworkVersion: string): void;
  deprecate(frameworkId: string, frameworkVersion: string): void;
  validate(framework: AssuranceFramework): AssuranceFrameworkValidationResult;
  /** Freezes registration (called when Enterprise startup completes). Later `register()`/`activate()` calls throw. */
  freeze(): void;
  isFrozen(): boolean;
}

function keyOf(frameworkId: string, frameworkVersion: string): string {
  return `${frameworkId}@@${frameworkVersion}`;
}

export function createAssuranceFrameworkRegistry(): AssuranceFrameworkRegistry {
  const frameworks = new Map<string, AssuranceFramework>();
  let frozen = false;

  function requireRegistered(frameworkId: string, frameworkVersion: string): AssuranceFramework {
    const framework = frameworks.get(keyOf(frameworkId, frameworkVersion));
    if (framework === undefined) {
      throw new AssuranceError('ASSURANCE_FRAMEWORK_NOT_FOUND', `No registered Assurance framework '${frameworkId}' version '${frameworkVersion}'.`);
    }
    return framework;
  }

  return {
    register(framework) {
      if (frozen) {
        throw new AssuranceError('ASSURANCE_FRAMEWORK_INVALID', 'The Assurance Framework Registry is frozen; frameworks register only during Enterprise composition.');
      }
      const key = keyOf(framework.frameworkId, framework.frameworkVersion);
      if (frameworks.has(key)) {
        throw new AssuranceError(
          'ASSURANCE_FRAMEWORK_INVALID',
          `Framework '${framework.frameworkId}' version '${framework.frameworkVersion}' is already registered; changed controls, weights, or thresholds require a new framework version.`,
        );
      }
      const validation = validateAssuranceFramework(framework);
      if (!validation.valid) {
        throw new AssuranceError('ASSURANCE_FRAMEWORK_INVALID', `Framework '${framework.frameworkId}@${framework.frameworkVersion}' failed validation.`, {
          issues: validation.issues,
        });
      }
      frameworks.set(key, framework);
    },

    get(frameworkId, frameworkVersion) {
      return frameworks.get(keyOf(frameworkId, frameworkVersion));
    },

    list() {
      return [...frameworks.values()].map((framework) => ({
        frameworkId: framework.frameworkId,
        frameworkVersion: framework.frameworkVersion,
        name: framework.name,
        status: framework.status,
        domainCount: framework.domains.length,
        controlCount: framework.controls.length,
      }));
    },

    activate(frameworkId, frameworkVersion) {
      if (frozen) {
        throw new AssuranceError('ASSURANCE_FRAMEWORK_INVALID', 'The Assurance Framework Registry is frozen; activation happens during Enterprise composition.');
      }
      const framework = requireRegistered(frameworkId, frameworkVersion);
      if (framework.status === 'retired') {
        throw new AssuranceError('ASSURANCE_FRAMEWORK_VERSION_UNSUPPORTED', `Framework '${frameworkId}@${frameworkVersion}' is retired and cannot be reactivated.`);
      }
      frameworks.set(keyOf(frameworkId, frameworkVersion), { ...framework, status: 'active' });
    },

    deprecate(frameworkId, frameworkVersion) {
      const framework = requireRegistered(frameworkId, frameworkVersion);
      frameworks.set(keyOf(frameworkId, frameworkVersion), { ...framework, status: 'deprecated' });
    },

    validate(framework) {
      return validateAssuranceFramework(framework);
    },

    freeze() {
      frozen = true;
    },

    isFrozen() {
      return frozen;
    },
  };
}

/**
 * Resolves the framework a new assessment may use (mission section 2): a
 * retired version is rejected unless `allowRetired` is explicitly
 * configured; a draft version is rejected outright -- assessments run only
 * against `active` (or, tolerated for read continuity, `deprecated`)
 * versions.
 */
export function resolveFrameworkForAssessment(
  registry: AssuranceFrameworkRegistry,
  frameworkId: string,
  frameworkVersion: string,
  options: { readonly allowRetired?: boolean } = {},
): AssuranceFramework {
  const framework = registry.get(frameworkId, frameworkVersion);
  if (framework === undefined) {
    throw new AssuranceError('ASSURANCE_FRAMEWORK_NOT_FOUND', `No registered Assurance framework '${frameworkId}' version '${frameworkVersion}'.`);
  }
  if (framework.status === 'draft') {
    throw new AssuranceError('ASSURANCE_FRAMEWORK_VERSION_UNSUPPORTED', `Framework '${frameworkId}@${frameworkVersion}' is a draft; activate it before assessing against it.`);
  }
  if (framework.status === 'retired' && options.allowRetired !== true) {
    throw new AssuranceError('ASSURANCE_FRAMEWORK_VERSION_UNSUPPORTED', `Framework '${frameworkId}@${frameworkVersion}' is retired; new assessments may not use it unless explicitly configured.`);
  }
  return framework;
}
