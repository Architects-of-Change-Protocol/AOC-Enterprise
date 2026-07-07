import * as React from 'react';
import type { ExternalAgentsViewModel, HandshakeRequestRow } from '../../domain/control-plane-view-model.js';
import { ExternalAgentsTable } from './ExternalAgentsTable.js';
import { HandshakeRequestsTable } from './HandshakeRequestsTable.js';
import { HandshakeDecisionDetail } from './HandshakeDecisionDetail.js';
import { AgentVisasTable } from './AgentVisasTable.js';
import { IngressGrantsTable } from './IngressGrantsTable.js';
import { TrustBoundarySummary } from './TrustBoundarySummary.js';

export interface ExternalAgentsPanelProps {
  readonly externalAgents: ExternalAgentsViewModel;
  readonly onRevokeVisa?: ((visaId: string) => void) | undefined;
  readonly onRevokeIngressGrant?: ((ingressGrantId: string) => void) | undefined;
}

export function ExternalAgentsPanel({ externalAgents, onRevokeVisa, onRevokeIngressGrant }: ExternalAgentsPanelProps): React.ReactElement {
  const [selectedRequest, setSelectedRequest] = React.useState<HandshakeRequestRow | undefined>(undefined);

  return (
    <section className="aoc-panel" aria-label="External Agents">
      <h2>External Agents</h2>

      <h3>Trust boundary</h3>
      <TrustBoundarySummary trustBoundaries={externalAgents.trustBoundaries} />

      <h3>External agents</h3>
      <ExternalAgentsTable agents={externalAgents.externalAgents} />

      <h3>Handshake requests</h3>
      <HandshakeRequestsTable requests={externalAgents.handshakeRequests} onSelect={setSelectedRequest} />
      {selectedRequest !== undefined ? <HandshakeDecisionDetail request={selectedRequest} /> : null}

      <h3>Agent visas</h3>
      <AgentVisasTable visas={externalAgents.visas} onRevoke={onRevokeVisa ? (visa) => onRevokeVisa(visa.id) : undefined} />

      <h3>Ingress grants</h3>
      <IngressGrantsTable
        ingressGrants={externalAgents.ingressGrants}
        onRevoke={onRevokeIngressGrant ? (grant) => onRevokeIngressGrant(grant.id) : undefined}
      />
    </section>
  );
}
