import type { EvidenceItem } from '../../features/recognition-runtime/domain/evidence.js';
import type { AocRecognitionRuntime } from '../../features/recognition-runtime/runtime/aoc-recognition-runtime.js';
import type { RecognitionProvider, RecognitionVerificationInput, RecognitionVerificationResult } from '../../kernel/index.js';
import type { KernelAuthorityRecord, ProvisionCapabilityTokenInput, ProvisionPassportInput } from './contracts.js';

/**
 * Resolved recognition credentials for one request: which durably-provisioned
 * passport and capability token this actor holds that bear on the action being
 * asked about.
 */
export interface ResolvedRecognitionCredentials {
  readonly passportId?: string;
  readonly capabilityTokenId?: string;
}

/**
 * Selects the passport and capability token a request is evaluated against,
 * from the records the operator provisioned for **this subject actor in this
 * trust domain** and from nowhere else.
 *
 * Why this exists at all: `AocKernel`'s request contract deliberately does not
 * carry Recognition Runtime's own primitive ids, and requiring a downstream
 * application to supply them would force it to maintain a mirror of Frontera's
 * credential table -- the exact coupling this increment exists to remove.
 *
 * Why it cannot widen authority. It is a *lookup*, not a verdict:
 *
 *   * Every candidate is filtered on `subjectActorId === request actor` and
 *     `trustDomainId === request trust domain` before anything else is
 *     considered, so no selection can reach across actors or trust domains --
 *     structurally, not merely by policy.
 *   * Selecting a credential asserts nothing about its validity. The unmodified
 *     policy chain still re-checks subject binding, trust-domain binding,
 *     revocation, expiry, suspension, prohibited actions, action grant,
 *     resource scope, delegation depth, evidence and approval against it, and
 *     the Authority Graph still has to prove the chain behind it.
 *   * When several credentials could apply, a usable one -- neither revoked
 *     nor expired at evaluation time -- is preferred, because a live grant is a
 *     real grant and denying an actor who genuinely holds one would be a false
 *     denial. Expiry is checked against the payload rather than the record's
 *     status: the store only knows whether a credential was revoked, so a
 *     long-expired token is still `active` to it, and selecting on status
 *     alone would let an expired credential that happens to sort first shadow
 *     a valid one. When *only* a revoked or expired credential covers the
 *     action it is still the one presented, so the denial says
 *     `CAPABILITY_TOKEN_REVOKED` or `CAPABILITY_TOKEN_EXPIRED` rather than the
 *     vaguer `CAPABILITY_TOKEN_REQUIRED`.
 *   * When nothing covers the action, nothing is presented and the request
 *     denies for want of a capability token. Absence is never resolved into a
 *     grant.
 *
 * A caller that *does* know the ids may still pass them explicitly; an
 * explicit id is honoured verbatim, exactly as `bridgeRecognitionRuntime` has
 * always honoured it.
 */
export function resolveRecognitionCredentials(
  records: readonly KernelAuthorityRecord[],
  request: {
    readonly actorId: string;
    readonly trustDomainId: string;
    readonly action: string;
    readonly resourceScope: string;
    /** Evaluation time, so expiry participates in selection. Without it an expired credential that happens to sort first would be chosen over a live one. */
    readonly now: string;
  },
): ResolvedRecognitionCredentials {
  const passports = records.filter(
    (record): record is KernelAuthorityRecord =>
      record.entityKind === 'passport' &&
      (record.payload as unknown as ProvisionPassportInput).subjectActorId === request.actorId &&
      (record.payload as unknown as ProvisionPassportInput).trustDomainId === request.trustDomainId,
  );
  // `status` is the *store's* view -- provisioned or revoked -- and says
  // nothing about expiry, which lives in the payload. A credential is only
  // usable if it is both.
  const usable = (record: KernelAuthorityRecord, expiresAt: string | undefined): boolean =>
    record.status === 'active' && (expiresAt === undefined || expiresAt > request.now);

  const passport = passports.find((record) => usable(record, (record.payload as unknown as ProvisionPassportInput).expiresAt)) ?? passports[0];

  const tokens = records.filter(
    (record): record is KernelAuthorityRecord =>
      record.entityKind === 'capability-token' &&
      (record.payload as unknown as ProvisionCapabilityTokenInput).subjectActorId === request.actorId &&
      (record.payload as unknown as ProvisionCapabilityTokenInput).trustDomainId === request.trustDomainId,
  );

  const covering = tokens.filter((record) => {
    const token = record.payload as unknown as ProvisionCapabilityTokenInput;
    const grantsAction = token.actions.includes(request.action);
    const inScope = token.resourceScopes.some((scope) => request.resourceScope === scope || request.resourceScope.startsWith(`${scope}:`));
    return grantsAction && inScope;
  });
  const token = covering.find((record) => usable(record, (record.payload as unknown as ProvisionCapabilityTokenInput).expiresAt)) ?? covering[0];

  return {
    ...(passport !== undefined ? { passportId: passport.entityId } : {}),
    ...(token !== undefined ? { capabilityTokenId: token.entityId } : {}),
  };
}

export interface DurableRecognitionBridgeOptions {
  /** The organization whose authority world `recognitionRuntime` was hydrated from. */
  readonly organizationId: string;
  /** Evaluation clock, so credential resolution can tell a live credential from an expired one. */
  readonly now: () => string;
  /** Live view of the hydrated world. Read through a getter so a re-hydration after provisioning is picked up without rebuilding the bridge. */
  readonly world: () => { readonly recognitionRuntime: AocRecognitionRuntime; readonly records: readonly KernelAuthorityRecord[] };
}

