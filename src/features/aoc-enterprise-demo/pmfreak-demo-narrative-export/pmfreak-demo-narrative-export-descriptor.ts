import {
  PMFREAK_DEMO_NARRATIVE_DISCLAIMERS,
  PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_ID,
  PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_NAME,
  PMFREAK_DEMO_NARRATIVE_EXPORT_PURPOSE,
  PMFREAK_DEMO_NARRATIVE_EXPORT_SOURCE_VIEW_ID,
  PMFREAK_DEMO_NARRATIVE_SAFE_LABELS,
} from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeExportDescriptor } from './pmfreak-demo-narrative-export-types.js';

/**
 * Builds the deterministic descriptor for this export pack. States what the
 * pack is and, just as importantly, what it is not: it does not create new
 * governance decisions, does not certify compliance, does not provide legal
 * advice, does not certify invoice validity or customer acceptance, and
 * does not indicate production execution.
 */
export function createPMFreakDemoNarrativeExportDescriptor(): PMFreakDemoNarrativeExportDescriptor {
  const descriptor: PMFreakDemoNarrativeExportDescriptor = {
    exportPackId: PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_ID,
    exportPackName: PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_NAME,
    version: 'v1',
    purpose: PMFREAK_DEMO_NARRATIVE_EXPORT_PURPOSE,
    sourceViewId: PMFREAK_DEMO_NARRATIVE_EXPORT_SOURCE_VIEW_ID,
    demoOnly: true,
    productionIntegration: false,
    safeLabels: PMFREAK_DEMO_NARRATIVE_SAFE_LABELS,
    disclaimers: PMFREAK_DEMO_NARRATIVE_DISCLAIMERS,
  };

  assertNoPMFreakDemoNarrativeOverclaim(descriptor);
  return descriptor;
}
