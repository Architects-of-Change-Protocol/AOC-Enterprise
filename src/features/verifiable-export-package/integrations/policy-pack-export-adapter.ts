import type { PolicyPack } from '../../domain-policy-pack-runtime/domain/policy-pack.js';
import type { PolicyPackVersion } from '../../domain-policy-pack-runtime/domain/policy-pack-version.js';
import type { PolicyPackRule } from '../../domain-policy-pack-runtime/domain/policy-pack-rule.js';
import type { PolicyPackDecision } from '../../domain-policy-pack-runtime/domain/policy-pack-decision.js';
import type { PolicyPackProof } from '../../domain-policy-pack-runtime/domain/policy-pack-proof.js';
import type { PolicyPackEvent } from '../../domain-policy-pack-runtime/domain/policy-pack-event.js';
import { createDigest } from '../domain/export-package.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';

function buildItem(ctx: ExportRuntimeContext, type: ExportPackageItem['type'], sourceId: string, title: string, summary: string, payload: Record<string, unknown>): ExportPackageItem {
  return {
    id: ctx.ids.nextId('export-item'),
    type,
    sourceModule: 'domain_policy_pack_runtime',
    sourceId,
    title,
    summary,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: ctx.clock.now(),
  };
}

/** Maps a real PolicyPack into an ExportPackageItem. */
export function mapPolicyPackToItem(ctx: ExportRuntimeContext, pack: PolicyPack): ExportPackageItem {
  const payload = { ...pack } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'policy_pack', pack.id, `Policy pack ${pack.name}`, pack.description, payload);
}

/**
 * Maps a real PolicyPackVersion into an ExportPackageItem, preserving
 * `demoOnly`/`legalCompleteness` as plain metadata. This package never
 * converts `not_legal_advice` into a claim of verified compliance -- it
 * only copies the label the policy pack already carries.
 */
export function mapPolicyPackVersionToItem(ctx: ExportRuntimeContext, version: PolicyPackVersion): ExportPackageItem {
  const payload = { ...version } as unknown as Record<string, unknown>;
  return buildItem(
    ctx,
    'policy_pack_version',
    version.id,
    `Policy pack version ${version.version}`,
    `${version.status}; demoOnly=${version.demoOnly}; legalCompleteness=${version.legalCompleteness}.`,
    payload,
  );
}

/** Maps a real PolicyPackRule into an ExportPackageItem. */
export function mapPolicyRuleToItem(ctx: ExportRuntimeContext, rule: PolicyPackRule): ExportPackageItem {
  const payload = { ...rule } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'policy_rule', rule.id, `Policy rule ${rule.name}`, rule.description, payload);
}

/** Maps a real PolicyPackDecision into an ExportPackageItem. Never re-evaluates the policy pack. */
export function mapPolicyDecisionToItem(ctx: ExportRuntimeContext, decision: PolicyPackDecision): ExportPackageItem {
  const payload = { ...decision } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'policy_decision', decision.id, `Policy decision ${decision.id}`, `${decision.type}: ${decision.reason}`, payload);
}

/** Maps a real PolicyPackProof into an ExportPackageItem, preserving matchedRuleIds and the chained proofHash. */
export function mapPolicyProofToItem(ctx: ExportRuntimeContext, proof: PolicyPackProof): ExportPackageItem {
  const payload = { ...proof } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'policy_proof', proof.id, `Policy proof ${proof.id}`, `Proof for policy decision ${proof.decisionId}.`, payload);
}

/** Maps a real PolicyPackEvent into an ExportPackageItem. */
export function mapPolicyEventToItem(ctx: ExportRuntimeContext, event: PolicyPackEvent): ExportPackageItem {
  const payload = { ...event } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'policy_event', event.id, `Policy event ${event.id}`, event.type, payload);
}
