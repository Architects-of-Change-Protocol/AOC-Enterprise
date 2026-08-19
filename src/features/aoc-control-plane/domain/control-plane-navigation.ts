export type AocGovernanceSource = 'recognition' | 'authority' | 'approval' | 'handshake' | 'enforcement' | 'policy';

export type AocSection =
  | 'overview'
  | 'recognition'
  | 'authority'
  | 'approvals'
  | 'external-agents'
  | 'enforcement'
  | 'policy-packs'
  | 'proofs';

export interface AocNavigationItem {
  readonly section: AocSection;
  readonly label: string;
  readonly description: string;
}

export const AOC_NAVIGATION_ITEMS: readonly AocNavigationItem[] = [
  { section: 'overview', label: 'Overview', description: 'Governance state at a glance across every Soberanía runtime.' },
  { section: 'recognition', label: 'Recognition', description: 'Actors, passports, capability tokens and recognition decisions.' },
  { section: 'authority', label: 'Authority', description: 'Authority grants, delegations, role assignments and authority chains.' },
  { section: 'approvals', label: 'Approvals', description: 'Approval requests, decisions, evidence and quorum.' },
  { section: 'external-agents', label: 'External Agents', description: 'External agents, handshakes, visas and ingress grants.' },
  { section: 'enforcement', label: 'Enforcement', description: 'Enforcement requests, decisions, execution results and side effects.' },
  { section: 'policy-packs', label: 'Policy Packs', description: 'Domain policy packs, versions, rules, evaluations, decisions and their enforcement links.' },
  { section: 'proofs', label: 'Proofs / Audit', description: 'Proof references, proof chains and the audit trail.' },
];
