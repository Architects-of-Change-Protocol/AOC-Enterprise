import type { ResourceRef } from '@aoc/protocol';
import type { EnterpriseResourceDescriptor, EnterpriseResourceIntegrity, EnterpriseResourceLocation } from '@aoc-enterprise/resource-envelope';

/**
 * The business scenario this demo proves the frozen Access Governance
 * lifecycle against (AOC Commercial Consolidation Program, Sequence R006.A).
 *
 * Customer: **Meridian Diligence** -- an enterprise data-room platform used
 * by law firms and corporate development teams to run M&A due-diligence
 * document exchanges. During a live acquisition, a target company's most
 * sensitive records (financial models, cap tables, IP schedules, litigation
 * exposure) must be shared with a narrow, time-boxed, constantly-changing
 * set of counterparties -- outside counsel, lenders, auditors -- while the
 * deal is still confidential and can still fall through.
 *
 * Why Governed Access, not a signed URL: a signed URL is a bearer secret.
 * Once issued it cannot be selectively revoked without rotating every
 * outstanding link; it carries no record of which policy allowed it, which
 * conditions (watermarking, read-only, a time limit) were supposed to
 * apply, or who approved it; and if a deal leaks, a regulator, an insurer,
 * or opposing counsel asks "prove who could see this, and when" -- a URL
 * has no answer. The seven frozen Access Governance contracts exist to make
 * that question answerable without touching the provider at all.
 */
export const BUSINESS_SCENARIO = {
  customerName: 'Meridian Diligence',
  customerDescription:
    'An enterprise data-room platform for M&A due-diligence document exchange, used by law firms and corporate development teams to share deal-critical records with a narrow, time-boxed set of counterparties.',
  whyGovernedAccess:
    'Diligence documents are the single highest-value leak target during a live acquisition. Access must be provable, time-boxed to the diligence window, revocable the instant a deal risk changes, and defensible after the fact to regulators, cyber insurers, and opposing counsel.',
  whySignedUrlsAreInsufficient: [
    'A signed URL is a bearer secret: anyone holding it has access, and it cannot be selectively revoked without rotating every other outstanding link for every other counterparty.',
    'A signed URL carries no record of which policy allowed it, who approved it, or what conditions (watermarking, read-only, a time limit) were meant to apply.',
    'A signed URL leaves no correlated evidence trail. When a deal leaks, there is no way to reconstruct who requested access, who approved it, and who actually opened the file -- only that a link existed.',
  ],
} as const;

/** The one reference asset this demo governs access to. */
export const RESOURCE_REF: ResourceRef = {
  kind: 'diligence-document',
  id: 'project-solstice-target-report',
  tenantId: 'meridian-diligence',
};

export const RESOURCE_DESCRIPTOR: EnterpriseResourceDescriptor = {
  displayName: 'Project Solstice — Confidential M&A Target Report.pdf',
  contentType: 'application/pdf',
  tags: ['m&a', 'due-diligence', 'confidential', 'board-restricted'],
};

export const RESOURCE_INTEGRITY: EnterpriseResourceIntegrity = {
  algorithm: 'sha256',
  value: '4dee56eb2bf9c8fe38cf9e735ec173557918088f0e61fcfb0cddb52ebbc0624d',
  sizeBytes: 4_290_114,
};

/** Pinata's own identifiers for the asset -- a CID (content identity) and a file id (Pinata's own record key), neither of which is a credential. */
export const PINATA_CID = 'bafybeigdyrztgvv3ck3wodm7fslktp4mzafwytnyd7hznrpxozsfqbn7za';
export const PINATA_FILE_ID = '018f2f6a-9c2b-7a63-b6a1-4c9d3e7f8a21';

export const RESOURCE_LOCATION: EnterpriseResourceLocation = {
  uri: `ipfs://${PINATA_CID}`,
  system: 'pinata',
  systemReference: PINATA_FILE_ID,
};

/** Principals in this scenario. Every id is opaque and provider-neutral, exactly as `principalId` is defined across the seven frozen contracts. */
export const PRINCIPALS = {
  /** Meridian Diligence's own deal-room operations lead, who registers the resource. */
  dealRoomOperator: 'meridian-ops-j-alvarez',
  /** Meridian Diligence's policy/approval engine, recorded as the issuer of grants. */
  approvalEngine: 'meridian-approval-engine',
  /** Outside counsel for the acquiring party, the counterparty this demo grants access to. */
  outsideCounsel: 'counsel-r-harrington-lee-llp',
  /** An unverified external contact with no NDA on file -- the denied-access scenario. */
  unverifiedExternalContact: 'external-contact-unverified-1',
  /** Meridian's security team, who revokes a grant administratively. */
  securityTeam: 'meridian-security-team',
} as const;
