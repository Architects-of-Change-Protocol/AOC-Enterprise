import type { GovernanceRecord } from '../governance-store/contracts.js';
import { computeDigest } from '../governance-store/digest.js';
import { EVIDENCE_BUNDLE_SCHEMA_VERSION, type EvidenceBundle, type EvidenceFieldKey, type EvidenceIntegrityFailure, type EvidenceVerificationResult } from './contracts.js';
import { bundleDigestInput, verificationDigestInput } from './projector.js';
import { findDisclosurePolicyById } from './disclosure-policies.js';

/**
 * The Evidence Verifier (mission section "Verification"). Answers, without
 * ever trusting a stored digest at face value:
 *
 * - Does this Bundle's content match its own claimed digest? (`bundleDigest`)
 * - Does its digest binding hold together? (`verificationDigest`)
 * - Does it match the Governance Record it claims to project, when one is
 *   supplied? (`recordDigest`)
 * - Does its disclosure policy match a real, registered policy? (`policyMatch`)
 * - Is it missing any field its own policy requires? (`complete`)
 * - Is its `bundleVersion` one this build understands? (`versionSupported`)
 */

function fieldValue(bundle: EvidenceBundle, field: EvidenceFieldKey): unknown {
  switch (field) {
    case 'source.organizationId':
      return bundle.source.organizationId;
    case 'subject.actionType':
      return bundle.subject.actionType;
    case 'subject.resourceScope':
      return bundle.subject.resourceScope;
    case 'subject.description':
      return bundle.subject.description;
    case 'evidence.status':
      return bundle.evidence.status;
    case 'evidence.summary':
      return bundle.evidence.summary;
    case 'evidence.reasonCodes':
      return bundle.evidence.reasonCodes;
    case 'evidence.trace':
      return bundle.evidence.trace;
    case 'evidence.events':
      return bundle.evidence.events;
    case 'evidence.metadata':
      return bundle.evidence.metadata;
  }
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function verifyEvidenceBundle(bundle: EvidenceBundle, options: { readonly record?: GovernanceRecord; readonly now: () => string }): EvidenceVerificationResult {
  const failures: EvidenceIntegrityFailure[] = [];

  // -- bundle content integrity --
  const { integrity, ...withoutIntegrity } = bundle;
  const recomputedBundleDigest = computeDigest(bundleDigestInput(withoutIntegrity));
  const bundleDigestOk = recomputedBundleDigest === integrity.bundleDigest;
  if (!bundleDigestOk) {
    failures.push({ check: 'bundleDigest', message: 'Recomputed bundle digest does not match integrity.bundleDigest; the Bundle content was modified after it was built.' });
  }

  // -- digest binding (bundleDigest + recordDigest + policy identity) --
  const recomputedVerificationDigest = computeDigest(
    verificationDigestInput({
      bundleDigest: recomputedBundleDigest,
      recordDigest: integrity.recordDigest,
      policyId: bundle.disclosure.policyId,
      policyVersion: bundle.disclosure.policyVersion,
      bundleVersion: bundle.bundleVersion,
    }),
  );
  const verificationDigestOk = recomputedVerificationDigest === integrity.verificationDigest;
  if (!verificationDigestOk) {
    failures.push({ check: 'verificationDigest', message: 'Recomputed verification digest does not match integrity.verificationDigest; the digest binding between bundle, record, and policy is broken.' });
  }

  // -- match against the source Governance Record, when supplied --
  let recordDigestOk: boolean | undefined;
  if (options.record !== undefined) {
    recordDigestOk = options.record.integrity.aggregateDigest === integrity.recordDigest;
    if (!recordDigestOk) {
      failures.push({ check: 'recordDigest', message: 'integrity.recordDigest does not match the aggregateDigest of the supplied Governance Record.' });
    }
    if (options.record.evaluation.evaluationId !== bundle.source.evaluationId) {
      recordDigestOk = false;
      failures.push({ check: 'recordDigest', message: 'The supplied Governance Record is not the one this Bundle claims as its source (evaluationId mismatch).' });
    }
  }

  // -- disclosure policy match --
  const registeredPolicy = findDisclosurePolicyById(bundle.disclosure.policyId);
  let policyMatchOk = registeredPolicy !== undefined;
  if (registeredPolicy === undefined) {
    failures.push({ check: 'policyMatch', message: `disclosure.policyId '${bundle.disclosure.policyId}' does not name a registered DisclosurePolicy.` });
  } else {
    if (registeredPolicy.level !== bundle.disclosure.level) {
      policyMatchOk = false;
      failures.push({ check: 'policyMatch', message: `disclosure.level '${bundle.disclosure.level}' does not match the registered level '${registeredPolicy.level}' for policy '${bundle.disclosure.policyId}'.` });
    }
    if (registeredPolicy.version !== bundle.disclosure.policyVersion) {
      policyMatchOk = false;
      failures.push({ check: 'policyMatch', message: `disclosure.policyVersion '${bundle.disclosure.policyVersion}' does not match the registered version '${registeredPolicy.version}'.` });
    }
    if (!sameStringArray(registeredPolicy.visibleFields, bundle.disclosure.visibleFields) ||
      !sameStringArray(registeredPolicy.hiddenFields, bundle.disclosure.hiddenFields) ||
      !sameStringArray(registeredPolicy.redactedFields, bundle.disclosure.redactedFields)) {
      policyMatchOk = false;
      failures.push({ check: 'policyMatch', message: `The Bundle's disclosed field classification does not match the registered policy '${bundle.disclosure.policyId}'.` });
    }
  }

  // -- completeness against the policy's own required fields --
  let completeOk = true;
  if (registeredPolicy !== undefined) {
    for (const field of registeredPolicy.requiredFields) {
      if (fieldValue(bundle, field) === undefined) {
        completeOk = false;
        failures.push({ check: 'complete', message: `Required field '${field}' (per disclosure policy '${bundle.disclosure.policyId}') is missing from this Bundle.` });
      }
    }
  } else {
    completeOk = false;
  }

  // -- version --
  const versionSupportedOk = bundle.bundleVersion === EVIDENCE_BUNDLE_SCHEMA_VERSION;
  if (!versionSupportedOk) {
    failures.push({ check: 'versionSupported', message: `bundleVersion '${bundle.bundleVersion}' is not supported by this build (expected '${EVIDENCE_BUNDLE_SCHEMA_VERSION}').` });
  }

  return {
    bundleId: bundle.bundleId,
    valid: failures.length === 0,
    checks: {
      bundleDigest: bundleDigestOk,
      verificationDigest: verificationDigestOk,
      ...(recordDigestOk !== undefined ? { recordDigest: recordDigestOk } : {}),
      policyMatch: policyMatchOk,
      versionSupported: versionSupportedOk,
      complete: completeOk,
    },
    verifiedAt: options.now(),
    failures,
  };
}
