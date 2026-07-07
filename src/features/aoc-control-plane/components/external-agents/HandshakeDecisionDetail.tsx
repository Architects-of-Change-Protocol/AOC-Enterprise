import * as React from 'react';
import type { HandshakeRequestRow } from '../../domain/control-plane-view-model.js';
import { ExternalStandingBadge } from './ExternalStandingBadge.js';

export interface HandshakeDecisionDetailProps {
  readonly request: HandshakeRequestRow;
}

/**
 * External Agent Handshake's read model does not expose a separate
 * "list all decisions" query -- the outcome is the request's own `status`.
 * This renders exactly that, plus whatever the request carries about a
 * pending approval, rather than inventing decision fields we don't have.
 */
export function HandshakeDecisionDetail({ request }: HandshakeDecisionDetailProps): React.ReactElement {
  return (
    <dl className="aoc-detail" aria-label={`Handshake request ${request.id}`}>
      <dt>Outcome</dt>
      <dd>
        <ExternalStandingBadge status={request.status} />
      </dd>
      <dt>External agent</dt>
      <dd>{request.externalAgentId}</dd>
      <dt>Requested actions</dt>
      <dd>{request.requestedActions.join(', ') || '—'}</dd>
      <dt>Requested resource scopes</dt>
      <dd>{request.requestedResourceScopes.join(', ') || '—'}</dd>
      {request.approvalRequestId !== undefined ? (
        <>
          <dt>Approval request</dt>
          <dd>{request.approvalRequestId}</dd>
        </>
      ) : null}
      <dt>Created at</dt>
      <dd>{request.createdAt}</dd>
    </dl>
  );
}
