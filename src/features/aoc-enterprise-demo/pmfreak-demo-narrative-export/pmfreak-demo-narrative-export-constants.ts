import { PMFREAK_DEMO_CONTROL_PLANE_PRIMARY_SCENARIO_ID, PMFREAK_DEMO_CONTROL_PLANE_VIEW_ID } from '../pmfreak-demo-control-plane-view/index.js';

/**
 * Soberanía PMFreak Demo Narrative Export Pack v1 -- shared identifiers.
 *
 * This module carries no real PMFreak project, customer, or billing data.
 * Every id below is a deterministic, opaque demo identifier, never a claim
 * about a real PMFreak deployment. See this module's README for the full
 * safety framing.
 */

export const PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_ID = 'aoc.demo.pmfreak.narrative_export.v1' as const;

export const PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_NAME = 'Soberanía PMFreak Demo Narrative Export Pack v1' as const;

export const PMFREAK_DEMO_NARRATIVE_EXPORT_PACK_VERSION = '1.0.0' as const;

/**
 * The Control Plane view id this pack's exports are always built from --
 * read directly from the Control Plane View Pack's own constant, never
 * redeclared, so it can never drift from the view it names.
 */
export const PMFREAK_DEMO_NARRATIVE_EXPORT_SOURCE_VIEW_ID = PMFREAK_DEMO_CONTROL_PLANE_VIEW_ID;

/**
 * The scenario this pack treats as its primary walkthrough demo -- read
 * directly from the Control Plane View Pack's own constant (which itself
 * reads it from the Project Governance Scenario Pack), never redeclared.
 */
export const PMFREAK_DEMO_NARRATIVE_EXPORT_PRIMARY_SCENARIO_ID = PMFREAK_DEMO_CONTROL_PLANE_PRIMARY_SCENARIO_ID;

/** Stable ids for each narrative export section, in the section's canonical rendering order. */
export const PMFREAK_DEMO_NARRATIVE_SECTION_IDS = {
  executiveSummary: 'executive_summary',
  agentAction: 'agent_action',
  governanceChecks: 'governance_checks',
  evidence: 'evidence',
  approvals: 'approvals',
  trace: 'trace',
  policyReferences: 'policy_references',
  safeInterpretation: 'safe_interpretation',
  nextSteps: 'next_steps',
  exportMetadata: 'export_metadata',
} as const;

/**
 * Safe, natural-language narrative labels for this export layer. Every
 * label is checked by this module's own tests against
 * `evaluatePMFreakDemoNarrativeClaimSafety` -- none claims full trust,
 * production authorization, invoice validity, customer acceptance
 * certification, contractual compliance, or Costa Rica legal compliance.
 */
export const PMFREAK_DEMO_NARRATIVE_SAFE_LABELS = [
  'Soberanía-governed agent',
  'Demo narrative export',
  'Not production integration',
  'Not compliance certification',
  'Evidence required',
  'Approval required',
  'No invoice validity claimed',
  'No customer acceptance certification',
  'Audit-ready demo export',
  'Costa Rica jurisdiction context referenced',
] as const;

/** Purpose statement carried by the narrative export descriptor. */
export const PMFREAK_DEMO_NARRATIVE_EXPORT_PURPOSE =
  'This export is a deterministic PMFreak demo narrative. It explains Soberanía Enterprise demo decisions. It does not create new governance decisions.';

/**
 * Canonical, claim-safe narrative export disclaimers. Reused verbatim by the
 * descriptor, every built narrative export, and the safe-interpretation
 * section -- never re-worded per call site, so the same disclaimer text can
 * be relied on everywhere it appears.
 */
export const PMFREAK_DEMO_NARRATIVE_DISCLAIMERS = [
  'This export does not certify invoice validity.',
  'This export does not certify customer acceptance.',
  'This export does not provide legal advice.',
  'This export does not certify compliance.',
  'This export does not indicate production execution.',
] as const;