/**
 * Bridges a durably-hydrated Recognition Runtime onto the Kernel's
 * `RecognitionProvider` port.
 *
 * Read-only with respect to authority source-of-truth state, and that is the
 * point of the whole increment: nothing on this path can register an actor,
 * mint a token, widen a scope, or clear a revocation. It holds no operator
 * context and no reference to the store's write surface, so an application's
 * evaluation request is a question about facts and can never be a command that
 * creates them.
 *
 * Organization isolation is enforced here rather than assumed. The hydrated
 * world contains exactly one organization's records; a request that names a
 * *different* organization is denied outright rather than silently answered
 * out of the wrong world -- which is what would otherwise happen, since the
 * actor ids of two organizations can legitimately collide.
 */
export function createDurableRecognitionProvider(options: DurableRecognitionBridgeOptions): RecognitionProvider {
  const { organizationId } = options;

  return {
    verifyAction(input: RecognitionVerificationInput): RecognitionVerificationResult {
      const metadata = input.metadata ?? {};
      const requestedOrganizationId = typeof metadata.organizationId === 'string' ? metadata.organizationId : undefined;

      // The organization must be stated, and must match. An omitted
      // organization is not an implicit match for the configured one: two
      // organizations may legitimately use the same actor ids, so "unstated"
      // and "this one" are different claims and only one of them is safe to
      // act on. It also matters upstream -- the Enterprise Host's
      // organization-scoped API keys reject a *mismatch*, so treating absence
      // as a match would let a caller skip that check entirely by simply not
      // naming an organization.
      //
      // `metadata.organizationId` is authoritative here because the Kernel's
      // request adapter derives it solely from the typed `organization` field
      // and strips any caller-supplied value of that name from the free-form
      // context bag (`kernel/orchestration/request-adapter.ts`).
      if (requestedOrganizationId === undefined) {
        return {
          id: `recognition-organization-missing-${input.actionRequestId ?? input.actorId}`,
          type: 'unrecognized_actor',
          allowed: false,
          recognized: false,
          reasonCode: 'RECOGNITION_ORGANIZATION_SCOPE_REQUIRED',
          reason: `This decision service is provisioned for organization '${organizationId}'; a request must name the organization it is made in.`,
          ...(input.actionRequestId !== undefined ? { actionRequestId: input.actionRequestId } : {}),
        };
      }

      if (requestedOrganizationId !== organizationId) {
        return {
          id: `recognition-organization-scope-${input.actionRequestId ?? input.actorId}`,
          type: 'unrecognized_actor',
          allowed: false,
          recognized: false,
          reasonCode: 'RECOGNITION_ORGANIZATION_SCOPE_VIOLATION',
          reason: `This decision service is provisioned for organization '${organizationId}' and holds no authority state for organization '${requestedOrganizationId}'.`,
          ...(input.actionRequestId !== undefined ? { actionRequestId: input.actionRequestId } : {}),
        };
      }

      const { recognitionRuntime, records } = options.world();

      const explicitPassportId = typeof metadata.passportId === 'string' ? metadata.passportId : undefined;
      const explicitCapabilityTokenId = typeof metadata.capabilityTokenId === 'string' ? metadata.capabilityTokenId : undefined;
      const evidence = Array.isArray(metadata.evidence) ? (metadata.evidence as readonly EvidenceItem[]) : undefined;

      const resolved = resolveRecognitionCredentials(records, {
        actorId: input.actorId,
        trustDomainId: input.trustDomainId,
        action: input.action,
        resourceScope: input.resourceScope,
        now: options.now(),
      });
      const passportId = explicitPassportId ?? resolved.passportId;
      const capabilityTokenId = explicitCapabilityTokenId ?? resolved.capabilityTokenId;

      const request = recognitionRuntime.buildActionRequest({
        actorId: input.actorId,
        trustDomainId: input.trustDomainId,
        action: input.action,
        resource: input.resourceScope,
        ...(input.actionRequestId !== undefined ? { id: input.actionRequestId } : {}),
        ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
        ...(passportId !== undefined ? { passportId } : {}),
        ...(capabilityTokenId !== undefined ? { capabilityTokenId } : {}),
        ...(evidence !== undefined ? { evidence } : {}),
        ...(input.approvalProofId !== undefined ? { approvalProofId: input.approvalProofId } : {}),
        ...(input.approvalRequestId !== undefined ? { approvalRequestId: input.approvalRequestId } : {}),
        ...(input.approvalDecisionId !== undefined ? { approvalDecisionId: input.approvalDecisionId } : {}),
      });
      const decision = recognitionRuntime.submitActionRequest(request);

      return {
        id: decision.id,
        type: decision.type,
        allowed: decision.type === 'allow',
        recognized: decision.recognized,
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        actionRequestId: request.id,
        ...(decision.authorityDecisionId !== undefined ? { authorityDecisionId: decision.authorityDecisionId } : {}),
        ...(decision.authorityProofId !== undefined ? { authorityProofId: decision.authorityProofId } : {}),
        ...(decision.approvalRequestId !== undefined ? { approvalRequestId: decision.approvalRequestId } : {}),
        ...(decision.approvalDecisionId !== undefined ? { approvalDecisionId: decision.approvalDecisionId } : {}),
        ...(decision.approvalProofId !== undefined ? { approvalProofId: decision.approvalProofId } : {}),
      };
    },
  };
}
