import { EncumbranceReleaseGovernanceError } from './errors.js';

/**
 * The provider-neutral seam a governed release crosses on its way to whatever
 * actually ends the arrangement.
 *
 * This port is the whole of the answer to "why can a caller not simply assert
 * that the collateral was released?". Everything above it — request, authority,
 * policy, approvals, obligations, mandate — establishes that a discharge is
 * *permitted*. None of it establishes that a discharge *happened*, and AOC has
 * no way to know that on its own. So the service does not decide it: it calls
 * this port and records what the port reported, and only a
 * `'confirmed_success'` reported by a port invocation the service made itself
 * can become a `'governed-execution'` release basis.
 *
 * ## What an implementation may and may not decide
 *
 * An adapter answers exactly one question: **did the release happen?** It is
 * emphatically not asked, and must never answer, "should this be released?" —
 * that is settled before it is called, by the Kernel and the deployment's own
 * policy. An adapter that refuses a release it disagrees with is reporting a
 * failure to perform, not withholding an authorization.
 *
 * ## What a confirmation means, and what it does not
 *
 * `'confirmed_success'` means: *the configured execution system reported that
 * it released the arrangement this constraint records.* It does not mean, and
 * AOC never claims, that a statutory discharge occurred, that a security
 * interest was extinguished, that a lien registry anywhere was updated, that a
 * creditor was paid, or that a debt was satisfied. Those are facts about the
 * world that this deployment observes through one configured system, and the
 * bound language here is deliberate.
 *
 * ## Why there is no production provider in this repository
 *
 * There is no bank API, no registry client, no custodian integration and no
 * chain adapter here, because inventing one would be inventing a counterparty.
 * A deployment that has a real discharge system implements this interface
 * against it; the adapters below are the deterministic ones the module's own
 * suite runs against, and the seam is what makes both interchangeable. Credential
 * and endpoint handling belongs to an adapter, exactly as it does for
 * `ContentStoragePort` — never to this contract, which carries neither.
 */
export interface EncumbranceReleaseExecutionRequest {
  /** The release authorization this attempt runs under. */
  readonly mandateId: string;
  readonly organizationId: string;
  /** The constraint to be released, by canonical Enterprise reference. */
  readonly encumbranceRef: string;
  readonly resource: { readonly kind: string; readonly id: string };
  /** Read from the stored constraint, never from a caller: which right, how much of it, and which arrangement created it. Carried so an adapter can address the right external arrangement, not so it can re-decide anything. */
  readonly governedRight: string;
  readonly encumberedScope: Readonly<Record<string, unknown>>;
  readonly sourceAction: string;
  readonly sourceMandateRef: string;
  readonly sourceExecutionRef: string;
  /**
   * The key an adapter should make its own external call idempotent on.
   *
   * Derived from the release mandate, which authorizes exactly one discharge,
   * so a retry after an indeterminate outcome presents the same key and a
   * conforming adapter performs at most one external release however many
   * times AOC asks.
   */
  readonly idempotencyKey: string;
  readonly attemptedAt: string;
  readonly correlationId: string;
}

/**
 * What an executor reported. Three outcomes, and the third one is why this is
 * a union rather than a boolean.
 *
 * `'indeterminate'` is a first-class answer, not an error: a timeout, an
 * ambiguous provider reply, or a call whose result was never observed. It
 * leaves the constraint standing, which blocks capacity that may in fact be
 * free — deliberately the conservative direction, because the other error
 * frees capacity for an arrangement that may still exist.
 */
export type EncumbranceReleaseExecutionOutcome =
  | {
      readonly kind: 'confirmed_success';
      /** Echoed back so a reply meant for a different constraint can be caught rather than applied. A mismatch is recorded as a definitive failure and terminalizes nothing. */
      readonly encumbranceRef: string;
      readonly confirmedAt: string;
      /** Opaque provider reference for whatever the executor produced. Preserved verbatim; never parsed, and never read as proof of anything beyond this contract. */
      readonly providerReleaseReference?: string;
    }
  | {
      readonly kind: 'confirmed_failure';
      readonly failureCode: string;
      readonly failureReason?: string;
    }
  | {
      readonly kind: 'indeterminate';
      readonly reason: string;
    };

export interface EncumbranceReleaseExecutorPort {
  /** Opaque provider label recorded on the evidence. Never a credential, an endpoint or a client. */
  readonly providerSystem: string;
  executeRelease(request: EncumbranceReleaseExecutionRequest): Promise<EncumbranceReleaseExecutionOutcome>;
}

// ---------------------------------------------------------------------------
// Deterministic adapters.
//
// The module's own suite runs against these and never against a network. What
// they establish is not that a particular provider works — it is that the
// *service* cannot self-assert a release: swap in the failing adapter and the
// constraint stays active however authorized the request was, swap in the
// indeterminate one and it stays active too.
// ---------------------------------------------------------------------------

