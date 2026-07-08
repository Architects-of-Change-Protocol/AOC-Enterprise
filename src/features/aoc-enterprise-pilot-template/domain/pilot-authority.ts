/**
 * Describes which Authority Graph grants/delegations/proofs a pilot expects
 * to be in play. This model references authority records by id only -- it
 * never re-derives or fabricates an authority proof itself.
 */
export interface PilotAuthorityModel {
  readonly authorityGrantIds: readonly string[];
  readonly delegationGrantIds: readonly string[];

  readonly authorityProofIds: readonly string[];

  readonly requiredCapabilities: readonly string[];

  readonly description: string;
  readonly walkthrough: readonly string[];
}
