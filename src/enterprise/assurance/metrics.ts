import type { AssuranceEvidenceReference, AssuranceEvidenceResolution } from './contracts.js';

/**
 * Deterministic metric derivation: the ONLY source of values for
 * `boolean`/`threshold` control criteria. Every metric below is computed
 * from *accepted* evidence references (their bounded `metadata`
 * projections), never from documentation, self-declarations, module names,
 * or model output -- the Assurance Equation's "Verified Evidence" input
 * (mission: no control passes merely because a UI displays it).
 *
 * A metric that cannot be derived from accepted evidence is simply absent
 * from the map, which the Control Evaluator surfaces as `unknown` -- never
 * silently `false`/`0`.
 */

function acceptedOfType(resolutions: readonly AssuranceEvidenceResolution[], evidenceType: string): AssuranceEvidenceReference[] {
  return resolutions.flatMap((resolution) => resolution.acceptedEvidence.filter((reference) => reference.evidenceType === evidenceType));
}

function metadataValue(reference: AssuranceEvidenceReference, key: string): unknown {
  return reference.metadata?.[key];
}

export function deriveAssuranceMetrics(resolutions: readonly AssuranceEvidenceResolution[]): Readonly<Record<string, number | boolean>> {
  const metrics: Record<string, number | boolean> = {};

  // -- Governance Record metrics ---------------------------------------------
  const governanceRecords = acceptedOfType(resolutions, 'governance_record');
  if (governanceRecords.length > 0) {
    metrics['governance.records.count'] = governanceRecords.length;
    metrics['governance.records.all_verified'] = governanceRecords.every((reference) => reference.verified);
    metrics['governance.records.denied_count'] = governanceRecords.filter((reference) => metadataValue(reference, 'status') === 'denied').length;
    metrics['governance.records.indeterminate_count'] = governanceRecords.filter((reference) => metadataValue(reference, 'status') === 'indeterminate').length;
  }

  // -- Evidence Bundle metrics -------------------------------------------------
  const bundles = acceptedOfType(resolutions, 'evidence_bundle');
  if (bundles.length > 0) {
    metrics['evidence.bundles.count'] = bundles.length;
    metrics['evidence.bundles.all_verified'] = bundles.every((reference) => reference.verified);
  }

  // -- Agent Passport metrics ----------------------------------------------------
  const passports = acceptedOfType(resolutions, 'agent_passport');
  const passport = passports[0];
  if (passport !== undefined) {
    metrics['passport.present'] = true;
    metrics['passport.verified'] = passport.verified;
    metrics['passport.active'] = metadataValue(passport, 'status') === 'active';
    const chainValid = metadataValue(passport, 'chainValid');
    if (typeof chainValid === 'boolean') metrics['passport.chain_valid'] = chainValid;
    const lifecycleValid = metadataValue(passport, 'lifecycleValid');
    if (typeof lifecycleValid === 'boolean') metrics['passport.lifecycle_valid'] = lifecycleValid;
    const status = metadataValue(passport, 'status');
    if (typeof status === 'string') metrics['passport.revoked'] = status === 'revoked';
    const governanceReferenceCount = metadataValue(passport, 'governanceReferenceCount');
    if (typeof governanceReferenceCount === 'number') metrics['passport.governance_reference_count'] = governanceReferenceCount;
    const evidenceReferenceCount = metadataValue(passport, 'evidenceReferenceCount');
    if (typeof evidenceReferenceCount === 'number') metrics['passport.evidence_reference_count'] = evidenceReferenceCount;
  }

  // -- Enterprise / module health metrics --------------------------------------------
  const enterpriseHealth = acceptedOfType(resolutions, 'enterprise_health')[0];
  if (enterpriseHealth !== undefined) {
    const ready = metadataValue(enterpriseHealth, 'ready');
    if (typeof ready === 'boolean') metrics['enterprise.ready'] = ready;
  }
  const moduleHealth = acceptedOfType(resolutions, 'module_health');
  if (moduleHealth.length > 0) {
    metrics['modules.count'] = moduleHealth.length;
    metrics['modules.unhealthy_count'] = moduleHealth.filter((reference) => metadataValue(reference, 'status') === 'unhealthy').length;
  }

  // -- Manual attestation metrics: an attestation may assert one named metric.
  const attestations = acceptedOfType(resolutions, 'control_attestation');
  for (const attestation of attestations) {
    const metricName = metadataValue(attestation, 'metric');
    const metricValue = metadataValue(attestation, 'value');
    if (typeof metricName === 'string' && metricName.length > 0 && (typeof metricValue === 'boolean' || typeof metricValue === 'number')) {
      metrics[metricName] = metricValue;
    }
  }

  return metrics;
}
