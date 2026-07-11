import { isWellFormedDigest } from '../governance-store/digest.js';
import { verifyEventChain } from './events.js';
import { reconstructAgentPassportFromEvents } from './reconstruction.js';
import { isAgentPassportError } from './errors.js';
import {
  AOC_AGENT_PASSPORT_RUNTIME_VERSION,
  type AgentPassport,
  type AgentPassportEvent,
  type AgentPassportVerificationMode,
  type AgentPassportVerificationResult,
  type PassportVerificationFailure,
} from './contracts.js';

/**
 * Optional referential lookups (mission section 45's `REFERENTIAL` /
 * `FULL_INTERNAL` modes). Supplied by `service.ts`, which has access to the
 * Governance Store and Evidence Bundle Store; `verification.ts` itself
 * never imports either directly, keeping this module a pure function of
 * its inputs.
 */
export interface PassportReferenceCheckers {
  readonly governanceRecordExists?: (evaluationId: string, organizationId: string) => Promise<boolean>;
  readonly evidenceBundleExists?: (bundleId: string, organizationId: string) => Promise<boolean>;
}

export interface VerifyAgentPassportInput {
  readonly passportId: string;
  readonly events: readonly AgentPassportEvent[];
  readonly mode: AgentPassportVerificationMode;
  readonly now: () => string;
  readonly referenceCheckers?: PassportReferenceCheckers;
}

function checkReferenceShape(failures: PassportVerificationFailure[], label: string, ok: boolean, message: string): void {
  if (!ok) failures.push({ check: label, message });
}

export async function verifyAgentPassport(input: VerifyAgentPassportInput): Promise<AgentPassportVerificationResult> {
  const { passportId, events, mode, now } = input;
  const failures: PassportVerificationFailure[] = [];

  const chainResult = verifyEventChain(events);
  for (const message of chainResult.failures) failures.push({ check: 'eventChain', message });

  let passport: AgentPassport | undefined;
  let lifecycleValid = true;
  try {
    passport = reconstructAgentPassportFromEvents(passportId, events);
  } catch (error) {
    lifecycleValid = false;
    failures.push({ check: 'lifecycle', message: isAgentPassportError(error) ? error.message : 'Passport could not be reconstructed from its event history.' });
  }

  const identityBindingValid = passport !== undefined && passport.subject.agentId.length > 0 && passport.identity.agentId === passport.subject.agentId;
  checkReferenceShape(failures, 'identityBinding', identityBindingValid, 'Passport subject/identity binding is missing or inconsistent.');

  const organizationBindingValid =
    passport !== undefined &&
    passport.organization.organizationId.length > 0 &&
    events.every((event) => event.organizationId === passport?.organization.organizationId);
  checkReferenceShape(failures, 'organizationBinding', organizationBindingValid, 'Passport organization binding is missing, empty, or inconsistent with an event outside that organization.');

  const versionValid = passport !== undefined && passport.provenance.passportRuntimeVersion === AOC_AGENT_PASSPORT_RUNTIME_VERSION;
  checkReferenceShape(failures, 'version', versionValid, `Passport was written by an unsupported passportRuntimeVersion (expected '${AOC_AGENT_PASSPORT_RUNTIME_VERSION}').`);

  const capabilityIds = new Set<string>();
  let capabilitiesValid = true;
  for (const capability of passport?.capabilities ?? []) {
    if (capability.capabilityId.length === 0) {
      capabilitiesValid = false;
      continue;
    }
    if (capabilityIds.has(capability.capabilityId)) capabilitiesValid = false;
    capabilityIds.add(capability.capabilityId);
  }
  checkReferenceShape(failures, 'capabilities', capabilitiesValid, 'One or more capability references are malformed or duplicated.');

  const authoritiesValid = (passport?.authorities ?? []).every((authority) => authority.authorityId.length > 0 && authority.issuedBy.length > 0);
  checkReferenceShape(failures, 'authorities', authoritiesValid, 'One or more authority references are malformed.');

  const delegationsValid = (passport?.delegations ?? []).every((delegation) => delegation.delegationId.length > 0 && delegation.delegatorId.length > 0 && delegation.delegateId.length > 0);
  checkReferenceShape(failures, 'delegations', delegationsValid, 'One or more delegation references are malformed.');

  const governanceStructuralValid = (passport?.governanceReferences ?? []).every(
    (reference) => reference.evaluationId.length > 0 && reference.decisionId.length > 0 && reference.requestId.length > 0 && isWellFormedDigest(reference.governanceRecordDigest),
  );
  let governanceReferencesValid = governanceStructuralValid;
  if (governanceStructuralValid && mode !== 'STRUCTURAL' && input.referenceCheckers?.governanceRecordExists !== undefined && passport !== undefined) {
    for (const reference of passport.governanceReferences) {
      const exists = await input.referenceCheckers.governanceRecordExists(reference.evaluationId, passport.organization.organizationId);
      if (!exists) {
        governanceReferencesValid = false;
        failures.push({ check: 'governanceReferences', message: `Referenced Governance Record '${reference.evaluationId}' was not found within the Passport's organization scope.` });
      }
    }
  }
  checkReferenceShape(failures, 'governanceReferences', governanceStructuralValid, 'One or more Governance References are structurally invalid.');

  const evidenceStructuralValid = (passport?.evidenceReferences ?? []).every((reference) => reference.bundleId.length > 0 && isWellFormedDigest(reference.bundleDigest));
  let evidenceReferencesValid = evidenceStructuralValid;
  if (evidenceStructuralValid && mode !== 'STRUCTURAL' && input.referenceCheckers?.evidenceBundleExists !== undefined && passport !== undefined) {
    for (const reference of passport.evidenceReferences) {
      const exists = await input.referenceCheckers.evidenceBundleExists(reference.bundleId, passport.organization.organizationId);
      if (!exists) {
        evidenceReferencesValid = false;
        failures.push({ check: 'evidenceReferences', message: `Referenced Evidence Bundle '${reference.bundleId}' was not found within the Passport's organization scope.` });
      }
    }
  }
  checkReferenceShape(failures, 'evidenceReferences', evidenceStructuralValid, 'One or more Evidence References are structurally invalid.');

  const checks = {
    eventChain: chainResult.valid,
    lifecycle: lifecycleValid,
    identityBinding: identityBindingValid,
    organizationBinding: organizationBindingValid,
    capabilities: capabilitiesValid,
    authorities: authoritiesValid,
    delegations: delegationsValid,
    governanceReferences: governanceReferencesValid,
    evidenceReferences: evidenceReferencesValid,
    version: versionValid,
  };

  const valid = Object.values(checks).every(Boolean);

  return {
    passportId,
    valid,
    status: passport?.status ?? 'draft',
    mode,
    checks,
    failures,
    verifiedAt: now(),
  };
}