export interface InMemoryEncumbranceReleaseExecutorOptions {
  readonly providerSystem?: string;
  readonly now?: () => string;
  /**
   * Reports success for a constraint other than the one asked about, so the
   * target-mismatch defence can be exercised. A real provider should never do
   * this; the point is that AOC does not rely on it not doing it.
   */
  readonly respondForEncumbranceRef?: string;
}

/**
 * An executor that confirms every release it is asked for, once per
 * idempotency key.
 *
 * Deliberately exposes `attempts` and `releasedKeys`: a test asserts directly
 * on what actually crossed the boundary — that a revoked mandate never reached
 * the executor at all, and that a retried release produced one external call
 * rather than two. No production adapter could safely offer that, which is
 * exactly why it lives here rather than on the port.
 */
export interface InMemoryEncumbranceReleaseExecutorPort extends EncumbranceReleaseExecutorPort {
  /** Every request this port received, in order. Inspection only; never read by `service.ts`. */
  readonly attempts: readonly EncumbranceReleaseExecutionRequest[];
  /** The idempotency keys it has already released under. */
  releasedKeys(): readonly string[];
}

export function createInMemoryEncumbranceReleaseExecutorPort(
  options: InMemoryEncumbranceReleaseExecutorOptions = {},
): InMemoryEncumbranceReleaseExecutorPort {
  const providerSystem = options.providerSystem ?? 'in-memory-release-executor';
  const now = options.now ?? (() => new Date().toISOString());
  const attempts: EncumbranceReleaseExecutionRequest[] = [];
  const released = new Map<string, string>();
  let counter = 0;

  return {
    providerSystem,
    attempts,
    releasedKeys: () => [...released.keys()],
    async executeRelease(request: EncumbranceReleaseExecutionRequest): Promise<EncumbranceReleaseExecutionOutcome> {
      attempts.push(request);
      // Idempotent on the key the service supplied: asking twice performs one
      // external release and reports the same reference, which is precisely the
      // behaviour a retry after an indeterminate outcome relies on.
      const existing = released.get(request.idempotencyKey);
      if (existing !== undefined) {
        return {
          kind: 'confirmed_success',
          encumbranceRef: options.respondForEncumbranceRef ?? request.encumbranceRef,
          confirmedAt: now(),
          providerReleaseReference: existing,
        };
      }
      counter += 1;
      const providerReleaseReference = `${providerSystem}-release-${counter}`;
      released.set(request.idempotencyKey, providerReleaseReference);
      return {
        kind: 'confirmed_success',
        encumbranceRef: options.respondForEncumbranceRef ?? request.encumbranceRef,
        confirmedAt: now(),
        providerReleaseReference,
      };
    },
  };
}

/** An executor that reports a definitive failure. The constraint must stay active, and no evidence of a release may exist. */
export function createFailingEncumbranceReleaseExecutorPort(
  options: { readonly providerSystem?: string; readonly failureCode?: string; readonly failureReason?: string } = {},
): EncumbranceReleaseExecutorPort {
  return {
    providerSystem: options.providerSystem ?? 'failing-release-executor',
    async executeRelease(): Promise<EncumbranceReleaseExecutionOutcome> {
      return {
        kind: 'confirmed_failure',
        failureCode: options.failureCode ?? 'release_refused_by_provider',
        ...(options.failureReason !== undefined ? { failureReason: options.failureReason } : {}),
      };
    },
  };
}

/** An executor whose outcome is unknown — a timeout, an ambiguous reply, a call whose result was never observed. The constraint stays active, and the attempt is safe to retry. */
export function createIndeterminateEncumbranceReleaseExecutorPort(
  options: { readonly providerSystem?: string; readonly reason?: string } = {},
): EncumbranceReleaseExecutorPort {
  return {
    providerSystem: options.providerSystem ?? 'indeterminate-release-executor',
    async executeRelease(): Promise<EncumbranceReleaseExecutionOutcome> {
      return { kind: 'indeterminate', reason: options.reason ?? 'provider_timeout' };
    },
  };
}

/**
 * An executor that throws rather than answering — an unreachable provider, a
 * transport failure, an adapter bug.
 *
 * Treated by the service as indeterminate rather than as failure, for the
 * reason the outcome union exists: a call that threw may still have reached
 * the provider.
 */
export function createUnavailableEncumbranceReleaseExecutorPort(
  options: { readonly providerSystem?: string } = {},
): EncumbranceReleaseExecutorPort {
  return {
    providerSystem: options.providerSystem ?? 'unavailable-release-executor',
    async executeRelease(): Promise<EncumbranceReleaseExecutionOutcome> {
      throw new EncumbranceReleaseGovernanceError(
        'ENCUMBRANCE_RELEASE_EXECUTOR_UNAVAILABLE',
        'The configured encumbrance release executor could not be reached.',
      );
    },
  };
}
