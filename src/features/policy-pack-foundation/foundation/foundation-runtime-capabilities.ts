import type { FoundationRuntimeCapability, FoundationRuntimeIntegrationStatus } from './foundation-runtime-types.js';

/**
 * Deterministic, static description of which Foundation modules this
 * checkout of AOC Enterprise actually ships. This is hand-maintained, not
 * derived from a filesystem scan or a network call -- the modules listed as
 * `available` are real, working runtimes that already exist under
 * `src/features/*` (see each capability's `notes` for the exact path).
 *
 * `jurisdiction_pack_runtime` is intentionally `planned`: `domain-policy-pack-runtime`
 * already models `PolicyPackKind = 'jurisdiction'` generically, but no
 * dedicated jurisdiction-pack runtime module exists yet. This Foundation
 * layer is what makes a future `aoc.jurisdiction.*` pack safe to add.
 *
 * When a new Foundation module lands, update this list by hand -- do not
 * make this function scan the filesystem or infer availability from
 * whatever happens to be on disk, or capability detection stops being
 * deterministic and testable.
 */
const FOUNDATION_RUNTIME_CAPABILITY_STATUSES: readonly FoundationRuntimeIntegrationStatus[] = [
  {
    capability: 'recognition_runtime',
    availability: 'available',
    modulePath: 'src/features/recognition-runtime',
    notes: ['Recognition Runtime is a real, working module in this checkout.'],
  },
  {
    capability: 'authority_graph',
    availability: 'available',
    modulePath: 'src/features/authority-graph',
    notes: ['Authority Graph & Delegation Runtime is a real, working module in this checkout.'],
  },
  {
    capability: 'approval_runtime',
    availability: 'available',
    modulePath: 'src/features/approval-runtime',
    notes: [
      'Approval Runtime is a real, working module in this checkout.',
      'This Foundation layer only produces ApprovalRuntimeReference records; it does not call into the runtime directly.',
    ],
  },
  {
    capability: 'evidence_runtime',
    availability: 'available',
    modulePath: 'src/features/evidence-source-runtime',
    notes: [
      'Evidence / Source / Citation Runtime is a real, working module in this checkout.',
      'This Foundation layer only produces EvidenceRuntimeReference records; it does not call into the runtime directly.',
    ],
  },
  {
    capability: 'source_runtime',
    availability: 'available',
    modulePath: 'src/features/evidence-source-runtime',
    notes: ['Source registration is part of the Evidence / Source / Citation Runtime.'],
  },
  {
    capability: 'citation_runtime',
    availability: 'available',
    modulePath: 'src/features/evidence-source-runtime',
    notes: ['Citation service is part of the Evidence / Source / Citation Runtime.'],
  },
  {
    capability: 'proof_runtime',
    availability: 'available',
    modulePath: 'src/features/evidence-source-runtime',
    notes: ['Evidence proof service is part of the Evidence / Source / Citation Runtime.'],
  },
  {
    capability: 'verifiable_export_package',
    availability: 'available',
    modulePath: 'src/features/verifiable-export-package',
    notes: [
      'Verifiable Export Package is a real, working module in this checkout.',
      'This Foundation layer only produces ExportRuntimeReference records; it does not call into the runtime directly.',
    ],
  },
  {
    capability: 'control_plane',
    availability: 'available',
    modulePath: 'src/features/aoc-control-plane',
    notes: [
      'AOC Control Plane UI is a real, working module in this checkout.',
      'This Foundation layer only produces ControlPlaneReference records with safe display labels; it does not render UI.',
    ],
  },
  {
    capability: 'domain_policy_pack_runtime',
    availability: 'available',
    modulePath: 'src/features/domain-policy-pack-runtime',
    notes: [
      'Domain Policy Pack Runtime is a real, working module in this checkout.',
      'This Foundation layer defines a horizontal manifest/composition standard alongside it, not a replacement for it.',
    ],
  },
  {
    capability: 'jurisdiction_pack_runtime',
    availability: 'available',
    modulePath: 'src/features/jurisdiction-pack-runtime',
    notes: [
      'Jurisdiction Pack Runtime is a real, working module in this checkout, built directly on this Foundation.',
      'It registers and resolves jurisdiction pack manifests and composes them via composePolicyPacks; it defines no parallel manifest, validation-status, safe-framing, composition, or no-overclaim system of its own.',
      'It carries no real jurisdiction-specific law -- only demo/fictional jurisdiction packs.',
    ],
  },
  {
    capability: 'policy_pack_manifest_standard',
    availability: 'available',
    modulePath: 'src/features/policy-pack-foundation/manifest',
    notes: ['Introduced by this PR: AOC Policy Pack Foundation Alignment & Manifest Standard v1.'],
  },
  {
    capability: 'policy_pack_composition_runtime',
    availability: 'available',
    modulePath: 'src/features/policy-pack-foundation/composition',
    notes: ['Introduced by this PR: generic pack composition and dependency resolution.'],
  },
  {
    capability: 'policy_pack_validation_harness',
    availability: 'available',
    modulePath: 'src/features/policy-pack-foundation/validation',
    notes: ['Introduced by this PR: shared validation status semantics and the universal no-overclaim harness.'],
  },
];

/**
 * Returns the deterministic, static Foundation capability statuses for this
 * checkout. No network calls, no filesystem scanning -- see the module doc
 * comment above for why this is hand-maintained rather than derived.
 */
export function detectFoundationRuntimeCapabilities(): FoundationRuntimeIntegrationStatus[] {
  return FOUNDATION_RUNTIME_CAPABILITY_STATUSES.map((status) => ({
    ...status,
    notes: [...status.notes],
  }));
}

export function findFoundationRuntimeCapabilityStatus(
  capabilities: readonly FoundationRuntimeIntegrationStatus[],
  capability: FoundationRuntimeCapability,
): FoundationRuntimeIntegrationStatus | undefined {
  return capabilities.find((status) => status.capability === capability);
}
