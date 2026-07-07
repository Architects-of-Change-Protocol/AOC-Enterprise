import * as React from 'react';
import type { AocControlPlaneReadModel } from '../domain/control-plane-view-model.js';
import type { AocSection } from '../domain/control-plane-navigation.js';
import { useAocSelection } from '../hooks/useAocSelection.js';
import { useAocFilters } from '../hooks/useAocFilters.js';
import { AocControlPlaneShell } from './AocControlPlaneShell.js';
import { AocNavigationTabs } from './AocNavigationTabs.js';
import { AocSearchInput } from './AocSearchInput.js';
import { AocFilterBar } from './AocFilterBar.js';
import { AocSearchResultsTable } from './AocSearchResultsTable.js';
import { AocOverviewDashboard } from './AocOverviewDashboard.js';
import { RecognitionPanel } from './recognition/RecognitionPanel.js';
import { AuthorityPanel } from './authority/AuthorityPanel.js';
import { ApprovalPanel } from './approvals/ApprovalPanel.js';
import { ExternalAgentsPanel } from './external-agents/ExternalAgentsPanel.js';
import { EnforcementPanel } from './enforcement/EnforcementPanel.js';
import { ProofsPanel } from './proofs/ProofsPanel.js';
import { PolicyPacksPanel } from './policy-packs/PolicyPacksPanel.js';

export interface AocControlPlanePageCommands {
  readonly onApproveApproval?: ((requestId: string) => void) | undefined;
  readonly onRejectApproval?: ((requestId: string) => void) | undefined;
  readonly onRequestApprovalChanges?: ((requestId: string) => void) | undefined;
  readonly onEscalateApproval?: ((requestId: string) => void) | undefined;
  readonly onRevokeAuthorityGrant?: ((grantId: string) => void) | undefined;
  readonly onRevokeDelegationGrant?: ((delegationId: string) => void) | undefined;
  readonly onRevokeAgentVisa?: ((visaId: string) => void) | undefined;
  readonly onRevokeIngressGrant?: ((ingressGrantId: string) => void) | undefined;
}

export interface AocControlPlanePageProps {
  readonly readModel: AocControlPlaneReadModel;
  readonly initialSection?: AocSection;
  readonly commands?: AocControlPlanePageCommands;
  readonly environment?: string;
  readonly availableTrustDomainIds?: readonly string[];
  readonly onTrustDomainChange?: (trustDomainId: string) => void;
}

/**
 * The single mount point for the AOC Control Plane. It only ever reads
 * `readModel` -- built upstream by ControlPlaneReadModelService from the
 * five governance runtimes -- and dispatches `commands` verbatim to
 * whatever ControlPlaneCommandService wiring the caller supplies. It never
 * evaluates or fakes a governance decision itself.
 */
export function AocControlPlanePage({
  readModel,
  initialSection = 'overview',
  commands,
  environment,
  availableTrustDomainIds,
  onTrustDomainChange,
}: AocControlPlanePageProps): React.ReactElement {
  const { section, setSection } = useAocSelection(initialSection);
  const { filter, setFilter, setSearch, results } = useAocFilters(readModel);
  const isFiltering = Object.keys(filter).length > 0;
  const emergencyDenyActive = readModel.overview.health.reasonCode === 'EMERGENCY_DENY_ACTIVE';

  return (
    <AocControlPlaneShell
      trustDomainId={readModel.trustDomainId}
      {...(availableTrustDomainIds !== undefined ? { availableTrustDomainIds } : {})}
      {...(onTrustDomainChange !== undefined ? { onTrustDomainChange } : {})}
      {...(environment !== undefined ? { environment } : {})}
      emergencyDenyActive={emergencyDenyActive}
    >
      <div className="aoc-control-plane-page__toolbar">
        <AocSearchInput value={filter.search ?? ''} onChange={setSearch} />
        <AocFilterBar filter={filter} onChange={setFilter} />
      </div>

      <AocNavigationTabs selected={section} onSelect={setSection} />

      <main className="aoc-control-plane-page__main">
        {isFiltering ? (
          <AocSearchResultsTable results={results} />
        ) : (
          <>
            {section === 'overview' ? (
              <AocOverviewDashboard overview={readModel.overview} timeline={readModel.timeline} onNavigate={setSection} />
            ) : null}
            {section === 'recognition' ? <RecognitionPanel recognition={readModel.recognition} /> : null}
            {section === 'authority' ? (
              <AuthorityPanel authority={readModel.authority} onRevokeGrant={commands?.onRevokeAuthorityGrant} onRevokeDelegation={commands?.onRevokeDelegationGrant} />
            ) : null}
            {section === 'approvals' ? (
              <ApprovalPanel
                approvals={readModel.approvals}
                commands={{
                  onApprove: commands?.onApproveApproval,
                  onReject: commands?.onRejectApproval,
                  onRequestChanges: commands?.onRequestApprovalChanges,
                  onEscalate: commands?.onEscalateApproval,
                }}
              />
            ) : null}
            {section === 'external-agents' ? (
              <ExternalAgentsPanel
                externalAgents={readModel.externalAgents}
                onRevokeVisa={commands?.onRevokeAgentVisa}
                onRevokeIngressGrant={commands?.onRevokeIngressGrant}
              />
            ) : null}
            {section === 'enforcement' ? <EnforcementPanel enforcement={readModel.enforcement} /> : null}
            {section === 'policy-packs' ? <PolicyPacksPanel policyPacks={readModel.policyPacks} /> : null}
            {section === 'proofs' ? <ProofsPanel proofs={readModel.proofs} auditEvents={readModel.recognition.auditEvents} /> : null}
          </>
        )}
      </main>
    </AocControlPlaneShell>
  );
}
